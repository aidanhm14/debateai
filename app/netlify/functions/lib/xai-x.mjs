// xAI Agent Tools client, scoped to X search.
//
// This is how live X discourse gets into the product. We do NOT scrape
// x.com: no API key exists for the X API here, and browser scraping is a
// ToS violation that Cloudflare kills within a week anyway. xAI's Agent
// Tools API exposes first-party X search (x_keyword_search +
// x_semantic_search) behind the XAI_API_KEY that already powers
// grok.mjs, so the firehose arrives through a supported door.
//
// Endpoint shape verified live 2026-08-11. Do NOT re-derive this from
// training-set memory: the older /v1/chat/completions "Live Search"
// (search_parameters: { sources: [{ type: 'x' }] }) is DEPRECATED and
// now returns a hard error pointing here. The GA shape is:
//
//   POST https://api.x.ai/v1/responses
//   { model, input, tools: [{ type: 'x_search' }] }
//
// The model decides how many searches to run and emits one
// custom_tool_call per search. Each x_search call is billed (~$0.015),
// so the caller's prompt caps the search count — that cap is the single
// biggest lever on this pipeline's cost.
//
// Response shape: output[] contains reasoning blocks, custom_tool_call
// blocks (one per search), and a final message block whose content[]
// carries .text plus .annotations[] of url_citation objects pointing at
// the individual posts. Those citations are the receipts; we keep them
// so every published motion can be traced back to real posts.

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_MODEL = process.env.XAI_PULSE_MODEL || 'grok-4.5';
const XAI_URL = 'https://api.x.ai/v1/responses';

// A single pulse query can legitimately take a while: the model fans out
// several X searches and reads the results before answering.
const TIMEOUT_MS = parseInt(process.env.XAI_PULSE_TIMEOUT_MS || '180000', 10);

/**
 * Run one X-grounded query.
 *
 * @param {string} prompt   The question to answer against live X posts.
 * @param {object} [opts]
 * @param {number} [opts.maxSearches] Soft cap, enforced by instruction.
 *   The API has no hard parameter for this, so we ask in the prompt.
 *   Every search is billed, so this is the cost dial.
 * @returns {Promise<{ text: string, citations: string[], searchCount: number, costUsd: number }>}
 */
export async function searchX(prompt, opts = {}) {
  if (!XAI_API_KEY) throw new Error('XAI_API_KEY not set');

  const maxSearches = opts.maxSearches || 4;
  const input = [
    prompt,
    '',
    `Use at most ${maxSearches} X searches. Prefer a few broad, well-chosen`,
    'queries over many narrow ones.',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(XAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        input,
        tools: [{ type: 'x_search' }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`xAI ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  return parseResponse(data);
}

// Pull the answer text, the post citations, and the billing facts out of
// the Responses envelope. Defensive throughout: an unexpected block type
// should degrade to "no text" rather than throw inside a nightly cron.
function parseResponse(data) {
  const output = Array.isArray(data && data.output) ? data.output : [];

  let text = '';
  const citations = [];

  for (const block of output) {
    if (!block || block.type !== 'message') continue;
    const content = Array.isArray(block.content) ? block.content : [];
    for (const part of content) {
      if (part && typeof part.text === 'string') text += part.text;
      const anns = (part && part.annotations) || [];
      for (const a of anns) {
        if (a && a.type === 'url_citation' && a.url) citations.push(a.url);
      }
    }
  }

  const usage = (data && data.usage) || {};
  const toolUsage = usage.server_side_tool_usage_details || {};
  // cost_in_usd_ticks is xAI's integer-tick accounting: 1 tick = 1e-10 USD.
  const costUsd = typeof usage.cost_in_usd_ticks === 'number'
    ? usage.cost_in_usd_ticks / 1e10
    : 0;

  return {
    text,
    citations: [...new Set(citations)],
    searchCount: toolUsage.x_search_calls || 0,
    costUsd,
  };
}

/**
 * Extract the first JSON value from a model response. Models wrap JSON in
 * ```json fences, prose, or both, so a bare JSON.parse fails often enough
 * that every caller would otherwise reimplement this.
 *
 * Returns null rather than throwing: a malformed answer for one domain
 * should skip that domain, not kill the nightly run.
 */
export function extractJson(text) {
  if (!text || typeof text !== 'string') return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [];
  if (fenced && fenced[1]) candidates.push(fenced[1].trim());

  // Fall back to the outermost bracketed span.
  const firstArr = text.indexOf('[');
  const firstObj = text.indexOf('{');
  const start = firstArr === -1 ? firstObj
    : firstObj === -1 ? firstArr
    : Math.min(firstArr, firstObj);
  if (start !== -1) {
    const open = text[start];
    const close = open === '[' ? ']' : '}';
    const end = text.lastIndexOf(close);
    if (end > start) candidates.push(text.slice(start, end + 1));
  }

  for (const c of candidates) {
    try { return JSON.parse(c); } catch { /* try the next candidate */ }
  }
  return null;
}
