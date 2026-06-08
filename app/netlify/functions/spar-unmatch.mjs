import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';

// Server-side UNMATCH for background spar (see js/notifications.js → sparLive).
//
// When a user DECLINES (or times out on) a "Match found" card, both queue
// docs are still status:'matched'. The decliner can re-queue its OWN doc
// from the client, but Firestore rules block writing the PEER's doc — so
// without this the peer sits 'matched' and, if they accept, lands in an
// empty room. This admin-SDK function releases BOTH docs back to
// status:'waiting' atomically. The peer's own-doc onSnapshot then sees the
// revert and closes its own card (sparNote "Opponent passed"). Mirrors
// spar-pair.mjs: trust the caller's uid from the verified token, never the
// body; the caller can only release a pairing it's actually part of.

const unmatchAttempts = new Map();
const THROTTLE_MS = 600;
function isThrottled(uid) {
  const now = Date.now();
  const last = unmatchAttempts.get(uid) || 0;
  if (now - last < THROTTLE_MS) return true;
  unmatchAttempts.set(uid, now);
  return false;
}
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [uid, t] of unmatchAttempts) if (t < cutoff) unmatchAttempts.delete(uid);
}, 5 * 60 * 1000);

// Fields that describe a live match — stripped on release so the doc reads
// as a clean waiting entry again.
const MATCH_FIELDS = [
  'room', 'matchedWith', 'matchedWithName', 'proUid', 'conUid',
  'proName', 'conName', 'pairedMotion', 'matchedAt', 'cancelledAt', 'cancelReason',
];
function toWaiting(data) {
  const clean = { ...(data || {}) };
  for (const k of MATCH_FIELDS) delete clean[k];
  clean.status = 'waiting';
  clean.joinedAt = FieldValue.serverTimestamp();
  return clean;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('[spar-unmatch] auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const myUid = decoded.sub;
  if (!myUid) return errorResponse('Invalid token subject', 401, request);
  if (isThrottled(myUid)) return errorResponse('Throttled. Wait a moment.', 429, request);

  const db = getDb();
  const queue = db.collection('matchmaking_queue');
  const myRef = queue.doc(myUid);

  try {
    const result = await db.runTransaction(async (tx) => {
      // All reads first, then all writes (Firestore transaction rule).
      const mineSnap = await tx.get(myRef);
      if (!mineSnap.exists) return { ok: true, released: 0, reason: 'no_doc' };
      const mine = mineSnap.data() || {};
      if (mine.status !== 'matched' || !mine.matchedWith) {
        // Nothing live to release — idempotent success.
        return { ok: true, released: 0, reason: 'not_matched' };
      }
      const peerUid = mine.matchedWith;
      const peerRef = queue.doc(peerUid);
      const peerSnap = await tx.get(peerRef);

      tx.set(myRef, toWaiting(mine));

      // Only release the peer if they're still matched to ME — don't stomp
      // a peer who already moved on or re-matched someone else.
      let released = 1;
      if (peerSnap.exists) {
        const peer = peerSnap.data() || {};
        if (peer.status === 'matched' && peer.matchedWith === myUid) {
          tx.set(peerRef, toWaiting(peer));
          released = 2;
        }
      }
      return { ok: true, released };
    });
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('[spar-unmatch] transaction error:', err?.message || err);
    return errorResponse('Unmatch failed: ' + (err?.message || 'unknown'), 500, request);
  }
};
