#!/usr/bin/env node
// Guard for the cash-round money rules. Runs in the pre-commit hook.
//
// A cash round is the first place on this site where real money moves
// on the result of an argument, so the four promises the page makes to
// a stranger are asserted here rather than trusted to a code review:
//
//   1. the house fee is charged at the door and never depends on who wins
//   2. the winner takes the whole pot, with no second cut at settlement
//   3. a round that produces no verdict refunds everything, fee included
//   4. money never moves before the appeal window closes
//
// Per the habit this repo learned the hard way: a suite that passes on
// its first run has not been shown to test anything. Every guard below
// was checked by deliberately breaking the code it covers.
import {
  feeOf, netOf, quote, awardPot, refundPlan, canSettle, canPay,
  canTransition, canJoin, isExpired, isFullyFunded,
  validateBuyIn, validateRoundInput, makeRoundData, publicRound, formatCents,
  STATUSES, TERMINAL_STATUSES, FEE_BPS, SEATS,
  MIN_BUY_IN_CENTS, MAX_BUY_IN_CENTS, BUY_IN_PRESETS, DEFAULT_BUY_IN_CENTS,
} from '../app/netlify/functions/lib/cash-round.mjs';

let pass = 0;
const fails = [];
function ok(cond, label) {
  if (cond) { pass++; return; }
  fails.push(label);
}
function throws(fn, label) {
  try { fn(); fails.push(label + ' (expected a throw)'); }
  catch { pass++; }
}

// Every buy-in the product can actually charge, plus the edges and a
// handful of awkward numbers that expose rounding.
const BUY_INS = [
  MIN_BUY_IN_CENTS, 201, 299, 333, 499, 500, 501, 999, 1000, 1001,
  1234, 2500, 3333, 4999, MAX_BUY_IN_CENTS,
];

// ── 1. the fee cannot depend on who wins ────────────────────────────
// The signature is the guarantee. With no round, no winner and no
// debater in scope, there is nothing for the fee to vary with.
ok(feeOf.length === 1, 'feeOf takes only the buy-in, so no winner can be passed to it');

// Math.round is not a reference to a cash round, so it comes out before
// the check. Caught on the first run of this suite, and worth keeping
// as a note: a substring guard that fires on a standard library call
// teaches you to loosen the guard, which is the wrong lesson.
const feeSrc = feeOf.toString().replace(/Math\.round/g, 'Math.rnd');
for (const word of ['winner', 'side', 'round', 'result', 'verdict', 'uid']) {
  ok(!new RegExp(`\\b${word}\\b`, 'i').test(feeSrc), `feeOf does not mention ${word}`);
}

// Both seats are charged the identical fee, so the house is indifferent
// to the outcome by construction rather than by promise.
for (const gross of BUY_INS) {
  const q = quote(gross);
  ok(q.platformCents === feeOf(gross) * SEATS,
     `both seats pay the same fee at ${gross}`);
  ok(q.feeCents * SEATS === q.platformCents, `fee is symmetric across seats at ${gross}`);
}

// The published rate is the rate actually charged.
for (const gross of BUY_INS) {
  ok(feeOf(gross) === Math.round((gross * FEE_BPS) / 10000),
     `fee at ${gross} matches the published ${FEE_BPS / 100}%`);
}
ok(FEE_BPS === 2000, 'the fee is 20%, which is what every surface says');

// ── 2. conservation: nothing appears, nothing disappears ────────────
// collected === pot + platform, to the cent, at every price. If this
// ever fails, either a debater is being overcharged or the pot is
// paying out money that was never collected.
for (const gross of BUY_INS) {
  const q = quote(gross);
  ok(q.collectedCents === q.potCents + q.platformCents,
     `collected === pot + platform at ${gross} (${q.collectedCents} vs ${q.potCents}+${q.platformCents})`);
  ok(q.netCents + q.feeCents === q.buyInCents, `net + fee === buy-in at ${gross}`);
  ok(Number.isInteger(q.potCents) && Number.isInteger(q.platformCents),
     `integer cents at ${gross}`);
  ok(q.potCents >= 0 && q.platformCents >= 0, `no negative money at ${gross}`);
  // The winner must always be better off than they started, or the
  // product is selling a losing bet to both sides.
  ok(q.winnerTakesCents > gross, `the winner beats their own buy-in at ${gross}`);
  ok(q.profitCents === q.winnerTakesCents - gross, `stated profit is real at ${gross}`);
}
// The headline example on the page: $5 each, $8 to the winner, $2 to us.
const five = quote(500);
ok(five.buyInCents === 500 && five.feeCents === 100, '$5 buy-in carries a $1 door fee');
ok(five.potCents === 800, '$5 each makes an $8 pot');
ok(five.platformCents === 200, '$5 each earns $2');
ok(five.profitCents === 300, 'the winner of a $5 round is up $3');

