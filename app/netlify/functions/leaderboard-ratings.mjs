// /api/leaderboard-ratings → GET. The head-to-head standings.
//
// 2026-08-18: the public board used to order people by raw judge score,
// which is the surface the stability eval showed carries the length
// premium and the fine-grained ordering softness. Ratings, credits and
// settlement already read `ballot.winner` only, so the ladder was the
// last standings surface ranking on the contaminated field. This
// endpoint serves the board from `user_ratings` (Glicko-2, written by
// lib/rating-apply.mjs) so the rank comes from wins against people,
// not points from the judge.
//
// Consent: a user_ratings doc only exists because both debaters
// consented to a public competitive record (eligibility() enforces
// leaderboardConsent / public visibility before a round rates), so
// serving names + records here publishes nothing the debater did not
// already agree to put on the board.
//
// Rankable vs provisional uses the one definition in lib/rating.mjs:
// rd <= PROVISIONAL_RD and games >= MIN_RATED_GAMES. Provisional
// debaters are returned after every rankable one, flagged, and the
// client shows them without a rank number.
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, setCached } from './lib/admin-cache.mjs';
import { fetchRatingRows } from './lib/rating-board.mjs';

const CACHE_KEY = 'leaderboard-ratings';
const CACHE_TTL_MS = 5 * 60 * 1000;  // ratings move round-by-round, not second-by-second
const QUERY_LIMIT = 100;

function emptyPayload(error) {
  const out = { rows: [], rankable: 0, at: Date.now() };
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
    // Query, filters, name join and rankable-first ordering all live in
    // lib/rating-board.mjs, shared with /api/leaderboard-top so the two
    // standings surfaces cannot drift onto different ladders.
    const rows = await fetchRatingRows(db, { limit: QUERY_LIMIT });

    const payload = { rows, rankable: rows.filter((r) => r.rankable).length, at: Date.now() };
    await setCachedShared(CACHE_KEY, payload, CACHE_TTL_MS);
    return jsonResponse(payload, 200, request);
  } catch (err) {
    console.warn('[leaderboard-ratings] query failed', err && err.message);
    const payload = emptyPayload(err && err.message);
    // Negative-cache 60s so a broken read doesn't get hammered.
    setCached(CACHE_KEY, payload, 60_000);
    return jsonResponse(payload, 200, request);
  }
};

export const config = { path: '/api/leaderboard-ratings' };
