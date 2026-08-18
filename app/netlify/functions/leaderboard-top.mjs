// /api/leaderboard-top → GET. Public top-of-the-leaderboard teaser for the
// landing page, which deliberately doesn't ship firebase-firestore-compat
// (dropped 2026-05-26 for ~100KB gzipped).
//
// 2026-08-18: rated debaters lead the teaser. The bias probe showed the
// judge's speaker points carry a ~+0.3 clarity premium for longer
// speeches, so raw score is no longer the primary ordering anywhere
// public. Rows come from the Glicko ladder first (kind:'rating', same
// user_ratings source as /api/leaderboard-ratings, via the shared
// lib/rating-board.mjs), and judge-score entries from
// `leaderboard_entries` fill the remaining places while the ladder is
// thin, deduped to one best entry per debater. As rounds rate, the
// score rows age off the teaser on their own.
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, setCached } from './lib/admin-cache.mjs';
import { fetchRatingRows, composeTopRows } from './lib/rating-board.mjs';

const CACHE_KEY = 'leaderboard-top';
const CACHE_TTL_MS = 5 * 60 * 1000;   // rankings move round-by-round, not second-by-second
const QUERY_LIMIT = 60;               // enough to survive per-uid dedupe
const ROWS = 8;

function emptyPayload(error) {
  const out = { rows: [], total: 0, at: Date.now() };
  if (error) out.error = String(error).slice(0, 200);
  return out;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const cached = await getCachedShared(CACHE_KEY);
  if (cached) return jsonResponse(cached, 200, request);

  let db;
  try { db = getDb(); }
  catch (err) { return jsonResponse(emptyPayload('getDb: ' + err.message), 200, request); }

  try {
    // Ladder and entries fetched concurrently; either failing alone
    // degrades to the other rather than emptying the board.
    const [ratingResult, entriesResult] = await Promise.allSettled([
      fetchRatingRows(db, { limit: ROWS * 3 }),
      withDeadline(db.collection('leaderboard_entries')
        .orderBy('score', 'desc')
        .limit(QUERY_LIMIT)
        .get(), 2500),
    ]);
    if (ratingResult.status === 'rejected') {
      console.warn('[leaderboard-top] rating ladder read failed', ratingResult.reason && ratingResult.reason.message);
    }
    if (entriesResult.status === 'rejected') {
      console.warn('[leaderboard-top] entries read failed', entriesResult.reason && entriesResult.reason.message);
    }
    if (ratingResult.status === 'rejected' && entriesResult.status === 'rejected') {
      throw ratingResult.reason || entriesResult.reason;
    }

    // Rated debaters, in ladder order, mapped onto the teaser row shape.
    // score stays null on these rows: a Glicko number rendered where a
    // 30-scale speaker score is expected would read as a broken board.
    const ratingRows = (ratingResult.status === 'fulfilled' ? ratingResult.value : []).map((r) => ({
      name: r.name,
      format: '',
      score: null,
      rating: r.rating,
      tier: r.tier,
      provisional: r.provisional === true,
      rankable: r.rankable === true,
      kind: 'rating',
      side: '',
      completedAt: r.lastEventAt || null,
      won: null,
      rounds: r.games,
      wins: r.wins,
      losses: r.losses,
      uid: r.uid,
    }));

    const snap = entriesResult.status === 'fulfilled' ? entriesResult.value : { forEach() {} };

    // First pass: per-debater aggregates over the whole snapshot, so a
    // row can say "3 ranked rounds, 2 wins" from data that is actually
    // on the board rather than invented recency texture.
    const agg = new Map();
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (typeof d.score !== 'number') return;
      const uid = d.uid || doc.id;
      const a = agg.get(uid) || { rounds: 0, wins: 0 };
      a.rounds += 1;
      if (d.won === true) a.wins += 1;
      agg.set(uid, a);
    });

    const seen = new Set();
    const entryRows = [];
    snap.forEach((doc) => {
      if (entryRows.length >= ROWS) return;
      const d = doc.data() || {};
      const uid = d.uid || doc.id;
      if (seen.has(uid)) return; // one best entry per debater on the teaser
      if (typeof d.score !== 'number') return;
      seen.add(uid);
      // 2026-07-22: side + completedAt added so the teaser row can carry
      // more than a name and a number. Both are already on the entry doc
      // (see admin-backfill-leaderboard), so this invents nothing — the
      // client renders each only when it is actually present.
      const completedAt = typeof d.completedAt === 'number'
        ? d.completedAt
        : (d.completedAt && typeof d.completedAt.toMillis === 'function' ? d.completedAt.toMillis() : null);
      const a = agg.get(uid) || { rounds: 1, wins: d.won === true ? 1 : 0 };
      entryRows.push({
        name: String(d.displayName || 'A debater').slice(0, 40),
        format: String(d.formatName || d.format || '').slice(0, 24),
        score: d.score,
        kind: d.kind === 'live' ? 'live' : 'voice',
        side: String(d.sideLabel || d.side || '').slice(0, 18),
        completedAt,
        won: d.won === true,
        rounds: a.rounds,
        wins: a.wins,
        // uid powers the landing's per-row Challenge deep link into the
        // /spar DM flow. Only for challengeable rows: real Firebase uids,
        // never seeds (a DM to a seed uid is a thread nobody answers).
        // leaderboard_entries is publicly readable, so this exposes
        // nothing /leaderboard doesn't already render client-side.
        uid: (d.seed !== true && typeof d.uid === 'string' && d.uid.length >= 8) ? d.uid : null,
      });
    });

    // Rated debaters first, entries filling out a thin ladder. Pure and
    // asserted by scripts/test-judge-integrity.mjs: no speaker score,
    // however high, outranks a rated debater.
    const ratedUids = new Set(ratingRows.map((r) => r.uid));
    const rows = composeTopRows(ratingRows, entryRows, ROWS);
    const total = ratingRows.length
      + [...seen].filter((uid) => !ratedUids.has(uid)).length;

    const payload = { rows, total, at: Date.now() };
    await setCachedShared(CACHE_KEY, payload, CACHE_TTL_MS);
    return jsonResponse(payload, 200, request);
  } catch (err) {
    console.warn('[leaderboard-top] query failed', err && err.message);
    const payload = emptyPayload(err && err.message);
    // Negative-cache 60s so a broken read doesn't get hammered.
    setCached(CACHE_KEY, payload, 60_000);
    return jsonResponse(payload, 200, request);
  }
};

export const config = { path: '/api/leaderboard-top' };
