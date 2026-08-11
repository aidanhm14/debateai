// WS2 Phase 3: Audience Q&A — spectators submit questions during polls.
// Endpoint: POST /api/submit-audience-question
// Payload: { roundId, pollNumber, question, upvotes }
// Stores questions for top-Q injection into AI prompts.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse } from './lib/response.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';

export default async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('POST only', 405, request);
  }

  // Questions land in the AI's live prompt (top-3 upvoted), so this is a
  // prompt-injection + write-cost surface, not just cosmetic. App Check keeps
  // scripted callers out; the per-IP rate limit caps flooding.
  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) {
    return errorResponse('App verification failed. Reload and try again.', 401, request);
  }
  const ip = callerIp(request);
  const rl = await checkLayers('submit-question', ip, [
    { label: 'min', window: 60_000, max: 6 },
    { label: 'hour', window: 3_600_000, max: 40 },
  ]);
  if (!rl.ok) {
    return errorResponse('Too many questions — give it a moment.', 429, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const { roundId, pollNumber, question } = body;
  if (!roundId || typeof pollNumber !== 'number' || !question) {
    return errorResponse('roundId, pollNumber, question required', 400, request);
  }

  if (typeof question !== 'string' || question.length < 10 || question.length > 300) {
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

    return jsonResponse({ ok: true, roundId, pollNumber }, 200, request);
  } catch (err) {
    console.error('[submit-audience-question] error:', err.message);
    return errorResponse('Failed to submit question', 500, request);
  }
};

export const config = {
  path: '/api/submit-audience-question',
};
