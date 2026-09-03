// ─────────────────────────────────────────────────────────────
// JUROR DISPATCH — the I/O half of the panel.
//
// One function per provider family, each taking the SAME system and
// user text and returning raw completion text. Identical input is not a
// nicety here: it is what makes the audit record's prompt hash mean
// something. If the jurors saw different prompts, their agreement would
// measure prompt engineering rather than the round.
//
// Provider request shapes are copied from this repo's existing brain
// proxies (claude.mjs / openai-chat.mjs / gemini.mjs) rather than
// written from memory, so a provider change only has to be tracked in
// one more place.
//
// FAILURE POSTURE
// A juror that errors, times out, or returns unparseable JSON is a
// MISSING VOTE, never a guessed one. The panel is designed to survive
// losing a juror: two agreeing jurors still carry a verdict, and a
// panel reduced to one juror produces `unresolved` rather than letting
// a single model decide a round the charter promised to a panel of
// three. That is the whole point of the quorum.
// ─────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';

// Per-juror wall clock. Measured against the real ballot prompt (the
// ~18K-char adjudication block plus three speech transcripts, so roughly
// 7.5K input tokens) rather than a toy one: on 2026-08-11 the pinned
// panel returned in 16.1s (anthropic), 13.5s (openai) and 5.0s (a
// search-family control). 30s leaves headroom for a slow round without
// letting one hung provider hold the whole sweep open.
//
// This is a CEILING, not a target. Jurors run concurrently, so the panel
// costs the slowest juror, and a juror that blows the ceiling is a
// missing vote rather than a failed ballot.
const JUROR_TIMEOUT_MS = Number(process.env.JUDGE_JUROR_TIMEOUT_MS || 30_000);

// Reasoning-effort levels a juror config may carry. The judge does not
// want maximum deliberation: a ballot is a bounded task with a published
// method, and the top effort tiers spend minutes re-deriving the rubric
// for no measurable gain in agreement. `low` measured clean, parseable
// ballots on every pinned model and roughly halves wall clock.
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

function effortOf(juror) {
  const e = String((juror && juror.effort) || '');
  return EFFORTS.has(e) ? e : null;
}

// OpenAI retired `max_tokens` on the gpt-5 and o-series families: sending
// it returns 400 `unsupported_parameter` and the juror is a missing vote
// for a reason that has nothing to do with the round. Verified live on
// 2026-08-11 against gpt-5.5.
function usesCompletionTokens(model) {
  return /^(gpt-5|gpt-6|o[0-9])/i.test(String(model || ''));
}

export function promptHash(system, user) {
  // Keep the separator escaped in source. A literal NUL made this module
  // look binary to static scanners and could hide a broken judge import.
  return createHash('sha256').update(String(system || '') + '\0' + String(user || '')).digest('hex').slice(0, 16);
}

function withTimeout(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, done: () => clearTimeout(t) };
}

async function callAnthropic(juror, system, user, maxTokens, timeoutMs = JUROR_TIMEOUT_MS) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY unset');
  const effort = effortOf(juror);
  const to = withTimeout(timeoutMs);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: to.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: juror.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        ...(effort ? { output_config: { effort } } : {}),
      }),
    });
    if (!r.ok) throw new Error('anthropic ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 160));
    const j = await r.json();
    // A safety refusal is a 200 with no usable ballot. Say so plainly
    // rather than returning empty text the parser will blame itself for.
    if (j.stop_reason === 'refusal') throw new Error('anthropic refusal: ' + ((j.stop_details && j.stop_details.category) || 'unspecified'));
    return (j.content || []).map((c) => c.text || '').join('');
  } finally { to.done(); }
}

// OpenAI and DeepSeek both speak the chat-completions shape, so they
// share one caller. The differences that matter are the token-limit
// field name and the reasoning-effort field, both keyed off the model.
async function callChatCompletions(url, key, juror, system, user, maxTokens, effortField, timeoutMs = JUROR_TIMEOUT_MS, extraHeaders = null) {
  const to = withTimeout(timeoutMs);
  const effort = effortField ? effortOf(juror) : null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      signal: to.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(extraHeaders || {}) },
      body: JSON.stringify({
        model: juror.model,
        ...(usesCompletionTokens(juror.model)
          ? { max_completion_tokens: maxTokens }
          : { max_tokens: maxTokens }),
        ...(effort ? { [effortField]: effort } : {}),
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!r.ok) throw new Error(r.status + ': ' + (await r.text().catch(() => '')).slice(0, 160));
    const j = await r.json();
    return ((j.choices || [])[0] || {}).message?.content || '';
  } finally { to.done(); }
}

async function callOpenai(juror, system, user, maxTokens, timeoutMs = JUROR_TIMEOUT_MS) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY unset');
  try {
    return await callChatCompletions('https://api.openai.com/v1/chat/completions', key, juror, system, user, maxTokens, 'reasoning_effort', timeoutMs);
  } catch (err) { throw new Error('openai ' + ((err && err.message) || err)); }
}

// Standby family. Not pinned by the current season, but kept wired so
// swapping a dark seat is a one-line season edit rather than a new
// provider integration under time pressure.
async function callDeepseek(juror, system, user, maxTokens, timeoutMs = JUROR_TIMEOUT_MS) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY unset');
  try {
    return await callChatCompletions('https://api.deepseek.com/chat/completions', key, juror, system, user, maxTokens, null, timeoutMs);
  } catch (err) { throw new Error('deepseek ' + ((err && err.message) || err)); }
}

