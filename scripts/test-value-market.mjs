#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Guard for lib/value-market.mjs. Runs in the pre-commit hook.
//
// The properties that matter are not "does it compute a price" but
// "can a trader extract credits from the house without being right".
// The Floor shipped a settlement that called Math.random() and it stood
// for months, so the no-randomness assertion is a source-text check as
// well as a behavioural one.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VM, normRating, ratingFromNorm, fairValue, confidence, clamp01,
  priceOf, markPrice, tradeCost, avgPrice, applyTrade, maxSubsidy,
  emptyPosition, positionValue, netShares,
  settleValue, settlePosition,
  canTrade, canPitch, openMarket, publicMarket, marketIdFor, applyToPosition,
  marketEligible, MIN_MARKET_GAMES,
} from '../app/netlify/functions/lib/value-market.mjs';
import { isRankable } from '../app/netlify/functions/lib/rating.mjs';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { pass++; } else { fail++; fails.push(name); }
}
function near(a, b, eps, name) { ok(Math.abs(a - b) <= eps, `${name} (${a} vs ${b})`); }

const book = (qLong = 0, qShort = 0, b = VM.LIQUIDITY) => ({ qLong, qShort, b });

// ── normalization ───────────────────────────────────────────────────
ok(normRating(VM.BAND_LO) === 0, 'norm at band floor is 0');
ok(normRating(VM.BAND_HI) === 1, 'norm at band ceiling is 1');
near(normRating(1550), 0.5, 1e-9, 'norm at band midpoint is 0.5');
ok(normRating(800) === 0, 'norm clamps below the band');
ok(normRating(9999) === 1, 'norm clamps above the band');
ok(normRating(undefined) === normRating(1500), 'missing rating falls back to default');
near(ratingFromNorm(normRating(1700)), 1700, 1e-6, 'norm round-trips');
ok(clamp01(NaN) === 0.5, 'clamp01 of NaN is neutral, not 0');

near(fairValue({ rating: 1550 }), 50, 1e-9, 'fair value at midpoint is half payout');
ok(fairValue({ rating: 1900 }) === VM.SHARE_PAYOUT, 'fair value caps at full payout');
ok(confidence({ rd: 350 }) === 0, 'a brand-new debater has zero confidence');
ok(confidence({ rd: 35 }) > 0.85, 'an established debater has high confidence');
ok(confidence({}) === 0, 'missing rd is treated as maximally uncertain');

// ── LMSR pricing ────────────────────────────────────────────────────
near(priceOf(book(0, 0)), 0.5, 1e-12, 'empty book prices at 50/50');
near(priceOf(book(0, 0), 'long') + priceOf(book(0, 0), 'short'), 1, 1e-12, 'sides sum to 1');
near(priceOf(book(30, 12), 'long') + priceOf(book(30, 12), 'short'), 1, 1e-12, 'sides sum to 1 when skewed');
ok(priceOf(book(50, 0)) > priceOf(book(10, 0)), 'buying long raises the long price');
ok(priceOf(book(0, 50)) < 0.5, 'buying short lowers the long price');
near(markPrice(book(0, 0)), VM.SHARE_PAYOUT / 2, 1e-9, 'mark is payout/2 on an empty book');

// Overflow: a huge inventory must not produce NaN via exp().
const huge = book(100000, 0, 25);
ok(Number.isFinite(priceOf(huge)) && priceOf(huge) > 0.999, 'extreme inventory stays finite');
ok(Number.isFinite(tradeCost(huge, 'long', 1)), 'extreme inventory quotes a finite cost');

// ── the money properties ────────────────────────────────────────────

// Buying costs credits; selling returns them.
ok(tradeCost(book(), 'long', 10) > 0, 'a buy costs credits');
ok(tradeCost(book(20, 0), 'long', -10) < 0, 'a sell returns credits');

// Price impact: a bigger order pays a worse average price.
ok(avgPrice(book(), 'long', 100) > avgPrice(book(), 'long', 5), 'larger orders pay worse average prices');
ok(avgPrice(book(), 'long', 5) >= markPrice(book(), 'long'), 'average price is never better than the mark');

