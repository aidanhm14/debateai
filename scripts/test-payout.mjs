#!/usr/bin/env node
// Guard for the payout rail. Runs in the pre-commit hook.
//
// lib/cash-round.mjs decides whether a pot is OWED. This covers whether
// it can be SENT, which is the half where real money leaves the
// account, so the promises asserted here are:
//
//   1. the amount comes from the round's own settlement record, never
//      from a caller
//   2. the appeal window still gates the send, using the appeal layer's
//      own constant
//   3. a winner who has not set up payouts BLOCKS, and the pot stays owed
//   4. a payout already sent or in flight can never be started again
//   5. the idempotency key is per round, so retries collapse instead of
//      paying twice
//   6. nothing about a person's Stripe account reaches a client
//
// Per the habit this repo learned the hard way: a suite that passes on
// its first run has not been shown to test anything. Every guard below
// was checked by deliberately breaking the code it covers.
import {
  accountState, plannedTransfer, canSendPayout,
  transferIdempotencyKey, publicAccount, BLOCK_REASONS,
} from '../app/netlify/functions/lib/payout.mjs';

let pass = 0;
const fails = [];
function ok(cond, label) {
  if (cond) { pass++; return; }
  fails.push(label);
}

const WINDOW = 72 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;
const READY = { stripeAccountId: 'acct_1', payoutsEnabled: true, detailsSubmitted: true };

function settledRound(over = {}) {
  return {
    status: 'settled',
    settledAt: T0,
    motion: 'THW abolish the filibuster',
    payout: { status: 'owed', splits: [{ uid: 'u_win', name: 'Rin', cents: 800 }] },
    ...over,
  };
}

// ── 1. account readiness ────────────────────────────────────────────
ok(accountState(null).reason === 'no_account', 'no account at all reads as no_account');
ok(accountState({}).reason === 'no_account', 'an empty account object is still no account');
ok(accountState({ stripeAccountId: 'a', detailsSubmitted: false }).reason === 'onboarding_incomplete',
  'an account mid-onboarding is incomplete, not disabled');
ok(accountState({ stripeAccountId: 'a', detailsSubmitted: true, payoutsEnabled: false }).reason === 'payouts_disabled',
  'details in but payouts off reads as disabled, which is Stripe holding it');
ok(accountState(READY).ready === true, 'payouts_enabled is what makes an account ready');
// The one field that decides. An account can look complete and be held.
ok(accountState({ stripeAccountId: 'a', detailsSubmitted: false, payoutsEnabled: true }).ready === true,
  'payouts_enabled outranks a profile that looks unfinished');

// ── 2. the amount comes from the round ──────────────────────────────
ok(plannedTransfer(settledRound()).cents === 800, 'the amount is read off the settlement record');
ok(plannedTransfer({}) === null, 'a round with no payout record plans nothing');
ok(plannedTransfer({ payout: { splits: [] } }) === null, 'empty splits plan nothing');
ok(plannedTransfer({ payout: { splits: [{ uid: 'u', cents: 0 }] } }) === null,
  'a zero split is not a payout: null, never a $0 transfer');
ok(plannedTransfer({ payout: { splits: [{ cents: 500 }] } }) === null,
  'a split with no uid cannot be paid to anybody');
// Arity is the guarantee: there is no parameter through which a caller
// could supply an amount.
ok(plannedTransfer.length === 1, 'plannedTransfer takes the round and nothing else');

// ── 3. the appeal window still gates it ─────────────────────────────
const early = canSendPayout(settledRound(), READY, WINDOW, T0 + 1000);
ok(!early.ok && early.stage === 'round' && early.reason === 'window_open',
  'inside the appeal window nothing sends, whatever the account looks like');
const appealed = canSendPayout(settledRound({ disputeState: 'open' }), READY, WINDOW, T0 + WINDOW + 1);
ok(!appealed.ok && appealed.reason === 'appeal_open',
  'an open appeal holds the money even after the window closes');
