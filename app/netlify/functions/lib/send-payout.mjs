// ─────────────────────────────────────────────────────────────
// The one place a cash-round pot actually leaves this account.
//
// Split out of the admin endpoint on purpose. There is exactly one
// function that moves a pot, so there is exactly one place to audit
// when the question is "how could somebody have been paid twice", and
// any future caller (a sweep, a retry button, an appeal correction)
// goes through the same claim-then-send sequence rather than writing
// its own.
//
// ── The double-send defence, which is the whole file ────────────────
//
// Sending money is not naturally idempotent and a retry that lands
// twice pays somebody out of a pot that only ever held it once. Two
// independent defences, because each one alone leaves a window:
//
//   1. THE CLAIM. A Firestore transaction moves `payout.status` to
//      `sending` only if it is currently not already sending or paid,
//      and only if the round is still `settled`. Two concurrent callers
//      cannot both win that transaction, so only one reaches Stripe.
//
//   2. THE IDEMPOTENCY KEY. Derived from the round id alone, so even if
//      a process dies after claiming and something retries from a cold
//      start, Stripe returns the SAME transfer rather than making a
//      second one.
//
// The claim is what stops two callers racing; the key is what stops one
// caller retrying. Neither covers the other's case.
//
// ── Failure leaves money owed, never lost ───────────────────────────
//
// Every failure path puts the round back to a state a human can act on:
// `settled` with a payout marked `failed` or `blocked` and the reason
// on the doc. Nothing here voids a round, refunds a winner's pot to the
// loser, or clears a debt. A round whose payout fails is a round that
// still owes somebody money, and it stays that way until it is paid.
// ─────────────────────────────────────────────────────────────
import Stripe from 'stripe';
import { FieldValue } from './firestore.mjs';
import { canSendPayout, transferIdempotencyKey } from './payout.mjs';

/**
 * Send a settled cash round's pot to its winner.
 *
 * @param {*} db          Firestore
 * @param {string} roundId
 * @param {{appealWindowMs:number, nowMs?:number}} opts
 * @returns {Promise<{ok:boolean, transferId?:string, plan?:object, stage?:string, reason?:string, message?:string}>}
 */
export async function sendCashRoundPayout(db, roundId, opts = {}) {
  const nowMs = Number(opts.nowMs) || Date.now();
  const windowMs = Number(opts.appealWindowMs) || 0;
  const ref = db.collection('cash_rounds').doc(roundId);

  const snap = await ref.get();
  if (!snap.exists) return { ok: false, stage: 'round', reason: 'no_round', message: 'No such round.' };
  const round = snap.data();

  // The recipient is read from the round's own settlement record, so
  // the account we look up is the winner's and cannot be pointed
  // somewhere else by a caller.
  const winnerUid = round.payout && Array.isArray(round.payout.splits) && round.payout.splits[0]
    ? round.payout.splits[0].uid : null;
  let account = null;
  if (winnerUid) {
    const profSnap = await db.collection('user_profiles').doc(String(winnerUid)).get();
    account = (profSnap.exists && profSnap.data().payoutAccount) || null;
  }

  const gate = canSendPayout(round, account, windowMs, nowMs);
  if (!gate.ok) {
    // A recipient who has not onboarded is recorded as BLOCKED rather
    // than failed. It is not an error, it is a person who has not
    // finished a form, and the distinction is what stops an operator
    // reading the queue as broken.
    if (gate.stage === 'recipient') {
      await ref.update({
        payout: {
          ...(round.payout || {}),
          status: 'blocked',
          blockedReason: gate.reason,
          blockedAt: nowMs,
        },
        updatedAt: nowMs,
      }).catch(() => {});
    }
    return gate;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, stage: 'platform', reason: 'no_stripe_key', message: 'Payouts are not configured.' };
  }

  // ── 1. claim ──────────────────────────────────────────────────────
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) throw new Error('claim:no_round');
      const f = fresh.data();
      if (f.status !== 'settled') throw new Error('claim:not_settled');
      const st = f.payout && f.payout.status;
      if (st === 'paid') throw new Error('claim:already_paid');
      if (st === 'sending') throw new Error('claim:in_flight');
      tx.update(ref, {
        payout: { ...(f.payout || {}), status: 'sending', claimedAt: nowMs },
        updatedAt: nowMs,
      });
    });
  } catch (e) {
    const reason = String(e.message || '').startsWith('claim:')
      ? String(e.message).slice(6) : 'claim_failed';
    return { ok: false, stage: 'round', reason, message: 'This payout is already in progress or done.' };
  }

  // ── 2. send ───────────────────────────────────────────────────────
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  try {
    const transfer = await stripe.transfers.create({
      amount: gate.plan.cents,
      currency: 'usd',
      destination: gate.stripeAccountId,
      description: `Cash round pot: ${String(round.motion || '').slice(0, 80)}`,
      metadata: { kind: 'cash_round_payout', roundId: String(roundId), uid: gate.plan.uid },
    }, { idempotencyKey: transferIdempotencyKey(roundId) });

    await ref.update({
      status: 'paid',
      payout: {
        ...(round.payout || {}),
        status: 'paid',
        transferId: transfer.id,
        destination: gate.stripeAccountId,
        paidAt: nowMs,
        blockedReason: FieldValue.delete(),
      },
      updatedAt: nowMs,
    });
    return { ok: true, transferId: transfer.id, plan: gate.plan };
  } catch (err) {
    console.error('cash round payout failed:', roundId, err && err.message);
    // Back to a state a human can retry from. Deliberately NOT
    // 'blocked': blocked means the winner has something to do, failed
    // means we do.
    await ref.update({
      payout: {
        ...(round.payout || {}),
        status: 'failed',
        failedAt: nowMs,
        error: String((err && err.message) || 'transfer failed').slice(0, 300),
      },
      updatedAt: nowMs,
    }).catch(() => {});
    return {
      ok: false, stage: 'platform', reason: 'transfer_failed',
      message: 'Stripe refused the transfer. The pot is still owed and can be retried.',
      plan: gate.plan,
    };
  }
}
