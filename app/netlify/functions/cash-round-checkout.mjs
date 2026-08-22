import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkWagerEligibility } from './lib/wager-eligibility.mjs';
import { quote, formatCents, isExpired, SEATS } from './lib/cash-round.mjs';

// Pay the buy-in for a seat you already hold. Mints a Stripe Checkout
// session; the seat is only marked paid when stripe-webhook.mjs sees
// the payment, so a browser that never comes back from Stripe cannot
// claim to have funded anything.
//
// Money posture, matching entry-checkout.mjs and bounty-checkout.mjs:
// - CASH_ROUNDS_LIVE defaults OFF. Until the operator flips it in the
//   Netlify env this endpoint refuses politely, so the board can ship
//   and be looked at before it can take a card.
// - 18+ and a named account, checked here as well as at join, because
//   this is the call that actually charges someone.
// - Payouts do NOT auto-run. A verdict marks the winner owed and they
//   are paid by hand until Connect and KYC exist. Money never moves on
//   an AI ballot alone.
// - The fee is taken at the door, is the same for both sides, and is
//   fixed before anyone knows the outcome, which is what keeps the
//   operator indifferent to who wins. See lib/cash-round.mjs.

const CASH_ROUNDS_LIVE = ['true', '1'].includes(
  String(process.env.CASH_ROUNDS_LIVE ?? 'false').toLowerCase()
);

export default async (request, context) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to pay your buy-in', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('cash-round-checkout auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }
  if (!isNamedAccount(decoded)) {
    return jsonResponse({
      error: 'NAMED_ACCOUNT_REQUIRED',
      message: 'A cash round needs a real account. Sign in with Google or an email address.',
    }, 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }

  const id = String(body.id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errorResponse('Invalid round id', 400, request);

  const db = getDb();
  const snap = await db.collection('cash_rounds').doc(id).get();
  if (!snap.exists) return errorResponse('No such round', 404, request);
  const r = snap.data();

  if (r.status !== 'open') {
    return jsonResponse({
      error: 'NOT_OPEN',
      message: 'This round is not taking buy-ins.',
    }, 409, request);
  }
  if (isExpired(r)) {
    return jsonResponse({
      error: 'EXPIRED',
      message: 'This round expired before both seats were paid. Anything already paid is being refunded.',
    }, 409, request);
  }

  const entrants = Array.isArray(r.entrants) ? r.entrants : [];
  const me = entrants.find((e) => e && e.uid === decoded.sub);
  if (!me) {
    return jsonResponse({
      error: 'NOT_SEATED',
      message: 'Take a seat in this round first.',
    }, 409, request);
  }
  // The one bug here that costs a real person real money is charging
  // someone twice, so it is refused before Stripe is ever reached.
  if (me.paid === true) {
    return jsonResponse({
      error: 'ALREADY_PAID',
      message: 'Your buy-in is already in. Nothing more to pay.',
    }, 409, request);
  }

  if (!CASH_ROUNDS_LIVE) {
    return jsonResponse({
      error: 'CASH_ROUNDS_OFF',
      message: 'Paid rounds are not switched on yet. The board is live so you can post and take rounds; money follows.',
    }, 403, request);
  }
  if (body.ageAttested !== true) {
    return jsonResponse({
      error: 'AGE_ATTESTATION_REQUIRED',
      message: 'A cash round requires confirming you are 18 or older.',
    }, 400, request);
  }
  const elig = await checkWagerEligibility(db, decoded.sub, request, context);
  if (!elig.ok) {
    return jsonResponse({
      error: 'NOT_ELIGIBLE',
      reason: elig.reason,
      message: elig.message || 'Cash rounds are not available to you.',
    }, 403, request);
  }

  const buyIn = Math.trunc(Number(r.buyInCents) || 0);
  if (buyIn <= 0) return errorResponse('This round has no buy-in set', 400, request);
  const q = quote(buyIn, SEATS);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.SITE_URL || 'https://itsdebatable.com';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: buyIn,
          product_data: {
            name: `Cash round buy-in: ${String(r.motion || '').slice(0, 100)}`,
            // The fee is disclosed on the Stripe page itself, not only
            // in our own copy, because the one place a person is
            // certain to read before paying is the checkout.
            description: `${formatCents(buyIn)} buy-in. ${formatCents(q.feeCents)} platform fee, ${formatCents(q.netCents)} to the pot. Winner takes ${formatCents(q.potCents)}. Refunded in full if the round is not judged.`,
          },
        },
      }],
      metadata: { kind: 'cash_round_buyin', uid: decoded.sub, roundId: id },
      payment_intent_data: { metadata: { kind: 'cash_round_buyin', uid: decoded.sub, roundId: id } },
      ...(decoded.email ? { customer_email: decoded.email } : {}),
      client_reference_id: decoded.sub,
      success_url: `${siteUrl}/predict?round=${encodeURIComponent(id)}&paid=1`,
      cancel_url: `${siteUrl}/predict?round=${encodeURIComponent(id)}&paid=0`,
    });
    return jsonResponse({ url: session.url, quote: q }, 200, request);
  } catch (err) {
    console.error('cash-round-checkout stripe error:', err);
    return errorResponse('Payment error. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/cash-round-checkout',
};
