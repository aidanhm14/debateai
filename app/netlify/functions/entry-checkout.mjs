import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// The TIP jar for a tournament, per the founder (2026-08-22): entry is free
// for everybody and a $5 tip toward the prize pot is accepted. This was
// the paid entry door until that call; what it mints is now a plain
// voluntary contribution.
//
// The distinction is not cosmetic and the code has to hold it, because
// the whole legal footing of a cash-prize event rests on it: a tip buys
// NOTHING. It does not enter anyone, does not make anyone cash-eligible,
// and no downstream code may read a payment as a competitive fact.
// Eligibility is decided once, in the register action, by the 18+
// attestation, and money never touches it.
//
// Money posture, deliberate:
// - `TIP_CENTS` is a constant here, NOT `entryFeeCents` on the doc.
//   That field is the ENTRY price and it is 0; reading it would put the
//   tip back on the same dial as the entry fee, which is exactly the
//   confusion this split exists to remove. A tournament may override
//   with `tipCents` on its doc.
// - ENTRY_PAYMENTS_LIVE still gates it. With the flag off, the tip jar
//   refuses politely and nothing about the event changes.
// - One tip per person. A second attempt is refused rather than
//   charged, because nobody should be able to be asked twice.
// - No age attestation is collected here. A tip is not prize entry, so
//   requiring one would be collecting a claim that decides nothing.
// - Tips are refundable on request (published rules, section 6), by
//   hand from the Stripe dashboard.
// - Payouts do NOT auto-run. Settlement marks winners owed and they
//   are paid manually from the Stripe dashboard until Connect + KYC
//   exists. Per the judge-integrity layer, money never moves on the
//   AI ballot alone.

const TIP_CENTS = 500;

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
  if (!token) return errorResponse('Sign in to tip', 401, request);

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

  // 'running' is accepted alongside 'registration' because the day is
  // drop-in: the doors are open while rounds are already going, and
  // refusing a tip from someone mid-event would be refusing it from
  // the people most likely to offer one.
  if (!['registration', 'running'].includes(String(t.data.status || ''))) {
    return jsonResponse({ error: 'ENTRIES_CLOSED', message: 'This tournament is closed.' }, 409, request);
  }

  const tipCents = Number(t.data.tipCents) || TIP_CENTS;
  if (!ENTRY_PAYMENTS_LIVE || tipCents <= 0) {
    return jsonResponse({
      error: 'TIPS_OFF',
      message: 'Tipping is not open right now. Your entry is free and complete without it.',
    }, 403, request);
  }

  const paidSnap = await db.collection('tournaments').doc(t.id)
    .collection('payments').doc(decoded.sub).get();
  if (paidSnap.exists && ['paid', 'comp'].includes(paidSnap.data().status)) {
    return jsonResponse({ error: 'ALREADY_PAID', message: 'You have already tipped this tournament. Thank you, and nothing more is owed.' }, 409, request);
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
          unit_amount: tipCents,
          product_data: {
            name: `Tip: ${String(t.data.name || t.id).slice(0, 110)}`,
            description: 'A voluntary contribution toward the prize pot. Entry is free and a tip buys nothing.',
          },
        },
      }],
      // `tip: '1'` is what the webhook branches on. The kind stays
      // `tournament_entry` so any session minted before this change
      // still settles the way it was sold; the flag is what tells the
      // webhook this one bought nothing.
      metadata: { kind: 'tournament_entry', tip: '1', uid: decoded.sub, tid: t.id },
      payment_intent_data: { metadata: { kind: 'tournament_entry', tip: '1', uid: decoded.sub, tid: t.id } },
      ...(decoded.email ? { customer_email: decoded.email } : {}),
      client_reference_id: decoded.sub,
      success_url: `${siteUrl}/tournaments?tip=success&t=${encodeURIComponent(t.id)}`,
      cancel_url: `${siteUrl}/tournaments?tip=canceled&t=${encodeURIComponent(t.id)}`,
    });
    return jsonResponse({ url: session.url }, 200, request);
  } catch (err) {
    console.error('entry-checkout stripe error:', err);
    return errorResponse('The card step could not start. Your entry is free and stands either way.', 500, request);
  }
};

export const config = {
  path: '/api/entry-checkout',
};
