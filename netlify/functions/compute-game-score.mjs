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

export default async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('POST only', 405, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const { roundId, speechIndex, side } = body;
  if (!roundId || typeof speechIndex !== 'number' || !side) {
    return errorResponse('roundId, speechIndex, side required', 400, request);
  }

  try {
    const db = getDb();

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
    await db.collection('voice_rounds').doc(roundId)
      .update({ 
        [`gameScore_${side}`]: (priorState.totalScore || 0) + score,
        [`gameStreak_${side}`]: streak
      })
      .catch(() => db.collection('voice_rounds').doc(roundId)
        .set({ 
          [`gameScore_${side}`]: score,
          [`gameStreak_${side}`]: streak
        }, { merge: true }));

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
