// /api/live-now → GET. Who is actually waiting for a live round right now —
// the real "N debaters live" signal, derived from the matchmaking_queue
// (status=='waiting', joined within the reaper window). Distinct from
// /api/online-count, which is "any tab heartbeated in 5 min." This one means
// "ready to spar this second."
//
// Honesty: the number is real (no floor). Names are the short display labels
// already stored on the queue doc. Cached 15s so a busy page doesn't hammer
// Firestore. Anonymous + signed-in both count (a guest in queue is a real
// opponent). Self-filtering (don't count yourself) is left to the client,
// which knows its own uid.
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared } from './lib/admin-cache.mjs';

const CACHE_KEY = 'live-now';
const CACHE_TTL_MS = 15 * 1000;        // 15s
const WINDOW_MS = 6 * 60 * 1000;       // match the spar-pair reaper window
const HARD_LIMIT = 200;                // safety cap
const SAMPLE = 6;                       // how many names to surface

function emptyPayload(error) {
  const out = { count: 0, debaters: [], windowSec: 360, at: Date.now() };
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
    // Single-field equality → auto-indexed, no composite needed. Recency is
    // filtered in memory so we never require a new console index.
    const snap = await db.collection('matchmaking_queue')
      .where('status', '==', 'waiting')
      .limit(HARD_LIMIT)
      .get();

    const cutoff = Date.now() - WINDOW_MS;
    const debaters = [];
    let count = 0;
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const ms = d.joinedAt && d.joinedAt.toMillis ? d.joinedAt.toMillis() : 0;
      if (ms && ms < cutoff) return; // stale (reaper hasn't swept yet)
      count++;
      if (debaters.length < SAMPLE) {
        debaters.push({ uid: doc.id, name: String(d.displayName || 'A debater').slice(0, 40), format: String(d.format || '').slice(0, 16) });
      }
    });

    const payload = { count, debaters, windowSec: 360, at: Date.now() };
    await setCachedShared(CACHE_KEY, payload, CACHE_TTL_MS);
    return jsonResponse(payload, 200, request);
  } catch (err) {
    console.warn('[live-now] query failed', err && err.message);
    return jsonResponse(emptyPayload(err && err.message), 200, request);
  }
};

export const config = { path: '/api/live-now' };
