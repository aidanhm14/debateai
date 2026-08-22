import Stripe from 'stripe';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getDb } from './lib/firestore.mjs';
import { checkWagerEligibility, trustedCountry } from './lib/wager-eligibility.mjs';
import { publicAccount, accountState } from './lib/payout.mjs';

// /api/payout-account — how a winner gets set up to actually be paid.
//
//   POST { action:'status' }   what state my payout account is in
//   POST { action:'onboard' }  a Stripe-hosted link to set it up
//   POST { action:'dashboard' } a link into an existing account
//
// WE NEVER TOUCH BANK DETAILS. Stripe Express hosts the whole
// onboarding: identity documents, the bank account, the KYC checks and
// the tax form. What comes back to us is an account id and two
// booleans. That is the entire reason this endpoint exists rather than
// an email asking somebody for their sort code, which is what "paid by
// hand" meant before it.
//
// Named accounts only, and 18+, checked with the SAME gate cash rounds
// use at the door. An anonymous uid cannot be paid: it belongs to a
// browser rather than a person, nobody can sign back into it, and
// there is no one on the other end of a KYC check.

const ALLOWED = new Set(['status', 'onboard', 'dashboard']);

export default async (request, context) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  const decoded = token ? await verifyIdToken(token) : null;
  if (!decoded || !decoded.sub) {
    return jsonResponse({ error: 'SIGN_IN_REQUIRED', message: 'Sign in to set up payouts.' }, 401, request);
  }
  // An anonymous session cannot hold a bank account. Refusing here
  // rather than at the Stripe call keeps the error honest.
  if (!isNamedAccount(decoded)) {
    return jsonResponse({
      error: 'NAMED_ACCOUNT_REQUIRED',
      message: 'Payouts need a real account. Sign in with Google, Apple, or an email address.',
    }, 403, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }
  const action = String(body.action || 'status').trim();
  if (!ALLOWED.has(action)) return errorResponse('Unknown action', 400, request);

  const db = getDb();
  const uid = decoded.sub;
  const profRef = db.collection('user_profiles').doc(uid);
  const profSnap = await profRef.get();
  const stored = (profSnap.exists && profSnap.data().payoutAccount) || null;

  // ── status: cheap, and refreshed from Stripe when it matters ──────
  // A stored copy goes stale the moment the winner finishes onboarding
  // in another tab, and the stale value is the one that says "not
  // ready". So an account that is connected but not yet ready is
  // re-read from Stripe; a ready one is trusted, because Stripe does
  // not un-enable payouts silently and the round rail re-checks before
  // it sends anyway.
  if (action === 'status') {
    let acct = stored;
    if (stored && stored.stripeAccountId && !accountState(stored).ready) {
      acct = await refreshAccount(db, uid, stored.stripeAccountId).catch(() => stored);
    }
    return jsonResponse({ account: publicAccount(acct) }, 200, request);
  }

  // Setting up to RECEIVE money is the same eligibility question as
  // paying to enter: 18+, not in a blocked jurisdiction.
  const elig = await checkWagerEligibility(db, uid, request, context);
  if (!elig.ok) {
    return jsonResponse({
      error: 'NOT_ELIGIBLE', reason: elig.reason,
      message: elig.message || 'Payouts are not available on this account.',
    }, 403, request);
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return jsonResponse({ error: 'PAYOUTS_UNAVAILABLE', message: 'Payouts are not switched on yet.' }, 503, request);
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.SITE_URL || 'https://itsdebatable.com';

  try {
    if (action === 'dashboard') {
      if (!stored || !stored.stripeAccountId) {
        return jsonResponse({ error: 'NO_ACCOUNT', message: 'Set up payouts first.' }, 409, request);
      }
      const link = await stripe.accounts.createLoginLink(stored.stripeAccountId);
      return jsonResponse({ url: link.url }, 200, request);
    }

    // ── onboard ───────────────────────────────────────────────────
    let accountId = stored && stored.stripeAccountId;
    if (!accountId) {
      // Country is immutable once the account exists, so it is read
      // from the edge rather than from the request body: a client-set
      // country here would be a client choosing its own payout
      // jurisdiction, which is the one field it must not choose.
      const country = trustedCountry(request, context) || 'US';
      const created = await stripe.accounts.create({
        type: 'express',
        country,
        email: decoded.email || undefined,
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
        metadata: { uid, source: 'cash_round_payout' },
        // The winner is paid a pot they won, not a fee we owe them for
        // a service, so the descriptor names the product.
        settings: { payouts: { schedule: { interval: 'daily' } } },
      });
      accountId = created.id;
      await profRef.set({
        payoutAccount: {
          stripeAccountId: accountId,
          country,
          payoutsEnabled: !!created.payouts_enabled,
          detailsSubmitted: !!created.details_submitted,
          updatedAt: Date.now(),
        },
      }, { merge: true });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      // Both point back at the payouts surface. `refresh_url` is what
      // Stripe uses when its own link has expired, so it must start the
      // flow again rather than land on a dead end.
      refresh_url: `${siteUrl}/payouts?refresh=1`,
      return_url: `${siteUrl}/payouts?done=1`,
      type: 'account_onboarding',
    });
    return jsonResponse({ url: link.url }, 200, request);
  } catch (err) {
    const raw = String((err && err.message) || '');
    console.error('payout-account error:', raw);
    // An unsupported country is the one failure worth naming. The
    // audience here is global and Stripe cannot pay out everywhere, so
    // a generic "try again shortly" would have someone retrying a thing
    // that will never work. Every OTHER Stripe message stays private:
    // it can name why an individual was rejected, which is their
    // business and not something to echo back to a browser.
    if (/country/i.test(raw)) {
      return jsonResponse({
        error: 'COUNTRY_UNSUPPORTED',
        message: 'Stripe cannot send payouts to your country yet, so cash rounds are not available to you. Nothing has been charged.',
      }, 409, request);
    }
    return jsonResponse({
      error: 'PAYOUT_SETUP_FAILED',
      message: 'Could not open payout setup. Try again shortly.',
    }, 502, request);
  }
};

/**
 * Re-read an account from Stripe and cache the two booleans we act on.
 * Exported shape is deliberately narrow: an id and two flags, never the
 * Stripe object, which carries identity documents and bank details.
 */
async function refreshAccount(db, uid, accountId) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const acct = await stripe.accounts.retrieve(accountId);
  const next = {
    stripeAccountId: accountId,
    payoutsEnabled: !!acct.payouts_enabled,
    detailsSubmitted: !!acct.details_submitted,
    updatedAt: Date.now(),
  };
  await db.collection('user_profiles').doc(uid).set({ payoutAccount: next }, { merge: true });
  return next;
}

export const config = {
  path: '/api/payout-account',
};
