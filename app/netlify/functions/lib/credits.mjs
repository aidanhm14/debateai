// ─────────────────────────────────────────────────────────────
// Prediction credits — free, non-purchasable, non-transferable,
// non-redeemable virtual participation points.
//
// WHAT CARRIES OVER FROM THE FLOOR
// The Floor's ledger was the good part and is kept: append-only txns,
// one transaction per mutation, server-authoritative, client writes
// denied at the rules layer. Its Sharp Score (Bayesian-shrunk accuracy
// blended with ROI and conviction) is kept verbatim.
//
// WHAT DOES NOT
// The fictional markets and the `Math.random()` verdict. Markets here
// bind to a real event and settle from a `judgments` document. There is
// deliberately NO simulate path in this file: no rating-based coin
// flip, no fallback winner. A market with no judgment stays open.
// scripts/test-credits.mjs asserts this file contains no randomness,
// so the regression cannot come back quietly.
//
// Pure module. No I/O, no clock of its own.
// ─────────────────────────────────────────────────────────────

export const CREDITS = {
  START: 1000,          // opening grant, matching the Floor so balances migrate 1:1
  MIN_STAKE: 5,
  MAX_STAKE: 500,
  SEED_LIQUIDITY: 40,   // opening pari-mutuel liquidity per side, so no empty book
  // An earlier read is a harder read, so it is worth more.
  MULT: { early: 1.5, live: 1.0 },
};

export const WALLET_PLAY = 'play';
export const LEDGER_KINDS = ['grant', 'stake', 'settle', 'reversal', 'adjustment'];

// ── market lifecycle ────────────────────────────────────────────────

export function marketId(source, eventId) {
  return `${source}_${eventId}`;
}

// 'early'   before the round starts, best multiplier
// 'live'    running, still stakeable up to the lock
// 'locked'  past the lock, waiting on the ballot
// 'settled' paid out
export function windowOf(m, nowMs) {
  if (!m) return 'settled';
  if (m.status === 'settled' || m.settled) return 'settled';
  if (m.startsAt && nowMs < m.startsAt) return 'early';
  if (m.lockAt && nowMs < m.lockAt) return 'live';
  return 'locked';
}
export const stakeable = (w) => w === 'early' || w === 'live';

export function poolMult(pool, side) {
  const a = Number(pool?.A) || 0;
  const b = Number(pool?.B) || 0;
  const tot = a + b;
  const mine = side === 'A' ? a : b;
  return mine > 0 ? tot / mine : 1;
}

// Implied probability the crowd is putting on side A. This is the
// number the arena card shows, so it lives here rather than being
// re-derived (and rounded differently) on each surface.
export function impliedPct(pool) {
  const a = Number(pool?.A) || 0;
  const b = Number(pool?.B) || 0;
  const tot = a + b;
  return tot > 0 ? Math.round((a / tot) * 100) : 50;
}

