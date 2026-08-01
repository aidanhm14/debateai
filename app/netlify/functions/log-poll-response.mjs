// WS2 Phase 2: Log audience poll responses during live debate.
// Endpoint: POST /api/log-poll-response
// Payload: { roundId, pollNumber, pollType, question, answer, userId }
// Stores individual poll votes for persuasion delta computation.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('POST only', 405, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const token = extractBearerToken(request);
  let userId = '';

  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      userId = decoded.sub;
    } catch (err) {
      return errorResponse('Auth failed', 401, request);
    }
  }

  const { roundId, pollNumber, pollType, question, answer } = body;

  if (!roundId || typeof pollNumber !== 'number' || !pollType || !answer) {
    return errorResponse('roundId, pollNumber, pollType, answer required', 400, request);
  }

  try {
    const db = getDb();

    // Store poll response: roundId/polls/pollNumber/responses/{userId}
    // This allows aggregation across users per poll per round.
    const pollRef = db.collection('voice_rounds').doc(roundId)
      .collection('polls').doc(String(pollNumber));

    const responseRef = pollRef.collection('responses').doc(userId || 'anon-' + Date.now());

    await responseRef.set({
      userId: userId || null,
      answer,
      pollType,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Denormalize response count on the poll doc for easy querying
    await pollRef.update({
      responseCount: FieldValue.increment(1),
      [answer + 'Count']: FieldValue.increment(1)
    }).catch(() => {
      // First response; create the poll doc if it doesn't exist
      return pollRef.set({
        roundId,
        pollNumber,
        pollType,
        question,
        responseCount: 1,
        [answer + 'Count']: 1,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    return jsonResponse({ ok: true, roundId, pollNumber }, 200, request);
  } catch (err) {
    console.error('[log-poll-response] error:', err.message);
    return errorResponse('Failed to log response', 500, request);
  }
};

export const config = {
  path: '/api/log-poll-response',
};
