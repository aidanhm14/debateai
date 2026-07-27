// /api/tokens/checkout — mint a Stripe subscription Checkout Session
// for the tokens plan. The session carries the uid in subscription
// metadata; the webhook grants tokens on each paid invoice from that.
//
// Per-user, no team required (the team-first funnel in create-checkout
// is for the legacy plan tiers). Gated by TOKENS_LIVE (default off):
// the whole pipe is wired and dark until pricing is decided.
import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { TOKENS, TOKENS_LIVE } from './lib/tokens.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  if (!TOKENS_LIVE) {
    return jsonResponse({
      error: 'TOKENS_NOT_LIVE',
      message: 'Tokens are not on sale yet. The checkout is wired and waiting on pricing.',
    }, 403, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in first.', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed. Please sign in again.', 401, request); }
  const uid = decoded.sub;

  const priceId = process.env.STRIPE_PRICE_TOKENS;
  if (!priceId) {
    console.error('tokens-checkout: STRIPE_PRICE_TOKENS not set');
    return errorResponse('Tokens plan is not configured.', 500, request);
  }

  // Reuse the Stripe customer if this uid subscribed before, so Checkout
  // opens pre-filled and billing history stays on one customer.
  let existingCustomer = null;
  try {
    const db = getDb();
    const snap = await withDeadline(db.collection('token_accounts').doc(uid).get(), 2000);
    if (snap.exists) existingCustomer = snap.data().stripeCustomerId || null;
  } catch { /* optional read; checkout works without it */ }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.SITE_URL || 'https://itsdebatable.com';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/tokens?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/tokens?billing=canceled`,
      client_reference_id: uid,
      ...(existingCustomer
        ? { customer: existingCustomer }
        : decoded.email
          ? { customer_email: decoded.email }
          : {}
      ),
      // tokensPerCycle is pinned at purchase time so a later env change
      // never silently reprices an existing subscriber's grant.
      subscription_data: {
        metadata: { kind: 'tokens', uid, tokensPerCycle: String(TOKENS.PER_CYCLE) },
      },
      metadata: { kind: 'tokens', uid },
    });
    return jsonResponse({ url: session.url }, 200, request);
  } catch (err) {
    console.error('tokens-checkout Stripe error:', err);
    return errorResponse('Billing error. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/tokens/checkout',
};
