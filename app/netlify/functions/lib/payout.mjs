// ─────────────────────────────────────────────────────────────
// SENDING THE POT — the rail that pays a cash round's winner.
//
// `lib/cash-round.mjs` decides WHETHER a pot is owed and to whom. This
// file decides whether it can actually be SENT, which is a different
// question with a different failure mode: the first is about the
// contest, the second is about a bank account existing on the other
// end. Keeping them apart matters, because "the winner has not set up
// payouts yet" must never read as "this round is unresolved."
//
// ── Why this exists at all ──────────────────────────────────────────
//
// cash-round-checkout.mjs shipped saying payouts are "paid by hand
// until Connect and KYC exist." This is Connect and KYC existing. The
// winner onboards to a Stripe Express account, Stripe collects the
// identity documents and the bank details and runs the KYC itself, and
// the payout becomes one API call against an account id. We never see
// a bank number, never store one, and never ask for one over email,
// which is what "by hand" actually meant in practice.
//
// ── The four rules, and why ─────────────────────────────────────────
//
// 1. THE AMOUNT COMES FROM THE ROUND, NEVER FROM THE CALLER.
//    `plannedTransfer` reads `payout.splits`, which was computed by
//    `awardPot` at settlement and written to the doc then. No request
//    body reaches this number. An endpoint that accepts an amount is
//    an endpoint that can be asked for the wrong one.
//
// 2. A PAYOUT IS CLAIMED BEFORE IT IS SENT.
//    Sending is not idempotent by nature and a retry that lands twice
//    is somebody being paid twice out of a pot that only holds it
//    once. So the doc moves to `sending` under a status guard first,
//    the transfer carries a deterministic idempotency key derived from
//    the round id, and Stripe collapses a duplicate to the same
//    transfer. Two independent defences, because either alone has a
//    window.
//
// 3. A MISSING ACCOUNT BLOCKS, IT DOES NOT FAIL AND IT DOES NOT VOID.
//    The money stays owed and the round stays `settled`. The winner is
//    told to onboard and the payout retries later. The one outcome
//    that must be impossible here is a round quietly leaving the payout
//    queue with nobody paid.
//
// 4. THE APPEAL WINDOW STILL GATES EVERYTHING.
//    `canSendPayout` calls straight through to `canPay`, so the window
//    and the open-appeal check are the same ones the appeal layer
//    publishes. This rail makes paying cheap; it does not make it
//    earlier.
// ─────────────────────────────────────────────────────────────
import { canPay } from './cash-round.mjs';

// Why a payout that is owed still cannot be sent. These are states of
// the RECIPIENT, not of the round, and each one is recoverable by the
// winner doing something, which is why each carries a sentence written
// to be read by them rather than by an operator.
export const BLOCK_REASONS = {
  no_account: 'You have not set up payouts yet. Connect a payout account and the pot is sent automatically.',
  onboarding_incomplete: 'Stripe still needs a few details before it can pay you. Finish setting up your payout account.',
  payouts_disabled: 'Stripe has payouts held on your account. Open your payout settings to see what it needs.',
};

/**
 * Is this account in a state Stripe will actually pay?
 *
 * `payouts_enabled` is the only field that answers the question, and it
 * is deliberately the one checked: an account can have submitted every
 * document and still be held, and an account can be payable before its
 * profile looks complete. Reading anything else here would be guessing
 * at Stripe's own decision.
 */
export function accountState(account) {
  if (!account || !account.stripeAccountId) {
    return { ready: false, reason: 'no_account' };
  }
  if (account.payoutsEnabled === true) return { ready: true, reason: null };
  if (!account.detailsSubmitted) {
    return { ready: false, reason: 'onboarding_incomplete' };
  }
  return { ready: false, reason: 'payouts_disabled' };
}

/**
 * What this round owes, to whom, read off the doc.
 *
 * Returns null rather than zero when there is nothing recorded, so a
 * caller cannot mistake "no settlement written" for "settled at $0".
 */
export function plannedTransfer(round) {
  const splits = round && round.payout && Array.isArray(round.payout.splits)
    ? round.payout.splits : null;
  if (!splits || !splits.length) return null;
  const win = splits[0];
  const cents = Math.trunc(Number(win && win.cents) || 0);
  if (!win || !win.uid || cents <= 0) return null;
  return { uid: String(win.uid), name: String(win.name || ''), cents };
}

/**
 * The whole gate: is this round payable, and can the winner receive it.
 *
 * Round first, recipient second, because the reasons are read by
 * different people. A round that is not payable yet is the operator's
 * business; a recipient who cannot be paid is the winner's.
 */
export function canSendPayout(round, account, windowMs, nowMs) {
  const payable = canPay(round, windowMs, nowMs);
  if (!payable.ok) return { ok: false, stage: 'round', ...payable };

  const plan = plannedTransfer(round);
  if (!plan) return { ok: false, stage: 'round', reason: 'no_payout_recorded' };

  // A payout already in flight is not a payout to start again. This is
  // the in-process half of rule 2; the idempotency key is the other.
  const status = round.payout && round.payout.status;
  if (status === 'sending') return { ok: false, stage: 'round', reason: 'in_flight' };
  if (status === 'paid') return { ok: false, stage: 'round', reason: 'already_paid' };

  const acct = accountState(account);
  if (!acct.ready) {
    return {
      ok: false, stage: 'recipient', reason: acct.reason,
      message: BLOCK_REASONS[acct.reason] || BLOCK_REASONS.no_account,
      plan,
    };
  }
  return { ok: true, plan, stripeAccountId: account.stripeAccountId };
}

/**
 * Deterministic per round, so a retry from any code path collapses to
 * the same Stripe transfer instead of creating a second one. Derived
 * from the round id ALONE on purpose: adding an attempt counter or a
 * timestamp would give every retry a fresh key, which is exactly the
 * double-send this is here to prevent.
 */
export function transferIdempotencyKey(roundId) {
  return `cashround_payout_${String(roundId || '').slice(0, 64)}`;
}

/**
 * What a winner is allowed to see about their own payout account.
 * Never the raw Stripe object: it carries the individual's name, date
 * of birth, address and the last four of a bank account.
 */
export function publicAccount(account) {
  const state = accountState(account);
  return {
    connected: !!(account && account.stripeAccountId),
    ready: state.ready,
    reason: state.reason,
    message: state.reason ? (BLOCK_REASONS[state.reason] || '') : '',
  };
}