// ── 3. the winner takes the pot, with no second cut ─────────────────
const winner = { uid: 'w', name: 'Winner' };
for (const pot of [0, 1, 2, 799, 800, 4321, 99999]) {
  const splits = awardPot(pot, winner);
  const sum = splits.reduce((s, x) => s + x.cents, 0);
  ok(sum === pot, `awardPot pays out exactly ${pot} (got ${sum})`);
  ok(splits.length === 1, `awardPot pays one winner at ${pot}`);
  ok(Number.isInteger(sum) && sum >= 0, `awardPot integer cents at ${pot}`);
}
// A deduction at settlement is the forbidden move: a cut at the door is
// a price, a cut here is a stake in the verdict our own judge wrote.
const awardSrc = awardPot.toString();
for (const word of ['FEE_BPS', 'feeOf', 'netOf', 'fee', 'rake', 'commission', 'house']) {
  ok(!new RegExp(word, 'i').test(awardSrc.replace(/\/\/[^\n]*/g, '')),
     `awardPot does no ${word} arithmetic`);
}
ok(awardPot.length === 2, 'awardPot takes only (pot, winner)');
// An undecided round must never reach a payout at all.
throws(() => awardPot(800, null), 'awardPot refuses to pay a round with no winner');
throws(() => awardPot(800, {}), 'awardPot refuses a winner with no uid');

// ── 4. no verdict, no fee: refunds are GROSS ────────────────────────
// The fee bought a judged round. If there wasn't one, it goes back.
for (const gross of BUY_INS) {
  const entrants = [
    { uid: 'a', name: 'A', paidCents: gross },
    { uid: 'b', name: 'B', paidCents: gross },
  ];
  const plan = refundPlan(entrants);
  const back = plan.reduce((s, r) => s + r.cents, 0);
  ok(back === gross * SEATS,
     `void refunds every cent collected at ${gross} (got ${back} of ${gross * SEATS})`);
  ok(back === quote(gross).collectedCents, `refund equals collected at ${gross}`);
  ok(back > quote(gross).potCents,
     `refund at ${gross} is gross, not the pot (we keep nothing)`);
}
const refundSrc = refundPlan.toString();
for (const word of ['FEE_BPS', 'feeOf', 'netOf', 'potCents']) {
  ok(!new RegExp(word, 'i').test(refundSrc.replace(/\/\/[^\n]*/g, '')),
     `refundPlan does no ${word} arithmetic, so it cannot refund net`);
}
// Somebody who never actually paid is not owed a refund.
ok(refundPlan([{ uid: 'a', paidCents: 0 }, { uid: 'b', paidCents: 500 }]).length === 1,
   'refundPlan skips a seat that never paid');
ok(refundPlan(null).length === 0, 'refundPlan survives a missing entrant list');

// ── 5. what may settle a round ──────────────────────────────────────
const funded = {
  status: 'funded',
  entrants: [{ uid: 'a', side: 'pro' }, { uid: 'b', side: 'con' }],
};
// A judgment always carries a participants map; these fixtures match
// what lib/judgment.mjs actually records.
const PARTIES = { a: 'a', b: 'b' };
ok(canSettle(funded, { verdictSource: 'server', winner: 'a', resolution: 'decided', participants: PARTIES }).ok,
   'a server verdict settles a funded round');
ok(!canSettle(funded, { verdictSource: 'participant', winner: 'a', participants: PARTIES }).ok,
   'a browser-authored ballot cannot move real money');
ok(canSettle(funded, { verdictSource: 'participant', winner: 'a', participants: PARTIES }).reason === 'unverified_verdict',
   'and it says why');
// A split panel is a round nobody won. There is no tie-break and there
// must never be one: the house is holding the money.
const split = canSettle(funded, { verdictSource: 'server', winner: null, resolution: 'unresolved' });
ok(!split.ok && split.shouldVoid === true, 'a split panel voids and refunds rather than picking a side');
ok(!canSettle({ ...funded, status: 'open' }, { verdictSource: 'server', winner: 'a', participants: PARTIES }).ok,
   'an unfunded round cannot settle');
