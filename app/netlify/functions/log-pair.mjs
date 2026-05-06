// /api/log-pair — Wire 2 of the self-recurring feedback loop.
//
// Records that two generations were produced for the same motion (the
// user hit "Regenerate"), so we can score one against the other.
// Pairwise data is what actually moves an evaluator — point ratings
// are noisy and most users skip them, but "the user threw this one
// away and kept the next one" is a clean head-to-head signal.
//
// Collection: generation_pairs/{id}
//   { uid, leftId, rightId, motion, kind, format, side,
//     winner: 'left'|'right'|null, source: 'implicit'|'judge'|'manual',
//     createdAt }
//
// Winner inference happens in two places:
//   1. log-generation.mjs already updates a generation's lastSignal/
//      rating/saved on every signal. When the right (newer) one
//      receives 'save' or rating>=4, we'll backfill winner='right' on
//      the most-recent pair via /api/log-pair?action=infer below.
//   2. A weekly batch job (distill-voice) can run a Haiku judge over
//      pairs with winner=null and write 'judge' verdicts.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const rateLimits = new Map();
const RATE_WINDOW = 60_000;
const RATE_MAX = 60;
function rateLimited(uid) {
  const now = Date.now();
  const e = rateLimits.get(uid);
  if (!e || now - e.start > RATE_WINDOW) {
    rateLimits.set(uid, { start: now, count: 1 });
    return false;
  }
  e.count += 1;
  return e.count > RATE_MAX;
}

function clamp(s, max) { return typeof s === 'string' ? s.slice(0, max) : ''; }

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed.', 401, request); }
  const uid = decoded.sub;
  if (rateLimited(uid)) return errorResponse('Too many requests.', 429, request);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON', 400, request); }

  const { action } = body;
  const db = getDb();

  try {
    // ── Mode A: record a new head-to-head pair ────────────────────
    if (!action || action === 'pair') {
      const { leftId, rightId, motion, kind, format, side } = body;
      if (!leftId || !rightId || typeof leftId !== 'string' || typeof rightId !== 'string') {
        return errorResponse('Missing leftId/rightId', 400, request);
      }
      if (leftId === rightId) return errorResponse('leftId == rightId', 400, request);
      // Verify both generations belong to this user.
      const [leftDoc, rightDoc] = await Promise.all([
        db.collection('generations').doc(leftId).get(),
        db.collection('generations').doc(rightId).get(),
      ]);
      if (!leftDoc.exists || !rightDoc.exists) return errorResponse('Generation not found', 404, request);
      if (leftDoc.data().uid !== uid || rightDoc.data().uid !== uid) {
        return errorResponse('Generation not found', 404, request);
      }

      const ref = await db.collection('generation_pairs').add({
        uid,
        leftId,
        rightId,
        motion: clamp(motion || leftDoc.data().motion, 600),
        kind: clamp(kind || leftDoc.data().kind, 32),
        format: clamp(format || leftDoc.data().format, 40),
        side: clamp(side || leftDoc.data().side, 32),
        winner: null,
        source: 'implicit',
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log('[log-pair] new pair', uid.slice(0, 6), ref.id, leftId, '→', rightId);
      return jsonResponse({ ok: true, id: ref.id }, 200, request);
    }

    // ── Mode B: infer a winner from a fresh signal on the right ────
    if (action === 'infer') {
      const { rightId, signal } = body;
      if (!rightId || typeof rightId !== 'string') {
        return errorResponse('Missing rightId', 400, request);
      }
      const validSignals = ['save', 'rate_high', 'rate_low', 'discard', 'regenerate'];
      if (!validSignals.includes(signal)) {
        return errorResponse('Invalid signal', 400, request);
      }
      // Find the most-recent pair where this rightId is the right side.
      const snap = await db.collection('generation_pairs')
        .where('uid', '==', uid)
        .where('rightId', '==', rightId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      if (snap.empty) return jsonResponse({ ok: true, found: false }, 200, request);
      const pairRef = snap.docs[0].ref;
      const pair = snap.docs[0].data();
      // Only the FIRST decisive signal sets the winner. Later signals
      // shouldn't flip a recorded result.
      if (pair.winner) return jsonResponse({ ok: true, alreadySet: pair.winner }, 200, request);

      let winner = null;
      if (signal === 'save' || signal === 'rate_high') winner = 'right';
      else if (signal === 'discard' || signal === 'regenerate' || signal === 'rate_low') winner = 'left';
      if (!winner) return jsonResponse({ ok: true, found: true, set: false }, 200, request);

      await pairRef.update({
        winner,
        winnerSetAt: FieldValue.serverTimestamp(),
        winnerSource: 'implicit',
        winnerSignal: signal,
      });
      return jsonResponse({ ok: true, found: true, winner }, 200, request);
    }

    return errorResponse('Unknown action', 400, request);
  } catch (err) {
    console.error('[log-pair] error:', err.message);
    return errorResponse('Failed to log pair.', 500, request);
  }
};

export const config = { path: '/api/log-pair' };
