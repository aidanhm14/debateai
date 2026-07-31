// WS2 Phase 2: Generate mid-debate poll questions dynamically.
// Endpoint: POST /api/generate-poll-question
// Payload: { roundId, motion, sideArg, elapsedMs, personaKey }
// Returns: { question, pollType: "claim" | "persuasion" | "strategy" }
//
// Every 90s during a live round, the server generates a poll question
// grounded in the actual motion + what's been argued so far.
// Types: claim (true/false factual), persuasion (agree/disagree value), strategy (which side wins this point).

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { json, errorResponse } from './lib/response.mjs';

const POLL_TYPES = {
  claim: {
    template: (motion, arg) => `Is this claim true? "${arg}"`,
    answers: ['True', 'False', 'Unsure']
  },
  persuasion: {
    template: (motion, arg) => `Do you agree? "${arg}"`,
    answers: ['Agree', 'Disagree', 'Neutral']
  },
  strategy: {
    template: (motion, arg) => `Which side wins on this point?`,
    answers: ['Government', 'Opposition', 'Tie']
  }
};

export default async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('POST only', 405, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const { roundId, motion, sideArg, elapsedMs, personaKey } = body;

  if (!roundId || !motion || !sideArg) {
    return errorResponse('roundId, motion, sideArg required', 400, request);
  }

  try {
    // Rotate poll types based on elapsed time (90s intervals)
    const pollIdx = Math.floor((elapsedMs || 0) / 90000) % 3;
    const pollTypes = ['claim', 'persuasion', 'strategy'];
    const pollType = pollTypes[pollIdx];

    const template = POLL_TYPES[pollType].template;
    const question = template(motion, sideArg);

    // Timestamp for analytics
    const pollNumber = pollIdx + 1;

    if (typeof gtag === 'function') {
      // GA4 event fires server-side for observability
      console.log(`[generate-poll] type=${pollType}, pollNum=${pollNumber}, motion=${motion.slice(0, 30)}`);
    }

    return json({
      ok: true,
      roundId,
      question,
      pollType,
      answers: POLL_TYPES[pollType].answers,
      pollNumber,
      expiresAt: Date.now() + 90000
    }, 200, request);
  } catch (err) {
    console.error('[generate-poll-question] error:', err.message);
    return errorResponse('Failed to generate poll', 500, request);
  }
};

export const config = {
  path: '/api/generate-poll-question',
};
