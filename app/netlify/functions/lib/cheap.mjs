// ─────────────────────────────────────────────────────────────────────────
// THE INTERNAL MODEL ROUTER — one call shape, several vendors, cheap first.
//
// WHY THIS EXISTS
// A dozen functions in here make an LLM call that no user ever chose: the
// claim extractor, the disclosure classifier, the argument linter, the
// flow parser, the nightly distill, the fingerprint pass. Every one of
// them hand-rolled `fetch('https://api.anthropic.com/v1/messages')` and
// every one of them grew an env override (`FLOW_MODEL`, `BLOCKS_MODEL`,
// `ARG_LINT_MODEL`, …) so the model could be tuned without a redeploy.
//
// Those overrides could only ever reach ANOTHER ANTHROPIC MODEL, because
// the URL and the auth header were hardcoded beside them. So the knob that
// existed to control cost could not reach the models that are cheap.
//
// Measured 2026-08-22 against live vendor pricing, USD per million tokens
// in/out:
//
//     claude-opus-5           5.00 / 25.00
//     claude-sonnet-4-6       3.00 / 15.00
//     moonshotai/kimi-k3      3.00 / 15.00     <- the flagship, NOT cheap
//     claude-haiku-4-5        1.00 /  5.00     <- our idea of "cheap"
//     z-ai/glm-5.2            0.97 /  3.04
//     moonshotai/kimi-k2.6    0.54 /  2.28
//     deepseek-v4-pro         0.41 /  0.83
//     openai/gpt-4o-mini      0.15 /  0.60
//     deepseek-v4-flash       0.06 /  0.13     <- 16x/40x under Haiku
//
// Read that table before reaching for a model by reputation. Kimi K3 is
// the heavyweight of the open roster and it bills exactly what Sonnet
// bills; "use Kimi to save money" is only true of K2.6 and below.
//
// WHAT THIS MODULE DOES
// `callModel` takes an ANTHROPIC-SHAPED request body and returns an
// ANTHROPIC-SHAPED response object. When the model is a `claude-*` id it
// is a passthrough. When it is anything else, the body is translated into
// the OpenAI chat-completions shape (which DeepSeek, Moonshot, OpenRouter
// and OpenAI all speak) and the reply is translated back into
// `{ content: [...], stop_reason, usage, model }`.
//
// That shape choice is deliberate and it is what keeps the diff at each
// call site to a single line: every existing `data?.content?.[0]?.text`,
// `data.stop_reason === 'max_tokens'` and `data.usage.output_tokens` read
// keeps working byte-identically whichever vendor answered.
//
// THE FALLBACK IS THE WHOLE SAFETY ARGUMENT
// A cost optimisation that can take a feature down is not a saving, it is
// an outage with a discount. Every call declares a `fallback` model, and a
// cheap provider that errors, times out or returns nothing is retried once
// on that fallback before the caller ever sees a failure. The fallback is
// the model the call site used BEFORE it was cheapened, so the worst case
// is the old bill plus one wasted request, never a broken feature.
//
// ROLLBACK IS AN ENV VAR, NOT A DEPLOY. Every call site keeps its existing
// `*_MODEL` variable. Set it back to a `claude-*` id in the Netlify UI and
// that task is on Anthropic again on the next invocation.
//
// WHAT IS DELIBERATELY NOT ROUTED THROUGH HERE
//   - The judge panel (`lib/judge-run.mjs`, `lib/judge-charter.mjs`). Its
//     models are PINNED BY A PUBLISHED CHARTER and stamped on every audit
//     row. Changing which model judged a round is a promise change, not a
//     config change: it needs a new season entry, not a cheaper default.
//     `scripts/test-judge-integrity.mjs` will block the commit anyway.
//   - The six user-facing brain proxies. The user picked that vendor; a
//     silent downgrade there is a lie about what argued against them.
//   - Realtime voice and TTS. Different API shape entirely, and the lever
//     there is `OPENAI_REALTIME_MODEL`, which already exists.
// ─────────────────────────────────────────────────────────────────────────

// Cheap ids worth naming, so call sites read as intent rather than as a
// vendor string. These are the two DeepSeek serves directly today
// (verified against api.deepseek.com/models on 2026-08-22).
export const CHEAP_FAST = 'deepseek-v4-flash'; // extraction, classification, batch
export const CHEAP_MID = 'deepseek-v4-pro';    // longer structured writing

