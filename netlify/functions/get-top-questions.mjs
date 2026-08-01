// WS2 Phase 3: Fetch top questions for AI injection.
// Endpoint: GET /api/get-top-questions?roundId=xxx&pollNumber=N&limit=5
// Returns: top N questions by upvotes.

import { getDb } from './lib/firestore.mjs';
import { json, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method !== 'GET') {
    return errorResponse('GET only', 405, request);
  }

  const url = new URL(request.url);
  const roundId = url.searchParams.get('roundId');
  const pollNumber = url.searchParams.get('pollNumber');
  const limit = Math.min(10, parseInt(url.searchParams.get('limit') || '5', 10));

  if (!roundId || !pollNumber) {
    return errorResponse('roundId and pollNumber required', 400, request);
  }

  try {
    const db = getDb();

    const questionsSnap = await db.collection('voice_rounds').doc(roundId)
      .collection('polls').doc(String(pollNumber))
      .collection('questions')
      .orderBy('upvotes', 'desc')
      .limit(limit)
      .get();

    const questions = questionsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return json({
      ok: true,
      roundId,
      pollNumber,
      questionCount: questions.length,
      questions
    }, 200, request);
  } catch (err) {
    console.error('[get-top-questions] error:', err.message);
    return errorResponse('Failed to fetch questions', 500, request);
  }
};

export const config = {
  path: '/api/get-top-questions',
};
