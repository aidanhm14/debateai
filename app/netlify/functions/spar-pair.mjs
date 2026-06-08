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
  'quick','apda','bp','worlds','asian','ld','pf','policy','casual',
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

// Stale-doc thresholds. iOS Safari often doesn't fire `pagehide` when
// the user backgrounds the tab, so phone sessions leave ghost
// `status: 'waiting'` docs in the queue. The client polls oldest-first
// (joinedAt ASC), so without a stale filter the user's pair attempts
// would always target a ghost while the real peer sits behind it in
// the queue. STALE_PEER_MS is the per-call peer-doc skip; REAPER_MS
// is the broader sweep cutoff (more permissive — those docs are
// definitely abandoned).
const STALE_PEER_MS = 3 * 60 * 1000;   // 3 min: well past the 60s AI fallback
const REAPER_MS     = 6 * 60 * 1000;   // 6 min: anything older is obviously dead
const REAPER_THROTTLE_MS = 60 * 1000;  // run the sweep at most once a minute
let lastReaperAt = 0;

// Returns the queue doc's joinedAt in epoch-ms. CRITICAL: an
// unresolved/missing timestamp means "just written" (Firestore
// serverTimestamp() lands as null on the local write and resolves a
// beat later on the server), NOT "epoch 0". Returning 0 here was the
// pairing bug: peerAgeMs = Date.now() - 0 ≈ 57 years > STALE_PEER_MS,
// so a freshly-queued peer got judged a ghost and force-cancelled the
// instant two users joined within ~1s of each other. Default to "now"
// (age ≈ 0 = fresh) so we never cancel a peer we can't age. The reaper
// query (joinedAt < cutoff) skips unresolved-timestamp docs anyway.
function joinedAtMs(data) {
  if (!data) return Date.now();
  const j = data.joinedAt;
  if (!j) return Date.now();
  if (typeof j.toMillis === 'function') return j.toMillis();
  if (j._seconds != null) return j._seconds * 1000;
  if (j.seconds != null) return j.seconds * 1000;
  return Date.now();
}

// One-shot reaper sweep. Marks any waiting doc older than REAPER_MS
// as cancelled so the next polling cycle stops seeing it. Throttled
// to once per minute across the whole function instance — multiple
// concurrent pair attempts share the rate-limit. Fails open (logs +
// continues) so a reaper hiccup never blocks a real pair.
async function reapStaleDocs(db) {
  const now = Date.now();
  if (now - lastReaperAt < REAPER_THROTTLE_MS) return;
  lastReaperAt = now;
  try {
    const cutoffDate = new Date(now - REAPER_MS);
    // Firestore Timestamp comparison: pass a JS Date and the SDK
    // coerces both sides. limit(40) caps the burst so we don't
    // accidentally write hundreds of docs on a cold queue.
    const snap = await db.collection('matchmaking_queue')
      .where('status', '==', 'waiting')
      .where('joinedAt', '<', cutoffDate)
      .limit(40)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'cancelled',
        cancelledAt: FieldValue.serverTimestamp(),
        cancelReason: 'stale_reaper',
      });
    });
    await batch.commit();
    console.log('[spar-pair] reaped', snap.size, 'stale queue docs');
  } catch (err) {
    // Most likely cause if this fails: missing composite index on
    // (status, joinedAt). Log clearly so the build owner can add it.
    console.warn('[spar-pair] reaper failed (likely missing composite index status+joinedAt):', err?.message || err);
  }
}

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

  // Fire the stale-doc reaper on the side. We don't await because the
  // user's polling loop will pick the cleaner queue on its next tick
  // anyway, and we'd rather not stack reaper latency on top of the
  // pair transaction's own round-trip.
  reapStaleDocs(db);

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
      // Stale-peer skip. The client's polling sorts oldest-first, so
      // without this filter every pair attempt would target the oldest
      // ghost in the queue (likely an iOS Safari session that didn't
      // fire pagehide) while the real live peer sits behind it. Mark
      // the ghost as cancelled and ask the client to retry; on the
      // next tick its polling will sort to a fresher peer.
      const peerAgeMs = Date.now() - joinedAtMs(theirs);
      if (peerAgeMs > STALE_PEER_MS) {
        tx.update(peerRef, {
          status: 'cancelled',
          cancelledAt: FieldValue.serverTimestamp(),
          cancelReason: 'stale_peer_skip',
        });
        return { ok: false, reason: 'stale_peer' };
      }
      // Format-mismatch defense: same format OR both broadened.
      const formatMatches = mine.format === theirs.format;
      const bothBroad = !!mine.broaden && !!theirs.broaden;
      if (!formatMatches && !bothBroad) {
        return { ok: false, reason: 'format_mismatch' };
      }

      const myShort = shortName(mine);
      const peerShort = shortName(theirs);
      // Older joiner's motion wins (theirs is older because the
      // poller sorted oldest-first). Both clients read pairedMotion
      // from their now-matched queue doc so the casual-room banner
      // shows the SAME motion on both sides. Falls back to the new
      // joiner's motion if the older joiner didn't supply one, then
      // empty string for non-casual pairings that don't pass a
      // motion at all (/spar). Capped to 280 chars to match the
      // client-side write cap.
      const pairedMotion = String(theirs.motion || mine.motion || '').slice(0, 280);
      const common = {
        status: 'matched',
        room,
        matchedAt: FieldValue.serverTimestamp(),
        proUid,
        conUid,
        proName: proUid === myUid ? myShort : peerShort,
        conName: conUid === myUid ? myShort : peerShort,
        pairedMotion,
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