const unsettled = canSendPayout(settledRound({ status: 'funded' }), READY, WINDOW, T0 + WINDOW + 1);
ok(!unsettled.ok && unsettled.reason === 'not_settled', 'a round with no verdict sends nothing');

// ── 4. a blocked recipient keeps the pot owed ───────────────────────
const blocked = canSendPayout(settledRound(), null, WINDOW, T0 + WINDOW + 1);
ok(!blocked.ok, 'no payout account means the pot cannot be sent');
ok(blocked.stage === 'recipient', 'the block is the recipient stage, not the round');
ok(blocked.reason === 'no_account', 'and it names what the winner has to do');
ok(!!blocked.plan && blocked.plan.cents === 800,
  'a blocked payout still reports what is owed: the debt does not disappear');
ok(typeof blocked.message === 'string' && blocked.message.length > 10,
  'the block carries a sentence written for the winner to read');
ok(Object.keys(BLOCK_REASONS).every((k) => typeof BLOCK_REASONS[k] === 'string' && BLOCK_REASONS[k].length > 10),
  'every block reason has copy');

// ── 5. never twice ──────────────────────────────────────────────────
const inflight = canSendPayout(settledRound({ payout: { status: 'sending', splits: [{ uid: 'u_win', cents: 800 }] } }),
  READY, WINDOW, T0 + WINDOW + 1);
ok(!inflight.ok && inflight.reason === 'in_flight', 'a payout in flight is never started again');
const done = canSendPayout(settledRound({ payout: { status: 'paid', splits: [{ uid: 'u_win', cents: 800 }] } }),
  READY, WINDOW, T0 + WINDOW + 1);
ok(!done.ok && done.reason === 'already_paid', 'a paid payout is never sent again');
// The key must be stable across retries. An attempt counter or a clock
// in here would give every retry a fresh key, which is the double-send
// this exists to prevent.
// Pinned to the exact string, NOT to two calls being equal to each
// other: that version passed while the key carried a Date.now(),
// because both calls landed in the same millisecond. A literal is the
// only form of this assertion that catches a clock, a counter or a
// random being mixed in.
ok(transferIdempotencyKey('r1') === 'cashround_payout_r1',
  'the key is exactly the round id, with nothing else mixed in');
ok(transferIdempotencyKey('r1') === transferIdempotencyKey('r1'), 'the key is stable for a round');
ok(transferIdempotencyKey('r1') !== transferIdempotencyKey('r2'), 'and distinct between rounds');
ok(transferIdempotencyKey.length === 1, 'the key derives from the round id alone');

// ── 6. the happy path ───────────────────────────────────────────────
const good = canSendPayout(settledRound(), READY, WINDOW, T0 + WINDOW + 1);
ok(good.ok === true, 'window closed, no appeal, account ready: it sends');
ok(good.plan.cents === 800 && good.plan.uid === 'u_win', 'and it sends the recorded amount to the recorded winner');
ok(good.stripeAccountId === 'acct_1', 'to the account on the winner profile');

// ── 7. nothing about the account reaches a client ───────────────────
const pubStr = JSON.stringify(publicAccount({
  stripeAccountId: 'acct_secret', payoutsEnabled: true, detailsSubmitted: true,
  individual: { last4: '4242', dob: '1999-01-01' },
}));
for (const leak of ['acct_', 'last4', 'dob', '4242', '1999']) {
  ok(!pubStr.includes(leak), `the public account projection leaks no ${leak}`);
}
ok(JSON.parse(pubStr).ready === true, 'it still says whether the winner can be paid');

// ── report ──────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\npayout guard FAILED: ${fails.length} of ${pass + fails.length}\n`);
  for (const f of fails) console.error('  x ' + f);
  console.error('\nThis is the rail real money leaves by. Fix the code, never the assertion.\n');
  process.exit(1);
}
console.log(`payout guard: ${pass} assertions pass`);
