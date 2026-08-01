// WS2 Phase 3: Upvote audience questions — crowd curates top questions.
// Endpoint: POST /api/upvote-question
// Payload: { roundId, pollNumber, questionId }
// Tracks which questions matter most to spectators.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { json, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('POST only', 405, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const { roundId, pollNumber, questionId } = body;
  if (!roundId || typeof pollNumber !== 'number' || !questionId) {
    return errorResponse('roundId, pollNumber, questionId required', 400, request);
  }

  try {
    const db = getDb();

    const questionRef = db.collection('voice_rounds').doc(roundId)
      .collection('polls').doc(String(pollNumber))
      .collection('questions').doc(questionId);

    await questionRef.update({ upvotes: FieldValue.increment(1) });

    return json({ ok: true, roundId, pollNumber, questionId }, 200, request);
  } catch (err) {
    console.error('[upvote-question] error:', err.message);
    return errorResponse('Failed to upvote question', 500, request);
  }
};

export const config = {
  path: '/api/upvote-question',
};
