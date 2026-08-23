// /api/clash-map — the argument map for a finished LIVE round.
//
// Draws the clash: each argument that carried the round, which side made
// it, the verbatim line where they made it, and what the other side
// actually did with it (answered / conceded / contradicted themselves /
// dropped it).
//
// WHY THIS IS A SERVER ENDPOINT rather than a client call like the round
// notes. The whole value of a clash map is the QUOTE GATE: every row
// carries a verbatim quote, the quote is checked against the transcript,
// and a row whose quote is not there is dropped individually. Running
// that check in the browser would let a client publish rows the gate
// never saw, and this artifact renders under a ballot on a judged
// surface, where "they said X" about a thing nobody said is the one
// output that cannot ship. The gate lives in lib/clash-map.mjs beside
// the async version so the two can never drift apart.
//
// WHAT IT IS NOT: a judge. It never names a winner, never scores, and
// the ballot never reads it. Same posture as the fact check and the
// round notes; the difference is only that this one is drawn once, at
// the end, over the whole round.
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';
import { liveClashMapPrompt, parseClashMapForBenches } from './lib/clash-map.mjs';

const MODEL = process.env.LIVE_CLASH_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 1600;
const MAX_SPEECH_CHARS = 9000;   // a long speech, generously
const MAX_TOTAL_CHARS = 42000;   // whole-round ceiling before the call

// One map per round, so these are sized for "a person finishing rounds"
// rather than for a stream of requests. A named account gets its own
// lane; anonymous callers (spectators) meter per IP, because anonymous
// uids are free to mint and keying on one is no limit at all.
const USER_LAYERS = [
  { windowMs: 60 * 60 * 1000, max: 12, label: 'hour' },
  { windowMs: 24 * 60 * 60 * 1000, max: 40, label: 'day' },
];
const IP_LAYERS = [
  { windowMs: 60 * 60 * 1000, max: 8, label: 'hour' },
  { windowMs: 24 * 60 * 60 * 1000, max: 25, label: 'day' },
];

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

  const key = process.env.ANTHROPIC_API_KEY;
  // Tell the client to stop asking rather than failing on every round.
  if (!key) return jsonResponse({ clashMap: null, disabled: true }, 200, request);

  let uid = '';
  const token = extractBearerToken(request);
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      if (isNamedAccount(decoded)) uid = decoded.sub || '';
    } catch (_) { /* anon lane */ }
  }
  const limited = uid
    ? await checkLayers('clashmap', 'u_' + uid, USER_LAYERS)
    : await checkLayers('clashmap', 'ip_' + callerIp(request), IP_LAYERS);
  if (!limited.ok) return jsonResponse({ clashMap: null, throttled: limited.layer }, 200, request);

  let body;
  try { body = await request.json(); } catch (_) { return errorResponse('Invalid JSON', 400, request); }

  const raw = Array.isArray(body.speeches) ? body.speeches : [];
  if (raw.length < 2) return jsonResponse({ clashMap: null, reason: 'too_few_speeches' }, 200, request);

  // Normalize and bound. `bench` must be exactly prop|opp: the client
  // collapses its format's sides down before sending, because this
  // module deliberately knows nothing about format tables.
  let total = 0;
  const speeches = [];
  for (const sp of raw.slice(0, 12)) {
    const bench = sp && sp.bench === 'opp' ? 'opp' : sp && sp.bench === 'prop' ? 'prop' : null;
    const text = String((sp && sp.text) || '').slice(0, MAX_SPEECH_CHARS).trim();
    if (!bench || !text) continue;
    total += text.length;
    if (total > MAX_TOTAL_CHARS) break;
    speeches.push({
      bench,
      text,
      code: String((sp && sp.code) || '').slice(0, 12),
      speakerName: String((sp && sp.speakerName) || '').slice(0, 60),
      sideLabel: String((sp && sp.sideLabel) || '').slice(0, 40),
    });
  }
  if (speeches.length < 2) return jsonResponse({ clashMap: null, reason: 'too_few_speeches' }, 200, request);

  // The haystacks the gate verifies against are built HERE, from the same
  // text sent to the model, so a client cannot widen what counts as
  // "in the transcript" by sending one thing and verifying another.
  const bench = { prop: '', opp: '' };
  for (const sp of speeches) bench[sp.bench] += ' ' + sp.text;

  const { system, user } = liveClashMapPrompt({
    motion: String(body.motion || '').slice(0, 600),
    formatName: String(body.formatName || '').slice(0, 60),
    propName: String(body.propName || '').slice(0, 60),
    oppName: String(body.oppName || '').slice(0, 60),
    propLabel: String(body.propLabel || '').slice(0, 40),
    oppLabel: String(body.oppLabel || '').slice(0, 40),
    speeches,
  });

  let text = '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('[clash-map] provider', res.status, detail.slice(0, 200));
      return jsonResponse({ clashMap: null, reason: 'provider_error' }, 200, request);
    }
    const j = await res.json();
    text = (Array.isArray(j.content) ? j.content : [])
      .map((c) => (c && c.text) || '').join('');
  } catch (err) {
    console.warn('[clash-map] fetch failed', err && err.message);
    return jsonResponse({ clashMap: null, reason: 'provider_error' }, 200, request);
  }

  // Individually gated: a hallucinated row is dropped, the rest survive.
  // `rejected` rides along so a map that lost most of its rows is
  // visible as such rather than silently thin.
  const clashMap = parseClashMapForBenches(text, bench);
  return jsonResponse({ clashMap, model: clashMap ? MODEL : undefined }, 200, request);
};

export const config = { path: '/api/clash-map' };
