// ─────────────────────────────────────────────────────────────
// Debater value markets — trade a debater's rating, not a coin flip.
//
// WHAT YOU ARE BUYING
// One share of a debater is a claim on where their Debate Rating ends
// the season. LONG pays the debater's normalized final rating; SHORT
// pays the complement. A share pays between 0 and SHARE_PAYOUT credits
// and the two sides of a pair always pay SHARE_PAYOUT between them, so
// the book is solvent by construction rather than by hoping.
//
//   norm(r) = clamp((r - BAND_LO) / (BAND_HI - BAND_LO), 0, 1)
//   LONG  pays  SHARE_PAYOUT * norm(finalRating)
//   SHORT pays  SHARE_PAYOUT * (1 - norm(finalRating))
//
// WHY A RATING AND NOT "WHO WINS THE NEXT ROUND"
// Per-round binary markets already exist in predict.mjs, and they have
// the problem every one-off event market has: nothing to do between
// events. A rating claim is continuously tradeable, it moves every time
// the debater competes, and it gives a trader something to hold. Winning
// rounds is how the rating goes up, so "trade their chance of winning"
// and "trade them going up the rankings" are the same instrument here.
//
// WHERE THE EDGE COMES FROM (this is the whole product)
// Glicko-2 carries a rating deviation. A new debater sits at 1500 with
// RD 350, which means the ladder is openly saying it does not know. It
// takes several rounds for the number to catch up to someone who is
// obviously good from the first speech. That lag is the edge: a trader
// who watches rounds can price a debater before the ladder confirms
// them. `fairValue` below exposes the ladder's current mark and the page
// shows it next to the market price, so the gap is the thesis rather
// than something you have to reverse-engineer.
//
// WHY AN AMM AND NOT AN ORDER BOOK
// An order book with no traders quotes nothing, and this launches cold.
// LMSR always quotes both sides, needs no counterparty, and caps what
// the house can lose at b * SHARE_PAYOUT * ln(2) per market, known
// before the market opens. Cold start beats price discovery at zero
// volume.
//
// Pure module. No I/O, no clock, no randomness. `scripts/test-value-market.mjs`
// asserts that as a source-text check, because the Floor once shipped a
// settlement that flipped a coin and it stood for months without anyone
// noticing. A property nobody tests is a property you do not have.
// ─────────────────────────────────────────────────────────────

import { DEFAULT_RATING, DEFAULT_RD } from './rating.mjs';

export const VM = {
  SHARE_PAYOUT: 100,       // max credits one share can pay at settlement
  BAND_LO: 1200,           // rating mapping to a 0-credit LONG share
  BAND_HI: 1900,           // rating mapping to a full-payout LONG share
  LIQUIDITY: 25,           // LMSR b, in shares. Max house subsidy = b*PAYOUT*ln2
  MIN_TRADE: 1,            // shares
  MAX_TRADE: 200,          // shares per single order
  MAX_POSITION: 400,       // net shares one account may hold in one debater
  OPEN_GRANT: 1000,        // matches CREDITS.START so the two economies line up
  DAILY_DRIP: 50,          // the come-back-tomorrow credit
  DRIP_CAP: 2000,          // drip stops once you are this rich; it is a floor, not income
  PITCH_MIN_SHARES: 25,    // capital required to post on a market. See "stake to speak"
  PITCH_MAX_LEN: 600,
};

export const SIDES = ['long', 'short'];
export const isSide = (s) => SIDES.includes(s);

// ── fundamentals ────────────────────────────────────────────────────

export function clamp01(x) {
  if (!Number.isFinite(x)) return 0.5;
  return Math.max(0, Math.min(1, x));
}

// The ladder's current mark for a debater, in [0,1]. This is what a
// LONG share would pay if the season closed right now.
export function normRating(rating) {
  const r = Number.isFinite(rating) ? rating : DEFAULT_RATING;
  return clamp01((r - VM.BAND_LO) / (VM.BAND_HI - VM.BAND_LO));
}

export function ratingFromNorm(x) {
  return VM.BAND_LO + clamp01(x) * (VM.BAND_HI - VM.BAND_LO);
}

// Fair value of a LONG share in credits, from the ladder alone.
export function fairValue(ratingDoc) {
  return VM.SHARE_PAYOUT * normRating(ratingDoc?.rating);
}

// How much the ladder itself doubts its mark. A high RD means the fair
// value above is a weak claim, which is exactly when the market is
// worth trading. Surfaced so the page can say so out loud instead of
// presenting every mark with the same confidence.
export function confidence(ratingDoc) {
  const rd = Number.isFinite(ratingDoc?.rd) ? ratingDoc.rd : DEFAULT_RD;
  // RD 350 (brand new) -> 0. RD 50 (well established) -> ~0.86.
  return clamp01(1 - rd / DEFAULT_RD);
}

