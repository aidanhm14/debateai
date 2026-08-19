// Unit test for lib/record-seed.mjs.
//
// The properties that matter: a seed can never claim more confidence
// than SEED_MIN_RD (which must sit far above PROVISIONAL_RD, or seeded
// accounts would leak onto the public board without playing), the
// rating stays inside the band, better records seed higher, and stale
// records decay toward 1500.
import {
  aggregateRows, seedFromRecord, seedFromSelfReport,
  mergeClaimedRows, normalizeClaimedRows,
  SEED_MIN_RATING, SEED_MAX_RATING, SEED_MIN_RD, SELF_REPORT_LEVELS,
} from '../app/netlify/functions/lib/record-seed.mjs';
import { PROVISIONAL_RD, DEFAULT_RATING } from '../app/netlify/functions/lib/rating.mjs';
import { readFileSync } from 'node:fs';

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

// ── revising a seed is additive, or it is a re-roll ─────────────────
// Everything below guards ONE property: a revision may add records and
// may never drop them. Without it "revise with more records" is just
// "keep importing until the number is flattering", which is the exact
// thing the seed's integrity story is built to refuse.
const idRow = (i, pw, pl, ew, el, d, n = 'Hollinger') => ({ i, n, pw, pl, ew, el, d, t: 'T', f: 'pf' });
{
  const prev = [idRow('a', 4, 1, 1, 0, '2026-03'), idRow('b', 3, 2, 0, 1, '2026-04')];
  const next = [idRow('b', 3, 2, 0, 1, '2026-04'), idRow('c', 5, 0, 2, 0, '2026-05')];
  const m = mergeClaimedRows(prev, next);
  t('merge keeps every prior row', ['a', 'b'].every((i) => m.rows.some((r) => r.i === i)), JSON.stringify(m.rows.map((r) => r.i)));
  t('merge adds the new row', m.rows.some((r) => r.i === 'c'));
  t('merge dedupes a resubmitted row', m.rows.length === 3, m.rows.length);
  t('merge reports only genuinely new rows as added', m.added === 1, m.added);
}
{
  // The attack: claim a bad weekend, then "revise" with only the good
  // one. The union must still carry the bad weekend, so the revised
  // seed cannot equal the seed of the good half alone.
  const bad = idRow('bad', 0, 8, 0, 0, '2026-03');
  const good = idRow('good', 8, 0, 3, 0, '2026-05');
  const dropped = mergeClaimedRows([bad], [good]);
  t('a revision cannot drop a prior row', dropped.rows.some((r) => r.i === 'bad'), JSON.stringify(dropped.rows.map((r) => r.i)));
  const revised = seedFromRecord(dropped.rows, NOW).rating;
  const cherryPicked = seedFromRecord([good], NOW).rating;
  t('cherry-picking the good half would rate higher than the honest union', cherryPicked > revised, `${cherryPicked} vs ${revised}`);
  const original = seedFromRecord([bad], NOW).rating;
  t('adding a good record still raises the seed', revised > original, `${revised} vs ${original}`);
}
{
  // ...and adding a bad record after a good one must be able to LOWER
  // it, or "additive" would quietly mean "ratchet upward".
  const good = [idRow('g', 8, 0, 3, 0, '2026-05')];
  const withBad = mergeClaimedRows(good, [idRow('b2', 0, 9, 0, 0, '2026-05')]);
  t('adding a losing record lowers the seed', seedFromRecord(withBad.rows, NOW).rating < seedFromRecord(good, NOW).rating);
}
{
  const m = mergeClaimedRows([], [idRow('x', 1, 0, 0, 0, '2026-05')]);
  t('a first claim merges cleanly from nothing', m.rows.length === 1 && m.added === 1);
  t('re-submitting an unchanged selection adds nothing', mergeClaimedRows(m.rows, m.rows).added === 0);
}
{
  // Seeds written before revisions existed stored rows and ids apart.
  const legacy = normalizeClaimedRows(
    [{ n: 'Hollinger', pw: 3, pl: 1, ew: 0, el: 0, d: '2026-02' }, { n: 'Hollinger', pw: 2, pl: 2, ew: 0, el: 0, d: '2026-03' }],
    ['old1', 'old2'],
  );
  t('legacy rows are zipped back to their ids', legacy.length === 2 && legacy[0].i === 'old1' && legacy[1].i === 'old2', JSON.stringify(legacy.map((r) => r.i)));
  t('a legacy row with no id is dropped rather than merged blind', normalizeClaimedRows([{ n: 'X' }], []).length === 0);
  t('legacy rows can then take part in a merge', mergeClaimedRows(legacy, [idRow('new', 1, 0, 0, 0, '2026-06')]).rows.length === 3);
}

// ── the endpoint has to actually use the additive path ──────────────
// The maths above is only worth anything if record-import.mjs routes
// through it. These read the source, in the spirit of the judge guard:
// a pure helper nobody calls protects nothing.
{
  const src = readFileSync(new URL('../app/netlify/functions/record-import.mjs', import.meta.url), 'utf8');
  t('import merges against the prior claim', /mergeClaimedRows\(priorRows, incomingRows\)/.test(src));
  t('a rated round still closes seeding for good', /Number\(pre\.games\)\s*\|\|\s*0\)\s*>\s*0/.test(src) && /already_rated/.test(src));
  t('a self-report can never revise an existing seed', /if \(prior\) return \{ ok: false, reason: 'self_after_seed' \}/.test(src));
  t('the name check runs over the union, not the new rows', /merged\.rows\.map\(\(r\) => new Set\(tokens\(r\.n\)\)\)/.test(src));
  t('the row cap applies to the union', /merged\.rows\.length > MAX_ROWS/.test(src));
  t('revision 0 keeps the bare ledger id', /revision > 0 \? `seed_\$\{uid\}_r\$\{revision\}` : `seed_\$\{uid\}`/.test(src));
  t('the old once-ever lock is gone', !/lockSnap\.exists/.test(src));
}

console.log(`record-seed: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
