import Stripe from 'stripe';
import { requireAdmin } from './lib/admin-auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { APPEAL_WINDOW_MS } from './lib/judge-appeals.mjs';
import {
  awardPot, refundPlan, canSettle, canPay, canTransition, formatCents, publicRound,
} from './lib/cash-round.mjs';
import { canSendPayout, transferIdempotencyKey, publicAccount } from './lib/payout.mjs';
import { sendCashRoundPayout } from './lib/send-payout.mjs';

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
// that never happened.
//
// PAYOUTS NOW RUN THROUGH THE API TOO. The old comment here said they
// stay manual "until Connect and KYC exist"; lib/payout.mjs is Connect
// and KYC existing, so `pay` sends a real Stripe transfer to the
// winner's connected account rather than recording that somebody sent
// one by hand. What did NOT change is who starts it: an admin still
// presses this, because a machine that both decides the round and
// releases the money is the circularity /judge-integrity refuses. The
// rail makes paying one click. It does not make it automatic.

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

    // A payout that is owed can still be unsendable because the WINNER
    // has not onboarded, and that is the single most common reason a
    // round sits in this queue. Reading it here means the operator sees
    // "waiting on the winner" instead of pressing Pay and getting a
    // refusal. One profile read per settled round, and only for settled
    // rounds, so the queue does not pay for the ones it cannot act on.
    const winners = [...new Set(snap.docs
      .filter((doc) => doc.data().status === 'settled')
      .map((doc) => {
        const sp = doc.data().payout && doc.data().payout.splits;
        return Array.isArray(sp) && sp[0] ? sp[0].uid : null;
      })
      .filter(Boolean))];
    const accounts = {};
    await Promise.all(winners.map(async (uid) => {
      try {
        const ps = await db.collection('user_profiles').doc(String(uid)).get();
        accounts[uid] = (ps.exists && ps.data().payoutAccount) || null;
      } catch { accounts[uid] = null; }
    }));

    const rows = snap.docs.map((doc) => {
      const d = doc.data();
      const payable = canPay(d, APPEAL_WINDOW_MS, now);
      const winnerUid = d.payout && Array.isArray(d.payout.splits) && d.payout.splits[0]
        ? d.payout.splits[0].uid : null;
      const acct = winnerUid ? accounts[winnerUid] : null;
      const send = d.status === 'settled'
        ? canSendPayout(d, acct, APPEAL_WINDOW_MS, now) : null;
      return {
        ...publicRound(doc.id, d),
        needs:
          d.status === 'funded' ? 'awaiting verdict'
          : (d.status === 'settled' && send && send.ok) ? 'PAYOUT OWED'
          : (d.status === 'settled' && payable.ok) ? 'WAITING ON WINNER'
          : (d.status === 'settled') ? `appeal window until ${new Date(payable.opensAt || 0).toISOString()}`
          : (d.status === 'void') ? 'REFUNDS OWED'
          : '',
        // Never the account id, only whether it can receive. The
        // operator needs to know if they can press Pay, not who the
        // winner banks with.
        winnerPayout: d.status === 'settled' ? publicAccount(acct) : null,
        payoutStatus: (d.payout && d.payout.status) || 'none',
        payoutError: (d.payout && d.payout.error) || '',
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
    const sent = await sendCashRoundPayout(db, id, { appealWindowMs: APPEAL_WINDOW_MS });
    if (!sent.ok) {
      return jsonResponse({
        error: 'PAYOUT_NOT_SENT',
        stage: sent.stage || '',
        reason: sent.reason || '',
        message: sent.message || 'The pot could not be sent.',
        ...(sent.plan ? { owed: sent.plan } : {}),
      }, 409, request);
    }
    return jsonResponse({
      ok: true,
      transferId: sent.transferId,
      paid: sent.plan,
      message: `${formatCents(sent.plan.cents)} sent to ${sent.plan.name || sent.plan.uid}.`,
    }, 200, request);
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