// ── LMSR ────────────────────────────────────────────────────────────
//
// C(q) = b * ln(e^(qL/b) + e^(qS/b)), in shares, scaled to credits by
// SHARE_PAYOUT at the boundary. Computed in a shifted form so a large
// inventory cannot overflow the exponential.

function costUnits(qL, qS, b) {
  const m = Math.max(qL, qS);
  return m + b * Math.log(Math.exp((qL - m) / b) + Math.exp((qS - m) / b));
}

// Instantaneous price of LONG in [0,1]. SHORT is the complement.
export function priceOf(book, side = 'long') {
  const b = bookLiquidity(book);
  const qL = Number(book?.qLong) || 0;
  const qS = Number(book?.qShort) || 0;
  const m = Math.max(qL, qS);
  const eL = Math.exp((qL - m) / b);
  const eS = Math.exp((qS - m) / b);
  const pLong = eL / (eL + eS);
  return side === 'short' ? 1 - pLong : pLong;
}

// Market price of one share, in credits.
export function markPrice(book, side = 'long') {
  return VM.SHARE_PAYOUT * priceOf(book, side);
}

export function bookLiquidity(book) {
  const b = Number(book?.b);
  return Number.isFinite(b) && b > 0 ? b : VM.LIQUIDITY;
}

/**
 * Cost in credits to move the book by `shares` on `side`. Positive
 * shares buy, negative shares sell. A sell returns a negative cost,
 * which the caller credits back.
 *
 * Rounded to whole credits, away from the trader on both directions, so
 * rounding can never be farmed for free credits by trading dust back
 * and forth.
 */
export function tradeCost(book, side, shares) {
  const b = bookLiquidity(book);
  const qL = Number(book?.qLong) || 0;
  const qS = Number(book?.qShort) || 0;
  const n = Number(shares) || 0;
  const nL = side === 'long' ? n : 0;
  const nS = side === 'short' ? n : 0;
  const delta = costUnits(qL + nL, qS + nS, b) - costUnits(qL, qS, b);
  const credits = VM.SHARE_PAYOUT * delta;
  return n >= 0 ? Math.ceil(credits) : -Math.floor(-credits);
}

// Average price per share actually paid, in credits. This is what the
// confirm dialog shows, because on a thin book it differs from the
// headline mark and a trader who only sees the mark feels cheated.
export function avgPrice(book, side, shares) {
  const n = Math.abs(Number(shares) || 0);
  if (n === 0) return markPrice(book, side);
  return Math.abs(tradeCost(book, side, shares)) / n;
}

export function applyTrade(book, side, shares) {
  const n = Number(shares) || 0;
  return {
    ...book,
    qLong: (Number(book?.qLong) || 0) + (side === 'long' ? n : 0),
    qShort: (Number(book?.qShort) || 0) + (side === 'short' ? n : 0),
    b: bookLiquidity(book),
  };
}

// Worst case the house can be out over the life of one market. Fixed
// before the market opens, which is the property an order book does not
// give you.
export function maxSubsidy(book) {
  return VM.SHARE_PAYOUT * bookLiquidity(book) * Math.LN2;
}

// ── positions ───────────────────────────────────────────────────────

export function emptyPosition(uid, marketId, now) {
  return {
    uid, marketId,
    long: 0, short: 0,
    costBasis: 0,       // net credits paid in, can go negative after selling out
    realized: 0,
    trades: 0,
    createdAt: now, updatedAt: now,
  };
}

export function netShares(pos, side) {
  return Math.max(0, Number(pos?.[side]) || 0);
}

/**
 * Mark-to-market value of a position if it were closed into the book
 * right now. Selling moves the price against you, so this prices the
 * actual exit rather than multiplying by the headline mark.
 */
export function positionValue(book, pos) {
  let b = book;
  let total = 0;
  for (const side of SIDES) {
    const n = netShares(pos, side);
    if (n <= 0) continue;
    const proceeds = -tradeCost(b, side, -n);
    total += proceeds;
    b = applyTrade(b, side, -n);
  }
  return Math.round(total);
}

export function unrealized(book, pos) {
  return positionValue(book, pos) - (Number(pos?.costBasis) || 0);
}

/**
 * Fold one filled trade into a position. Lives here rather than in the
 * endpoint because it is money math and everything that decides what a
 * trader is owed belongs behind the test guard.
 *
 * A partial sell realizes only the proportional slice of cost basis. The
 * obvious alternative, booking the whole basis on the first sell, would
 * report a wild gain on a partial exit and a matching phantom loss later.
 */
