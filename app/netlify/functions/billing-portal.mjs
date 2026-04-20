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
    console.error('billing-portal auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const result = await getUserTeam(decoded.sub);
  if (!result) return errorResponse('No team found', 404, request);

  const { team, membership } = result;
  if (membership.role !== 'owner') {
    return errorResponse('Only the team owner can manage billing', 403, request);
  }

  if (!team.stripeCustomerId) {
    return errorResponse('No billing account found', 400, request);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  // Prefer the actual request's origin over a hardcoded env var so we return
  // users to the domain they came from (debatethedevil.com) rather than the
  // old debateos.com fallback that the return-button could otherwise send
  // them to. Fall back to env var + final hardcoded fallback.
  let siteUrl;
  try {
    const origin = request.headers.get('origin') || request.headers.get('referer');
    if (origin) siteUrl = new URL(origin).origin;
  } catch (e) { /* fall through */ }
  if (!siteUrl) siteUrl = process.env.SITE_URL || 'https://debatethedevil.com';

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: team.stripeCustomerId,
      return_url: siteUrl,
    });
    console.log('[billing-portal] opened for team', team.id, '→', session.url);
    return jsonResponse({ url: session.url }, 200, request);
  } catch (err) {
    console.error('Billing portal error:', err);
    // Surface the Stripe error message so the client can show "configure your
    // portal" guidance if the portal isn't configured at all.
    const msg = err && err.message ? err.message : 'Billing error. Please try again.';
    return errorResponse(msg, 500, request);
  }
};

export const config = {
  path: '/api/billing/portal',
};
