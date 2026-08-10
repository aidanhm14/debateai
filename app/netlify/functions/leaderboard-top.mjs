// /api/leaderboard-top → GET. Public top-of-the-leaderboard teaser for the
// landing page, which deliberately doesn't ship firebase-firestore-compat
// (dropped 2026-05-26 for ~100KB gzipped). Reads the same `leaderboard_entries`
// collection /leaderboard renders, deduped to one best entry per debater.
//
// Honesty: real entries only, no seed merge (matches the 2026-05-25
// /leaderboard decision). An empty board returns rows:[] and the client
// shows the be-among-the-first pitch instead of fake names.
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, setCached } from './lib/admin-cache.mjs';

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
    // Single-field orderBy rides the automatic index; no composite needed.
    const snap = await withDeadline(db.collection('leaderboard_entries')
      .orderBy('score', 'desc')
      .limit(QUERY_LIMIT)
      .get(), 2500);

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
    const rows = [];
    snap.forEach((doc) => {
      if (rows.length >= ROWS) return;
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
      rows.push({
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

    const payload = { rows, total: seen.size, at: Date.now() };
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
