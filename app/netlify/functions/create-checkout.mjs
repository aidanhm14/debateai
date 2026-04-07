import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse();
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return errorResponse('Invalid token: ' + err.message, 401);
  }

  const result = await getUserTeam(decoded.sub);
  if (!result) return errorResponse('No team found. Create a team first.', 404);

  const { team, membership } = result;
  if (membership.role !== 'owner') {
    return errorResponse('Only the team owner can manage billing', 403);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400); }
  const planId = body.plan; // "individual" or "team"

  const priceMap = {
    individual: process.env.STRIPE_PRICE_INDIVIDUAL,
    team: process.env.STRIPE_PRICE_TEAM,
    lifetime: process.env.STRIPE_PRICE_LIFETIME,
  };

  const priceId = priceMap[planId];
  if (!priceId) return errorResponse('Invalid plan. Choose "individual", "team", or "lifetime".', 400);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.SITE_URL || 'https://debateos1.netlify.app';

  const isLifetime = planId === 'lifetime';

  try {
    const sessionParams = {
      customer: team.stripeCustomerId,
      mode: isLifetime ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}?billing=success`,
      cancel_url: `${siteUrl}?billing=canceled`,
      ...(isLifetime
        ? { payment_intent_data: { metadata: { teamId: team.id, plan: 'lifetime' } } }
        : { subscription_data: { metadata: { teamId: team.id } } }
      ),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return errorResponse('Stripe error: ' + err.message, 500);
  }
};

export const config = {
  path: '/api/billing/checkout',
};
