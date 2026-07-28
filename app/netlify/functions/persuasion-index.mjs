// ─────────────────────────────────────────────────────────────
// GET /api/persuasion-index            the rolling public index
// GET /api/persuasion-index?roundId=…  one round's record
//
// No auth, no key, no rate card. Deliberately.
//
// Polymarket ran zero trading fees for years, and even after adding
// taker fees in March 2026 it rebates 100% of them to market makers.
// The trade was never the product. Free odds got embedded by
// Bloomberg, Google and Grok, which made the odds the default
// reference, which is what ICE paid up to $2B to distribute. The
// output being free is what made it citable, and being citable is
// what made it worth anything.
//
// Same posture. The measured mind-change on a round, and the argument
// that produced it, are free to read and free to quote forever. What
// is not free is querying the corpus underneath: full argument chains,
// per-claim attribution, cross-round history, the delivery-controlled
// arm.
//
// Every response ships its own caveats. A percentage without its
// population and its sample size is a marketing claim, and marketing
// claims do not survive diligence.
// ─────────────────────────────────────────────────────────────
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { SWAY, swayReport, caveatsFor, argumentScores, emptyTally } from './lib/sway.mjs';

const CACHE_MS = 30 * 1000;
const cache = new Map();

const LICENSE = 'Free to read and quote with attribution to Debatable. Bulk and per-claim access is licensed.';

function cached(k) {
  const hit = cache.get(k);
  return hit && Date.now() - hit.at < CACHE_MS ? hit.val : null;
}
function store(k, v) { cache.set(k, { at: Date.now(), val: v }); return v; }

async function oneRound(db, roundId) {
  const snap = await db.collection('sway_rounds').doc(roundId).get();
  if (!snap.exists) return null;
  const round = snap.data();

  const report = swayReport(round.tally, {
    deliveryControlled: round.deliveryControlled,
    population: round.population,
  });

  // Per-argument attribution, pulled from the raw rows rather than the
  // aggregate: only closing stances that named a claim, carried weight,
  // and were not staked.
  let args = [];
  if (Array.isArray(round.arguments) && round.arguments.length) {
    try {
      const rows = await db.collection('opinion_deltas')
        .where('roundId', '==', roundId)
        .limit(1000)
        .get();
      const named = rows.docs
        .map(d => d.data())
        .filter(v => v.movedBy && v.weight > 0 && !v.staked)
        .map(v => ({ argId: v.movedBy, weight: v.weight }));
      args = argumentScores(named, round.arguments);
    } catch (err) {
      console.error('persuasion-index attribution failed:', err.message);
    }
  }

  return {
    roundId,
    motion: round.motion || '',
    format: round.format || '',
    report,
    arguments: args,
    caveats: caveatsFor(report),
    license: LICENSE,
  };
}

async function index(db) {
  let docs = [];
  try {
    const snap = await db.collection('sway_rounds')
      .orderBy('updatedAt', 'desc')
      .limit(200)
      .get();
    docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('persuasion-index read failed:', err.message);
  }

  let counted = 0, switched = 0, holdout = 0, publishable = 0, controlled = 0, excluded = 0;
  for (const r of docs) {
    const t = { ...emptyTally(), ...(r.tally || {}) };
    counted += t.counted || 0;
    switched += t.switched || 0;
    holdout += t.holdoutCounted || 0;
    excluded += t.excludedStakers || 0;
    if (r.deliveryControlled) controlled += 1;
    if ((t.counted || 0) >= SWAY.MIN_COUNTED) publishable += 1;
  }

  // The one number meant to get cited: across rounds with a usable
  // sample, what share of listeners changed their mind at all. Null
  // until the corpus can carry it, rather than a flattering figure
  // built on a handful of people.
  const mindChangeRate = (publishable && counted >= SWAY.MIN_COUNTED)
    ? Math.round((switched / counted) * 1000) / 10
    : null;

  return {
    updatedAt: new Date().toISOString(),
    rounds: docs.length,
    publishableRounds: publishable,
    votesCounted: counted,
    holdoutVotes: holdout,
    stakedVotesExcluded: excluded,
    deliveryControlledRounds: controlled,
    mindChangeRate,
    method: {
      holdoutPct: SWAY.HOLDOUT_PCT,
      minWatchSeconds: Math.round(SWAY.MIN_WATCH_MS / 1000),
      minSampleForPercentage: SWAY.MIN_COUNTED,
      stakersExcluded: true,
      resolution: 'Measured mind change in a live audience, polled before the round and after the ballot. Not the AI judge score.',
      attribution: 'The closing stance may name the one claim that moved it, scored against the arguments the judge segmented.',
      deliveryControl: 'Rounds against the AI opponent hold voice, pace and persona constant, isolating argument from performance.',
    },
    caveats: [
      'Self-selected audience on Debatable. Not a representative panel of any population.',
      'Human vs human rounds do not hold delivery constant. Rounds against the AI opponent do.',
      'Anonymous stances count at reduced weight and can be cleared by the viewer.',
      'Rounds under the minimum sample publish counts only, never a percentage.',
      'A quarter of viewers are never asked before the round, so the anchoring effect of asking is measured rather than assumed.',
    ],
    license: LICENSE,
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const url = new URL(request.url);
  const roundId = (url.searchParams.get('roundId') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);

  try {
    const db = getDb();
    const key = roundId ? 'r:' + roundId : 'index';
    const hit = cached(key);
    if (hit) return jsonResponse(hit, 200, request);

    if (roundId) {
      const data = await oneRound(db, roundId);
      if (!data) return errorResponse('No persuasion record for that round.', 404, request);
      return jsonResponse(store(key, data), 200, request);
    }
    return jsonResponse(store(key, await index(db)), 200, request);
  } catch (err) {
    console.error('persuasion-index error:', err.message);
    return errorResponse('Could not read the persuasion index.', 500, request);
  }
};

export const config = {
  path: '/api/persuasion-index',
};
