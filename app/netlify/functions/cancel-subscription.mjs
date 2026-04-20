import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, getUserTeam, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Cancel the team's Stripe subscription at the end of the current billing
// period. Users keep what they paid for until the period expires, then no
// future charges. Stripe flag: cancel_at_period_end = true.
//
// Why not cancel immediately? Two reasons:
//  1. Users hate losing access to something they already paid for this month.
//  2. "Cancel at period end" is the industry norm and avoids pro-rata refund
//     complexity. Users wanting an immediate refund can still use the Stripe
//     portal or email support.
export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('cancel-subscription auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const result = await getUserTeam(decoded.sub);
  if (!result) return errorResponse('No team found.', 404, request);

  const { team, membership } = result;
  if (membership.role !== 'owner') {
    return errorResponse('Only the team owner can cancel the subscription', 403, request);
  }

  if (!team.stripeSubscriptionId) {
    return errorResponse('No active subscription to cancel.', 400, request);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const updated = await stripe.subscriptions.update(team.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Mirror the pending-cancel state onto the team doc so the UI can show
    // "Cancels on <date>" without needing a separate Stripe fetch. The
    // webhook's customer.subscription.updated handler will also catch this.
    const cancelAt = updated.cancel_at || updated.current_period_end;
    const db = getDb();
    await db.collection('teams').doc(team.id).update({
      cancelAtPeriodEnd: true,
      cancelAt: cancelAt ? new Date(cancelAt * 1000) : null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return jsonResponse({
      ok: true,
      cancelAtPeriodEnd: true,
      cancelAt: cancelAt ? new Date(cancelAt * 1000).toISOString() : null,
    }, 200, request);
  } catch (err) {
    console.error('cancel-subscription Stripe error:', err.message);
    return errorResponse('Could not cancel subscription. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/billing/cancel',
};
