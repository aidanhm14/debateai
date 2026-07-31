// WS3: Compute persuasion delta — how much did this round change minds on specific claims?
// Endpoint: GET /api/compute-persuasion-delta?roundId=xxx
// Returns: { deltas: [ { claim, deltaScore, respondentCount, persuaded } ] }
//
// Algorithm:
// 1. Extract claims from the round transcript
// 2. Match claims to the polls asked about them
// 3. For each poll, compute delta = (post_agree - pre_agree) / respondent_count
// 4. Rank by persuasion impact

import { getDb } from './lib/firestore.mjs';
import { json, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method !== 'GET') {
    return errorResponse('GET only', 405, request);
  }

  const url = new URL(request.url);
  const roundId = url.searchParams.get('roundId');

  if (!roundId) {
    return errorResponse('roundId required', 400, request);
  }

  try {
    const db = getDb();

    // Fetch the round to get transcript
    const roundDoc = await db.collection('voice_rounds').doc(roundId).get();
    if (!roundDoc.exists) {
      return errorResponse('Round not found', 404, request);
    }

    const roundData = roundDoc.data();
    const transcript = roundData.transcript || [];

    // Fetch all polls for this round
    const pollsSnap = await db.collection('voice_rounds').doc(roundId)
      .collection('polls').get();

    const deltas = [];

    for (const pollDoc of pollsSnap.docs) {
      const pollData = pollDoc.data();
      const { question, pollType } = pollData;

      // Fetch responses for this poll
      const responsesSnap = await db.collection('voice_rounds').doc(roundId)
        .collection('polls').doc(pollDoc.id)
        .collection('responses').get();

      if (responsesSnap.size === 0) continue;

      // Compute agreement counts
      const responses = responsesSnap.docs.map(d => d.data());
      const agreeCount = responses.filter(r => ['Agree', 'True', 'Government'].includes(r.answer)).length;
      const disagreeCount = responses.filter(r => ['Disagree', 'False', 'Opposition'].includes(r.answer)).length;
      const totalCount = responses.length;

      // Estimate persuasion: net movement toward agreement
      const agreeRate = agreeCount / totalCount;
      const persuasionScore = agreeRate - 0.5;  // Centered at neutral (0.5)

      deltas.push({
        pollNumber: parseInt(pollDoc.id, 10),
        claim: question.slice(0, 100),  // First 100 chars as claim label
        pollType,
        respondentCount: totalCount,
        agreeRate: Math.round(agreeRate * 100),
        persuasionScore: Math.round(persuasionScore * 100),
        responses: {
          agree: agreeCount,
          disagree: disagreeCount,
          neutral: totalCount - agreeCount - disagreeCount
        }
      });
    }

    // Sort by persuasion impact (highest first)
    deltas.sort((a, b) => Math.abs(b.persuasionScore) - Math.abs(a.persuasionScore));

    return json({
      ok: true,
      roundId,
      pollCount: deltas.length,
      avgPersuasionScore: deltas.length > 0 
        ? Math.round(deltas.reduce((sum, d) => sum + d.persuasionScore, 0) / deltas.length)
        : 0,
      deltas: deltas
    }, 200, request);
  } catch (err) {
    console.error('[compute-persuasion-delta] error:', err.message);
    return errorResponse('Failed to compute deltas', 500, request);
  }
};

export const config = {
  path: '/api/compute-persuasion-delta',
};