// THE one that matters: an instant round trip must never be profitable.
// If it were, a bot mints credits from the house with no view at all.
for (const size of [1, 5, 25, 100, 200]) {
  for (const side of ['long', 'short']) {
    let bk = book(7, 3);
    const paid = tradeCost(bk, side, size);
    bk = applyTrade(bk, side, size);
    const got = -tradeCost(bk, side, -size);
    ok(got <= paid, `round trip ${side} x${size} cannot profit (paid ${paid}, got ${got})`);
  }
}

// Same, walking the book in the other order, and across sides.
{
  let bk = book();
  const a = tradeCost(bk, 'long', 50); bk = applyTrade(bk, 'long', 50);
  const b = tradeCost(bk, 'short', 50); bk = applyTrade(bk, 'short', 50);
  let out = 0;
  out += -tradeCost(bk, 'long', -50); bk = applyTrade(bk, 'long', -50);
  out += -tradeCost(bk, 'short', -50); bk = applyTrade(bk, 'short', -50);
  ok(out <= a + b, 'buying both sides and unwinding cannot profit');
}

// Rounding must favour the house in both directions, or dust trading
// becomes a credit printer. Ten thousand one-share round trips.
{
  let bk = book(3, 1);
  let net = 0;
  for (let i = 0; i < 10000; i++) {
    const paid = tradeCost(bk, 'long', 1);
    bk = applyTrade(bk, 'long', 1);
    const got = -tradeCost(bk, 'long', -1);
    bk = applyTrade(bk, 'long', -1);
    net += got - paid;
  }
  ok(net <= 0, `10k dust round trips cannot mint credits (net ${net})`);
}

// Buying a long and a short share together should cost about a full
// payout, since together they pay exactly that. This is the solvency
// intuition in price form.
{
  const bk = book();
  const both = tradeCost(bk, 'long', 1) + tradeCost(applyTrade(bk, 'long', 1), 'short', 1);
  ok(both >= VM.SHARE_PAYOUT - 2, `a matched pair costs about full payout (${both})`);
}

// ── solvency under settlement ───────────────────────────────────────
//
// Simulate a market: a crowd trades, the season closes at some rating,
// everyone is paid. The house must never be out more than the LMSR
// bound, whatever the outcome and whatever order people traded in.
{
  const seq = [
    ['long', 40], ['short', 15], ['long', 25], ['short', 60],
    ['long', -20], ['short', 30], ['long', 90], ['short', -25],
  ];
  for (const finalRating of [1150, 1200, 1350, 1500, 1550, 1750, 1900, 2100]) {
    let bk = book();
    let collected = 0;
    const pos = emptyPosition('u1', 'm1', 0);
    for (const [side, n] of seq) {
      const cost = tradeCost(bk, side, n);
      collected += cost;
      bk = applyTrade(bk, side, n);
      pos[side] = (pos[side] || 0) + n;
    }
    const s = settleValue(finalRating);
    const paid = settlePosition(pos, s);
    const houseNet = collected - paid;
    ok(houseNet >= -maxSubsidy(bk) - 2,
      `house loss bounded at final ${finalRating} (net ${Math.round(houseNet)}, bound ${Math.round(maxSubsidy(bk))})`);
  }
}

// A long share and a short share always pay exactly the payout between
// them, at every possible close. This is what makes a matched pair risk
// free and the book solvent.
for (const r of [1000, 1200, 1400, 1550, 1700, 1900, 2400]) {
  const s = settleValue(r);
  near(s.longPay + s.shortPay, VM.SHARE_PAYOUT, 1e-9, `pair pays exactly the payout at ${r}`);
}

