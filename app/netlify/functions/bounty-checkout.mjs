import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { validateContribution, formatCents, isExpired } from './lib/bounty.mjs';

// Put money into a bounty pot. Mints a Stripe Checkout session; the
// contribution is only recorded when stripe-webhook.mjs sees the
// payment, so a browser that never comes back from Stripe cannot claim
// to have funded anything.
//
// Money posture, matching entry-checkout.mjs deliberately:
// - BOUNTY_PAYMENTS_LIVE defaults OFF. Until the operator flips it in
//   the Netlify env this endpoint refuses politely, so the board can
//   ship and be looked at before it can take a card.
// - Funding is 18+; the client collects the attestation and the server
//   refuses without it.
// - Payouts do NOT auto-run. Completing a bounty marks the two debaters
//   owed and they are paid manually until Connect and KYC exist. Same
//   rule as tournament prizes: money does not move on an AI ballot.
// - There is no rake. The full pot goes to the two debaters, which is
//   asserted by splitPot and by scripts/test-bounty.mjs.

const BOUNTY_PAYMENTS_LIVE = ['true', '1'].includes(
  String(process.env.BOUNTY_PAYMENTS_LIVE ?? 'false').toLowerCase()
);

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to fund a bounty', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('bounty-checkout auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }
  const provider = decoded.firebase && decoded.firebase.sign_in_provider;
  if (!provider || provider === 'anonymous') {
    return jsonResponse({
      error: 'NAMED_ACCOUNT_REQUIRED',
      message: 'Funding a bounty needs a real account. Sign in with Google or an email address.',
    }, 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }

  const id = String(body.id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errorResponse('Invalid bounty id', 400, request);

  const db = getDb();
  const snap = await db.collection('bounties').doc(id).get();
  if (!snap.exists) return errorResponse('No such bounty', 404, request);
  const b = snap.data();

  if (isExpired(b)) {
    return jsonResponse({
      error: 'EXPIRED',
      message: 'This bounty expired. Contributions to it are being refunded.',
    }, 409, request);
  }

  const check = validateContribution(body.amountCents, b);
  if (!check.ok) return jsonResponse({ error: 'INVALID_AMOUNT', message: check.reason }, 400, request);
  const amountCents = check.value;

  if (!BOUNTY_PAYMENTS_LIVE) {
    return jsonResponse({
      error: 'BOUNTY_PAYMENTS_OFF',
      message: 'Funding is not switched on yet. The board is live so you can post and take bounties; money follows.',
    }, 403, request);
  }
  if (body.ageAttested !== true) {
    return jsonResponse({
      error: 'AGE_ATTESTATION_REQUIRED',
      message: 'Funding a bounty requires confirming you are 18 or older.',
    }, 400, request);
  }
  // Funding your own bounty is allowed (that is how most of them start),
  // but the creator cannot also debate it, which canClaim enforces.

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.SITE_URL || 'https://itsdebatable.com';
  const currency = /^[a-z]{3}$/.test(String(b.currency || '')) ? b.currency : 'usd';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: `Debate bounty: ${String(b.motion || '').slice(0, 100)}`,
            description: 'Goes to the two people who run the round. No fee is taken.',
          },
        },
      }],
      // uid + bid are what the webhook keys the contribution on, so a
      // retry overwrites one document instead of double-counting a pot.
      metadata: { kind: 'bounty_fund', uid: decoded.sub, bid: id, amountCents: String(amountCents) },
      payment_intent_data: { metadata: { kind: 'bounty_fund', uid: decoded.sub, bid: id } },
      ...(decoded.email ? { customer_email: decoded.email } : {}),
      client_reference_id: decoded.sub,
      success_url: `${siteUrl}/bounties?funded=1&b=${encodeURIComponent(id)}`,
      cancel_url: `${siteUrl}/bounties?funded=0&b=${encodeURIComponent(id)}`,
    });
    return jsonResponse({ url: session.url, amount: formatCents(amountCents, currency) }, 200, request);
  } catch (err) {
    console.error('bounty-checkout stripe error:', err);
    return errorResponse('Payment error. Please try again.', 500, request);
  }
};

export const config = { path: '/api/bounty-checkout' };
