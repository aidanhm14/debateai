import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { createHash } from 'crypto';

// Anonymous feedback capture for the on-scroll micro-poll and the
// post-round micro-survey (app/js/micro-poll.js). One Firestore doc per
// answer in `poll_responses`.
//
// No auth on purpose: feedback has to work for logged-out marketing
// visitors, and the whole point is a low-friction one-tap answer. The
// data is private (admin-only reads), so the only real threat is spam
// text — bounded here by strict per-IP rate limits + hard size caps.
// The IP is stored only as a salted hash, never raw, so a submission
// can be de-duped/grouped without keeping PII.

const MAX_TEXT = 600;      // free-text "tell us more"
const MAX_FIELD = 120;     // poll id, choice label, page path, variant
const MAX_BODY_BYTES = 8_000;

// Per-IP throttle. Feedback is cheap to write but we don't want a bot
// filling the collection. 8/min catches a human answering a couple of
// polls; 40/day caps sustained abuse from one address.
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60_000;
const DAY_LIMIT = 40;
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

const minuteLimits = new Map();
const dayLimits = new Map();

function isLimited(store, key, max, windowMs) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

// Drop stale rate-limit buckets so the maps don't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of minuteLimits) if (now - v.windowStart > RATE_WINDOW_MS) minuteLimits.delete(k);
  for (const [k, v] of dayLimits) if (now - v.windowStart > DAY_WINDOW_MS) dayLimits.delete(k);
}, 10 * 60_000).unref?.();

function clientIp(request) {
  const h = request.headers;
  return (
    h.get('x-nf-client-connection-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    h.get('cf-connecting-ip') ||
    'unknown'
  );
}

function clip(v, n) {
  return typeof v === 'string' ? v.slice(0, n) : '';
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength && contentLength > MAX_BODY_BYTES) return errorResponse('Payload too large', 413, request);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400, request); }

  const ip = clientIp(request);
  if (isLimited(minuteLimits, ip, RATE_LIMIT, RATE_WINDOW_MS)) return errorResponse('Rate limit exceeded. Try again shortly.', 429, request);
  if (isLimited(dayLimits, ip, DAY_LIMIT, DAY_WINDOW_MS)) return errorResponse('Rate limit exceeded. Try again later.', 429, request);

  const poll = clip(body.poll, MAX_FIELD);
  const choice = clip(body.choice, MAX_FIELD);
  const text = clip(body.text, MAX_TEXT);
  const page = clip(body.page, MAX_FIELD);
  const variant = clip(body.variant, MAX_FIELD);
  const sessionId = clip(body.sessionId, MAX_FIELD);

  if (!poll) return errorResponse('Missing poll id', 400, request);
  if (!choice && !text) return errorResponse('Empty response', 400, request);

  // Salted, truncated IP hash: lets us group/dedupe answers without ever
  // storing the raw address. Salt keeps the space un-reversible.
  const ipHash = createHash('sha256').update('debateit-poll:' + ip).digest('hex').slice(0, 16);

  try {
    const db = getDb();
    await db.collection('poll_responses').add({
      poll,
      choice,
      text,
      page,
      variant,
      sessionId,
      ipHash,
      ua: clip(request.headers.get('user-agent'), 240),
      createdAt: FieldValue.serverTimestamp(),
    });
    return jsonResponse({ ok: true }, 200, request);
  } catch (e) {
    console.error('[poll-submit] write failed:', e.message);
    return errorResponse('Could not record response', 500, request);
  }
};

export const config = {
  path: '/api/poll-submit',
};
