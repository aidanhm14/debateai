// WS2 Phase 3: Upvote audience questions — crowd curates top questions.
// Endpoint: POST /api/upvote-question
// Payload: { roundId, pollNumber, questionId }
// Tracks which questions matter most to spectators.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse } from './lib/response.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';

export default async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('POST only', 405, request);
  }

  // App Check keeps scripted (non-browser) callers out; rate limit blocks
  // upvote-spamming a question into the AI's live prompt from one source.
  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) {
    return errorResponse('App verification failed. Reload and try again.', 401, request);
  }
  const ip = callerIp(request);
  const rl = await checkLayers('upvote-question', ip, [
    { label: 'min', window: 60_000, max: 30 },
    { label: 'hour', window: 3_600_000, max: 300 },
  ]);
  if (!rl.ok) {
    return errorResponse('Too many upvotes — slow down a moment.', 429, request);
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

    return jsonResponse({ ok: true, roundId, pollNumber, questionId }, 200, request);
  } catch (err) {
    console.error('[upvote-question] error:', err.message);
    return errorResponse('Failed to upvote question', 500, request);
  }
};

export const config = {
  path: '/api/upvote-question',
};
