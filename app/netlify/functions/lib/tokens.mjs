// Usage-token ledger. A subscription grants a monthly token allowance;
// AI features (voice rounds, sparring, ballots) will draw it down.
//
// Hard firewall, never blur it: tokens are NOT the free Play Points in
// credit_accounts. Play Points are non-purchasable and stake prediction
// markets; tokens are paid usage allowance and stake nothing. Tokens
// never enter prize events and never convert to money or Play Points.
// This file has no code path into credit_accounts and none may be added.
//
// Server-authoritative: the Stripe webhook is the only writer. Rules
// deny all client writes on token_accounts (see firestore.rules).
import { getDb } from './firestore.mjs';

export const TOKENS = {
  // Tokens granted per paid billing cycle. Env-overridable so the
  // number can move without a redeploy of the price itself. The value
  // pinned in subscription metadata at checkout time wins over this.
  PER_CYCLE: Math.max(1, parseInt(process.env.TOKENS_PER_CYCLE || '500', 10) || 500),
};

// Sale switch. Off by default: every checkout attempt 403s until the
// price and launch surface are decided. Flip TOKENS_LIVE=true in the
// Netlify env to open the pipe; no code change needed.
export const TOKENS_LIVE = ['true', '1'].includes(
  String(process.env.TOKENS_LIVE ?? 'false').toLowerCase()
);

export function defaultTokenAccount(uid, now) {
  return {
    uid,
    tokens: 0,
    granted: 0,
    spent: 0,
    status: 'none', // none | active | past_due | canceled
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    createdAt: now,
    updatedAt: now,
  };
}

// Grant per paid invoice, idempotent on the invoice id: the txn doc id
// IS the guard. checkout.session.completed and invoice.payment_succeeded
// both fire for the first cycle, and Stripe retries webhooks, so only
// this path grants and it is keyed to the invoice. A duplicate delivery
// finds the txn doc and does nothing.
export async function grantTokensForInvoice({ uid, invoiceId, amount, reason }) {
  const db = getDb();
  const acctRef = db.collection('token_accounts').doc(uid);
  const txnRef = acctRef.collection('txns').doc('inv_' + invoiceId);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const [txnSnap, acctSnap] = await Promise.all([tx.get(txnRef), tx.get(acctRef)]);
    if (txnSnap.exists) return { granted: false, duplicate: true };

    const a = acctSnap.exists ? acctSnap.data() : defaultTokenAccount(uid, now);
    const tokens = (a.tokens || 0) + amount;
    tx.set(acctRef, {
      ...a,
      uid,
      tokens,
      granted: (a.granted || 0) + amount,
      status: 'active',
      updatedAt: now,
    }, { merge: true });
    tx.set(txnRef, {
      kind: 'grant',
      uid,
      amount,
      balanceAfter: tokens,
      refType: 'stripe_invoice',
      refId: invoiceId,
      reason: reason || 'Subscription token grant',
      createdAt: now,
    });
    return { granted: true, balance: tokens };
  });
}

// Merge subscription lifecycle state onto the account without touching
// the balance. Cancellation keeps already-granted tokens; it only stops
// future grants (no more paid invoices, so no more grant txns).
export async function setTokenSubscriptionState(uid, fields) {
  const db = getDb();
  const acctRef = db.collection('token_accounts').doc(uid);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(acctRef);
    const a = snap.exists ? snap.data() : defaultTokenAccount(uid, now);
    tx.set(acctRef, { ...a, uid, ...fields, updatedAt: now }, { merge: true });
  });
}
