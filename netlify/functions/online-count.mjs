// /api/online-count → GET. Returns the count of users whose presence
// heartbeat was within the last 5 minutes. Companion to
// /api/presence-ping; together they form the "N online now" surface
// rendered on the landing hero.
//
// Honesty notes:
//   - The number is real. There's no minimum-floor inflation.
//     If only one tab is open right now, this returns 1.
//   - "Online" means "had a heartbeat in the last 5 min." That
//     includes the visitor reading the landing page (their own tab
//     heartbeats) and any other tabs anywhere with the same JS.
//   - signed-in vs anonymous is broken out so the surface can choose
//     which number to surface (today we just show the total).
//
// Cached server-side for 30s so a busy landing page doesn't hammer
// Firestore on every load. 30s is short enough that the number still
// moves visibly within a session.
//
// Response shape:
//   {
//     online:   N,    // total in last 5 min
//     signedIn: M,    // subset signed-in
//     anon:     N-M,
//     windowSec: 300,
//     at: <ms epoch>
//   }

import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared } from './lib/admin-cache.mjs';

const CACHE_KEY = 'online-count';
const CACHE_TTL_MS = 5 * 60 * 1000;        // 5 min: near-static count, keep quota burn low
const WINDOW_MS = 5 * 60 * 1000;       // 5 minutes
const HARD_LIMIT = 5000;               // safety: never iterate beyond this many docs

function emptyPayload(error){
  const out = {
    online: 0,
    signedIn: 0,
    anon: 0,
    windowSec: 300,
    at: Date.now(),
  };
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
  catch (err) {
    return jsonResponse(emptyPayload('getDb: ' + err.message), 200, request);
  }

  try {
    // Firestore accepts JS Date for Timestamp comparisons (it auto-
    // converts via Timestamp.fromDate). Index requirement (console-
    // only): single-field index on presence.lastPing is auto-indexed
    // by default since it's a top-level field. No composite needed.
    const cutoff = new Date(Date.now() - WINDOW_MS);
    const snap = await db.collection('presence')
      .where('lastPing', '>=', cutoff)
      .limit(HARD_LIMIT)
      .get();

    let online = 0;
    let signedIn = 0;
    snap.forEach(doc => {
      online++;
      if (doc.get('signedIn') === true) signedIn++;
    });

    const payload = {
      online,
      signedIn,
      anon: Math.max(0, online - signedIn),
      windowSec: 300,
      at: Date.now(),
    };
    await setCachedShared(CACHE_KEY, payload, CACHE_TTL_MS);
    return jsonResponse(payload, 200, request);
  } catch (err) {
    console.warn('[online-count] query failed', err && err.message);
    return jsonResponse(emptyPayload(err && err.message), 200, request);
  }
};

export const config = { path: '/api/online-count' };
