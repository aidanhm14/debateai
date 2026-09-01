// Shared standings logic for the public boards.
//
// 2026-08-18: the 2026-08-14 judge bias probe measured the live panel and
// found verdicts clean under every manipulation, but a ~+0.3 speaker-point
// clarity premium for longer speeches on the scorecard. Ratings, credits
// and settlement read ballot.winner only, so the one contamination path
// was any public surface that ORDERS people by raw judge score. Both
// standings endpoints (/api/leaderboard-ratings and /api/leaderboard-top)
// now rank from user_ratings through this module, so the rank comes from
// wins against people, not points from the judge.
// scripts/test-judge-integrity.mjs asserts this stays true.
import { withDeadline } from './firestore.mjs';
import { displayRating, isRankable, tierFor, MIN_RATED_GAMES } from './rating.mjs';

// The rating ladder, ordered placed-first (3+ real rated rounds) then
// rating. Names joined
// from user_profiles with a rating_changes fallback so a row never
// renders blank. Returns [] on an empty ladder; throws on a failed
// primary query so callers keep their own error posture.
export async function fetchRatingRows(db, { limit = 100 } = {}) {
  // Single-field orderBy rides the automatic index; no composite needed.
  const snap = await withDeadline(db.collection('user_ratings')
    .orderBy('rating', 'desc')
    .limit(limit)
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
      console.warn('[rating-board] profile join failed', err && err.message);
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
    const games = Number(d.games) || 0;
    // PLACED = has actually played MIN_RATED_GAMES real rated rounds.
    // The /claim seed path writes rating+rd only, never `games` (see
    // record-seed.mjs), so this bar cannot be bought with a self-reported
    // Tabroom record: it is always 3 rounds played HERE.
    const placed = games >= MIN_RATED_GAMES;
    return {
      uid,
      name: String(p.displayName || p.name || changeNames.get(uid) || 'A debater').slice(0, 40),
      photoURL: typeof p.photoURL === 'string' ? p.photoURL.slice(0, 500) : '',
      avatarIdentity: p.avatarIdentity || null,
      rating: disp.rating,
      rd: disp.rd,
      range: disp.range,
      floor: disp.floor,
      // A placed debater wears the tier band for the rating on their row
      // even while the rating is still settling; the provisional flag
      // still travels beside it, so the uncertainty is disclosed rather
      // than hidden. Unplaced rows stay Unranked: a tier over 1 round is
      // a claim about nothing.
      tier: placed ? tierFor(disp.rating, false) : disp.tier,
      provisional: disp.provisional,
      rankable: isRankable(d),
      placed,
      games,
      wins: Number(d.wins) || 0,
      losses: Number(d.losses) || 0,
      draws: Number(d.draws) || 0,
      peak: Math.round(Number(d.peak) || disp.rating),
      lastEventAt: Number(d.lastEventAt) || null,
    };
  });

  // Placed debaters (MIN_RATED_GAMES real rated rounds) hold the numbered
  // places, ordered by the rating printed on the row. The unplaced tail
  // follows, also by printed rating, so the visible order can never
  // disagree with the visible numbers (the old conservative-floor tail
  // sort put a 1691 above a 1776 on the live board, which reads as a bug
  // to everyone who cannot see the RD behind it).
  //
  // The protective job the conservative sort used to do — never let a
  // 1-0 wonder top the board — is done by the games bar instead: one win
  // leaves you unplaced and unnumbered below every real record, and a
  // /claim seed cannot fake the bar because seeding never writes `games`.
  rows.sort((a, b) => (Number(b.placed) - Number(a.placed)) || (b.rating - a.rating));
  return rows;
}

// Composes the top-of-board teaser: rated debaters FIRST, ordered by the
// rating printed on the teaser, then judge-score entry rows filling the
// remaining places while the ladder is thin. The full leaderboard keeps
// the uncertainty-aware rankable/provisional order from fetchRatingRows;
// this compact surface prints a simple number and rank badge, so those two
// visible values must agree. Pure, so the integrity suite can assert the
// ordering property directly: no speaker score, however high, ever
// outranks a rated debater, and nobody appears twice.
export function composeTopRows(ratingRows, entryRows, n) {
  const out = [];
  const seen = new Set();
  const orderedRatings = (ratingRows || []).slice().sort((a, b) => {
    const ar = a && Number.isFinite(a.rating) ? a.rating : -Infinity;
    const br = b && Number.isFinite(b.rating) ? b.rating : -Infinity;
    return br - ar;
  });
  for (const r of orderedRatings) {
    if (out.length >= n) break;
    if (!r || typeof r !== 'object') continue;
    if (r.uid) {
      if (seen.has(r.uid)) continue;
      seen.add(r.uid);
    }
    out.push(r);
  }
  for (const e of entryRows || []) {
    if (out.length >= n) break;
    if (!e || typeof e !== 'object') continue;
    if (e.uid) {
      if (seen.has(e.uid)) continue;
      seen.add(e.uid);
    }
    out.push(e);
  }
  return out;
}
