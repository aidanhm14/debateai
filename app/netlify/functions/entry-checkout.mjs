import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// The PAID door into a tournament, per Aidan (2026-08-10): "pay in to
// get payouts or compete for free." The free door is the tournament
// engine's own register action (POST /api/tournament); this endpoint
// only mints the Stripe Checkout session that makes an entry
// payout-eligible. Payment lands as `tournaments/{tid}/payments/{uid}`
// via stripe-webhook.mjs, so eligibility is a lookup, never a client
// claim.
//
// Money posture, deliberate:
// - The fee is `entryFeeCents` on the tournament doc. No price is
//   hardcoded anywhere in code or copy; turning money on is a data
//   decision (set the field) plus an env decision (flip the flag
//   below). 0 or missing = free-only tournament.
// - ENTRY_PAYMENTS_LIVE defaults OFF. Until the operator flips it in
//   the Netlify env, this endpoint refuses politely and free entry is
//   the only door. Mirrors the BETA_NO_CHARGE posture in
//   create-checkout.mjs.
// - Paid entry is 18+; the client collects the attestation and the
//   server refuses without it.
// - Payouts do NOT auto-run. Settlement marks winners owed and they
//   are paid manually from the Stripe dashboard until Connect + KYC
//   exists. Per the judge-integrity layer, money never moves on the
//   AI ballot alone.

const ENTRY_PAYMENTS_LIVE = ['true', '1'].includes(
  String(process.env.ENTRY_PAYMENTS_LIVE ?? 'false').toLowerCase()
);

async function readTournament(db, key) {
  const byId = await db.collection('tournaments').doc(key).get();
  if (byId.exists) return { id: byId.id, data: byId.data() };
  const bySlug = await db.collection('tournaments').where('slug', '==', key).limit(1).get();
  if (!bySlug.empty) return { id: bySlug.docs[0].id, data: bySlug.docs[0].data() };
  return null;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to pay in', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('entry-checkout auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }

  const key = String(body.tid || '').trim();
  if (!key || !/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
    return errorResponse('Invalid tournament id', 400, request);
  }

  const db = getDb();
  const t = await readTournament(db, key);
  if (!t) return errorResponse('No such tournament', 404, request);

  if (t.data.status !== 'registration') {
    return jsonResponse({ error: 'ENTRIES_CLOSED', message: 'Entries are closed for this tournament.' }, 409, request);
  }

  const feeCents = Number(t.data.entryFeeCents) || 0;
  if (feeCents <= 0) {
    return jsonResponse({ error: 'FREE_ONLY', message: 'This tournament has no paid entry. Register free.' }, 400, request);
  }
  if (!ENTRY_PAYMENTS_LIVE) {
    return jsonResponse({
      error: 'ENTRY_PAYMENTS_OFF',
      message: 'Paid entry is not open yet. Free entry works today and plays the same bracket, but it is not eligible for cash prizes.',
    }, 403, request);
  }
  if (body.ageAttested !== true) {
    return jsonResponse({ error: 'AGE_ATTESTATION_REQUIRED', message: 'Paid entry requires confirming you are 18 or older.' }, 400, request);
  }

  const paidSnap = await db.collection('tournaments').doc(t.id)
    .collection('payments').doc(decoded.sub).get();
  if (paidSnap.exists && paidSnap.data().status === 'paid') {
    return jsonResponse({ error: 'ALREADY_PAID', message: 'You have already paid in to this tournament.' }, 409, request);
  }
  // A founding comp is already full prize eligibility. Taking the fee from
  // someone who owes nothing is the one bug here that costs a person
  // money, so it is refused before Stripe is ever reached.
  if (paidSnap.exists && paidSnap.data().status === 'comp') {
    return jsonResponse({
      error: 'ALREADY_ELIGIBLE',
      message: 'Your entry is already eligible for the cash prizes. There is nothing to pay.',
    }, 409, request);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.SITE_URL || 'https://itsdebatable.com';
  const currency = /^[a-z]{3}$/.test(String(t.data.currency || '')) ? t.data.currency : 'usd';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: feeCents,
          product_data: { name: `Prize entry: ${String(t.data.name || t.id).slice(0, 120)}` },
        },
      }],
      metadata: { kind: 'tournament_entry', uid: decoded.sub, tid: t.id },
      payment_intent_data: { metadata: { kind: 'tournament_entry', uid: decoded.sub, tid: t.id } },
      ...(decoded.email ? { customer_email: decoded.email } : {}),
      client_reference_id: decoded.sub,
      success_url: `${siteUrl}/tournaments?entry=success&t=${encodeURIComponent(t.id)}`,
      cancel_url: `${siteUrl}/tournaments?entry=canceled&t=${encodeURIComponent(t.id)}`,
    });
    return jsonResponse({ url: session.url }, 200, request);
  } catch (err) {
    console.error('entry-checkout stripe error:', err);
    return errorResponse('Payment error. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/entry-checkout',
};
