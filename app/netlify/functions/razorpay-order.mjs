// Razorpay order creation for Indian traffic. Mirrors create-checkout.mjs
// (Stripe) but uses Razorpay Orders API (one-time payments). This keeps
// UPI on the happy path without forcing UPI Autopay (e-mandate) setup,
// which Indian consumers reject at 2–3× the rate of one-time UPI.
//
// Plan semantics: each successful order grants 30 days of access for the
// recurring tiers (BYOK/Individual/Team) and forever-access for Lifetime.
// Re-purchase = period extension; razorpay-verify.mjs is the source of
// truth for applying that to teams/{teamId}.
//
// Why hand-roll the Razorpay REST call instead of npm i razorpay:
// the official Node SDK is a thin wrapper over fetch, adds a cold-start
// import, and Netlify Functions v2 ships fine with built-in fetch.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam } from './lib/firestore.mjs';
import { razorpayPlanAmount } from './lib/geo.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    console.error('razorpay-order: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured');
    return errorResponse('Razorpay not configured. Use Stripe or contact support.', 503, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('razorpay-order auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  // Team-first funnel matches the Stripe path. NEEDS_TEAM is the signal
  // the client uses to route into the team-creation flow with the
  // upgrade-intent preserved.
  const result = await getUserTeam(decoded.sub);
  if (!result) return errorResponse('NEEDS_TEAM', 404, request);

  const { team, membership } = result;
  if (membership.role !== 'owner') {
    return errorResponse('Only the team owner can manage billing', 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }
  const planId = body.plan;

  const priceInfo = razorpayPlanAmount(planId);
  if (!priceInfo) {
    return errorResponse('Invalid plan. Choose "byok", "individual", "lifetime", or "team".', 400, request);
  }

  // Receipt has to be ≤40 chars per Razorpay rules. teamId is a Firestore
  // doc id (20 chars), plan is short, timestamp is the dedupe tail.
  const receipt = `${team.id.slice(0, 20)}-${planId}-${Date.now().toString(36)}`.slice(0, 40);

  const orderBody = {
    amount: priceInfo.amountPaise,
    currency: 'INR',
    receipt,
    notes: {
      teamId: team.id,
      uid: decoded.sub,
      plan: planId,
      // recurring flag lets the webhook + verify endpoints know whether to
      // set planExpiresAt or treat as lifetime.
      recurring: String(!!priceInfo.recurring),
    },
    // Capture immediately on payment — no two-step authorize/capture.
    payment_capture: 1,
  };

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  let order;
  try {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderBody),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Razorpay order create failed:', res.status, text);
      return errorResponse('Could not start payment. Try again in a moment.', 502, request);
    }
    order = await res.json();
  } catch (err) {
    console.error('Razorpay fetch error:', err);
    return errorResponse('Could not reach payment provider.', 502, request);
  }

  return jsonResponse({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId, // Razorpay Checkout widget needs the public key id, NOT the secret.
    plan: planId,
    planLabel: priceInfo.label,
    cadence: priceInfo.cadence,
    recurring: priceInfo.recurring,
    teamName: team.name || 'DebateIt',
    prefill: {
      email: decoded.email || '',
      name: decoded.name || team.name || '',
    },
  }, 200, request);
};

export const config = {
  path: '/api/billing/razorpay-order',
};
