// Public inter-rater reliability for the judging panel.
//
// This is the evidence half of fix 2. "We ensemble the judge" is a
// claim; a published kappa over a stated number of rounds is a
// measurement. It is also the honest answer to the circularity
// objection: if three independent model families agree on the outcome,
// the ballot is tracking the round rather than the house.
//
// PUBLISHED WARTS AND ALL. The unresolved rate is reported next to the
// agreement rate on purpose. A system that quietly resolved its split
// cases would show a better agreement number and be worth less.
//
// SMALL SAMPLES ARE NOT REPORTED AS RESULTS. `reportable` is false until
// 30 judged rounds, and the surface is expected to honor it. A kappa
// over four rounds is noise, and dressing noise as documented
// reliability is precisely the kind of overclaim that turns a good
// system into a bad exhibit.
import { corsResponse, errorResponse } from './lib/response.mjs';
import { getDb } from './lib/firestore.mjs';
import { getCachedShared, setCachedShared } from './lib/admin-cache.mjs';
import { AUDIT_COLLECTION } from './lib/judge-audit.mjs';
import { reliabilityFrom, RELIABILITY_MIN_N } from './lib/judge-panel.mjs';
import { seasonFor, SEASONS } from './lib/judge-charter.mjs';

const CACHE_KEY = 'judge-reliability-v1';
const TTL_MS = 30 * 60 * 1000;
// Bounded scan. The figures are a rolling picture rather than an
// all-time census, and an unbounded read on a public endpoint is how a
// transparency page becomes a Firestore bill.
const SCAN_LIMIT = 500;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('GET only', 405, request);

  const cached = await getCachedShared(CACHE_KEY);
  if (cached) return payload(cached);

  const db = getDb();
  let records = [];
  try {
    const snap = await db.collection(AUDIT_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(SCAN_LIMIT)
      .get();
    records = snap.docs.map((d) => d.data());
  } catch (err) {
    console.error('[judge-reliability]', err && err.message);
    return errorResponse('Reliability figures are unavailable right now.', 503, request);
  }

  const overall = reliabilityFrom(records);

  // Per season, because a rubric change or a panel change is exactly the
  // moment reliability would move, and an all-time blend would hide it.
  const bySeason = {};
  for (const s of SEASONS) {
    const rows = records.filter((r) => r.seasonId === s.id);
    if (!rows.length) continue;
    bySeason[s.id] = {
      rubricVersion: s.rubricVersion,
      rubricHash: rows[0].rubricHash || '',
      ...reliabilityFrom(rows),
    };
  }

  // Panel composition drift. If a juror has been unavailable for a
  // stretch, the agreement figure was measured on a smaller panel and
  // the page should be able to say so.
  const degraded = records.filter((r) => r.panel && r.panel.degraded).length;
  const singleJudge = records.filter((r) => r.panel && r.panel.resolution === 'single').length;
  const nonIdenticalPrompts = records.filter((r) => r.identicalPrompts === false).length;

  const out = {
    generatedAt: Date.now(),
    currentSeason: seasonFor(Date.now()).id,
    scanned: records.length,
    scanLimit: SCAN_LIMIT,
    minReportableN: RELIABILITY_MIN_N,
    overall,
    bySeason,
    integrity: {
      degradedPanels: degraded,
      singleJudgeBallots: singleJudge,
      // Should always be zero. A non-zero value means jurors were shown
      // different prompts, which would make their agreement a
      // measurement of the prompt rather than of the round.
      nonIdenticalPrompts,
    },
    appeals: await appealSummary(db),
  };

  await setCachedShared(CACHE_KEY, out, TTL_MS).catch(() => {});
  return payload(out);
};

// Appeal volume and outcomes belong on the same page as the reliability
// figures. An appeal route nobody uses and an appeal route that
// overturns half the ballots are very different systems, and both are
// worth being able to see.
async function appealSummary(db) {
  try {
    const snap = await db.collection('judge_appeals').orderBy('filedAt', 'desc').limit(SCAN_LIMIT).get();
    const rows = snap.docs.map((d) => d.data());
    const resolved = rows.filter((r) => r.state === 'resolved');
    const count = (o) => resolved.filter((r) => r.outcome === o).length;
    return {
      filed: rows.length,
      open: rows.filter((r) => r.state === 'open').length,
      resolved: resolved.length,
      upheld: count('upheld'),
      overturned: count('overturned'),
      void: count('void'),
      overturnRate: resolved.length ? Math.round((count('overturned') / resolved.length) * 100) / 100 : null,
    };
  } catch {
    return null;
  }
}

function payload(out) {
  return new Response(JSON.stringify(out), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=1800',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export const config = { path: '/api/judge/reliability' };