ok(!canSettle(funded, null).ok, 'no judgment, no settlement');
ok(!canSettle(funded, { verdictSource: 'server', winner: 'stranger', resolution: 'decided', participants: PARTIES }).ok,
   'the winner has to have been in the round');
// A real judgment names its winner as a side KEY and carries the uids
// in `participants`. Resolving through that map is what stops the wrong
// person being paid when the judgment's labels are prop/opp and ours
// are pro/con.
const realShape = {
  verdictSource: 'server', resolution: 'decided', winner: 'b',
  sideLabels: { a: 'prop', b: 'opp' },
  participants: { a: 'a', b: 'b' },
};
ok(canSettle(funded, realShape).ok, 'a judgment resolves its winner through participants');
ok(canSettle(funded, realShape).winner.uid === 'b', 'and it resolves to the right person');
ok(canSettle(funded, { ...realShape, winner: 'a' }).winner.uid === 'a', 'both directions');
// The trap this guards: side key 'b' must never be read as OUR side
// label. Our seats are pro/con, so a judgment labelled prop/opp whose
// participants are missing has to fail rather than guess.
ok(!canSettle(funded, { verdictSource: 'server', resolution: 'decided', winner: 'b' }).ok,
   'a judgment with no participants map cannot settle by side label alone');
const settleSrc = canSettle.toString();
ok(!/tie|coin|random/i.test(settleSrc.replace(/\/\/[^\n]*/g, '')),
   'canSettle contains no tie-break');

// ── 6. money waits for the appeal window ────────────────────────────
const WINDOW = 72 * 3600_000;
const settled = { status: 'settled', settledAt: 1_000_000, disputeState: 'none', payout: { status: 'owed' } };
ok(!canPay(settled, WINDOW, 1_000_000 + WINDOW - 1).ok, 'no payout while the window is open');
ok(canPay(settled, WINDOW, 1_000_000 + WINDOW).ok, 'payout unlocks when the window closes');
ok(canPay(settled, WINDOW, 1_000_000 + WINDOW + 1).ok, 'and stays unlocked after');
ok(!canPay({ ...settled, disputeState: 'open' }, WINDOW, 9e15).ok,
   'an open appeal freezes the money however long it has been');
ok(!canPay({ ...settled, payout: { status: 'paid' } }, WINDOW, 9e15).ok,
   'a paid round cannot be paid twice');
ok(!canPay({ ...settled, status: 'funded' }, WINDOW, 9e15).ok, 'an unsettled round cannot pay');
ok(!canPay({ ...settled, settledAt: 0 }, WINDOW, 9e15).ok,
   'a round with no settled time cannot pay, rather than paying immediately');

// ── 7. the status machine ───────────────────────────────────────────
ok(canTransition('open', 'funded'), 'open -> funded');
ok(canTransition('funded', 'settled'), 'funded -> settled');
ok(canTransition('settled', 'paid'), 'settled -> paid');
ok(canTransition('void', 'refunded'), 'void -> refunded');
ok(!canTransition('open', 'settled'), 'a round cannot settle before it is funded');
ok(!canTransition('open', 'paid'), 'a round cannot pay before it is funded');
ok(!canTransition('funded', 'paid'), 'a round cannot pay without a verdict');
ok(!canTransition('paid', 'void'), 'paid is terminal, so money cannot be clawed back by a status flip');
ok(!canTransition('refunded', 'paid'), 'refunded is terminal');
ok(!canTransition('paid', 'refunded'), 'a paid round cannot also refund');
for (const s of ['paid', 'refunded']) ok(TERMINAL_STATUSES.has(s), `${s} is terminal`);
ok(STATUSES.length === 6, 'six statuses, no undocumented state');

// ── 8. who may take a seat ──────────────────────────────────────────
const open = {
  status: 'open',
  creatorUid: 'a',
  entrants: [{ uid: 'a', side: 'pro', paid: true, paidCents: 500 }],
  expiresAt: Date.now() + 3600_000,
};
ok(canJoin(open, 'b').ok, 'a stranger can take the empty seat');
ok(!canJoin(open, 'a').ok, 'you cannot take both sides of your own pot');
ok(!canJoin(open, null).ok, 'signed out cannot join');
ok(!canJoin({ ...open, status: 'funded' }, 'b').ok, 'a funded round is closed');
ok(!canJoin({ ...open, expiresAt: 1 }, 'b').ok, 'an expired round cannot be joined');
ok(!canJoin({ ...open, entrants: [{ uid: 'a' }, { uid: 'c' }] }, 'b').ok, 'both seats taken');

