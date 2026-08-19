// ─────────────────────────────────────────────────────────────
// Record seed — turn an imported competitive record into a Glicko
// starting point.
//
// WHY A SEED AND NOT A RATING
// A Tabroom record is real evidence, but it is evidence about a
// different judge pool, a different meta, and (for teams) a partnership
// rather than a person. So the seed moves the MEAN off 1500 and leaves
// the DEVIATION wide: the floor here (SEED_MIN_RD) sits far above
// PROVISIONAL_RD in rating.mjs, which means a seeded-only account never
// publicly ranks. The number shows on their profile the moment they
// claim it; the leaderboard slot still costs MIN_RATED_GAMES real
// rounds. That is the whole integrity story in two constants.
//
// Pure module: no I/O, no Firestore, no clock reads (callers pass now).
// Imported by record-import.mjs and scripts/test-record-seed.mjs.
// ─────────────────────────────────────────────────────────────
import { DEFAULT_RATING, DEFAULT_VOL } from './rating.mjs';

export const SEED_MIN_RATING = 1200;
export const SEED_MAX_RATING = 1900;
export const SEED_MIN_RD = 240;   // never below: imported evidence caps our confidence
export const SEED_MAX_RD = 330;
export const STALE_MONTHS = 24;   // records older than this decay toward 1500

// Winrate is Laplace-smoothed toward 0.5 so a 3-0 weekend does not
// read as a 100% career. 600 points of spread means a true 75%
// debater with a real sample seeds around 1620-1700, which matches
// where a strong circuit competitor lands on this ladder after a
// month of rounds.
const SPREAD = 600;
const ELIM_BONUS_PER_WIN = 14;
const ELIM_BONUS_CAP = 80;

function monthsBetween(yyyymm, nowMs) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(yyyymm || ''));
  if (!m) return Infinity;
  const then = new Date(Number(m[1]), Number(m[2]) - 1, 15).getTime();
  return (nowMs - then) / (30.44 * 24 * 3600 * 1000);
}

// rows: [{ pw, pl, ew, el, d: 'YYYY-MM', t, f }]
export function aggregateRows(rows) {
  const agg = { pw: 0, pl: 0, ew: 0, el: 0, tournaments: 0, newest: '' };
  for (const r of rows || []) {
    const pw = Number(r.pw) || 0, pl = Number(r.pl) || 0;
    const ew = Number(r.ew) || 0, el = Number(r.el) || 0;
    if (pw + pl + ew + el === 0) continue;
    agg.pw += pw; agg.pl += pl; agg.ew += ew; agg.el += el;
    agg.tournaments += 1;
    if (String(r.d || '') > agg.newest) agg.newest = String(r.d || '');
  }
  agg.games = agg.pw + agg.pl + agg.ew + agg.el;
  agg.wins = agg.pw + agg.ew;
  agg.losses = agg.pl + agg.el;
  return agg;
}

export function seedFromRecord(rows, nowMs) {
  const agg = aggregateRows(rows);
  if (!agg.games) return null;

  const wr = (agg.wins + 3) / (agg.games + 6);
  let rating = DEFAULT_RATING + SPREAD * (wr - 0.5)
    + Math.min(ELIM_BONUS_CAP, ELIM_BONUS_PER_WIN * agg.ew);

  // Deviation narrows with sample size but never below the seed floor.
  let rd = SEED_MAX_RD - 3.5 * agg.games;

  const age = monthsBetween(agg.newest, nowMs);
  if (age > STALE_MONTHS) {
    rating = DEFAULT_RATING + (rating - DEFAULT_RATING) * 0.8;
    rd += 40;
  }

  rating = Math.round(Math.min(SEED_MAX_RATING, Math.max(SEED_MIN_RATING, rating)));
  rd = Math.round(Math.min(SEED_MAX_RD, Math.max(SEED_MIN_RD, rd)));
  return { rating, rd, vol: DEFAULT_VOL, evidence: agg };
}

// The no-Tabroom path. Deliberately coarser and deliberately more
// conservative: nothing self-reported seeds above 1650 or below 1400,
// and the deviation stays at the wide end.
export const SELF_REPORT_LEVELS = {
  new:      { rating: 1450, rd: 330, label: 'New to competitive debate' },
  local:    { rating: 1500, rd: 320, label: 'Local or school circuit' },
  regional: { rating: 1550, rd: 310, label: 'Regional competitor, some elim rounds' },
  circuit:  { rating: 1600, rd: 300, label: 'National circuit, regular breaks' },
  national: { rating: 1650, rd: 300, label: 'Late elims at national tournaments' },
};

export function seedFromSelfReport(level) {
  const row = SELF_REPORT_LEVELS[String(level || '')];
  if (!row) return null;
  return { rating: row.rating, rd: row.rd, vol: DEFAULT_VOL, evidence: { level } };
}