export function makeMarket({ source, eventId, challengeId, claim, sideA, sideB, startsAt, lockAt, now }) {
  return {
    source, eventId,
    challengeId: challengeId || '',
    claim: String(claim || '').slice(0, 500),
    sideA: sideA || { label: 'For', uid: '', name: '' },
    sideB: sideB || { label: 'Against', uid: '', name: '' },
    pool: { A: CREDITS.SEED_LIQUIDITY, B: CREDITS.SEED_LIQUIDITY },
    backers: { A: 0, B: 0 },
    startsAt: startsAt || now,
    lockAt: lockAt || (now + 5 * 60_000),
    status: 'open',
    settled: false,
    positionsSettled: false,
    judgmentId: '',
    result: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── settlement ──────────────────────────────────────────────────────
//
// The whole point of this module. A winner comes from a judgment
// document or it does not come at all.
export function verdictFrom(judgment) {
  if (!judgment) return { ok: false, reason: 'no_judgment' };
  if (judgment.disputeState === 'open') return { ok: false, reason: 'disputed' };
  if (judgment.winner !== 'a' && judgment.winner !== 'b') return { ok: false, reason: 'bad_judgment' };
  return {
    ok: true,
    side: judgment.winner === 'a' ? 'A' : 'B',
    judgmentId: judgment.id,
    verdictSource: judgment.verdictSource || 'unknown',
  };
}

// Pari-mutuel payout for one position. Losers return 0; the pool they
// staked into is what pays the winners.
export function payoutFor(position, winningSide, pool) {
  if (!position || position.side !== winningSide) return 0;
  const stake = Number(position.stake) || 0;
  if (stake <= 0) return 0;
  const mult = poolMult(pool, winningSide);
  const windowMult = CREDITS.MULT[position.window] || 1;
  return Math.max(0, Math.round(stake * mult * windowMult));
}

// ── ledger ──────────────────────────────────────────────────────────
//
// Deterministic ids make idempotency structural rather than a matter of
// remembering to check. A retried settlement writes the same id and is
// a no-op; it cannot double-pay.
export function txnId(kind, refId, uid) {
  return `${kind}:${refId}:${uid}`;
}

export function ledgerEntry({ kind, uid, amount, balanceAfter, refType, refId, reason, actor, now }) {
  if (!LEDGER_KINDS.includes(kind)) throw new Error('bad ledger kind: ' + kind);
  return {
    txnId: txnId(kind, refId, uid),
    uid,
    kind,
    amount: Math.round(amount),        // integers only; a fractional credit is a bug
    balanceAfter: Math.round(balanceAfter),
    refType: refType || 'market',
    refId: refId || '',
    reason: String(reason || '').slice(0, 200),
    actor: actor || 'system',
    // Reserved so a future, legally reviewed real-money product can be
    // separated by wallet without migrating this collection. Nothing
    // surfaces it today and nothing writes any other value.
    walletType: WALLET_PLAY,
    createdAt: now,
  };
}

export function defaultAccount(uid, now) {
  return {
    uid,
    credits: CREDITS.START,
    staked: 0, returned: 0, bets: 0, wins: 0,
    convSum: 0, streak: 0, sharpScore: 600,
    createdAt: now, updatedAt: now,
  };
}

// ── Sharp Score ─────────────────────────────────────────────────────
// Structure kept from the Floor: shrunk accuracy blended with ROI,
// conviction, and a reliability term. Two corrections, because the
// original ranked noise above skill.
//
// The Floor's version scored a 3-for-3 predictor at 1173 and a
// 60-for-100 predictor at 1123. Sixty percent over a hundred markets is
// genuinely sharp; three for three is a coin landing heads three times.
// Two causes, both fixed here:
//
//  1. The Beta prior was +2/+4, a prior of 0.5 with a weight of only 4
//     bets, so three results moved accuracy almost to face value. Now
//     +5/+10, which needs roughly ten markets before your record
//     outweighs the assumption that you are average.
//  2. ROI was taken at face value regardless of sample. A 100% return
//     on three bets is not a 100% edge. ROI is now pulled toward
//     neutral by the same reliability term, so it only counts once
//     there are enough markets for it to mean anything.
//
// The streak bonus is also capped. Uncapped, a twenty-market run
// multiplied the whole score by 1.8, which re-introduced exactly the
// hot-hand problem the shrinkage exists to prevent.
//
// This is the same principle as choosing Glicko-2 over Elo for Debate
// Rating: with sparse data, confidence has to be earned separately from
// performance. See scripts/test-credits.mjs.
const SHARP_PRIOR_WINS = 5;
const SHARP_PRIOR_BETS = 10;
const SHARP_RELIABILITY_K = 10;
const SHARP_MAX_STREAK_BONUS = 0.2;

export function sharpScore(u) {
  const bets = u.bets || 0;
  const reliability = bets / (bets + SHARP_RELIABILITY_K);

  const accShrunk = ((u.wins || 0) + SHARP_PRIOR_WINS) / (bets + SHARP_PRIOR_BETS);

  const staked = u.staked || 0;
  const roi = staked > 0 ? ((u.returned || 0) - staked) / staked : 0;
  const roiNorm = 1 / (1 + Math.exp(-roi * 2));
  // Pull ROI toward neutral until there is enough sample to trust it.
  const roiShrunk = 0.5 + (roiNorm - 0.5) * reliability;

  const conviction = bets > 0 ? (u.convSum || 0) / bets : 1.0;
  const convNorm = Math.max(0, Math.min(1, (conviction - 0.7) / 0.8));

  const base = 0.4 * accShrunk + 0.3 * roiShrunk + 0.2 * convNorm + 0.1 * reliability;
  const streakBonus = Math.min(SHARP_MAX_STREAK_BONUS, 0.04 * (u.streak || 0));
  return Math.round(1000 * base * (1 + streakBonus)) + 600;
}

// Can this person stake on this event? Debaters are excluded from their
// own round: they know the result before the market does, and one of
// them can influence it.
export function canStake({ uid, market, position, nowMs }) {
  if (!market) return { ok: false, reason: 'no_market' };
  if (market.settled || market.status === 'settled') return { ok: false, reason: 'settled' };
  const w = windowOf(market, nowMs);
  if (!stakeable(w)) return { ok: false, reason: 'locked' };
  if (position) return { ok: false, reason: 'already_staked' };
  if (uid && (market.sideA?.uid === uid || market.sideB?.uid === uid)) {
    return { ok: false, reason: 'debater_excluded' };
  }
  return { ok: true, window: w, mult: CREDITS.MULT[w] || 1 };
}