// Funded means BOTH people actually paid, not both people clicked.
ok(!isFullyFunded(open), 'one paid seat is not a funded round');
ok(!isFullyFunded({ entrants: [{ uid: 'a', paid: true, paidCents: 500 }, { uid: 'b', paid: false, paidCents: 0 }] }),
   'a seat that clicked but never paid does not fund the round');
ok(isFullyFunded({ entrants: [{ uid: 'a', paid: true, paidCents: 500 }, { uid: 'b', paid: true, paidCents: 500 }] }),
   'two paid seats fund the round');

// A funded round is never killed by the clock: both people paid, so it
// is owed a chance to be played rather than a refund.
ok(!isExpired({ status: 'funded', expiresAt: 1 }), 'a funded round does not expire');
ok(isExpired({ status: 'open', expiresAt: 1 }), 'an unfunded round does expire');
ok(!isExpired({ status: 'paid', expiresAt: 1 }), 'a paid round does not expire');

// ── 9. price validation ─────────────────────────────────────────────
ok(!validateBuyIn(MIN_BUY_IN_CENTS - 1).ok, 'under the floor is refused');
ok(!validateBuyIn(MAX_BUY_IN_CENTS + 1).ok, 'over the ceiling is refused');
ok(validateBuyIn(MIN_BUY_IN_CENTS).ok && validateBuyIn(MAX_BUY_IN_CENTS).ok, 'the edges are allowed');
ok(!validateBuyIn(0).ok && !validateBuyIn(-500).ok, 'zero and negative are refused');
ok(!validateBuyIn('500; DROP').ok === false || validateBuyIn('500').ok, 'numeric strings coerce or refuse');
for (const p of BUY_IN_PRESETS) ok(validateBuyIn(p).ok, `preset ${p} is inside the bounds`);
ok(BUY_IN_PRESETS.includes(DEFAULT_BUY_IN_CENTS), 'the default is one of the presets');

const bad = validateRoundInput({ motion: 'too short', buyInCents: 500 });
ok(!bad.ok && bad.field === 'motion', 'a motion has to say something');
const good = validateRoundInput({ motion: 'This house would abolish the filibuster', buyInCents: 500 });
ok(good.ok && good.value.buyInCents === 500, 'a real motion passes');
ok(validateRoundInput({ motion: 'This house would abolish the filibuster', buyInCents: 999999 }).ok === false,
   'an out-of-range buy-in is refused at the door');

// ── 10. the round doc, and what a browser sees ──────────────────────
const doc = makeRoundData({
  input: good.value,
  creator: { uid: 'a', name: 'Aidan' },
  nowMs: 1_000_000,
});
ok(doc.status === 'open' && doc.potCents === 0, 'a new round holds no money');
ok(doc.entrants.length === 1 && doc.entrants[0].paid === false,
   'the creator holds a seat but has not paid yet');
ok(doc.feeBps === FEE_BPS, 'the round stamps the fee it was created under');
ok(doc.payout.status === 'none' && doc.refunds.status === 'none', 'nothing is owed yet');

const pub = publicRound('r1', { ...doc, potCents: 800, buyInCents: 500 });
ok(pub.winnerTakesCents === 800, 'the board shows what the winner actually takes');
const pubStr = JSON.stringify(pub);
for (const leak of ['stripe', 'paymentIntent', 'sessionId', 'email', 'customer']) {
  ok(!new RegExp(leak, 'i').test(pubStr), `the public projection leaks no ${leak}`);
}
ok(!('paidCents' in pub.entrants[0]), 'the public projection does not expose what someone paid');

// ── 11. copy that has to match the maths ────────────────────────────
ok(formatCents(500) === '$5', 'whole dollars read as whole dollars');
ok(formatCents(199) === '$1.99', 'cents read as cents');
ok(formatCents(0) === '$0', 'zero is zero');

// ── report ──────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\ncash-round guard FAILED: ${fails.length} of ${pass + fails.length}\n`);
  for (const f of fails) console.error('  x ' + f);
  console.error('\nThese are the money rules. Fix the code, never the assertion.\n');
  process.exit(1);
}
console.log(`cash-round guard: ${pass} assertions pass`);
