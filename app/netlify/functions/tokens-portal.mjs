// /api/tokens/portal — Stripe billing portal for token subscribers.
// The honest-selling requirement: "cancel anytime" needs a mechanism.
// billing-portal.mjs is team-scoped; token subs are per-user, keyed by
// the stripeCustomerId the webhook wrote onto token_accounts/{uid}.
import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in first.', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed.', 401, request); }
  const uid = decoded.sub;

  let customerId = null;
  try {
    const snap = await withDeadline(getDb().collection('token_accounts').doc(uid).get(), 2500);
    if (snap.exists) customerId = snap.data().stripeCustomerId || null;
  } catch (err) {
    console.error('tokens-portal read error:', err.message);
    return errorResponse('Could not load your billing record. Try again.', 500, request);
  }
  if (!customerId) return errorResponse('No token subscription on this account.', 404, request);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.SITE_URL || 'https://itsdebatable.com';

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/tokens`,
    });
    return jsonResponse({ url: session.url }, 200, request);
  } catch (err) {
    console.error('tokens-portal Stripe error:', err);
    return errorResponse('Billing portal error. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/tokens/portal',
};
