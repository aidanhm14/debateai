// WS1 Phase 3: Compute inter-rater agreement (Cohen's kappa) for RFD quality.
// Endpoint: GET /api/compute-rfd-metrics?limit=50
// Returns: { rounds: [...], avgKappa, dimension_agreement: {...}, outliers: [...] }
//
// Cohen's kappa = (Po - Pe) / (1 - Pe)
// Po = observed agreement (fraction of dimensions where raters agree within 1 point)
// Pe = expected agreement by chance

import { getDb } from './lib/firestore.mjs';
import { json, errorResponse } from './lib/response.mjs';

function computeKappa(ratings1, ratings2) {
  if (!ratings1 || !ratings2) return null;

  const dims = ['clarity', 'persuasiveness', 'accuracy', 'conciseness', 'fairness'];
  let agree = 0;
  let total = 0;

  // Po = fraction of dimensions where absolute difference <= 1
  for (const dim of dims) {
    const r1 = ratings1[dim];
    const r2 = ratings2[dim];
    if (typeof r1 === 'number' && typeof r2 === 'number') {
      if (Math.abs(r1 - r2) <= 1) agree++;
      total++;
    }
  }

  if (total === 0) return null;
  const Po = agree / total;

  // Pe = expected agreement by random chance (assuming uniform distribution 1-5)
  // Simplified: Pe ≈ 0.2 (random 1-5 scale)
  const Pe = 0.2;

  const kappa = (Po - Pe) / (1 - Pe);
  return Math.max(-1, Math.min(1, kappa)); // Clamp to [-1, 1]
}

export default async (request) => {
  if (request.method !== 'GET') {
    return errorResponse('GET only', 405, request);
  }

  try {
    const url = new URL(request.url);
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10));

    const db = getDb();

    // Fetch recent RFDs with ratings
    const ratingsSnap = await db.collection('rfd_ratings')
      .orderBy('createdAt', 'desc')
      .limit(limit * 5)  // Overfetch to account for per-round aggregation
      .get();

    // Group ratings by roundId
    const roundsMap = {};
    for (const doc of ratingsSnap.docs) {
      const { roundId, ratings } = doc.data();
      if (!roundsMap[roundId]) {
        roundsMap[roundId] = [];
      }
      roundsMap[roundId].push(ratings);
    }

    // Compute kappa for each round
    const rounds = [];
    let totalKappa = 0;
    let kappaCount = 0;

    for (const [roundId, ratingsList] of Object.entries(roundsMap)) {
      if (ratingsList.length < 2) continue; // Need at least 2 raters

      // Pairwise kappa between first two raters
      const kappa = computeKappa(ratingsList[0], ratingsList[1]);
      if (kappa !== null) {
        rounds.push({
          roundId,
          raterCount: ratingsList.length,
          kappa,
          ratings: ratingsList,
        });
        totalKappa += kappa;
        kappaCount++;
      }
    }

    rounds.sort((a, b) => a.kappa - b.kappa); // Sort by kappa (lowest first = most disagreement)

    // Dimension-wise agreement stats
    const dimStats = {};
    const dims = ['clarity', 'persuasiveness', 'accuracy', 'conciseness', 'fairness'];
    for (const dim of dims) {
      let agree = 0;
      let total = 0;
      for (const rnd of rounds) {
        const [r1, r2] = rnd.ratings;
        if (r1[dim] && r2[dim]) {
          if (Math.abs(r1[dim] - r2[dim]) <= 1) agree++;
          total++;
        }
      }
      dimStats[dim] = total > 0 ? (agree / total) : null;
    }

    // Outliers = kappa < 0.4 (poor agreement)
    const outliers = rounds.filter(r => r.kappa < 0.4).slice(0, 10);

    return json({
      ok: true,
      roundsRated: rounds.length,
      avgKappa: kappaCount > 0 ? totalKappa / kappaCount : null,
      dimensionAgreement: dimStats,
      outliers,
      sampleRounds: rounds.slice(0, 10),
    }, 200, request);
  } catch (err) {
    console.error('[compute-rfd-metrics] error:', err.message);
    return errorResponse('Failed to compute metrics', 500, request);
  }
};

export const config = {
  path: '/api/compute-rfd-metrics',
};
