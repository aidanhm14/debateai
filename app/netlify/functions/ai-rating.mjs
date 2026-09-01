// ─────────────────────────────────────────────────────────────
// /api/ai-rating — rated rounds against the AI.
//
// POST { roundId, kind, winner, transcript } applies one AI round to
// the caller's ai_ratings doc and answers with the movement. GET
// answers the caller's current AI rating for profile surfaces.
//
// Named accounts only: an anonymous uid is free and unlimited to mint,
// so a rating attached to one is a number nobody owns. The write path
// is admin-SDK only (ai_ratings has no firestore.rules entry, so the
// default deny covers client writes); reads come back through this
// endpoint rather than a rules hole.
//
// Idempotent per round: ai_rating_changes/{uid__roundId} is claimed in
// the same transaction that moves the rating, so a retry, a double
// click, or a resubmitted roundId returns the recorded movement
// instead of applying twice.
//
// See lib/ai-rating.mjs for why this number is SEPARATE from
// user_ratings and must stay that way without a founder decision.
// ─────────────────────────────────────────────────────────────

import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import {
  KINDS, MIN_USER_WORDS, RATE_LAYERS,
  normalizeOutcome, userWordCount, applyAiRound,
} from './lib/ai-rating.mjs';
import { displayRating } from './lib/rating.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse('Method not allowed', 405, request);
  }

  let decoded;
  try {
    decoded = await verifyIdToken(extractBearerToken(request));
  } catch (e) {
    return errorResponse('SIGN_IN_REQUIRED', 401, request);
  }
  if (!isNamedAccount(decoded)) {
    return errorResponse('NAMED_ACCOUNT_REQUIRED', 403, request);
  }
  const uid = decoded.uid || decoded.sub;

  const db = getDb();
  const ratingRef = db.collection('ai_ratings').doc(uid);

  if (request.method === 'GET') {
    try {
      const snap = await ratingRef.get();
      const data = snap.exists ? snap.data() : null;
      return jsonResponse({
        rating: data ? displayRating(data) : null,
        record: data ? { wins: data.wins || 0, losses: data.losses || 0, draws: data.draws || 0 } : null,
      }, 200, request);
    } catch (e) {
      return errorResponse('Could not read right now', 503, request);
    }
  }

  let body;
  try { body = await request.json(); }
  catch (e) { return errorResponse('Invalid JSON body', 400, request); }

  const roundId = String(body.roundId || '').trim();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(roundId)) {
    return errorResponse('roundId required', 400, request);
  }
  if (!KINDS.has(body.kind)) return errorResponse('Unknown round kind', 400, request);

  const score = normalizeOutcome(body.winner);
  if (score === null) {
    // A round with no call rates nothing. Not an error the client
    // should surface; it just is not a rated round.
    return jsonResponse({ rated: false, reason: 'no_verdict' }, 200, request);
  }

  const words = userWordCount(body.transcript);
  if (words < MIN_USER_WORDS) {
    return jsonResponse({ rated: false, reason: 'too_short', words }, 200, request);
  }

  const rl = await checkLayers('airating', 'uid_' + uid, RATE_LAYERS);
  if (!rl.ok) return errorResponse('RATE_LIMITED', 429, request);

  const changeRef = db.collection('ai_rating_changes').doc(uid + '__' + roundId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [changeSnap, stateSnap] = await Promise.all([tx.get(changeRef), tx.get(ratingRef)]);
      if (changeSnap.exists) {
        return { alreadyApplied: true, ...changeSnap.data().result };
      }
      const applied = applyAiRound(stateSnap.exists ? stateSnap.data() : null, score);
      const payload = {
        rated: true,
        before: applied.before,
        delta: applied.delta,
        rating: applied.display,
        record: { wins: applied.stored.wins, losses: applied.stored.losses, draws: applied.stored.draws },
      };
      tx.set(ratingRef, { ...applied.stored, updatedAt: FieldValue.serverTimestamp() });
      tx.set(changeRef, {
        uid, roundId, kind: body.kind, score, words,
        // Same provenance honesty as lib/judgment.mjs: this verdict was
        // written in the participant's browser, and anything that ever
        // reads these rows must know that.
        verdictSource: 'participant',
        at: FieldValue.serverTimestamp(),
        result: payload,
      });
      return payload;
    });
    return jsonResponse(result, 200, request);
  } catch (e) {
    console.warn('[ai-rating] apply failed:', e.message);
    return errorResponse('Could not apply right now', 503, request);
  }
};

export const config = { path: '/api/ai-rating' };
