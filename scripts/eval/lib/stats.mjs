// ─────────────────────────────────────────────────────────────
// Statistics for the judge evals. Pure, seeded, and tested, because the
// numbers these produce are meant to be pitched with, and the rule since
// the 2026-07-04 /benchmark incident is that no number goes public
// without something reproducible behind it.
//
// Two deliberate choices:
//
// 1. Every resampling routine takes an explicit seed. An unseeded
//    bootstrap gives a slightly different confidence interval on every
//    run, which invites re-rolling until the interval looks good.
//    Same seed, same interval, forever.
//
// 2. Power is computed BEFORE a run, not after. A stability number on
//    n=23 rounds carries an interval roughly ±20 points wide, and the
//    honest response to that is to say so up front rather than to
//    discover it in the write-up.
// ─────────────────────────────────────────────────────────────

/** Deterministic PRNG (mulberry32). Seeded so every interval reproduces. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(xs) {
  const a = (xs || []).filter((x) => Number.isFinite(x));
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
}

/**
 * Wilson score interval for a proportion. Preferred over the normal
 * approximation because our n is small and our rates run near the
 * boundaries, where the textbook interval famously returns nonsense
 * (a 0/12 result should not produce an interval of exactly [0, 0]).
 */
export function proportionCI(k, n, z = 1.96) {
  if (!n) return { p: null, lo: null, hi: null, n: 0 };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    p: round3(p),
    lo: round3(Math.max(0, centre - half)),
    hi: round3(Math.min(1, centre + half)),
    n,
    k,
  };
}

/**
 * Percentile bootstrap over a sample. `statFn` maps a resample to a
 * number; the default is the mean, which covers every rate in the
 * stability harness (each observation is a 0/1 flag).
 */
export function bootstrapCI(values, { iters = 10000, seed = 20260814, alpha = 0.05, statFn = mean } = {}) {
  const xs = (values || []).filter((x) => Number.isFinite(x));
  const n = xs.length;
  if (n < 2) return { stat: n ? round3(statFn(xs)) : null, lo: null, hi: null, n, iters: 0 };
  const rand = rng(seed);
  const stats = new Array(iters);
  const draw = new Array(n);
  for (let i = 0; i < iters; i++) {
    for (let j = 0; j < n; j++) draw[j] = xs[(rand() * n) | 0];
    stats[i] = statFn(draw);
  }
  stats.sort((a, b) => a - b);
  const lo = stats[Math.floor((alpha / 2) * iters)];
  const hi = stats[Math.min(iters - 1, Math.ceil((1 - alpha / 2) * iters) - 1)];
  return { stat: round3(statFn(xs)), lo: round3(lo), hi: round3(hi), n, iters };
}

/** log n! via lgamma, so the exact binomial holds at the n we run. */
function lnFactorial(n) {
  if (n < 2) return 0;
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

function binomPmf(k, n, p) {
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(
    lnFactorial(n) - lnFactorial(k) - lnFactorial(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p)
  );
}

/**
 * Exact two-sided binomial test, by the method of small p-values: sum
 * every outcome at least as unlikely as the observed one. Used for
 * position bias, where the null is a coin (p0 = 0.5) and n is small
 * enough that a normal approximation would be the wrong tool.
 */
export function binomTest(k, n, p0 = 0.5) {
  if (!n) return { p: null, n: 0 };
  const obs = binomPmf(k, n, p0);
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const pi = binomPmf(i, n, p0);
    if (pi <= obs * (1 + 1e-9)) acc += pi;
  }
  // Three significant figures rather than four decimal places: a
  // p-value of 0.00195 is a different sentence from 0.002, and fixed
  // decimals flatten exactly the small values that matter.
  const p = Math.min(1, acc);
  return { p: Number(p.toPrecision(3)), k, n, p0, observed: round3(k / n) };
}

/** Rounds needed for a proportion's 95% half-width to reach `margin`. */
export function nForMargin(pHat, margin, z = 1.96) {
  const p = Math.min(0.99, Math.max(0.01, Number.isFinite(pHat) ? pHat : 0.5));
  return Math.ceil((z * z * p * (1 - p)) / (margin * margin));
}

/**
 * Rounds needed to detect a true rate of `p1` against a null of `p0`,
 * one sample, two-sided. This is the number that decides whether a
 * stability run is worth paying for before it is run.
 */
export function nForDetect(p1, p0 = 0.5, { alpha = 0.05, power = 0.8 } = {}) {
  const zA = 1.959963985; // two-sided 0.05
  const zB = power >= 0.9 ? 1.2815516 : 0.8416212; // 0.90 / 0.80
  const d = Math.abs(p1 - p0);
  if (!d) return Infinity;
  const n = ((zA * Math.sqrt(p0 * (1 - p0)) + zB * Math.sqrt(p1 * (1 - p1))) ** 2) / (d * d);
  return Math.ceil(n);
}

/**
 * Fleiss kappa generalized to k categories, for chance-corrected
 * agreement across repeated judge runs on the same round.
 *
 * `items` is an array of count objects keyed by category, one per round,
 * e.g. {prop: 2, opp: 1} or {og: 3, co: 1}. Rounds with fewer than two
 * runs carry no agreement information and are dropped rather than
 * counted as perfect, matching lib/judge-panel.mjs, whose binary version
 * this must reproduce exactly (asserted in scripts/test-stability.mjs).
 */
export function fleissKappaMulti(items) {
  const rows = (items || [])
    .map((it) => {
      const counts = {};
      let n = 0;
      for (const [key, raw] of Object.entries(it || {})) {
        const v = Number(raw) || 0;
        if (v > 0) { counts[key] = v; n += v; }
      }
      return { counts, n };
    })
    .filter((r) => r.n >= 2);

  const N = rows.length;
  if (!N) return null;

  const totals = {};
  let grand = 0;
  let sumP = 0;
  for (const r of rows) {
    let agree = 0;
    for (const [key, c] of Object.entries(r.counts)) {
      agree += c * (c - 1);
      totals[key] = (totals[key] || 0) + c;
      grand += c;
    }
    sumP += agree / (r.n * (r.n - 1));
  }

  const pBarObserved = sumP / N;
  let pBarExpected = 0;
  for (const c of Object.values(totals)) pBarExpected += (c / grand) ** 2;

  if (pBarExpected >= 1) {
    return { kappa: pBarObserved >= 1 ? 1 : 0, n: N, observed: round3(pBarObserved), expected: 1, degenerate: true };
  }
  return {
    kappa: round3((pBarObserved - pBarExpected) / (1 - pBarExpected)),
    n: N,
    observed: round3(pBarObserved),
    expected: round3(pBarExpected),
    degenerate: false,
  };
}

export function round3(x) {
  return Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null;
}
export function round4(x) {
  return Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null;
}
export function pct(x) {
  return Number.isFinite(x) ? (x * 100).toFixed(1) + '%' : 'n/a';
}