// Anthropic ids the call sites fall back to. Kept here so a fallback is
// never a bare string typo'd at twelve call sites.
export const FALLBACK_FAST = 'claude-haiku-4-5-20251001';
export const FALLBACK_MID = 'claude-sonnet-4-6';

const DEFAULT_TIMEOUT_MS = 20_000;

// ── provider resolution ──────────────────────────────────────────────────
//
// Prefix rules, most specific first. A slug containing '/' is an
// OpenRouter id by construction ('moonshotai/kimi-k2.6'), which is also
// how the Open Lab roster in engines.mjs addresses models, so the two
// files agree without importing each other.
//
// An id we cannot place resolves to null and the caller goes straight to
// its fallback. Guessing a provider for an unknown string is how a typo
// in an env var becomes a request to the wrong vendor with the wrong key.
export function resolveProvider(model) {
  const m = String(model || '').trim();
  if (!m) return null;
  if (m.startsWith('claude-')) {
    return { id: 'anthropic', key: 'ANTHROPIC_API_KEY', url: 'https://api.anthropic.com/v1/messages', shape: 'anthropic' };
  }
  if (m.includes('/')) {
    return { id: 'openrouter', key: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions', shape: 'openai' };
  }
  if (m.startsWith('deepseek')) {
    return { id: 'deepseek', key: 'DEEPSEEK_API_KEY', url: 'https://api.deepseek.com/chat/completions', shape: 'openai' };
  }
  if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) {
    return { id: 'openai', key: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/chat/completions', shape: 'openai' };
  }
  return null;
}

// ── request translation: anthropic body -> openai body ───────────────────
//
// Anthropic carries `system` as a top-level field; OpenAI carries it as
// the first message. Anthropic's `system` may also be an array of content
// blocks (the cache-prefix form used by claude.mjs), so flatten that.
//
// `max_tokens` becomes `max_completion_tokens` for the OpenAI o-series and
// gpt-5.x families, which reject the older name outright. DeepSeek,
// Moonshot and OpenRouter all still accept `max_tokens`.
export function toOpenAiBody(model, body) {
  const sys = Array.isArray(body.system)
    ? body.system.map((b) => (typeof b === 'string' ? b : b?.text || '')).join('\n')
    : String(body.system || '');

  const messages = [];
  if (sys.trim()) messages.push({ role: 'system', content: sys });

  for (const msg of body.messages || []) {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';

    // Anthropic message content is either a string or an array of blocks.
    if (!Array.isArray(msg.content)) {
      messages.push({ role, content: String(msg.content ?? '') });
      continue;
    }

    // IMAGES SURVIVE THE TRANSLATION, AND DOCUMENTS REFUSE IT LOUDLY.
    // This used to flatten every block to `b.text || ''`, which meant a
    // caller that passed a screenshot got a request containing the empty
    // string and a model that answered confidently about nothing. A
    // vision call that silently becomes a blind one is the worst kind of
    // bug: it returns plausible output. record-extract.mjs reads
    // screenshots of tab pages, so it needs this to be true.
    //
    // PDFs have no portable chat-completions spelling (OpenAI, DeepSeek
    // and OpenRouter each differ), so rather than guess, an unsupported
    // block THROWS. attempt() is inside callModel's try, so the throw
    // routes the call to its fallback — which for any document caller is
    // an Anthropic model that reads PDFs natively. Refusing beats
    // dropping: the caller gets the right answer from the second model
    // instead of a wrong one from the first.
    const parts = [];
    for (const b of msg.content) {
      if (typeof b === 'string') { parts.push({ type: 'text', text: b }); continue; }
      if (!b || b.type === 'text') { parts.push({ type: 'text', text: (b && b.text) || '' }); continue; }
      if (b.type === 'image' && b.source) {
        const src = b.source.type === 'base64'
          ? `data:${b.source.media_type || 'image/png'};base64,${b.source.data}`
          : String(b.source.url || '');
        if (!src) throw new Error('image block has no data');
        parts.push({ type: 'image_url', image_url: { url: src } });
        continue;
      }
      throw new Error(`content block '${b.type}' has no openai-shape equivalent; use an anthropic model`);
    }

    // A message that is only text collapses back to a plain string, so
    // every existing text-only call site sends a byte-identical body.
    const allText = parts.every((p) => p.type === 'text');
    messages.push({ role, content: allText ? parts.map((p) => p.text).join('\n') : parts });
  }

  const out = { model, messages };
  const cap = Number(body.max_tokens) || 1024;
  if (/^(gpt-5|gpt-6|o[134])/.test(model)) out.max_completion_tokens = cap;
  else out.max_tokens = cap;
  if (typeof body.temperature === 'number') out.temperature = body.temperature;

  // THINKING IS OFF BY DEFAULT, AND THIS IS THE MOST LOAD-BEARING LINE IN
  // THE FILE. Both DeepSeek V4 models reason by default and bill the
  // thinking against `max_tokens`, which is the same trap that left the
  // judge panel's Anthropic seat recorded as a missing vote for weeks.
  //
  // Measured 2026-08-22 on the real extract-claims prompt at its real
  // 800-token budget: v4-flash spent 329 of 382 output tokens thinking,
  // v4-pro spent 244 of 297. On a 2200-token blocks job v4-pro spent the
  // ENTIRE budget reasoning and returned an empty message with
  // finish_reason 'stop' — a working model that looks like a broken one.
  //
  // Every call this router makes is a bounded structured task against a
  // fixed rubric, inside a ~26s Netlify execution budget. Thinking buys
  // nothing there and costs three things: truncation risk, latency, and
  // reasoning tokens billed at the output rate. Disabling it measured
  // 2.4x faster on the same prompt (1772ms vs 4255ms) with LONGER visible
  // output.
  //
  // Pass `reasoning: true` on a call that genuinely wants it. Note the
  // vendors spell the switch differently and only these exact spellings
  // work: DeepSeek ignores `reasoning:{enabled:false}` outright, and
  // `enable_thinking:false` made it WORSE (800 reasoning tokens, empty
  // content). Verify against the vendor before adding another.
  if (!body.reasoning) {
    if (model.startsWith('deepseek')) out.thinking = { type: 'disabled' };
    else if (model.includes('/')) out.reasoning = { enabled: false }; // OpenRouter's spelling
  }

  // Tool use. Anthropic's `input_schema` is OpenAI's `parameters`; the
  // rest of the declaration is the same object. Callers that force a tool
  // get `tool_choice` translated too, because a caller that expects
  // structured output and receives prose is a parse failure, not a
  // degraded answer.
  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = body.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description || '', parameters: t.input_schema || t.parameters || { type: 'object', properties: {} } },
    }));
    const tc = body.tool_choice;
    if (tc && tc.type === 'tool' && tc.name) out.tool_choice = { type: 'function', function: { name: tc.name } };
    else if (tc && tc.type === 'any') out.tool_choice = 'required';
  }
  return out;
}

