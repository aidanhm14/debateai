import Stripe from 'stripe';
import { requireAdmin } from './lib/admin-auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { APPEAL_WINDOW_MS } from './lib/judge-appeals.mjs';
import {
  awardPot, refundPlan, canSettle, canPay, canTransition, formatCents, publicRound,
} from './lib/cash-round.mjs';

// /api/admin/cash-round — the operator controls for the two moments a
// cash round owes somebody money.
//
//   POST { action:'list' }                    rounds needing attention
//   POST { action:'settle', id, judgmentId }  verdict in: pot owed to the winner
//   POST { action:'pay',    id }              record that the winner was paid
//   POST { action:'void',   id, reason }      no verdict: buy-ins owed back
//   POST { action:'refund', id }              actually send the refunds
//
// Settling is an ADMIN action, not something a debater's browser can
// call, and that is the same rule the judge-integrity layer already
// enforces on credits: money never moves because an AI ballot said so.
// The winner is read from the recorded judgment, never from the request
// body, so the person calling this cannot name the winner.
//
// Paying is gated a second time by the APPEAL WINDOW. The same constant
// the appeal layer publishes is the one checked here, so the money and
// the right to object can never disagree about how long someone has.
//
// Refunds DO run through the Stripe API, because the failure mode on
// that side is a debater's money sitting in our account for a round
// that never happened. Payouts stay manual until Connect and KYC exist.

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
    const snap = await db.collection('cash_rounds')
      .orderBy('createdAt', 'desc').limit(60).get();
    const now = Date.now();
    const rows = snap.docs.map((doc) => {
      const d = doc.data();
      const payable = canPay(d, APPEAL_WINDOW_MS, now);
      return {
        ...publicRound(doc.id, d),
        needs:
          d.status === 'funded' ? 'awaiting verdict'
          : (d.status === 'settled' && payable.ok) ? 'PAYOUT OWED'
          : (d.status === 'settled') ? `appeal window until ${new Date(payable.opensAt || 0).toISOString()}`
          : (d.status === 'void') ? 'REFUNDS OWED'
          : '',
        collectedCents: Number(d.collectedCents) || 0,
        platformCents: Number(d.platformCents) || 0,
      };
    });
    return jsonResponse({ rounds: rows, appealWindowMs: APPEAL_WINDOW_MS }, 200, request);
  }

  const id = String(body.id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errorResponse('Invalid round id', 400, request);
  const ref = db.collection('cash_rounds').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return errorResponse('No such round', 404, request);
  const d = snap.data();

  // ── settle: the verdict is in, the pot is owed ────────────────────
  if (action === 'settle') {
    const judgmentId = String(body.judgmentId || '').trim();
    if (!judgmentId) return errorResponse('Which judgment settles this round?', 400, request);
    const jSnap = await db.collection('judgments').doc(judgmentId).get();
    if (!jSnap.exists) return errorResponse('No such judgment', 404, request);
    const judgment = jSnap.data();

    const check = canSettle(d, judgment);
    if (!check.ok) {
      // A split panel is a round nobody won, so it voids and refunds
      // rather than being tie-broken. There is no tie-break here and
      // there must never be one: we are holding the money.
      if (check.shouldVoid) {
        if (!canTransition(d.status, 'void')) {
          return jsonResponse({ error: 'REFUSED', message: `Cannot void from ${d.status}` }, 409, request);
        }
        await ref.update({
          status: 'void',
          voidReason: 'panel_unresolved',
          judgmentId,
          voidedAt: FieldValue.serverTimestamp(),
          updatedAt: Date.now(),
        });
        return jsonResponse({
          ok: true, voided: true,
          message: 'The panel split, so nobody won it. Every buy-in is refundable in full.',
        }, 200, request);
      }
      return jsonResponse({ error: 'REFUSED', reason: check.reason }, 409, request);
    }

    if (!canTransition(d.status, 'settled')) {
      return jsonResponse({ error: 'REFUSED', message: `Cannot settle from ${d.status}` }, 409, request);
    }
    const splits = awardPot(Number(d.potCents) || 0, check.winner);
    await ref.update({
      status: 'settled',
      judgmentId,
      verdict: {
        winnerUid: check.winner.uid,
        winnerName: check.winner.name || '',
        verdictSource: judgment.verdictSource || '',
        judgedAt: Number(judgment.judgedAt) || 0,
      },
      payout: { status: 'owed', splits, paidAt: null },
      settledAt: Date.now(),
      updatedAt: Date.now(),
    });
    return jsonResponse({
      ok: true,
      owed: splits,
      // Say when, not just that it is owed. An operator who pays early
      // has paid out a round somebody still has the right to appeal.
      payableAt: Date.now() + APPEAL_WINDOW_MS,
      message: `${formatCents(splits[0].cents)} owed to ${splits[0].name || splits[0].uid} once the appeal window closes.`,
    }, 200, request);
  }

  // ── pay: record that the winner actually got the money ────────────
  if (action === 'pay') {
    const payable = canPay(d, APPEAL_WINDOW_MS, Date.now());
    if (!payable.ok) {
      return jsonResponse({
        error: 'REFUSED',
        reason: payable.reason,
        ...(payable.opensAt ? { payableAt: payable.opensAt } : {}),
        message: payable.reason === 'window_open'
          ? 'The appeal window is still open on this round.'
          : payable.reason === 'appeal_open'
            ? 'An appeal is open. Money stays put until it is decided.'
            : 'This round is not payable.',
      }, 409, request);
    }
    if (!canTransition(d.status, 'paid')) {
      return jsonResponse({ error: 'REFUSED', message: `Cannot pay from ${d.status}` }, 409, request);
    }
    await ref.update({
      status: 'paid',
      payout: { ...(d.payout || {}), status: 'paid', paidAt: Date.now() },
      updatedAt: Date.now(),
    });
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── void: no verdict is coming ────────────────────────────────────
  if (action === 'void') {
    if (!canTransition(d.status, 'void')) {
      return jsonResponse({ error: 'REFUSED', message: `Cannot void from ${d.status}` }, 409, request);
    }
    await ref.update({
      status: 'void',
      voidReason: String(body.reason || 'operator').slice(0, 120),
      voidedAt: FieldValue.serverTimestamp(),
      updatedAt: Date.now(),
    });
    return jsonResponse({ ok: true, owedBack: refundPlan(d.entrants) }, 200, request);
  }

  // ── refund: send every buy-in back, in full ───────────────────────
  if (action === 'refund') {
    if (d.status !== 'void') {
      return jsonResponse({ error: 'REFUSED', message: 'Only a void round refunds.' }, 409, request);
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intents = Array.isArray(d.paymentIntentIds) ? d.paymentIntentIds : [];
    const done = Array.isArray(d.refundedIntents) ? d.refundedIntents : [];
    const results = [];
    for (const pi of intents) {
      // Per-intent idempotency, so a re-run after a partial failure
      // cannot double-refund somebody.
      if (done.includes(pi)) { results.push({ pi, skipped: true }); continue; }
      try {
        // No amount argument: the FULL charge goes back, fee included.
        // A round that produced no verdict earns this site nothing.
        await stripe.refunds.create({ payment_intent: pi });
        done.push(pi);
        results.push({ pi, refunded: true });
      } catch (e) {
        console.error('cash round refund failed:', pi, e.message);
        results.push({ pi, error: e.message });
      }
    }
    const all = intents.length > 0 && intents.every((pi) => done.includes(pi));
    await ref.update({
      refundedIntents: done,
      refunds: { status: all ? 'done' : 'partial', doneAt: all ? Date.now() : null },
      ...(all ? { status: 'refunded' } : {}),
      updatedAt: Date.now(),
    });
    return jsonResponse({ ok: true, results, complete: all }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};

export const config = {
  path: '/api/admin/cash-round',
};