// ── settlement refuses to invent an outcome ─────────────────────────
ok(settleValue(undefined).ok === false, 'no rating means no settlement');
ok(settleValue(null).ok === false, 'null rating means no settlement');
ok(settleValue(NaN).ok === false, 'NaN rating means no settlement');
ok(settleValue('1700').ok === false, 'a string rating is refused, not coerced');
ok(settlePosition({ long: 10 }, { ok: false }) === 0, 'a failed settlement pays nothing');
near(settlePosition({ long: 10, short: 0 }, settleValue(1900)), 10 * VM.SHARE_PAYOUT, 1e-9, 'a winning long is paid in full');
ok(settlePosition({ long: 10, short: 0 }, settleValue(1200)) === 0, 'a worthless long pays zero');
near(settlePosition({ long: 0, short: 10 }, settleValue(1200)), 10 * VM.SHARE_PAYOUT, 1e-9, 'a winning short is paid in full');
ok(settlePosition({ long: -5 }, settleValue(1900)) === 0, 'a negative holding cannot be paid');

// ── position value ──────────────────────────────────────────────────
{
  const bk = book(40, 10);
  const pos = { long: 20, short: 0 };
  const v = positionValue(bk, pos);
  ok(v > 0, 'a held position has exit value');
  ok(v <= 20 * markPrice(bk, 'long') + 1, 'exit value accounts for slippage, never exceeds the mark');
  ok(positionValue(bk, { long: 0, short: 0 }) === 0, 'an empty position is worth nothing');
  ok(netShares({ long: -3 }, 'long') === 0, 'negative holdings floor at zero');
}

// ── cost basis and realized P&L ─────────────────────────────────────
{
  let bk = book();
  let pos = emptyPosition('u', 'm', 0);

  // Buy 40 long.
  let c = tradeCost(bk, 'long', 40);
  pos = applyToPosition(pos, 'long', 40, c);
  bk = applyTrade(bk, 'long', 40);
  ok(netShares(pos, 'long') === 40, 'buy adds shares');
  ok(pos.costBasis === c, 'buy adds full cost to basis');
  ok(pos.realized === 0, 'a buy realizes nothing');
  ok(pos.trades === 1, 'trade count increments');

  // Sell half. Exactly half the basis should leave.
  const basisBefore = pos.costBasis;
  const c2 = tradeCost(bk, 'long', -20);
  pos = applyToPosition(pos, 'long', -20, c2);
  bk = applyTrade(bk, 'long', -20);
  ok(netShares(pos, 'long') === 20, 'partial sell leaves the rest');
  near(pos.costBasis, basisBefore / 2, 1, 'a half exit removes half the basis');
  // Average-cost basis books an interim gain here, and that is correct
  // rather than a leak: the first 20 shares were bought lower down the
  // curve than the price the second 20 sell at. The gain is given back
  // exactly on the final exit, which the round-trip invariant below is
  // what actually pins down. Asserting a loss here would be asserting
  // last-in-first-out accounting we deliberately do not use.
  ok(Number.isFinite(pos.realized), 'a partial exit books a finite realized figure');

  // Sell the rest. Basis must land at zero, not drift.
  const c3 = tradeCost(bk, 'long', -20);
  pos = applyToPosition(pos, 'long', -20, c3);
  bk = applyTrade(bk, 'long', -20);
  ok(netShares(pos, 'long') === 0, 'full exit leaves no shares');
  ok(pos.costBasis === 0, 'a full exit zeroes the cost basis');

  // Total realized must equal total cash flow. If these diverge, the
  // P&L shown to a trader is fiction.
  const cashOut = -(c + c2 + c3);
  near(pos.realized, cashOut, 1, 'realized P&L equals net cash flow after a full round trip');
  ok(pos.realized <= 0, 'a pure round trip never shows a profit');
}

// A profitable trade must actually book a profit: buy cheap, let the
// market move up on someone else's flow, sell into it.
{
  let bk = book();
  let pos = emptyPosition('u', 'm', 0);
  const c = tradeCost(bk, 'long', 20);
  pos = applyToPosition(pos, 'long', 20, c);
  bk = applyTrade(bk, 'long', 20);

  bk = applyTrade(bk, 'long', 120);          // someone else piles in

  const c2 = tradeCost(bk, 'long', -20);
  pos = applyToPosition(pos, 'long', -20, c2);
  ok(pos.realized > 0, `buying before a rally books a real gain (${pos.realized})`);
  ok(pos.costBasis === 0, 'basis clears on the full exit');
}

