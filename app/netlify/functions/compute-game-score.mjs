// WS2 Phase 4: Compute game score from reactions + argument metadata.
// Endpoint: POST /api/compute-game-score
// Payload: { roundId, speechIndex, side, argumentText }
// Returns: { score, combo, streak, argumentStrength: 0-1 }
//
// Scoring algorithm:
// - Base: 10 points per speech
// - Reactions: strong(+25) dodge(-10) citation(-5) direct(+15) unclear(-3)
// - Strength multiplier: (strong + direct) / all_reactions, capped 0-1
// - Combo: consecutive strong reactions × 1.5 multiplier
// - Streak: N consecutive high-score turns

import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse } from './lib/response.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';

// 2026-09-07 security sweep: this endpoint was keyless, unmetered, and
// wrote game_state + gameScore_* onto ANY voice_rounds doc (creating it if
// missing). It now needs a Firebase token (anonymous is fine: the voice
// page mints one), validates every id, meters per uid and per IP, and
// only ever updates a round that already exists.
const ROUND_ID = /^[A-Za-z0-9_-]{1,120}$/;
const SIDE = /^[a-z]{1,12}$/;
const UID_LAYERS = [
  { window: 60_000, max: 30, label: 'min' },
  { window: 3_600_000, max: 300, label: 'hour' },
];
const IP_LAYERS = [
  { window: 60_000, max: 120, label: 'min' },
  { window: 3_600_000, max: 1200, label: 'hour' },
];

export default async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('POST only', 405, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let uid;
  try { uid = (await verifyIdToken(token)).sub; }
  catch { return errorResponse('Invalid token', 401, request); }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const { roundId, speechIndex, side } = body;
  if (!roundId || typeof speechIndex !== 'number' || !side) {
    return errorResponse('roundId, speechIndex, side required', 400, request);
  }
  if (!ROUND_ID.test(String(roundId)) || !SIDE.test(String(side))
      || !Number.isInteger(speechIndex) || speechIndex < 0 || speechIndex > 200) {
    return errorResponse('Invalid roundId, side, or speechIndex', 400, request);
  }

  const ipGate = await checkLayers('gamescore', 'ip_' + callerIp(request), IP_LAYERS);
  if (!ipGate.ok) return errorResponse('Too many requests', 429, request);
  const uidGate = await checkLayers('gamescore', 'uid_' + uid, UID_LAYERS);
  if (!uidGate.ok) return errorResponse('Too many requests', 429, request);

  try {
    const db = getDb();

    const roundSnap = await db.collection('voice_rounds').doc(roundId).get();
    if (!roundSnap.exists) return errorResponse('Round not found', 404, request);

    // Fetch reaction counts for this speech
    const reactionsDoc = await db.collection('voice_rounds').doc(roundId)
      .collection('reactions').doc(String(speechIndex)).get();

    const reactions = reactionsDoc.data() || {};
    const strong = reactions.strong || 0;
    const dodge = reactions.dodge || 0;
    const citation = reactions.citation || 0;
    const direct = reactions.direct || 0;
    const unclear = reactions.unclear || 0;

    const totalReactions = strong + dodge + citation + direct + unclear;

    // Base score
    let score = 10;

    // Reaction bonuses/penalties
    score += strong * 25;
    score -= dodge * 10;
    score -= citation * 5;
    score += direct * 15;
    score -= unclear * 3;

    // Argument strength = (strong + direct) / total
    const argumentStrength = totalReactions > 0 
      ? Math.min(1, (strong + direct) / totalReactions)
      : 0.5;

    // Combo multiplier: if strong reactions > 50% of total
    const comboMultiplier = strong > totalReactions * 0.5 ? 1.5 : 1;
    score = Math.floor(score * comboMultiplier);

    // Fetch prior game state to compute streak
    const gameStateSnap = await db.collection('voice_rounds').doc(roundId)
      .collection('game_state').doc('current').get();

    const priorState = gameStateSnap.data() || {};
    const priorScore = priorState.lastSpeechScore || 0;
    const priorStreak = priorState.streak || 0;

    // Streak logic: high score (>20) extends streak; low score resets
    let streak = score > 20 ? priorStreak + 1 : 0;

    // Combo multiplier for streaks
    const streakBonus = streak > 0 ? Math.min(1.3, 1 + (streak * 0.1)) : 1;
    score = Math.floor(score * streakBonus);

    // Store game state
    const gameStateRef = db.collection('voice_rounds').doc(roundId)
      .collection('game_state').doc('current');

    await gameStateRef.set({
      side,
      lastSpeechIndex: speechIndex,
      lastSpeechScore: score,
      totalScore: (priorState.totalScore || 0) + score,
      streak,
      maxStreak: Math.max(priorState.maxStreak || 0, streak),
      combo: comboMultiplier > 1 ? true : false,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // Denormalize total score on voice_rounds doc
    // update() only: the round was confirmed to exist above, so the old
    // set({merge}) fallback (which minted a doc at any id) is gone.
    await db.collection('voice_rounds').doc(roundId)
      .update({
        [`gameScore_${side}`]: (priorState.totalScore || 0) + score,
        [`gameStreak_${side}`]: streak
      });

    return jsonResponse({
      ok: true,
      roundId,
      speechIndex,
      score,
      argumentStrength,
      combo: comboMultiplier > 1,
      streak,
      totalScore: (priorState.totalScore || 0) + score
    }, 200, request);
  } catch (err) {
    console.error('[compute-game-score] error:', err.message);
    return errorResponse('Failed to compute score', 500, request);
  }
};

export const config = {
  path: '/api/compute-game-score',
};
