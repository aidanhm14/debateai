import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { ensureWorkspace } from './lib/workspace.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { PURCHASABLE_PLANS, envKeyForPlan, priceMatchesCanonical, hasActivePaidPlan } from './lib/plans.mjs';

// Server-side beta no-charge gate, mirroring the client flags
// (pricing.html BETA_NO_CHARGE, index.html CHECKOUT_BETA_NO_CHARGE).
// The client flags only hide checkout UI; a direct POST with a valid
// Firebase token would still mint a live Stripe session. Set
// BETA_NO_CHARGE=false in the Netlify env to restore live checkout —
// the Stripe wiring below stays intact, no code change needed.
const BETA_NO_CHARGE = !['false', '0'].includes(String(process.env.BETA_NO_CHARGE ?? 'true').toLowerCase());

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  if (BETA_NO_CHARGE) {
    return jsonResponse({
      error: 'BETA_NO_CHARGE',
      message: 'Checkout is paused right now. Nothing was charged.',
    }, 403, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('create-checkout auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  if (!isNamedAccount(decoded)) {
    return errorResponse('A permanent account is required for checkout.', 403, request);
  }

  // The plan settles onto a `teams` doc, so one has to exist. It used to
  // be the CLIENT's job to make one first (404 NEEDS_TEAM, then a "Name
  // your workspace" modal on /pricing), which put a naming question
  // between a person and the card form. The workspace is created here
  // on first use now; see lib/workspace.mjs. A user who is a non-owner
  // member of somebody else's Team workspace is the one case that still
  // cannot buy from this account, because their entitlement is that
  // team's to manage.
  let team, membership;
  try {
    ({ team, membership } = await ensureWorkspace(decoded));
  } catch (err) {
    console.error('create-checkout: ensureWorkspace failed:', err.message);
    return errorResponse('Billing setup failed. Please try again.', 500, request);
  }
  if (membership.role !== 'owner') {
    return errorResponse('Your plan is managed by the owner of your team workspace.', 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }
  const planId = body.plan; // "individual" or "team"

  if (!PURCHASABLE_PLANS.includes(planId)) {
    return errorResponse('Invalid plan. Choose "byok", "individual", "voice", or "team".', 400, request);
  }
  const priceId = process.env[envKeyForPlan(planId)];
  if (!priceId) {
    console.error(`create-checkout: ${envKeyForPlan(planId)} is not set`);
    return errorResponse('That plan is not configured for checkout yet.', 500, request);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // Someone who already holds a live paid plan gets the billing portal,
  // not a second checkout. Measured 2026-09-07: a Voice subscriber came
  // back to /pricing the morning after paying, pressed Get Voice again
  // and minted a fresh Checkout session for the plan they already had.
  // Stripe would have happily opened a SECOND subscription on the same
  // customer, and the webhook would have overwritten the team's plan
  // with whichever invoice landed last. The portal is the right door
  // for an existing subscriber: card, invoices, cancellation.
  if (hasActivePaidPlan(team) && team.stripeCustomerId) {
    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: team.stripeCustomerId,
        return_url: `${process.env.SITE_URL || 'https://itsdebatable.com'}/pricing`,
      });
      return jsonResponse({ url: portal.url, portal: true, currentPlan: team.plan }, 200, request);
    } catch (err) {
      console.error('create-checkout: portal for existing subscriber failed:', err.message);
      return jsonResponse({
        error: 'ALREADY_SUBSCRIBED',
        message: `You already have the ${team.plan} plan. Manage it from your account.`,
        currentPlan: team.plan,
      }, 409, request);
    }
  }

  // Confirm Stripe charges what the site says it charges, BEFORE anyone
  // reaches a card form. See the header of lib/plans.mjs: on 2026-08-24
  // the live Individual price was $5.00/month against an advertised
  // $10/year, and nothing in the repo could see it, because a price id
  // is opaque and the HTML price guard only ever read HTML.
  //
  // This fails CLOSED. An overcharge is not a degradation to trade off
  // against availability: a checkout that refuses is an outage, and a
  // checkout that quietly bills six times the advertised figure is a
  // refund queue and a chargeback. Cached per price id because the
  // answer only changes when someone re-points the env var.
  const verdict = await verifyPrice(stripe, planId, priceId);
  if (!verdict.ok) {
    console.error(`create-checkout PRICE MISMATCH [${planId}] ${priceId}: ${verdict.reason}`);
    return jsonResponse({
      error: 'PRICE_MISCONFIGURED',
      message: 'Checkout is paused on this plan while we correct a billing setting. Nothing was charged.',
    }, 500, request);
  }
  // Default to itsdebatable.com (the production host) instead of the legacy
  // debateos.com which now 404s. SITE_URL env var still wins if set.
  const siteUrl = process.env.SITE_URL || 'https://itsdebatable.com';

  try {
    // If we already have a Stripe customer for this team, reuse it so
    // the user lands on Checkout pre-filled. Otherwise pass
    // customer_email so Stripe creates a new customer with the right
    // email — without either, the Checkout form opens blank and a fresh
    // anonymous customer is created (annoying for billing reconciliation).
    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/pricing?billing=success&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/pricing?billing=canceled&plan=${planId}`,
      ...(team.stripeCustomerId
        ? { customer: team.stripeCustomerId }
        : decoded.email
          ? { customer_email: decoded.email }
          : {}
      ),
      subscription_data: { metadata: { teamId: team.id } },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    return jsonResponse({ url: session.url }, 200, request);
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return errorResponse('Billing error. Please try again.', 500, request);
  }
};

// Cache is per warm Lambda instance, which is the right scope: it is a
// read of configuration, so a cold start re-checking costs one Stripe
// call and a stale entry can only be as old as the instance.
const priceCache = new Map();

async function verifyPrice(stripe, plan, priceId) {
  const cacheKey = plan + ':' + priceId;
  const hit = priceCache.get(cacheKey);
  if (hit) return hit;
  let price;
  try {
    price = await stripe.prices.retrieve(priceId);
  } catch (err) {
    // An unreadable price is not a pass. We cannot show someone a card
    // form for an amount we were unable to confirm.
    return { ok: false, reason: `could not read the Stripe price: ${err.message}` };
  }
  const verdict = priceMatchesCanonical(plan, price);
  // Only a PASS is cached. Caching a failure would keep checkout dark
  // on that instance after the operator has already fixed the env var.
  if (verdict.ok) priceCache.set(cacheKey, verdict);
  return verdict;
}

export const config = {
  path: '/api/billing/checkout',
};
