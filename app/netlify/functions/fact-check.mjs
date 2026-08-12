// Live fact check for an in-progress speech.
// POST /api/fact-check  { motion, format, speaker, side, text, checked[] }
// ->   { flags: [...], grounded: bool }   |   { flags: [], disabled: true }
//
// One pass over the speech-so-far, run every ~20s by ONE client in the room
// (see live-round.html: the non-speaking participant drives it, so a 2v2
// bench does not fire four identical checks). The flags it returns go on the
// round doc and render to everyone watching.
//
// The judgement about WHAT is worth flagging, and the quote gate that keeps
// a flag honest, both live in lib/fact-check.mjs. This file is transport:
// auth-optional identity, rate limits, one upstream call, parse, return.
//
// WHY THE RATE LIMITS ARE SHAPED THIS WAY
// A round is ~6 speeches over ~40 minutes, and the client caps itself at 10
// checks per round. The per-caller layers here sit just above that, so a
// well-behaved round never touches them and a client stuck in a retry loop
// stops costing money within a minute. Anonymous callers are not the target
// (spectators never drive checks, participants are signed in) so their lane
// is tight.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';
import {
  factCheckPrompt, parseFactChecks, verifyPrompt, applyVerification,
} from './lib/fact-check.mjs';

const MAX_TEXT = 6000;          // ~900 words, longer than any single speech
const PPLX_MODEL = 'sonar-pro'; // reads live sources and returns them
const CLAUDE_MODEL = 'claude-sonnet-4-6';

const USER_LAYERS = [
  { window: 60_000, max: 6, label: 'min' },
  { window: 60 * 60_000, max: 90, label: 'hour' },
];
const IP_LAYERS = [
  { window: 60_000, max: 8, label: 'min' },
  { window: 60 * 60_000, max: 60, label: 'hour' },
];

async function checkWithPerplexity(apiKey, prompt) {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: PPLX_MODEL,
      max_tokens: 1200,
      temperature: 0,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('perplexity ' + res.status + ' ' + detail.slice(0, 160));
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';

  // sonar-pro returns search_results; older sonar returns citations[].
  // Normalize to [{title,url}] so the card renders one Sources list.
  let sources = [];
  if (Array.isArray(data.search_results)) {
    sources = data.search_results.filter(r => r && r.url).map(r => ({ title: r.title || r.url, url: r.url }));
  } else if (Array.isArray(data.citations)) {
    sources = data.citations.filter(u => typeof u === 'string').map(u => ({ title: u, url: u }));
  }
  return { text, sources };
}

async function checkWithClaude(apiKey, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      // Generous for a two-line JSON payload: these models bill any
      // thinking against max_tokens, and a cap tuned to the visible output
      // is how you get a truncated response and blame your own parser.
      max_tokens: 2000,
      temperature: 0,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('anthropic ' + res.status + ' ' + detail.slice(0, 160));
  }
  const data = await res.json();
  const text = (data.content || []).map(c => (c && c.text) || '').join('');
  return { text, sources: [] };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('POST only', 405, request);

  const pplxKey = process.env.PERPLEXITY_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  // Neither key configured: tell the client to stop asking rather than
  // failing a request every 20 seconds for the rest of the round.
  if (!pplxKey && !claudeKey) return jsonResponse({ flags: [], disabled: true }, 200, request);

  let uid = '';
  const token = extractBearerToken(request);
  if (token) {
    try { uid = (await verifyIdToken(token)).sub || ''; } catch (_) { /* anon lane */ }
  }
  const limited = uid
    ? await checkLayers('factcheck', 'u_' + uid, USER_LAYERS)
    : await checkLayers('factcheck', 'ip_' + callerIp(request), IP_LAYERS);
  if (!limited.ok) return jsonResponse({ flags: [], throttled: limited.layer }, 200, request);

  let body;
  try { body = await request.json(); } catch (_) { return errorResponse('Invalid JSON', 400, request); }

  const text = String(body.text || '').slice(0, MAX_TEXT).trim();
  // Under ~40 words there is rarely a checkable claim yet, and a pass on a
  // half-sentence is where a checker invents things to say.
  if (text.split(/\s+/).length < 40) return jsonResponse({ flags: [] }, 200, request);

  const d = {
    motion: String(body.motion || '').slice(0, 400),
    format: String(body.format || '').slice(0, 60),
    speaker: String(body.speaker || '').slice(0, 60),
    side: String(body.side || '').slice(0, 40),
    text,
    checked: (Array.isArray(body.checked) ? body.checked : [])
      .filter(c => typeof c === 'string').slice(0, 12).map(c => c.slice(0, 160)),
  };

  const grounded = !!pplxKey;
  const prompt = factCheckPrompt(d, grounded);

  const ask = (p) => (grounded ? checkWithPerplexity(pplxKey, p) : checkWithClaude(claudeKey, p));

  try {
    const res = await ask(prompt);
    const candidates = parseFactChecks(res.text, d, { grounded, sources: res.sources });
    if (!candidates.length) return jsonResponse({ flags: [], grounded }, 200, request);

    // Second opinion. One call for the whole batch (there are at most two),
    // so the round waits for one extra round trip, not one per card.
    const check = await ask(verifyPrompt(d, candidates));
    const flags = applyVerification(check.text, candidates);
    return jsonResponse({ flags, grounded, considered: candidates.length }, 200, request);
  } catch (err) {
    console.warn('[fact-check]', err.message);
    // A checker that errors is a checker that says nothing. The round is
    // not waiting on it, so never surface a failure into the broadcast.
    return jsonResponse({ flags: [], error: 'unavailable' }, 200, request);
  }
};

export const config = { path: '/api/fact-check' };
