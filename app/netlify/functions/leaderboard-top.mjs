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

    const seen = new Set();
    const rows = [];
    snap.forEach((doc) => {
      if (rows.length >= ROWS) return;
      const d = doc.data() || {};
      const uid = d.uid || doc.id;
      if (seen.has(uid)) return; // one best entry per debater on the teaser
      if (typeof d.score !== 'number') return;
      seen.add(uid);
      rows.push({
        name: String(d.displayName || 'A debater').slice(0, 40),
        format: String(d.formatName || d.format || '').slice(0, 24),
        score: d.score,
        kind: d.kind === 'live' ? 'live' : 'voice',
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
