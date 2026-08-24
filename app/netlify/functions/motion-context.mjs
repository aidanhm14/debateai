// Does this motion depend on WHERE it applies?
// POST /api/motion-context  { motion, format }
// ->   { needsContext: bool, options: [str], reason: str }
//      | { needsContext: false, disabled: true }   (no key configured)
//
// Called ONCE per matched live round by the same lowest-uid client that
// drives the fact check and the verdict reel (see live-round.html). The
// result goes on the round doc; if needsContext, both debaters agree on a
// setting (US / UK / Worldwide ...) before Speech 1, and the agreed frame
// is handed to the AI judge as the shared premise. A motion whose answer
// does not change by jurisdiction ("democracy is overrated") returns
// needsContext:false and the step never shows.
//
// This file is transport: App Check, a light rate limit (one call per
// round), one Claude call, parse, sanitize, return. It fails OPEN to
// needsContext:false, because a classifier that errors must never block a
// round from starting.

import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';

const CLAUDE_MODEL = 'claude-sonnet-4-6';

// One call per round, so these sit well above a well-behaved room and only
// bite a client stuck in a retry loop.
const USER_LAYERS = [
  { window: 60_000, max: 10, label: 'min' },
  { window: 60 * 60_000, max: 60, label: 'hour' },
];
const IP_LAYERS = [
  { window: 60_000, max: 8, label: 'min' },
  { window: 60 * 60_000, max: 40, label: 'hour' },
];

// A worldwide/global option must always be offered, so a round can never be
// forced into a national frame it does not want. This recognises the ones
// the model tends to return so we do not append a duplicate.
const GLOBAL_RE = /\b(worldwide|global|internationa|any (country|nation)|the world|no specific)\b/i;

const SYSTEM = [
  'You decide whether a debate motion depends on the country or region it is argued about.',
  '',
  'Many motions have the SAME answer everywhere: value claims, analytic claims, and',
  'thought experiments ("democracy is overrated", "the ends justify the means",',
  '"THBT beauty is a curse"). For those, the setting does not change the debate.',
  '',
  'Others turn on a specific legal, political, or economic context that varies by place:',
  'a named institution ("abolish the electoral college" is a US institution), a policy',
  'whose costs and benefits differ sharply by country ("ban private schools", "legalise',
  'all drugs", "adopt a universal basic income"), or a motion that says "this country"',
  'without naming one. For those, debaters should agree on the setting first, or two',
  'people argue past each other about different worlds.',
  '',
  'Return ONLY a JSON object, no prose, no code fence:',
  '{"needsContext": true|false, "options": ["...", "..."], "reason": "one short clause"}',
  '',
  'Rules:',
  '- needsContext is true ONLY when the better side of the debate could plausibly flip',
  '  depending on the country/region, or when the motion names an institution or policy',
  '  that exists in some places and not others.',
  '- When false, options is [] and reason names why the setting does not matter.',
  '- When true, options is 2 to 4 concrete settings for THIS motion, most specific first,',
  '  and the LAST option is always a worldwide/global one. Use real, well-known frames',
  '  (a country, a bloc like the European Union, or a group like "nuclear-armed states").',
  '  If the motion is tied to one country\'s institution, offer just that country and Worldwide.',
  '- Each option is a short label a debater reads at a glance (2 to 4 words), no explanation.',
  '- reason is one short clause, at most 12 words.',
].join('\n');

async function classify(apiKey, motion, format) {
  const user = 'FORMAT: ' + (format || 'general') + '\nMOTION: ' + motion
    + '\n\nReturn the JSON object.';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      // Small JSON payload, but reasoning bills against max_tokens, so keep
      // room rather than truncate the closing brace and blame the parser.
      max_tokens: 700,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('anthropic ' + res.status + ' ' + detail.slice(0, 160));
  }
  const data = await res.json();
  return (data.content || []).map(c => (c && c.text) || '').join('');
}

// Pull the JSON object out of whatever the model returned and clamp it to a
// shape the client can trust. Anything malformed becomes needsContext:false,
// which is the safe default: no card, round proceeds.
function parse(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return { needsContext: false, options: [], reason: '' };
  let obj;
  try { obj = JSON.parse(m[0]); } catch (_) { return { needsContext: false, options: [], reason: '' }; }
  if (!obj || obj.needsContext !== true) return { needsContext: false, options: [], reason: '' };

  let options = (Array.isArray(obj.options) ? obj.options : [])
    .filter(o => typeof o === 'string')
    .map(o => o.trim().replace(/\s+/g, ' ').slice(0, 32))
    .filter(Boolean);
  // Dedupe case-insensitively, keep order.
  const seen = new Set();
  options = options.filter(o => { const k = o.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  // Always guarantee a worldwide option, at the end.
  if (!options.some(o => GLOBAL_RE.test(o))) options.push('Worldwide');
  options = options.slice(0, 4);
  // A single option is not a choice; two is the floor for a real setting.
  if (options.filter(o => !GLOBAL_RE.test(o)).length < 1) return { needsContext: false, options: [], reason: '' };

  return {
    needsContext: true,
    options,
    reason: String(obj.reason || '').trim().slice(0, 120),
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('POST only', 405, request);

  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) {
    return jsonResponse({
      error: 'App verification failed. Reload the page and try again.',
      code: 'APP_CHECK_' + String(appCheck.reason || '').toUpperCase(),
    }, 401, request);
  }

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  // No key: tell the client the step is unavailable so it stops asking and
  // the round runs with no context card.
  if (!claudeKey) return jsonResponse({ needsContext: false, disabled: true }, 200, request);

  // Named accounts meter per uid; anonymous uids are free to mint, so they
  // meter per IP (the 2026-07-28 lesson). Participants are signed in.
  let uid = '';
  const token = extractBearerToken(request);
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      if (isNamedAccount(decoded)) uid = decoded.sub || '';
    } catch (_) { /* anon lane */ }
  }
  const limited = uid
    ? await checkLayers('motioncontext', 'u_' + uid, USER_LAYERS)
    : await checkLayers('motioncontext', 'ip_' + callerIp(request), IP_LAYERS);
  if (!limited.ok) return jsonResponse({ needsContext: false, throttled: limited.layer }, 200, request);

  let body;
  try { body = await request.json(); } catch (_) { return errorResponse('Invalid JSON', 400, request); }
  const motion = String(body.motion || '').slice(0, 400).trim();
  const format = String(body.format || '').slice(0, 60).trim();
  // Too short to be a real motion. No card.
  if (motion.split(/\s+/).length < 3) return jsonResponse({ needsContext: false }, 200, request);

  try {
    const out = parse(await classify(claudeKey, motion, format));
    return jsonResponse(out, 200, request);
  } catch (err) {
    console.warn('[motion-context]', err.message);
    // A classifier that errors must not block a round. Fail open to no card.
    return jsonResponse({ needsContext: false, error: 'unavailable' }, 200, request);
  }
};

export const config = { path: '/api/motion-context' };
