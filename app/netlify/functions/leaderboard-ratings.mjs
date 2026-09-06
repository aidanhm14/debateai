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
// Consent: an OPT-OUT since 2026-08-24. A round rates unless a debater
// explicitly kept it off (eligibility() honours an explicit `false` on
// either side, and an async round consents by being published public),
// so this endpoint can serve a name for a round nobody affirmatively
// ticked a box for. That is the decision, not an oversight: the old
// dual opt-in produced 0 rated rounds out of 400. The comment that used
// to sit here still described the opt-in rule and was wrong from the
// day the rule flipped.
//
// Rows are ordered placed-first (games >= MIN_RATED_GAMES real rated
// rounds, a bar a /claim seed cannot buy because seeding never writes
// `games`) then by the printed rating in both bands, so the visible
// order always matches the visible numbers. Placed rows hold numbered
// ranks on the client; the unplaced tail renders as placement rounds.
// `rankable` (rd <= PROVISIONAL_RD too) still travels for the settled
// concept, and `provisional` still discloses an unsettled rating.
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { fetchStandingsSnapshot } from './lib/standings-snapshot.mjs';


function emptyPayload(error) {
  const out = { rows: [], rankable: 0, at: Date.now() };
  if (error) out.error = String(error).slice(0, 200);
  return out;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  let db;
  try { db = getDb(); }
  catch (err) { return jsonResponse(emptyPayload('getDb: ' + err.message), 200, request); }

  try {
    // Query, filters, name join and rankable-first ordering all live in
    // lib/rating-board.mjs, shared with /api/leaderboard-top so the two
    // standings surfaces cannot drift onto different ladders.
    const { rows, at, revision } = await fetchStandingsSnapshot(db);

    const payload = { rows, rankable: rows.filter((r) => r.rankable).length, at, revision };
    return jsonResponse(payload, 200, request);
  } catch (err) {
    console.warn('[leaderboard-ratings] query failed', err && err.message);
    const payload = emptyPayload(err && err.message);
    return jsonResponse(payload, 200, request);
  }
};

export const config = { path: '/api/leaderboard-ratings' };