// ── response translation: openai reply -> anthropic reply ────────────────
//
// The `content` array is rebuilt block by block so a caller doing
// `content.find(c => c.type === 'tool_use')` finds one, and a caller doing
// `content[0].text` gets text. A reply with both puts text first, which is
// the order Anthropic emits.
export function fromOpenAiReply(data, model) {
  const choice = (data?.choices || [])[0] || {};
  const msg = choice.message || {};
  const content = [];

  const text = typeof msg.content === 'string'
    ? msg.content
    : Array.isArray(msg.content)
      ? msg.content.map((c) => c?.text || '').join('')
      : '';
  if (text) content.push({ type: 'text', text });

  for (const call of msg.tool_calls || []) {
    let input = {};
    try { input = JSON.parse(call?.function?.arguments || '{}'); } catch (_) { input = {}; }
    content.push({ type: 'tool_use', id: call.id || 'tool_0', name: call?.function?.name || '', input });
  }

  // `length` is OpenAI's truncation signal and `max_tokens` is Anthropic's.
  // Call sites check the Anthropic name before parsing, precisely so a
  // truncated reply reports as truncation rather than as a parse bug, so
  // the mapping has to survive the translation.
  const finish = choice.finish_reason;
  const stop_reason = finish === 'length' ? 'max_tokens'
    : finish === 'tool_calls' ? 'tool_use'
      : 'end_turn';

  const u = data?.usage || {};
  return {
    id: data?.id || '',
    model: data?.model || model,
    content,
    stop_reason,
    usage: {
      input_tokens: u.prompt_tokens ?? u.input_tokens ?? 0,
      output_tokens: u.completion_tokens ?? u.output_tokens ?? 0,
    },
  };
}

