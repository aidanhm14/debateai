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
    console.error('billing-portal auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401);
  }

  const result = await getUserTeam(decoded.sub);
  if (!result) return errorResponse('No team found', 404);

  const { team, membership } = result;
  if (membership.role !== 'owner') {
    return errorResponse('Only the team owner can manage billing', 403);
  }

  if (!team.stripeCustomerId) {
    return errorResponse('No billing account found', 400);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.SITE_URL || 'https://debateos1.netlify.app';

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: team.stripeCustomerId,
      return_url: siteUrl,
    });
    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error('Billing portal error:', err);
    return errorResponse('Billing error. Please try again.', 500);
  }
};

export const config = {
  path: '/api/billing/portal',
};
