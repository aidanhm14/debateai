// WS2 Phase 3: Audience Q&A — spectators submit questions during polls.
// Endpoint: POST /api/submit-audience-question
// Payload: { roundId, pollNumber, question, upvotes }
// Stores questions for top-Q injection into AI prompts.

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

  const { roundId, pollNumber, question } = body;
  if (!roundId || typeof pollNumber !== 'number' || !question) {
    return errorResponse('roundId, pollNumber, question required', 400, request);
  }

  if (question.length < 10 || question.length > 300) {
    return errorResponse('Question must be 10-300 characters', 400, request);
  }

  try {
    const db = getDb();

    // Store question: roundId/polls/pollNumber/questions/{questionId}
    const questionRef = db.collection('voice_rounds').doc(roundId)
      .collection('polls').doc(String(pollNumber))
      .collection('questions').doc();

    await questionRef.set({
      question,
      upvotes: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Denormalize question count on poll doc
    await db.collection('voice_rounds').doc(roundId)
      .collection('polls').doc(String(pollNumber))
      .update({ questionCount: FieldValue.increment(1) })
      .catch(() => null);  // Ignore if poll doc doesn't exist yet

    return json({ ok: true, roundId, pollNumber }, 200, request);
  } catch (err) {
    console.error('[submit-audience-question] error:', err.message);
    return errorResponse('Failed to submit question', 500, request);
  }
};

export const config = {
  path: '/api/submit-audience-question',
};