// ── one attempt against one vendor ───────────────────────────────────────
async function attempt(model, body, timeoutMs) {
  const p = resolveProvider(model);
  if (!p) throw new Error('unroutable model id: ' + String(model).slice(0, 40));
  const apiKey = process.env[p.key];
  if (!apiKey) throw new Error(p.id + ' key missing (' + p.key + ')');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const headers = { 'content-type': 'application/json' };
    let payload;
    if (p.shape === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      payload = { ...body, model };
    } else {
      headers.authorization = 'Bearer ' + apiKey;
      if (p.id === 'openrouter') {
        // OpenRouter attributes traffic by these two; without them the
        // request still works but the dashboard cannot tell our spend
        // apart from anything else on the key.
        headers['HTTP-Referer'] = 'https://itsdebatable.com';
        headers['X-Title'] = 'Debatable';
      }
      payload = toOpenAiBody(model, body);
    }

    const res = await fetch(p.url, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctl.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(p.id + ' ' + res.status + ' ' + detail.slice(0, 200));
    }
    const data = await res.json();
    const out = p.shape === 'anthropic' ? data : fromOpenAiReply(data, model);

    // An empty reply is a failure even at HTTP 200. A cheap provider that
    // answers with nothing would otherwise burn the caller's only attempt
    // and hand it an empty string to parse, which reads downstream as the
    // model having nothing to say.
    const hasContent = Array.isArray(out?.content) && out.content.some((c) => (c?.text || '').trim() || c?.type === 'tool_use');
    if (!hasContent) {
      // Name the reasoning case explicitly. An empty reply from a model
      // that spent its whole budget thinking arrives with finish_reason
      // 'stop' and looks identical to a model with nothing to say; the
      // fix for one is a bigger cap and for the other is a better prompt,
      // so the log line has to tell them apart.
      const spent = data?.usage?.completion_tokens_details?.reasoning_tokens || 0;
      throw new Error(spent
        ? `${p.id} returned empty content after ${spent} reasoning tokens (raise max_tokens or keep thinking disabled)`
        : `${p.id} returned empty content`);
    }

    out._provider = p.id;
    return out;
  } finally {
    clearTimeout(timer);
  }
}

// ── the public call ──────────────────────────────────────────────────────
//
//   const data = await callModel({
//     model: process.env.FLOW_MODEL || CHEAP_MID,
//     fallback: FALLBACK_MID,
//     body: { max_tokens: 2000, system, messages: [...] },
//   });
//   const raw = data?.content?.[0]?.text || '';   // unchanged from before
//
// Returns an Anthropic-shaped object, or throws only when BOTH the chosen
// model and the fallback failed. `label` is for the log line, so a cheap
// provider degrading shows up as a named event rather than as noise.
export async function callModel({ model, fallback, body, timeoutMs = DEFAULT_TIMEOUT_MS, label = 'internal' }) {
  const primary = String(model || '').trim() || fallback;
  let firstErr = null;

  try {
    return await attempt(primary, body, timeoutMs);
  } catch (err) {
    firstErr = err;
  }

  const alt = String(fallback || '').trim();
  if (!alt || alt === primary) throw firstErr;

  // Loud on purpose. A cheap model failing quietly and being paid for
  // twice is the failure mode that makes a cost saving cost more, and the
  // only way to see it is a log line naming both models.
  console.warn(`[cheap:${label}] ${primary} failed (${firstErr?.message || 'unknown'}); falling back to ${alt}`);
  try {
    return await attempt(alt, body, timeoutMs);
  } catch (err2) {
    console.warn(`[cheap:${label}] fallback ${alt} also failed: ${err2?.message || 'unknown'}`);
    throw firstErr;
  }
}

// Convenience for the many call sites that want one string out.
export function textOf(data) {
  return (data?.content || []).map((c) => (c && c.text) || '').join('');
}