export function applyToPosition(pos, side, shares, cost) {
  const held = netShares(pos, side);
  const n = Math.trunc(Number(shares) || 0);
  let costBasis = Number(pos?.costBasis) || 0;
  let realized = Number(pos?.realized) || 0;

  if (n > 0) {
    costBasis += cost;
  } else if (n < 0) {
    const proceeds = -cost;
    const frac = held > 0 ? Math.min(1, Math.abs(n) / held) : 1;
    const basisOut = Math.round(costBasis * frac);
    realized += proceeds - basisOut;
    costBasis -= basisOut;
  }

  return {
    ...pos,
    [side]: held + n,
    costBasis,
    realized,
    trades: (Number(pos?.trades) || 0) + 1,
  };
}

// ── settlement ──────────────────────────────────────────────────────
//
// The rule the Floor got wrong. A payout comes from a rating document
// or it does not come at all. There is no fallback, no simulated close,
// and no default winner. A market with no final rating stays open.

export function settleValue(finalRating) {
  if (!Number.isFinite(finalRating)) return { ok: false, reason: 'no_rating' };
  const x = normRating(finalRating);
  return {
    ok: true,
    norm: x,
    longPay: VM.SHARE_PAYOUT * x,
    shortPay: VM.SHARE_PAYOUT * (1 - x),
  };
}

/**
 * What one position is paid when the market settles. Whole credits, and
 * the two sides of a share always sum to SHARE_PAYOUT before rounding,
 * so the book cannot pay out more than it owes.
 */
export function settlePosition(pos, settlement) {
  if (!settlement?.ok) return 0;
  const l = netShares(pos, 'long') * settlement.longPay;
  const s = netShares(pos, 'short') * settlement.shortPay;
  return Math.round(l + s);
}

// ── eligibility ─────────────────────────────────────────────────────
//
// A debater cannot trade their own market. They decide the outcome by
// competing, which is not an edge, it is control. This is the same
// self-exclusion predict.mjs applies to the two debaters of a round,
// for the same reason.

export const TRADE_REASONS = {
  no_market: 'That market does not exist.',
  settled: 'This market has settled.',
  suspended: 'Trading is paused on this market.',
  self: 'You cannot trade your own market.',
  bad_side: 'Pick long or short.',
  bad_size: `Trade between ${VM.MIN_TRADE} and ${VM.MAX_TRADE} shares.`,
  position_cap: `You can hold at most ${VM.MAX_POSITION} shares in one debater.`,
  insufficient: 'Not enough credits for that trade.',
  no_shares: 'You do not hold that many shares.',
};

export function canTrade({ uid, market, position, side, shares }) {
  if (!market) return { ok: false, reason: 'no_market' };
  if (market.status === 'settled' || market.settled) return { ok: false, reason: 'settled' };
  if (market.status === 'suspended') return { ok: false, reason: 'suspended' };
  if (uid && market.subjectUid && market.subjectUid === uid) return { ok: false, reason: 'self' };
  if (!isSide(side)) return { ok: false, reason: 'bad_side' };

  const n = Number(shares);
  if (!Number.isFinite(n) || n === 0 || !Number.isInteger(n)) return { ok: false, reason: 'bad_size' };
  const size = Math.abs(n);
  if (size < VM.MIN_TRADE || size > VM.MAX_TRADE) return { ok: false, reason: 'bad_size' };

  const held = netShares(position, side);
  if (n < 0 && size > held) return { ok: false, reason: 'no_shares' };
  if (n > 0 && held + size > VM.MAX_POSITION) return { ok: false, reason: 'position_cap' };

  return { ok: true };
}

// Stake to speak. Holding a real position is what buys you the right to
// argue the case on a market page, so the loudest voice on a debater is
// someone with money behind the opinion rather than whoever is bored.
export function canPitch(position) {
  const held = netShares(position, 'long') + netShares(position, 'short');
  if (held < VM.PITCH_MIN_SHARES) {
    return { ok: false, reason: 'position', message: `Hold ${VM.PITCH_MIN_SHARES} shares in this debater to post.` };
  }
  return { ok: true, side: netShares(position, 'long') >= netShares(position, 'short') ? 'long' : 'short' };
}

// ── market construction ─────────────────────────────────────────────

