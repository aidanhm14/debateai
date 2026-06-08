import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('create-checkout auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  // Team-first funnel: requiring a team before checkout is intentional.
  // Teams are DebateIt's social/tracking layer — create one, invite peers,
  // track your cases and analytics together. Returning 404 here is the
  // signal the client uses to route to the team-creation flow with
  // upgrade-intent preserved, rather than letting people pay in isolation.
  const result = await getUserTeam(decoded.sub);
  if (!result) {
    return errorResponse('NEEDS_TEAM', 404, request);
  }

  const { team, membership } = result;
  if (membership.role !== 'owner') {
    return errorResponse('Only the team owner can manage billing', 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }
  const planId = body.plan; // "individual" or "team"

  const priceMap = {
    byok: process.env.STRIPE_PRICE_BYOK,
    individual: process.env.STRIPE_PRICE_INDIVIDUAL,
    team: process.env.STRIPE_PRICE_TEAM,
    lifetime: process.env.STRIPE_PRICE_LIFETIME,
  };

  const priceId = priceMap[planId];
  if (!priceId) return errorResponse('Invalid plan. Choose "byok", "individual", "team", or "lifetime".', 400, request);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  // Default to debateit.com (the live brand) instead of the legacy
  // debateos.com which now 404s. SITE_URL env var still wins if set.
  const siteUrl = process.env.SITE_URL || 'https://debateit.com';

  const isLifetime = planId === 'lifetime';

  try {
    // If we already have a Stripe customer for this team, reuse it so
    // the user lands on Checkout pre-filled. Otherwise pass
    // customer_email so Stripe creates a new customer with the right
    // email — without either, the Checkout form opens blank and a fresh
    // anonymous customer is created (annoying for billing reconciliation).
    const sessionParams = {
      mode: isLifetime ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/?billing=success&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/pricing?billing=canceled&plan=${planId}`,
      ...(team.stripeCustomerId
        ? { customer: team.stripeCustomerId }
        : decoded.email
          ? { customer_email: decoded.email }
          : {}
      ),
      ...(isLifetime
        ? { payment_intent_data: { metadata: { teamId: team.id, plan: 'lifetime' } } }
        : { subscription_data: { metadata: { teamId: team.id } } }
      ),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    return jsonResponse({ url: session.url }, 200, request);
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return errorResponse('Billing error. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/billing/checkout',
};
