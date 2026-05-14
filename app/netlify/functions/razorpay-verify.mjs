// Verify a Razorpay payment client-side handshake and activate the plan
// immediately. The webhook (razorpay-webhook.mjs) is the async backup —
// this endpoint is what gives the user instant gratification ("you're on
// Individual now") the moment Razorpay Checkout returns success.
//
// Trust model:
//  1. HMAC SHA256 over `${order_id}|${payment_id}` with the Razorpay
//     key secret. Only Razorpay's server can produce a valid signature.
//  2. teamId is read from the order's `notes` (set server-side when the
//     order was created), NOT from the client body or the Firebase token.
//     This blocks an attacker from re-binding someone else's payment
//     to their own team.
//
// Idempotency: lastRazorpayPaymentId guards against double-extension if
// verify + webhook both fire, or the user double-clicks the success.

import crypto from 'node:crypto';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { PLANS } from './lib/firestore.mjs';
import { activateRazorpayPayment } from './lib/razorpay-activate.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

function verifySignature(orderId, paymentId, providedSig, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  // timingSafeEqual requires equal-length buffers; bail early if not.
  if (expected.length !== (providedSig || '').length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedSig));
}

async function fetchRazorpayOrder(orderId, keyId, keySecret) {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay order fetch ${res.status}: ${text}`);
  }
  return res.json();
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return errorResponse('Razorpay not configured.', 503, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed.', 401, request); }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return errorResponse('Missing payment fields.', 400, request);
  }

  if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, keySecret)) {
    console.error('razorpay-verify: signature mismatch for order', razorpay_order_id);
    return errorResponse('Payment signature invalid.', 400, request);
  }

  // Pull the source-of-truth order from Razorpay to read notes server-side.
  let order;
  try {
    order = await fetchRazorpayOrder(razorpay_order_id, keyId, keySecret);
  } catch (err) {
    console.error('razorpay-verify order fetch failed:', err.message);
    return errorResponse('Could not confirm order.', 502, request);
  }

  const notes = order.notes || {};
  const teamId = notes.teamId;
  const plan = notes.plan;
  if (!teamId || !plan) {
    console.error('razorpay-verify: order missing teamId/plan in notes', order.id);
    return errorResponse('Order missing required notes.', 400, request);
  }
  if (!PLANS[plan]) {
    console.error('razorpay-verify: unknown plan', plan);
    return errorResponse('Unknown plan on order.', 400, request);
  }

  let result;
  try {
    result = await activateRazorpayPayment({
      teamId,
      plan,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      source: 'verify',
    });
  } catch (err) {
    console.error('razorpay-verify activation failed:', err.message);
    return errorResponse('Could not activate plan.', 500, request);
  }

  console.log(`razorpay-verify: team ${teamId} → plan=${plan}, payment=${razorpay_payment_id}${result.idempotent ? ' (idempotent)' : ''}`);

  return jsonResponse({
    ok: true,
    plan: result.plan,
    idempotent: result.idempotent,
    currentPeriodEnd: result.currentPeriodEnd
      ? (result.currentPeriodEnd.toISOString?.() || String(result.currentPeriodEnd))
      : null,
  }, 200, request);
};

export const config = {
  path: '/api/billing/razorpay-verify',
};
