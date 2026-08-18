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
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, setCached } from './lib/admin-cache.mjs';
import { displayRating, isRankable } from './lib/rating.mjs';

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
    // Single-field orderBy rides the automatic index; no composite needed.
    const snap = await withDeadline(db.collection('user_ratings')
      .orderBy('rating', 'desc')
      .limit(QUERY_LIMIT)
      .get(), 2500);

    const raw = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (!Number.isFinite(d.rating)) return;
      if (!(Number(d.games) > 0)) return; // never rated a round: not on a ladder
      // Humans only. Real Firebase uids are 28 chars; anything short is
      // a synthetic seat (the seeded async challenges use uid 'ai', and
      // one of those rated for real before eligibility() learned to
      // check the seats). The ladder never ranks an AI.
      if (doc.id.length < 20) return;
      raw.push({ uid: doc.id, d });
    });

    // Names + avatars live on user_profiles, not the rating doc. One
    // batched getAll for the whole board; a missing profile falls back
    // to the name recorded on the debater's latest rating change so the
    // row never renders blank.
    const profiles = new Map();
    if (raw.length) {
      const refs = raw.map((r) => db.collection('user_profiles').doc(r.uid));
      try {
        const docs = await withDeadline(db.getAll(...refs), 2500);
        docs.forEach((p) => { if (p.exists) profiles.set(p.id, p.data() || {}); });
      } catch (err) {
        console.warn('[leaderboard-ratings] profile join failed', err && err.message);
      }
    }
    const nameless = raw.filter((r) => {
      const p = profiles.get(r.uid);
      return !(p && (p.displayName || p.name));
    });
    const changeNames = new Map();
    if (nameless.length) {
      await Promise.all(nameless.slice(0, 25).map(async (r) => {
        try {
          const cs = await withDeadline(db.collection('rating_changes')
            .where('uid', '==', r.uid)
            .orderBy('at', 'desc')
            .limit(1)
            .get(), 2000);
          const row = cs.docs[0] && cs.docs[0].data();
          if (row && row.name) changeNames.set(r.uid, row.name);
        } catch (_) { /* composite index may be missing; fallback name only */ }
      }));
    }

    const rows = raw.map(({ uid, d }) => {
      const disp = displayRating(d);
      const p = profiles.get(uid) || {};
      return {
        uid,
        name: String(p.displayName || p.name || changeNames.get(uid) || 'A debater').slice(0, 40),
        photoURL: typeof p.photoURL === 'string' ? p.photoURL.slice(0, 500) : '',
        avatarIdentity: p.avatarIdentity || null,
        rating: disp.rating,
        rd: disp.rd,
        range: disp.range,
        tier: disp.tier,
        provisional: disp.provisional,
        rankable: isRankable(d),
        games: Number(d.games) || 0,
        wins: Number(d.wins) || 0,
        losses: Number(d.losses) || 0,
        draws: Number(d.draws) || 0,
        peak: Math.round(Number(d.peak) || disp.rating),
        lastEventAt: Number(d.lastEventAt) || null,
      };
    });

    // Rankable debaters hold the ranked places, ordered by rating.
    // Provisionals follow, also by rating, but the client shows them
    // without a rank number: an empty ladder is more honest than one
    // topped by someone who won a single round.
    rows.sort((a, b) => (Number(b.rankable) - Number(a.rankable)) || (b.rating - a.rating));

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
