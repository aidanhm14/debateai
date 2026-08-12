// Audience topic board — upvote a request.
// Endpoint: POST /api/topic-vote
// Payload: { topicId }
//
// One vote per person per topic, enforced server-side by a marker doc at
// topic_request_votes/{topicId}__{voterKey}. Signed-in voters key on uid;
// everyone else keys on a hash of their IP. The client also keeps a
// localStorage record, but that is UI state, not the guard.
//
// The create-marker-then-increment order matters: if the increment fails
// we would rather lose a vote than double-count one, and a create that
// loses the race throws ALREADY_EXISTS instead of silently overwriting.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { COLLECTION, VOTES_COLLECTION, voterKey, voteDocId } from './lib/topic-requests.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('POST only', 405, request);

  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) {
    return errorResponse('App verification failed. Reload and try again.', 401, request);
  }

  const ip = callerIp(request);
  const rl = await checkLayers('topic-vote', ip, [
    { label: 'min', window: 60_000, max: 25 },
    { label: 'hour', window: 3_600_000, max: 200 },
  ]);
  if (!rl.ok) {
    return errorResponse('Slow down a moment.', 429, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const id = typeof body.topicId === 'string' ? body.topicId.trim() : '';
  // Doc ids from topicId() are 16 lowercase hex chars. Anything else is a
  // malformed or hand-crafted call, and rejecting it here keeps junk out
  // of the votes collection.
  if (!/^[0-9a-f]{16}$/.test(id)) {
    return errorResponse('Unknown topic.', 400, request);
  }

  let uid = null;
  const token = extractBearerToken(request);
  if (token) {
    try {
      const payload = await verifyIdToken(token);
      uid = payload.sub || null;
    } catch { /* vote anonymously */ }
  }

  const voter = voterKey(uid, ip);

  try {
    const db = getDb();
    const topicRef = db.collection(COLLECTION).doc(id);
    const topicSnap = await topicRef.get();
    if (!topicSnap.exists) return errorResponse('Unknown topic.', 404, request);

    const markerRef = db.collection(VOTES_COLLECTION).doc(voteDocId(id, voter));
    try {
      await markerRef.create({
        topicId: id,
        voter,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {
      // Marker already there: this person already voted. Report the
      // current count so the UI can settle on the truth either way.
      const current = topicSnap.data() || {};
      return jsonResponse({
        ok: true,
        counted: false,
        votes: typeof current.votes === 'number' ? current.votes : 0,
      }, 200, request);
    }

    await topicRef.update({
      votes: FieldValue.increment(1),
      lastVoteAt: FieldValue.serverTimestamp(),
    });

    const after = await topicRef.get();
    const data = after.data() || {};
    return jsonResponse({
      ok: true,
      counted: true,
      votes: typeof data.votes === 'number' ? data.votes : 0,
    }, 200, request);
  } catch (err) {
    console.error('[topic-vote] error:', err.message);
    return errorResponse('Could not record that vote.', 500, request);
  }
};

export const config = {
  path: '/api/topic-vote',
};