// Overselling cannot mint basis. canTrade blocks this, but the maths
// must not corrupt the books if it is ever reached another way.
{
  let pos = { long: 10, costBasis: 500, realized: 0 };
  pos = applyToPosition(pos, 'long', -50, -400);
  ok(pos.costBasis === 0, 'an oversell cannot leave negative basis behind');
}

// ── trade eligibility ───────────────────────────────────────────────
const M = { marketId: 'd_x', subjectUid: 'subject', status: 'open', settled: false };
ok(canTrade({ uid: 'a', market: null, side: 'long', shares: 5 }).reason === 'no_market', 'missing market refused');
ok(canTrade({ uid: 'a', market: { ...M, settled: true }, side: 'long', shares: 5 }).reason === 'settled', 'settled market refused');
ok(canTrade({ uid: 'a', market: { ...M, status: 'suspended' }, side: 'long', shares: 5 }).reason === 'suspended', 'suspended market refused');
ok(canTrade({ uid: 'subject', market: M, side: 'long', shares: 5 }).reason === 'self', 'the debater cannot trade themselves');
ok(canTrade({ uid: 'a', market: M, side: 'sideways', shares: 5 }).reason === 'bad_side', 'bad side refused');
ok(canTrade({ uid: 'a', market: M, side: 'long', shares: 0 }).reason === 'bad_size', 'zero size refused');
ok(canTrade({ uid: 'a', market: M, side: 'long', shares: 2.5 }).reason === 'bad_size', 'fractional shares refused');
ok(canTrade({ uid: 'a', market: M, side: 'long', shares: VM.MAX_TRADE + 1 }).reason === 'bad_size', 'oversized order refused');
ok(canTrade({ uid: 'a', market: M, side: 'long', shares: 5 }).ok, 'a normal buy is allowed');
ok(canTrade({ uid: 'a', market: M, side: 'long', shares: -5, position: { long: 10 } }).ok, 'selling what you hold is allowed');
ok(canTrade({ uid: 'a', market: M, side: 'long', shares: -20, position: { long: 10 } }).reason === 'no_shares', 'cannot sell what you do not hold');
ok(canTrade({ uid: 'a', market: M, side: 'long', shares: -5, position: { short: 10 } }).reason === 'no_shares', 'cannot sell across sides');
ok(canTrade({ uid: 'a', market: M, side: 'long', shares: 100, position: { long: VM.MAX_POSITION - 50 } }).reason === 'position_cap', 'position cap enforced');

// ── stake to speak ──────────────────────────────────────────────────
ok(canPitch({ long: 0, short: 0 }).ok === false, 'no position means no pitch');
ok(canPitch({ long: VM.PITCH_MIN_SHARES - 1, short: 0 }).ok === false, 'below the threshold means no pitch');
ok(canPitch({ long: VM.PITCH_MIN_SHARES, short: 0 }).ok, 'the threshold unlocks a pitch');
ok(canPitch({ long: VM.PITCH_MIN_SHARES, short: 0 }).side === 'long', 'a long holder pitches long');
ok(canPitch({ long: 0, short: VM.PITCH_MIN_SHARES }).side === 'short', 'a short holder pitches short');
ok(canPitch({ long: 13, short: 13 }).ok, 'holdings across both sides count toward the threshold');

// ── opening a market at the ladder's mark ───────────────────────────
{
  for (const rating of [1250, 1500, 1620, 1850]) {
    const m = openMarket({ subjectUid: 'u9', name: 'X', ratingDoc: { rating, rd: 80 }, now: 1 });
    near(markPrice(m, 'long'), fairValue({ rating }), 0.5, `market opens at the ladder mark for ${rating}`);
  }
  const edge = openMarket({ subjectUid: 'u9', name: 'X', ratingDoc: { rating: 1900, rd: 40 }, now: 1 });
  ok(Number.isFinite(edge.qLong) && Number.isFinite(markPrice(edge, 'long')), 'a band-edge rating opens finite');
  ok(marketIdFor('abc') === marketIdFor('abc'), 'market id is stable for a uid');
  ok(!marketIdFor('abc').includes('abc'), 'market id does not embed the uid');
  ok(marketIdFor('abc') !== marketIdFor('abd'), 'market ids differ across uids');
  ok(/^d[a-z0-9]+$/.test(marketIdFor('Zx-9_qQ')), 'market id is url safe');
  {
    // No collisions across a realistic population.
    const seen = new Set();
    for (let i = 0; i < 20000; i++) seen.add(marketIdFor('uid_test_' + i));
    ok(seen.size === 20000, 'market ids do not collide across 20k uids');
  }
  ok(openMarket({ subjectUid: 'u', name: 'x'.repeat(500), ratingDoc: {}, now: 1 }).name.length <= 80, 'name is truncated');
}