async function callGoogle(juror, system, user, maxTokens, timeoutMs = JUROR_TIMEOUT_MS) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY unset');
  const to = withTimeout(timeoutMs);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${juror.model}:generateContent?key=${key}`,
      {
        method: 'POST',
        signal: to.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: user }] }],
          systemInstruction: { parts: [{ text: system }] },
          generationConfig: { maxOutputTokens: maxTokens, temperature: 1.0 },
        }),
      },
    );
    if (!r.ok) throw new Error('gemini ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 160));
    const j = await r.json();
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    return parts.map((p) => p.text || '').join('');
  } finally { to.done(); }
}

// xAI speaks the chat-completions shape. Grok is a fourth independent
// family, which is the only reason it is here: a panel's whole value is
// that its members fail differently, and two seats trained by the same
// lab are one seat wearing two names.
async function callXai(juror, system, user, maxTokens, timeoutMs = JUROR_TIMEOUT_MS) {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error('XAI_API_KEY unset');
  try {
    return await callChatCompletions('https://api.x.ai/v1/chat/completions', key, juror, system, user, maxTokens, 'reasoning_effort', timeoutMs);
  } catch (err) { throw new Error('xai ' + ((err && err.message) || err)); }
}

// OpenRouter, which is how Moonshot's Kimi is reachable: both direct
// Moonshot keys on this account are rejected (verified against
// api.moonshot.ai and api.moonshot.cn on 2026-09-03), and the repo
// already routes Open Lab through OpenRouter.
//
// A ROUTER IS NOT A FAMILY. It can serve any model, so pinning
// `openrouter` as a provider would let the model behind a published
// seat change without the season changing, which is exactly the quiet
// swap the charter exists to prevent. The season therefore pins the
// full upstream model id and OpenRouter is only the transport. The
// attribution headers are what keep this account's usage identifiable.
async function callOpenrouter(juror, system, user, maxTokens, timeoutMs = JUROR_TIMEOUT_MS) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY unset');
  try {
    return await callChatCompletions(
      'https://openrouter.ai/api/v1/chat/completions', key, juror, system, user, maxTokens, 'reasoning_effort', timeoutMs,
      { 'HTTP-Referer': 'https://itsdebatable.com', 'X-Title': 'Debatable' },
    );
  } catch (err) { throw new Error('openrouter ' + ((err && err.message) || err)); }
}

const PROVIDERS = {
  anthropic: callAnthropic,
  openai: callOpenai,
  google: callGoogle,
  deepseek: callDeepseek,
  xai: callXai,
  openrouter: callOpenrouter,
};

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDERS);

// Which providers this deployment can actually reach. A juror whose key
// is unset is reported as unavailable rather than being called and
// failing three times a round; the charter endpoint surfaces this so a
// panel silently running short is visible.
export function jurorAvailable(juror) {
  if (!juror || !PROVIDERS[juror.provider]) return false;
  if (juror.provider === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  if (juror.provider === 'openai') return !!process.env.OPENAI_API_KEY;
  if (juror.provider === 'google') return !!process.env.GEMINI_API_KEY;
  if (juror.provider === 'deepseek') return !!process.env.DEEPSEEK_API_KEY;
  if (juror.provider === 'xai') return !!process.env.XAI_API_KEY;
  if (juror.provider === 'openrouter') return !!process.env.OPENROUTER_API_KEY;
  return false;
}

// Run one juror. Never throws: a failure is data the audit record wants.
export async function callJuror(juror, system, user, maxTokens, parse, timeoutMs = JUROR_TIMEOUT_MS) {
  const started = Date.now();
  const base = {
    jurorId: juror.id,
    provider: juror.provider,
    model: juror.model,
    // Effort is part of the configuration a ballot was decided under, so
    // it belongs on the audit row next to the model id rather than being
    // inferable only from the season document.
    ...(effortOf(juror) ? { effort: effortOf(juror) } : {}),
    promptHash: promptHash(system, user),
  };
  const fn = PROVIDERS[juror.provider];
  if (!fn) return { ...base, ok: false, error: 'unknown provider', ms: 0 };
  try {
    const text = await fn(juror, system, user, maxTokens, timeoutMs);
    const ballot = parse(text);
    return { ...base, ok: true, ballot, ms: Date.now() - started, chars: (text || '').length };
  } catch (err) {
    return {
      ...base,
      ok: false,
      // Truncated on purpose: an audit record is a permanent document
      // and a provider stack trace is not the thing being preserved.
      error: String((err && err.message) || err).slice(0, 200),
      ms: Date.now() - started,
    };
  }
}

// Run the whole panel concurrently. Wall clock is the slowest juror
// rather than the sum, which is what keeps a three-family panel inside
// the same sweep budget a single call used to occupy.
export async function callPanel(jurors, system, user, maxTokens, parse, timeoutMs = JUROR_TIMEOUT_MS) {
  return Promise.all((jurors || []).map((j) => callJuror(j, system, user, maxTokens, parse, timeoutMs)));
}
