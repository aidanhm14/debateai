import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';

// Server-side pair-matcher for /spar.
//
// The bug we're fixing: pairing was a client-side Firestore transaction
// that updated BOTH the caller's queue doc AND the peer's queue doc in
// one atomic write. Firestore security rules don't allow user A to
// write user B's doc, so the transaction silently failed for the
// cross-user update — even after the polling query had found a valid
// peer. User saw "1 other debater in your queue" forever, then the AI
// fallback kicked in at 60s.
//
// Fix: move the pair operation to a Netlify function with admin SDK
// credentials. Admin writes bypass Firestore rules so the function can
// update both queue docs atomically. Both clients' onSnapshot
// listeners on their own queue doc still fire on the update; the
// existing client-side navigation flow (subscribeMyDoc → location.href
// /live-round) is unchanged.
//
// Auth: requires a signed-in Firebase ID token (the caller's). We
// trust the caller's uid from the verified token, NOT from the body.
// Body only supplies peerUid + format (for format-mismatch defense).

const VALID_FORMATS = new Set([
  'quick','apda','bp','worlds','asian','ld','pf','policy',
]);

// Per-uid throttle so a misbehaving client can't fan out pair attempts.
const pairAttempts = new Map();
const PAIR_THROTTLE_MS = 600; // soft cap; one attempt every ~0.6s

function isThrottled(uid) {
  const now = Date.now();
  const last = pairAttempts.get(uid) || 0;
  if (now - last < PAIR_THROTTLE_MS) return true;
  pairAttempts.set(uid, now);
  return false;
}

// Garbage-collect the throttle map every 5 min.
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [uid, t] of pairAttempts) {
    if (t < cutoff) pairAttempts.delete(uid);
  }
}, 5 * 60 * 1000);

function shortName(profile) {
  const full = String(profile?.displayName || profile?.name || '').trim();
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts[0] + ' ' + parts[parts.length - 1][0].toUpperCase() + '.';
  }
  return parts[0] || 'Anonymous';
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
    console.error('[spar-pair] auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const myUid = decoded.sub;
  if (!myUid) return errorResponse('Invalid token subject', 401, request);

  if (isThrottled(myUid)) {
    return errorResponse('Pair attempts throttled. Wait a moment.', 429, request);
  }

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const peerUid = String(body?.peerUid || '').trim();
  const format = String(body?.format || '').trim().toLowerCase();
  const broaden = !!body?.broaden;

  if (!peerUid || peerUid === myUid) {
    return errorResponse('Invalid peerUid', 400, request);
  }
  if (!VALID_FORMATS.has(format)) {
    return errorResponse('Invalid format', 400, request);
  }

  const db = getDb();
  const queue = db.collection('matchmaking_queue');
  const myRef = queue.doc(myUid);
  const peerRef = queue.doc(peerUid);

  // Deterministic room name from the lex-sorted UID pair so both
  // clients converge on the same /live-round room. Mirrors the
  // client-side fallback path so existing live-round consumers don't
  // need updating.
  const pair = [myUid, peerUid].sort();
  const room = 'SparMatch-' + pair[0].slice(0, 8) + '-' + pair[1].slice(0, 8);
  const proUid = pair[0];
  const conUid = pair[1];

  try {
    const result = await db.runTransaction(async (tx) => {
      const [mineSnap, theirsSnap] = await Promise.all([
        tx.get(myRef),
        tx.get(peerRef),
      ]);

      if (!mineSnap.exists || !theirsSnap.exists) {
        return { ok: false, reason: 'queue_doc_missing' };
      }
      const mine = mineSnap.data();
      const theirs = theirsSnap.data();
      if (mine.status !== 'waiting' || theirs.status !== 'waiting') {
        return { ok: false, reason: 'lost_race' };
      }
      // Format-mismatch defense: same format OR both broadened.
      const formatMatches = mine.format === theirs.format;
      const bothBroad = !!mine.broaden && !!theirs.broaden;
      if (!formatMatches && !bothBroad) {
        return { ok: false, reason: 'format_mismatch' };
      }

      const myShort = shortName(mine);
      const peerShort = shortName(theirs);
      const common = {
        status: 'matched',
        room,
        matchedAt: FieldValue.serverTimestamp(),
        proUid,
        conUid,
        proName: proUid === myUid ? myShort : peerShort,
        conName: conUid === myUid ? myShort : peerShort,
      };

      tx.update(myRef, {
        ...common,
        matchedWith: peerUid,
        matchedWithName: peerShort,
      });
      tx.update(peerRef, {
        ...common,
        matchedWith: myUid,
        matchedWithName: myShort,
      });

      return {
        ok: true,
        room,
        proUid,
        conUid,
        proName: common.proName,
        conName: common.conName,
        matchedWithName: peerShort,
      };
    });

    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('[spar-pair] transaction error:', err?.message || err);
    return errorResponse('Pair transaction failed: ' + (err?.message || 'unknown'), 500, request);
  }
};
