import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// RETIRED 2026-08-10, same day it shipped, by Aidan: competing is free
// permanently and advertising is the intended long-term funding. There
// is no paid door into a tournament any more. Everyone competes in one
// bracket for the same prizes; eligibility for the CASH turns on
// placement and age (18+, per the doctrine rule that money never
// reaches minors), never on payment.
//
// The endpoint stays mounted and refuses, rather than being deleted,
// for three reasons: a checkout URL may already be in someone's tab or
// inbox and should get an explanation instead of a 404; the Stripe
// plumbing and the payments-subcollection shape are the same ones a
// future decision would want; and a live route that refuses is easier
// to audit than a deleted one that might get re-added by accident.
//
// PAID_ENTRY_RETIRED is a constant, NOT an env read, on purpose.
// ENTRY_PAYMENTS_LIVE is currently 'true' in the Netlify env, so an
// env-only switch would leave real $20 charges one variable away from
// firing against a product decision that has already been made. Undoing
// this is a deliberate code edit plus a soul.md decision-log entry.
//
// stripe-webhook.mjs still honours any payment that already completed
// (there are none: paidEntries was 0 at retirement), so nobody's money
// is stranded by this.

const PAID_ENTRY_RETIRED = true;

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

  // Refused before auth, before the body is read, before Stripe is
  // constructed. Nothing about the caller can reach a charge.
  if (PAID_ENTRY_RETIRED) {
    return jsonResponse({
      error: 'ENTRY_IS_FREE',
      message: 'Tournament entry is free. Register on the tournament page and you are in the same bracket, judged the same way, competing for the same prizes.',
    }, 410, request);
  }

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
  // The old ENTRY_PAYMENTS_LIVE env gate lived here. It is gone rather
  // than left dangling: with PAID_ENTRY_RETIRED above, this code is
  // unreachable, and a reference to a constant that no longer exists
  // would throw the moment anyone flipped that switch back, which is
  // the worst possible time to discover it.
  if (body.ageAttested !== true) {
    return jsonResponse({ error: 'AGE_ATTESTATION_REQUIRED', message: 'Paid entry requires confirming you are 18 or older.' }, 400, request);
  }

  const paidSnap = await db.collection('tournaments').doc(t.id)
    .collection('payments').doc(decoded.sub).get();
  if (paidSnap.exists && paidSnap.data().status === 'paid') {
    return jsonResponse({ error: 'ALREADY_PAID', message: 'You have already paid in to this tournament.' }, 409, request);
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