// The market id is a deterministic hash of the uid, not the uid with a
// prefix. A market id is the most public string in this system: it sits
// in URLs, in the board payload, and in every pitch. Firebase uids are
// document keys across most of this codebase, so publishing one hands an
// attacker the key to probe every other collection for that person.
// Hashed, the id is still stable and still derivable server-side from
// the uid, and it tells a reader nothing.
//
// FNV-1a, twice, over different seeds. Not a security hash and not
// pretending to be one: the uid is not recoverable from it, which is the
// only property needed here. `openMarket` records subjectUid inside the
// document, so the server maps back by reading, never by parsing the id.
function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
/**
 * Does this debater get a market? Deliberately NOT `isRankable` from
 * rating.mjs, which was the first thing this reached for and is the
 * wrong rule.
 *
 * `isRankable` guards the public LEADERBOARD, where the question is
 * "do we know enough to rank this person", and it answers no above
 * RD 110. A market asks something different: is there a claim here
 * worth pricing. Those come apart in both directions.
 *
 *  - It would refuse a market to someone with fifty rounds and RD 115,
 *    who is obviously tradeable.
 *  - More importantly it refuses exactly the debaters the whole thesis
 *    is about. A high RD means the ladder is openly unsure, which is
 *    where the lag between the number and the reality is largest, which
 *    is where a trader who watches rounds has an edge. Gating on
 *    certainty would have shipped a market that only lists people
 *    nobody needs to price.
 *
 * So the bar is a record, not a confidence: enough completed rounds
 * that the rating reflects something that happened. One round is a
 * coin landing heads, and a market on it prices noise.
 *
 * MIN_MARKET_GAMES is the one number to move if the board is too thin
 * or too noisy, and it is env-overridable so that does not need a
 * deploy.
 */
export const MIN_MARKET_GAMES = 3;

export function marketEligible(ratingDoc, minGames) {
  const min = Number.isFinite(minGames) && minGames > 0 ? minGames : MIN_MARKET_GAMES;
  const games = Number(ratingDoc?.games) || 0;
  if (games < min) return { ok: false, reason: 'thin_record', games, min };
  if (!Number.isFinite(ratingDoc?.rating)) return { ok: false, reason: 'no_rating', games, min };
  return { ok: true, games, min };
}

export function marketIdFor(uid) {
  const s = String(uid || '');
  const a = fnv1a(s, 0x811c9dc5).toString(36);
  const b = fnv1a(s + ' vm', 0x9e3779b1).toString(36);
  return `d${a}${b}`;
}

/**
 * Open a market already priced at the ladder's current mark, so the
 * first trader is not handed a free 50/50 on someone the ladder already
 * rates at 1800. Seeded by setting the opening inventory to the
 * imbalance LMSR needs to quote that price.
 */
export function openMarket({ subjectUid, name, handle, ratingDoc, seasonId, now, b }) {
  const liq = Number.isFinite(b) && b > 0 ? b : VM.LIQUIDITY;
  const p = clamp01(normRating(ratingDoc?.rating));
  // Solve p = e^(qL/b)/(e^(qL/b)+e^(qS/b)) with qS = 0 for the opening skew.
  const eps = 1e-6;
  const pc = Math.max(eps, Math.min(1 - eps, p));
  const qLong = liq * Math.log(pc / (1 - pc));
  return {
    marketId: marketIdFor(subjectUid),
    subjectUid,
    name: String(name || 'Debater').slice(0, 80),
    handle: String(handle || '').slice(0, 40),
    seasonId: seasonId || '',
    qLong, qShort: 0, b: liq,
    openRating: Number.isFinite(ratingDoc?.rating) ? ratingDoc.rating : DEFAULT_RATING,
    volume: 0, traders: 0, trades: 0,
    status: 'open',
    settled: false,
    settlement: null,
    finalRating: null,
    createdAt: now, updatedAt: now,
  };
}

// What a client is allowed to see. The book is public on purpose (a
// market with a hidden price is not a market); individual positions are
// not, and never leave the server for anyone but their owner.
export function publicMarket(m, ratingDoc) {
  if (!m) return null;
  const book = { qLong: m.qLong, qShort: m.qShort, b: m.b };
  const mark = markPrice(book, 'long');
  const fair = ratingDoc ? fairValue(ratingDoc) : null;
  return {
    marketId: m.marketId,
    name: m.name,
    handle: m.handle || '',
    status: m.status || 'open',
    settled: !!m.settled,
    long: Math.round(mark * 100) / 100,
    short: Math.round((VM.SHARE_PAYOUT - mark) * 100) / 100,
    fair: fair === null ? null : Math.round(fair * 100) / 100,
    // Signed gap between the ladder and the market. The number a trader
    // is actually looking for.
    edge: fair === null ? null : Math.round((fair - mark) * 100) / 100,
    rating: ratingDoc ? Math.round(ratingDoc.rating) : null,
    rd: ratingDoc ? Math.round(ratingDoc.rd) : null,
    games: ratingDoc ? (ratingDoc.games || 0) : 0,
    confidence: ratingDoc ? Math.round(confidence(ratingDoc) * 100) : null,
    volume: m.volume || 0,
    traders: m.traders || 0,
    trades: m.trades || 0,
    finalRating: m.finalRating ?? null,
    updatedAt: m.updatedAt || 0,
  };
}
