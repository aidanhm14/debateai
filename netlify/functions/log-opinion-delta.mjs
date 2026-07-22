import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Opinion-delta capture — measures what actually changes a mind.
//
// A spectator states a stance on the motion BEFORE the round, taps a
// button whenever an argument moves them DURING it, and restates the
// stance AFTER the ballot. The before/after delta plus the tap
// timestamps is the dataset: not "was the speech good" but "did it
// move anyone, and at which second".
//
// Collection written:
//  - opinion_deltas: one doc per spectator per round.
//
// Anonymous participation is allowed on purpose. Spectating is the
// lowest-commitment surface on the site and a sign-in wall here would
// collect nothing. An anonId (stable localStorage id, shared with the
// micro-poll capture) is the ownership key; when the same visitor signs
// in later the uid is attached to the doc on the next write.

const MAX_BODY_BYTES = 16_000;
const MAX_MOTION = 2_000;
const MAX_FIELD = 120;
const MAX_MOVES = 200;        // taps per round; a real round yields <30
const ROUND_MAX_MS = 6 * 60 * 60 * 1000;  // reject tap offsets beyond 6h

const VALID_SIDES = new Set(['pro', 'con', 'undecided']);

// Per-IP throttle, matching the posture of the other anon-writable
// endpoint (poll-submit). A spectator creates one doc and updates it a
// handful of times per round, so these ceilings are far above real use
// and only bite bots.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const DAY_LIMIT = 300;
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

// Same shape as log-generation's sanitizeSid: opaque, bounded, no PII.
function sanitizeAnonId(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s || s.length > 64) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return '';
  return s;
}

function readConfidence(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// Normalized taps: ints, in-range, sorted, deduped, capped. The client
// sends the FULL array it holds rather than a delta, so a retried or
// out-of-order request is idempotent instead of double-counting.
function readMoves(raw) {
  if (!Array.isArray(raw)) return null;
  const seen = new Set();
  for (const v of raw.slice(0, MAX_MOVES * 2)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const ms = Math.round(v);
    if (ms < 0 || ms > ROUND_MAX_MS) continue;
    seen.add(ms);
  }
  return Array.from(seen).sort((a, b) => a - b).slice(0, MAX_MOVES);
}

// Stance projected onto a signed persuasion axis: pro = +confidence,
// con = -confidence, undecided = 0. `shift` is the movement along that
// axis, so a 70-confident pro who ends 40-confident con reads as -110
// rather than as an uninterpretable pair of numbers. Range -200..200.
function stanceAxis(side, conf) {
  if (side === 'pro') return conf;
  if (side === 'con') return -conf;
  return 0;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return errorResponse('Payload too large', 413, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400, request); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse('Invalid JSON body', 400, request);
  }

  const anonId = sanitizeAnonId(body.anonId);
  if (!anonId) return errorResponse('Missing or invalid anonId', 400, request);

  // Signing in is optional here. When a token is present we attach the
  // uid; when it is absent the anonId alone carries the row.
  const token = extractBearerToken(request);
  let uid = null;
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.sub;
    } catch (err) {
      console.error('log-opinion-delta auth error:', err.message);
      return errorResponse('Authentication failed. Please sign in again.', 401, request);
    }
  } else {
    const appCheckResult = await checkAppCheck(request);
    if (!appCheckResult.ok) {
      return errorResponse('App verification failed. Reload the page and try again.', 401, request);
    }
  }

  const ip = clientIp(request);
  const rateKey = uid || anonId + ':' + ip;
  if (isLimited(minuteLimits, rateKey, RATE_LIMIT, RATE_WINDOW_MS)) {
    return errorResponse('Rate limit exceeded. Try again shortly.', 429, request);
  }
  if (isLimited(dayLimits, rateKey, DAY_LIMIT, DAY_WINDOW_MS)) {
    return errorResponse('Rate limit exceeded. Try again later.', 429, request);
  }

  const { action } = body;

  try {
    const db = getDb();

    // ── Mode A: opening stance ───────────────────────────────────────
    if (action === 'create' || !action) {
      const roundId = clip(body.roundId, MAX_FIELD);
      const motion = clip(body.motion, MAX_MOTION);
      const format = clip(body.format, 40);
      const sideBefore = clip(body.sideBefore, 20);
      const confBefore = readConfidence(body.confBefore);

      if (!roundId) return errorResponse('Missing roundId', 400, request);
      if (!VALID_SIDES.has(sideBefore)) return errorResponse('Invalid sideBefore', 400, request);
      if (confBefore === null) return errorResponse('Invalid confBefore', 400, request);

      const doc = {
        roundId,
        motion,
        format,
        uid,
        anonId,
        sideBefore,
        confBefore,
        movedAt: [],
        sideAfter: null,
        confAfter: null,
        flipped: null,
        shift: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      const ref = await db.collection('opinion_deltas').add(doc);
      console.log('[log-opinion-delta] create round=', roundId, 'side=', sideBefore, 'id=', ref.id);
      return jsonResponse({ ok: true, id: ref.id }, 200, request);
    }

    // ── Mode B: taps during, and the closing stance ──────────────────
    if (action === 'update') {
      const id = clip(body.id, MAX_FIELD);
      if (!id) return errorResponse('Missing id', 400, request);

      const ref = db.collection('opinion_deltas').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return errorResponse('Opinion delta not found', 404, request);

      // Ownership: the anonId must match the row that was created. A
      // signed-in caller may also claim a row they created anonymously
      // in the same browser, which is how the uid gets attached.
      const existing = snap.data();
      const ownsByAnon = existing.anonId === anonId;
      const ownsByUid = uid && existing.uid === uid;
      if (!ownsByAnon && !ownsByUid) {
        return errorResponse('Opinion delta not found', 404, request);
      }

      const update = { updatedAt: FieldValue.serverTimestamp() };

      // Attach the uid the first time a signed-in write lands on a row
      // that was opened anonymously.
      if (uid && !existing.uid) update.uid = uid;

      if (body.movedAt !== undefined) {
        const moves = readMoves(body.movedAt);
        if (moves === null) return errorResponse('Invalid movedAt', 400, request);
        update.movedAt = moves;
      }

      // Closing stance. Both fields land together or not at all, so a
      // row is never half-restated.
      if (body.sideAfter !== undefined || body.confAfter !== undefined) {
        const sideAfter = clip(body.sideAfter, 20);
        const confAfter = readConfidence(body.confAfter);
        if (!VALID_SIDES.has(sideAfter)) return errorResponse('Invalid sideAfter', 400, request);
        if (confAfter === null) return errorResponse('Invalid confAfter', 400, request);

        update.sideAfter = sideAfter;
        update.confAfter = confAfter;
        // Derived server-side so the persuasion metric can't be shaped
        // by the client.
        update.flipped = sideAfter !== existing.sideBefore
          && sideAfter !== 'undecided'
          && existing.sideBefore !== 'undecided';
        update.shift = stanceAxis(sideAfter, confAfter)
          - stanceAxis(existing.sideBefore, existing.confBefore);
      }

      await ref.update(update);
      return jsonResponse({ ok: true }, 200, request);
    }

    return errorResponse('Unknown action', 400, request);
  } catch (err) {
    console.error('log-opinion-delta error:', err.message, err.code || '');
    return errorResponse('Failed to log opinion delta', 500, request);
  }
};

export const config = {
  path: '/api/log-opinion-delta',
};
