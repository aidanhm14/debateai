// WS1 Phase 3: RFD quality validation via blind inter-rater review.
// Endpoint: POST /api/log-rfd-rating
// Payload: { roundId, ratings: { dimension: score }, raterUid, blind: true }
// Stores individual rater scores; server computes inter-rater agreement.
//
// Five dimensions scored 1-5: clarity, persuasiveness, accuracy, conciseness, fairness.
// Blind = true means rater doesn't know which model/persona generated the RFD.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse } from './lib/response.mjs';

const VALID_DIMENSIONS = new Set([
  'clarity',
  'persuasiveness',
  'accuracy',
  'conciseness',
  'fairness'
]);

function validateRatings(ratings) {
  if (!ratings || typeof ratings !== 'object') return 'ratings must be an object';
  for (const [dim, score] of Object.entries(ratings)) {
    if (!VALID_DIMENSIONS.has(dim)) return `Invalid dimension: ${dim}`;
    if (typeof score !== 'number' || score < 1 || score > 5 || !Number.isInteger(score)) {
      return `Score for ${dim} must be 1-5 (integer)`;
    }
  }
  return null;
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({}, 200, request);
  }
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON body', 400, request);
  }

  const token = extractBearerToken(request);
  let raterUid = '';
  
  if (!token) {
    return errorResponse('Authorization required. Sign in to rate RFDs.', 401, request);
  }

  try {
    const decoded = await verifyIdToken(token);
    raterUid = decoded.sub;
  } catch (err) {
    return errorResponse('Authentication failed', 401, request);
  }

  const { roundId, ratings, blind } = body;
  if (!roundId || typeof roundId !== 'string') {
    return errorResponse('roundId required', 400, request);
  }

  const validationError = validateRatings(ratings);
  if (validationError) {
    return errorResponse(validationError, 400, request);
  }

  try {
    const db = getDb();

    // Verify the RFD exists
    const rfdDoc = await db.collection('voice_rounds').doc(roundId).get();
    if (!rfdDoc.exists) {
      return errorResponse('RFD not found', 404, request);
    }

    // Create or update rating doc. DocId = raterUid so each rater rates once per RFD.
    const ratingRef = db.collection('rfd_ratings').doc(roundId + ':' + raterUid);
    await ratingRef.set({
      roundId,
      raterUid,
      ratings,
      blind: !!blind,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Denormalize the rating counts onto the RFD doc for easy querying
    const rfdRef = db.collection('voice_rounds').doc(roundId);
    await rfdRef.update({
      lastRatedAt: FieldValue.serverTimestamp(),
      ratedByCount: FieldValue.increment(1),
    });

    return jsonResponse({ ok: true, roundId, raterUid }, 200, request);
  } catch (err) {
    console.error('[log-rfd-rating] error:', err.message);
    return errorResponse('Failed to log rating', 500, request);
  }
};

export const config = {
  path: '/api/log-rfd-rating',
};
