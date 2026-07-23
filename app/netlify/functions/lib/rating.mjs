// ─────────────────────────────────────────────────────────────
// Debate Rating — Glicko-2.
//
// WHY NOT ELO
// Elo assumes you play often enough that noise averages out. This
// product runs on the order of tens of head-to-head rounds a month, so
// a debater might have three results all season. Elo would move them
// 32 points on a coin flip and present it as skill. Glicko-2 carries a
// rating deviation (how sure we are) and a volatility (how erratic the
// player is), so a 1500 with RD 350 and a 1500 with RD 45 are visibly
// different claims, and the ladder can refuse to rank the first one.
//
// RATING PERIODS
// Glickman's method batches a period's games and updates once. A live
// arena wants the number to move when the round ends, so this runs a
// period of one game, which is the standard adaptation. The cost is
// slightly faster RD decay than a batched period; acceptable, and it
// keeps "your rating changed" honest at the moment the verdict lands.
//
// Pure module: no I/O, no Firestore, no clock. Import it from
// rating-apply, the backfill, and the tests so there is one definition.
// ─────────────────────────────────────────────────────────────

export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;      // a brand-new debater: we know nothing
export const DEFAULT_VOL = 0.06;
export const TAU = 0.5;             // system constant; smaller = calmer volatility
const SCALE = 173.7178;             // Glicko-2 internal scale factor
const EPSILON = 0.000001;

// Above this RD we do not claim to know someone's strength. They still
// have a rating and it still moves; it just does not rank publicly.
export const PROVISIONAL_RD = 110;
export const MIN_RATED_GAMES = 3;

// ── scale conversion ────────────────────────────────────────────────
const toMu = (r) => (r - DEFAULT_RATING) / SCALE;
const toPhi = (rd) => rd / SCALE;
const fromMu = (mu) => mu * SCALE + DEFAULT_RATING;
const fromPhi = (phi) => phi * SCALE;

const g = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu, muJ, phiJ) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

// ── volatility solver (Glickman's Illinois variant) ─────────────────
function newVolatility(phi, v, delta, sigma, tau) {
  const a = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    const d2 = delta * delta;
    const p2 = phi * phi;
    return (ex * (d2 - p2 - v - ex)) / (2 * Math.pow(p2 + v + ex, 2)) - (x - a) / (tau * tau);
  };

  let A = a;
  let B;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) {
      k += 1;
      if (k > 100) break; // never spin forever on a pathological input
    }
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > EPSILON && guard < 200) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else { fA = fA / 2; }
    B = C; fB = fC;
    guard += 1;
  }
  return Math.exp(A / 2);
}

// ── the update ──────────────────────────────────────────────────────
//
// player:    { rating, rd, vol }
// results:   [{ rating, rd, score }]  score: 1 win, 0 loss, 0.5 draw
//
// Returns { rating, rd, vol }. A player with no results still gets an
// update: RD grows, because uncertainty increases while you are away.
export function updateRating(player, results) {
  const rating = Number.isFinite(player?.rating) ? player.rating : DEFAULT_RATING;
  const rd = Number.isFinite(player?.rd) ? player.rd : DEFAULT_RD;
  const vol = Number.isFinite(player?.vol) && player.vol > 0 ? player.vol : DEFAULT_VOL;

  const mu = toMu(rating);
  const phi = toPhi(rd);

  if (!results || results.length === 0) {
    // Idle period: only the deviation moves, capped so an inactive
    // account does not drift back to "total unknown" forever.
    const phiStar = Math.sqrt(phi * phi + vol * vol);
    return { rating, rd: Math.min(fromPhi(phiStar), DEFAULT_RD), vol };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const r of results) {
    const muJ = toMu(Number.isFinite(r.rating) ? r.rating : DEFAULT_RATING);
    const phiJ = toPhi(Number.isFinite(r.rd) ? r.rd : DEFAULT_RD);
    const gJ = g(phiJ);
    const eJ = E(mu, muJ, phiJ);
    vInv += gJ * gJ * eJ * (1 - eJ);
    deltaSum += gJ * (r.score - eJ);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  const newVol = newVolatility(phi, v, delta, vol, TAU);
  const phiStar = Math.sqrt(phi * phi + newVol * newVol);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;

  return {
    rating: fromMu(newMu),
    rd: fromPhi(newPhi),
    vol: newVol,
  };
}

// Head-to-head convenience: one round, two debaters, one outcome.
// outcome is from A's perspective: 'a' | 'b' | 'draw'.
// Both sides are updated against the OTHER's pre-round numbers, which
// is why this exists rather than two updateRating calls in sequence.
export function applyRound(a, b, outcome) {
  const scoreA = outcome === 'a' ? 1 : (outcome === 'b' ? 0 : 0.5);
  const preA = { rating: a?.rating ?? DEFAULT_RATING, rd: a?.rd ?? DEFAULT_RD, vol: a?.vol ?? DEFAULT_VOL };
  const preB = { rating: b?.rating ?? DEFAULT_RATING, rd: b?.rd ?? DEFAULT_RD, vol: b?.vol ?? DEFAULT_VOL };
  return {
    a: updateRating(preA, [{ rating: preB.rating, rd: preB.rd, score: scoreA }]),
    b: updateRating(preB, [{ rating: preA.rating, rd: preA.rd, score: 1 - scoreA }]),
  };
}

// ── presentation ────────────────────────────────────────────────────

// What the profile shows. Rounded, with the uncertainty made explicit
// rather than hidden behind a confident-looking integer.
export function displayRating(r) {
  const rating = Math.round(Number.isFinite(r?.rating) ? r.rating : DEFAULT_RATING);
  const rd = Math.round(Number.isFinite(r?.rd) ? r.rd : DEFAULT_RD);
  const games = Number(r?.games) || 0;
  const provisional = rd > PROVISIONAL_RD || games < MIN_RATED_GAMES;
  return {
    rating,
    rd,
    games,
    provisional,
    // A 95% interval. Honest about a thin record without hiding the number.
    range: [Math.round(rating - 1.96 * rd), Math.round(rating + 1.96 * rd)],
    tier: tierFor(rating, provisional),
  };
}

const TIERS = [
  [1900, 'Titan'],
  [1750, 'Elite'],
  [1650, 'Varsity'],
  [1550, 'Contender'],
  [1450, 'Regular'],
  [1300, 'Rookie'],
];
export function tierFor(rating, provisional) {
  if (provisional) return 'Unranked';
  for (const [floor, name] of TIERS) if (rating >= floor) return name;
  return 'Newcomer';
}

// Only rank people we actually know something about. An empty ladder is
// better than a ladder topped by someone who won one round.
export function isRankable(r) {
  const rd = Number.isFinite(r?.rd) ? r.rd : DEFAULT_RD;
  return rd <= PROVISIONAL_RD && (Number(r?.games) || 0) >= MIN_RATED_GAMES;
}

export function defaultRatingDoc(now) {
  return {
    rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL,
    games: 0, wins: 0, losses: 0, draws: 0,
    peak: DEFAULT_RATING, lastEventAt: 0, createdAt: now, updatedAt: now,
  };
}
