import Stripe from 'stripe';
import { requireAdmin } from './lib/admin-auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import {
  splitPot, canTransition, isExpired, formatCents, REFUNDABLE_STATUSES, DEBATERS_NEEDED,
} from './lib/bounty.mjs';

// /api/admin/bounty — the operator controls for the two moments a
// bounty owes somebody money.
//
//   POST { action:'list' }              every bounty needing attention
//   POST { action:'complete', id }      round happened: pot owed, split
//   POST { action:'expire',   id }      nobody took it: contributions owed back
//   POST { action:'refund',   id }      actually send the refunds
//   POST { action:'paid',     id }      record that payouts were sent
//
// Completing is an ADMIN action, not something a debater's browser can
// call, and that is the same rule the judge-integrity layer already
// enforces on credits: money never moves because an AI ballot said so.
// A human confirms the round happened, then the pot is marked owed.
//
// Refunds DO run through the Stripe API here rather than being another
// manual dashboard job, because the failure mode on this side is a
// stranger's money sitting in our account for a debate that never
// happened. Payouts stay manual until Connect and KYC exist.

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }
  const action = String(body.action || '').trim();
  const db = getDb();

  if (action === 'list') {
    const snap = await db.collection('bounties').limit(200).get();
    const rows = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const pot = Number(d.potCents) || 0;
      const needs =
        (d.status === 'claimed' && (d.debaters || []).length >= DEBATERS_NEEDED) ? 'ready to complete'
        : (d.status === 'completed' && d.payout?.status === 'owed') ? 'payout owed'
        : (REFUNDABLE_STATUSES.has(d.status) && d.refund?.status === 'due') ? 'refund due'
        : (d.status === 'funding' && isExpired(d)) ? 'expired, needs sweeping'
        : null;
      if (!needs) return;
      rows.push({
        id: doc.id, motion: d.motion, status: d.status, needs,
        potCents: pot, pot: formatCents(pot, d.currency),
        debaters: (d.debaters || []).map((x) => x.name),
        payoutStatus: d.payout?.status || 'none',
        refundStatus: d.refund?.status || 'none',
      });
    });
    return jsonResponse({ rows }, 200, request);
  }

  const id = String(body.id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errorResponse('Invalid id', 400, request);
  const ref = db.collection('bounties').doc(id);

  // ── complete: the round happened, the pot is owed ─────────────────
  if (action === 'complete') {
    const snap = await ref.get();
    if (!snap.exists) return errorResponse('No such bounty', 404, request);
    const d = snap.data();
    if (!canTransition(d.status, 'completed')) {
      return jsonResponse({ error: 'BAD_STATUS', message: `Cannot complete from ${d.status}.` }, 409, request);
    }
    const debaters = d.debaters || [];
    if (debaters.length < DEBATERS_NEEDED) {
      return jsonResponse({ error: 'NOT_ENOUGH_DEBATERS', message: 'A bounty pays two people. Only one took it.' }, 409, request);
    }
    let splits;
    try {
      // Throws if the split does not conserve the pot exactly. A throw
      // here must stop settlement rather than pay out a rounded number.
      splits = splitPot(Number(d.potCents) || 0, debaters);
    } catch (err) {
      console.error('[bounty-admin] split failed', err.message);
      return errorResponse('Split did not balance. Settlement stopped.', 500, request);
    }
    await ref.update({
      status: 'completed',
      roundId: typeof body.roundId === 'string' ? body.roundId.slice(0, 64) : (d.roundId || null),
      payout: { status: 'owed', splits, paidAt: null },
      updatedAt: Date.now(),
    });
    return jsonResponse({ ok: true, splits, total: splits.reduce((a, s) => a + s.cents, 0) }, 200, request);
  }

  // ── expire: nobody took it in time ────────────────────────────────
  if (action === 'expire') {
    const snap = await ref.get();
    if (!snap.exists) return errorResponse('No such bounty', 404, request);
    const d = snap.data();
    if (!canTransition(d.status, 'expired')) {
      return jsonResponse({ error: 'BAD_STATUS', message: `Cannot expire from ${d.status}.` }, 409, request);
    }
    const pot = Number(d.potCents) || 0;
    await ref.update({
      status: 'expired',
      refund: { status: pot > 0 ? 'due' : 'none', doneAt: null },
      updatedAt: Date.now(),
    });
    return jsonResponse({ ok: true, refundDue: pot > 0 }, 200, request);
  }

  // ── refund: send the money back ───────────────────────────────────
  if (action === 'refund') {
    const snap = await ref.get();
    if (!snap.exists) return errorResponse('No such bounty', 404, request);
    const d = snap.data();
    if (!REFUNDABLE_STATUSES.has(d.status)) {
      return jsonResponse({
        error: 'NOT_REFUNDABLE',
        message: `A ${d.status} bounty is not refundable. Completed pots belong to the debaters.`,
      }, 409, request);
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const contribs = await ref.collection('contributions').get();
    const results = [];
    for (const c of contribs.docs) {
      const cd = c.data() || {};
      if (cd.status !== 'paid' || cd.refund?.status === 'done') { results.push({ uid: c.id, skipped: true }); continue; }
      const intents = Array.isArray(cd.paymentIntentIds) ? cd.paymentIntentIds : [];
      let refunded = 0;
      const errors = [];
      for (const pi of intents) {
        try {
          // Stripe dedupes on the idempotency key, so re-running this
          // action after a partial failure cannot double-refund.
          const r = await stripe.refunds.create(
            { payment_intent: pi },
            { idempotencyKey: `bounty-refund-${id}-${pi}` },
          );
          refunded += r.amount || 0;
        } catch (e) {
          errors.push(`${pi}: ${e.message}`);
        }
      }
      await c.ref.update({
        refund: {
          status: errors.length ? 'partial' : 'done',
          doneAt: FieldValue.serverTimestamp(),
          amountCents: refunded,
          errors: errors.slice(0, 5),
        },
      });
      results.push({ uid: c.id, refunded, errors });
    }
    const allDone = results.every((r) => r.skipped || !r.errors?.length);
    await ref.update({
      refund: { status: allDone ? 'done' : 'partial', doneAt: Date.now() },
      ...(allDone && canTransition(d.status, 'refunded') ? { status: 'refunded' } : {}),
      updatedAt: Date.now(),
    });
    return jsonResponse({ ok: true, results, allDone }, 200, request);
  }

  // ── paid: record that the two debaters were paid ──────────────────
  if (action === 'paid') {
    const snap = await ref.get();
    if (!snap.exists) return errorResponse('No such bounty', 404, request);
    const d = snap.data();
    if (d.status !== 'completed' || d.payout?.status !== 'owed') {
      return jsonResponse({ error: 'NOTHING_OWED', message: 'This bounty has no outstanding payout.' }, 409, request);
    }
    await ref.update({
      payout: { ...d.payout, status: 'paid', paidAt: Date.now() },
      updatedAt: Date.now(),
    });
    return jsonResponse({ ok: true }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};

export const config = { path: '/api/admin/bounty' };
