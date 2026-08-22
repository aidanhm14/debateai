// /api/spar-queue → GET. Public, keyless: how many people are in the
// live matchmaking queue right now. Built 2026-08-22 for the /spar
// sign-in gate, which requires an account before queueing (the founder's
// call ahead of a paid push) and therefore can no longer let a signed-out
// visitor read matchmaking_queue directly (rules: isSignedIn read). The
// gate uses this to say "3 others waiting live right now", so the ask is
// "sign in and meet them" rather than a wall in front of an unknown room.
//
// Honesty: the count is REAL, no floor and no padding. A queue doc
// re-stamps joinedAt every 90s while its tab is alive (spar.html
// QUEUE_HEARTBEAT_MS), so "waiting" here means heartbeated inside the
// last 120s — the same one-beat-plus-grace window the /spar meta strip
// uses. When the queue is empty the gate falls back to the presence
// figure from /api/presence-live, which carries its own declared
// baseline; this endpoint never invents a person. Someone who signs in
// off "3 waiting" has to actually meet somebody, or the number taught
// them the site lies.
//
// Cost: one 30-doc capped read per cache miss, shared-cached 15s, so a
// whole ad-spike of signed-out visitors together costs ~4 reads a
// minute. Same posture as watch-live.mjs.
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, setCached } from './lib/admin-cache.mjs';

const CACHE_KEY = 'spar-queue';
const CACHE_TTL_MS = 15 * 1000;
const FRESH_WINDOW_MS = 120 * 1000;  // one 90s heartbeat + grace
const SCAN_LIMIT = 30;

function payload(waiting, error) {
  const out = { waiting, at: Date.now() };
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
  catch (err) { return jsonResponse(payload(0, 'getDb: ' + err.message), 200, request); }

  try {
    // Single-field range on joinedAt → auto-indexed, no composite
    // console index needed (the watch-live.mjs pattern). Status filters
    // in memory over the small recency window: consent/matched docs are
    // transient and never numerous, and a status+range composite would
    // be a console dependency for a marketing number.
    const snap = await withDeadline(db.collection('matchmaking_queue')
      .where('joinedAt', '>', new Date(Date.now() - FRESH_WINDOW_MS))
      .limit(SCAN_LIMIT)
      .get(), 2500);

    let waiting = 0;
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (d.status === 'waiting') waiting++;
    });

    const out = payload(waiting);
    await setCachedShared(CACHE_KEY, out, CACHE_TTL_MS);
    return jsonResponse(out, 200, request);
  } catch (err) {
    console.warn('[spar-queue] query failed', err && err.message);
    const out = payload(0, err && err.message);
    // Negative-cache 30s so a broken read is not re-paid per visitor.
    setCached(CACHE_KEY, out, 30_000);
    return jsonResponse(out, 200, request);
  }
};

export const config = { path: '/api/spar-queue' };
