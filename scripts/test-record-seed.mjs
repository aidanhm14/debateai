// Unit test for lib/record-seed.mjs.
//
// The properties that matter: a seed can never claim more confidence
// than SEED_MIN_RD (which must sit far above PROVISIONAL_RD, or seeded
// accounts would leak onto the public board without playing), the
// rating stays inside the band, better records seed higher, and stale
// records decay toward 1500.
import {
  aggregateRows, seedFromRecord, seedFromSelfReport,
  SEED_MIN_RATING, SEED_MAX_RATING, SEED_MIN_RD, SELF_REPORT_LEVELS,
} from '../app/netlify/functions/lib/record-seed.mjs';
import { PROVISIONAL_RD, DEFAULT_RATING } from '../app/netlify/functions/lib/rating.mjs';

let pass = 0, fail = 0;
const t = (name, cond, got) => {
  if (cond) pass++;
  else { fail++; console.error('  FAIL:', name, got !== undefined ? `(got ${got})` : ''); }
};

const NOW = new Date(2026, 7, 15).getTime();
const row = (pw, pl, ew, el, d) => ({ pw, pl, ew, el, d, t: 'T', f: 'pf' });

// ── seeded-only never rankable ──────────────────────────────────────
t('seed RD floor sits far above the rankable line', SEED_MIN_RD > PROVISIONAL_RD * 2, SEED_MIN_RD);
{
  const s = seedFromRecord([row(50, 0, 20, 0, '2026-05')], NOW);
  t('even a perfect huge record stays at the RD floor', s.rd >= SEED_MIN_RD, s.rd);
  t('rating capped at band top', s.rating <= SEED_MAX_RATING, s.rating);
}

// ── monotonicity ────────────────────────────────────────────────────
{
  const even = seedFromRecord([row(3, 3, 0, 0, '2026-05')], NOW);
  const good = seedFromRecord([row(5, 1, 2, 1, '2026-05')], NOW);
  const bad = seedFromRecord([row(1, 5, 0, 0, '2026-05')], NOW);
  t('50% record seeds at the default', Math.abs(even.rating - DEFAULT_RATING) <= 5, even.rating);
  t('winning record seeds above losing record', good.rating > even.rating && even.rating > bad.rating,
    `${good.rating} > ${even.rating} > ${bad.rating}`);
  t('losing record stays inside the band', bad.rating >= SEED_MIN_RATING, bad.rating);
}

// ── elims count extra ───────────────────────────────────────────────
{
  const prelimOnly = seedFromRecord([row(6, 2, 0, 0, '2026-05')], NOW);
  const withElims = seedFromRecord([row(4, 2, 2, 0, '2026-05')], NOW);
  t('same W-L with elim wins seeds higher', withElims.rating > prelimOnly.rating,
    `${withElims.rating} vs ${prelimOnly.rating}`);
}

// ── sample size narrows rd, smoothing tames tiny samples ────────────
{
  const tiny = seedFromRecord([row(3, 0, 0, 0, '2026-05')], NOW);
  const big = seedFromRecord([row(30, 10, 5, 3, '2026-05')], NOW);
  t('3-0 weekend does not seed as a monster', tiny.rating < 1620, tiny.rating);
  t('bigger sample, tighter rd', big.rd < tiny.rd, `${big.rd} < ${tiny.rd}`);
}

// ── staleness ───────────────────────────────────────────────────────
{
  const fresh = seedFromRecord([row(6, 2, 2, 1, '2026-04')], NOW);
  const stale = seedFromRecord([row(6, 2, 2, 1, '2022-04')], NOW);
  t('old record decays toward default', stale.rating < fresh.rating && stale.rating > DEFAULT_RATING,
    `${stale.rating} < ${fresh.rating}`);
  t('old record widens rd', stale.rd > fresh.rd, stale.rd);
}

// ── aggregation ─────────────────────────────────────────────────────
{
  const agg = aggregateRows([row(4, 1, 2, 0, '2026-03'), row(3, 2, 0, 1, '2026-04'), { pw: 0, pl: 0, ew: 0, el: 0 }]);
  t('aggregate sums rounds across selected rows', agg.games === 13 && agg.wins === 9, JSON.stringify(agg));
  t('empty rows do not count as tournaments', agg.tournaments === 2, agg.tournaments);
  t('newest month wins', agg.newest === '2026-04', agg.newest);
}

// ── degenerate inputs ───────────────────────────────────────────────
t('no rows → null', seedFromRecord([], NOW) === null);
t('junk level → null', seedFromSelfReport('champion') === null);
{
  for (const k of Object.keys(SELF_REPORT_LEVELS)) {
    const s = seedFromSelfReport(k);
    t(`self-report ${k} stays modest and wide`, s.rating >= 1400 && s.rating <= 1650 && s.rd >= SEED_MIN_RD, JSON.stringify(s));
  }
}

console.log(`record-seed: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
