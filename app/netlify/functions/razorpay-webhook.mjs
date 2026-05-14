// Razorpay webhook handler — async backup to razorpay-verify.mjs.
//
// Razorpay calls this endpoint when a payment is captured/failed/etc.
// We handle:
//  - payment.captured  → activate plan (idempotent with verify)
//  - payment.failed    → mark team past_due if this was a renewal
//
// Signature: HMAC SHA256 of the raw request body using
// RAZORPAY_WEBHOOK_SECRET (set in the Razorpay dashboard, NOT the API
// key secret). Header is `x-razorpay-signature`.

import crypto from 'node:crypto';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { activateRazorpayPayment } from './lib/razorpay-activate.mjs';

function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('razorpay-webhook: RAZORPAY_WEBHOOK_SECRET not configured');
    return new Response('Webhook not configured', { status: 503 });
  }

  const rawBody = await request.text();
  const sig = request.headers.get('x-razorpay-signature');

  if (!verifyWebhookSignature(rawBody, sig, webhookSecret)) {
    console.error('razorpay-webhook: signature mismatch');
    return new Response('Signature invalid', { status: 400 });
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return new Response('Bad JSON', { status: 400 }); }

  const eventType = event.event;
  try {
    switch (eventType) {
      case 'payment.captured': {
        const payment = event.payload?.payment?.entity;
        if (!payment) break;

        // We stash teamId/plan in the Order notes when creating it.
        // payment.notes inherits from the order on Razorpay's side, so
        // either path works; prefer payment.notes for resilience.
        const notes = payment.notes || {};
        const teamId = notes.teamId;
        const plan = notes.plan;

        if (!teamId || !plan) {
          console.warn('razorpay-webhook: payment.captured missing teamId/plan in notes', payment.id);
          break;
        }

        const result = await activateRazorpayPayment({
          teamId,
          plan,
          paymentId: payment.id,
          orderId: payment.order_id,
          source: 'webhook',
        });

        if (result.idempotent) {
          console.log(`razorpay-webhook: payment ${payment.id} already applied (verify won the race)`);
        } else {
          console.log(`razorpay-webhook: team ${teamId} → plan=${plan} via webhook`);
        }
        break;
      }

      case 'payment.failed': {
        const payment = event.payload?.payment?.entity;
        if (!payment) break;
        const teamId = payment.notes?.teamId;
        if (!teamId) break;

        // Only mark past_due if the team is currently on a paid Razorpay
        // plan. A failed first-payment attempt for a trial user shouldn't
        // mutate their state.
        const db = getDb();
        const teamRef = db.collection('teams').doc(teamId);
        const teamDoc = await teamRef.get();
        if (!teamDoc.exists) break;
        const t = teamDoc.data();
        if (t.paymentProvider === 'razorpay' && t.plan && t.plan !== 'trial') {
          await teamRef.update({
            status: 'past_due',
            lastRazorpayFailureCode: payment.error_code || null,
            lastRazorpayFailureDesc: payment.error_description || null,
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log(`razorpay-webhook: team ${teamId} marked past_due (${payment.error_code})`);
        }
        break;
      }

      default:
        // Razorpay fires lots of events we don't care about (refund.*,
        // subscription.* if we were using Subscriptions, etc.). Log and
        // move on — returning 200 prevents endless retries.
        console.log(`razorpay-webhook: unhandled event ${eventType}`);
    }
  } catch (err) {
    console.error(`razorpay-webhook: error processing ${eventType}:`, err);
    // 500 makes Razorpay retry, which is what we want for transient
    // Firestore blips.
    return new Response(JSON.stringify({ error: 'processing_failed', eventType }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = {
  path: '/api/razorpay-webhook',
};