// ── who gets a market ───────────────────────────────────────────────
//
// The bar is a record, not a confidence. These assertions exist because
// the first version reused isRankable from rating.mjs, which is the
// leaderboard's rule and excludes exactly the debaters worth pricing.
{
  ok(marketEligible({ rating: 1600, games: 3 }).ok, 'three rounds earns a market');
  ok(!marketEligible({ rating: 1600, games: 2 }).ok, 'two rounds is too thin');
  ok(marketEligible({ rating: 1600, games: 2 }).reason === 'thin_record', 'thin record is named');
  ok(!marketEligible({ rating: 1600, games: 0 }).ok, 'no rounds, no market');
  ok(!marketEligible({ games: 9 }).ok, 'a record with no rating cannot be priced');
  ok(!marketEligible(null).ok, 'a missing rating doc is refused');

  // The whole point of the separate rule: high uncertainty is the
  // product, not a disqualification.
  ok(marketEligible({ rating: 1740, rd: 300, games: 4 }).ok,
    'a wildly uncertain debater still gets a market, because that is where the edge is');
  ok(marketEligible({ rating: 1500, rd: 115, games: 50 }).ok,
    'fifty rounds at RD 115 gets a market, which isRankable would have refused');

  // Confirms the two rules genuinely disagree, so this is not a
  // distinction without a difference.
  ok(isRankable({ rd: 300, games: 4 }) === false, 'the leaderboard would not rank that debater');
  ok(isRankable({ rd: 115, games: 50 }) === false, 'nor that one');

  ok(marketEligible({ rating: 1600, games: 4 }, 10).ok === false, 'the threshold is overridable upward');
  ok(marketEligible({ rating: 1600, games: 4 }, 0).ok, 'a zero override falls back to the default');
  ok(MIN_MARKET_GAMES >= 2, 'the default bar is above a single coin flip');
}

// ── public projection leaks nothing ─────────────────────────────────
{
  const m = openMarket({ subjectUid: 'secret-uid', name: 'Ana', ratingDoc: { rating: 1600, rd: 70, games: 9 }, now: 5 });
  const pub = publicMarket(m, { rating: 1600, rd: 70, games: 9 });
  ok(!JSON.stringify(pub).includes('secret-uid'), 'the public projection never carries the subject uid');
  near(pub.long + pub.short, VM.SHARE_PAYOUT, 0.02, 'public long and short sum to the payout');
  ok(pub.edge !== null && Math.abs(pub.edge - (pub.fair - pub.long)) < 0.02, 'edge is fair minus mark');
  ok(publicMarket(null) === null, 'a missing market projects to null');
}

// ── no randomness, structurally ─────────────────────────────────────
{
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'app', 'netlify', 'functions', 'lib', 'value-market.mjs'), 'utf8');
  ok(!/Math\.random/.test(src), 'value-market.mjs contains no Math.random');
  ok(!/Date\.now/.test(src), 'value-market.mjs keeps no clock of its own');

  // Determinism, behaviourally: the same inputs price identically.
  const a = tradeCost(book(11, 4), 'long', 17);
  const b = tradeCost(book(11, 4), 'long', 17);
  ok(a === b, 'pricing is deterministic');
}

// ── report ──────────────────────────────────────────────────────────
console.log(`\nvalue-market: ${pass} passed, ${fail} failed`);
if (fail) {
  console.error('\nFailures:');
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
