// Delete your account. POST /api/delete-account-data
//
// App Store Guideline 5.1.1(v): an app that offers account creation must
// offer account deletion from inside the app, it must actually delete
// rather than deactivate, and it must not hand the person off to a
// support email to finish the job. This endpoint is that deletion, and
// it is the authority on it. The client's only job afterwards is to
// stop holding a session for an account that no longer exists.
//
// WHAT THIS REPLACED, because the shape of the old bug explains most of
// the decisions below. The previous flow deleted ten Firestore
// collections here and then called `user.delete()` in the BROWSER.
// Firebase requires a recent sign-in for that call, so for anybody whose
// session was more than a few minutes old, which is everybody who
// wanders into a settings page, so it threw `auth/requires-recent-login`
// AFTER the data was already gone. The person was left with an emptied
// profile, a live account, and a message telling them to sign out, sign
// back in, and come do it again. It also capped each collection at one
// page of 500 with no loop, so a heavy account kept most of its rows,
// and it never touched the subscription, so a deleted account carried on
// billing a card.
//
// Three rules fall out of that:
//
//   1. THE AUTH RECORD IS DELETED SERVER-SIDE. Service-account
//      credentials have no recency requirement, so this cannot fail for
//      the reason the old one always failed.
//
//   2. THE AUTH RECORD IS DELETED BEFORE THE BULK PURGE. "Your account
//      is gone" is the sentence being made true, and it must not be
//      starved by a slow pass over ten thousand captured rounds inside
//      Netlify's ~26s ceiling. Identity-bearing rows go first (nobody
//      should stay visible or matchable), then Auth, then bulk, and
//      whatever bulk does not finish is recorded on the tombstone and
//      completed by scheduled-deletion-sweep.mjs.
//
//   3. NOTHING IS BEST-EFFORT AND SILENT. Every failure lands on the
//      tombstone with the collection that produced it.
//
// Named accounts only. An anonymous uid is a browser, not an account:
// there is nothing to delete that a person could be locked out of, and
// the rows keyed to one are the free-round meter (guest_rounds,
// voice_usage, age_bands). Handing that a delete button would turn it
// into a "refill my free tier" button and, for the age band, a way to
// re-answer a write-once question. Guests are told to clear their
// browser data, which is the honest description of what their data is.

import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { deleteAuthUser } from './lib/auth-admin.mjs';
import { getDb, getUserTeam, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import {
  RETAINED,
  BLOB_OBJECTS,
  BULK_QUERIES,
  TOMBSTONE_COLLECTION,
  purgeIdentity,
  purgeBulk,
  anonymizeRounds,
} from './lib/account-deletion.mjs';

// Netlify kills the invocation at roughly 26s. Stop the bulk pass with
// real time left so the tombstone write that records what is left over
// actually happens; a purge that dies mid-page and never records where
// it got to is a purge nothing can resume.
const BULK_BUDGET_MS = 15000;

// Generous, because someone deleting their account is not doing it in a
// loop, and tight enough that this cannot be turned into a way to burn
// Identity Toolkit quota.
const LAYERS = [
  { window: 60 * 60 * 1000, max: 5, label: 'hour' },
  { window: 24 * 60 * 60 * 1000, max: 10, label: 'day' },
];

// The typed word, not a boolean. A boolean is a thing a stray or
// replayed POST can carry; a literal string is a thing a person had to
// mean. The client asks them to type it.
const CONFIRM_PHRASE = 'DELETE';

async function auth(request) {
  const token = extractBearerToken(request);
  if (!token) return { error: errorResponse('Sign in to delete your account', 401, request) };
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (e) { return { error: errorResponse('Invalid token', 401, request) }; }
  if (!isNamedAccount(decoded)) {
    return {
      error: errorResponse(
        'You are browsing as a guest, so there is no account to delete. Clearing this browser’s site data removes everything a guest session holds.',
        403,
        request,
      ),
    };
  }
  return { decoded, uid: decoded.sub };
}

// Does this person's deletion also stop a payment? Read separately from
// the cancellation so the confirmation screen can WARN before anything
// is destroyed, rather than the person discovering afterwards that they
// cancelled a plan they were sharing with a team.
async function subscriptionState(uid) {
  try {
    const result = await getUserTeam(uid);
    if (!result) return { hasSubscription: false };
    const { team, membership } = result;
    const owner = membership.role === 'owner';
    const subId = team.stripeSubscriptionId || null;
    return {
      hasSubscription: !!(owner && subId),
      isOwner: owner,
      teamName: team.name || null,
      plan: team.plan || null,
      subscriptionId: owner ? subId : null,
      // A member leaving is just a seat opening up. An owner leaving
      // takes the plan with them, and the people on it deserve to be
      // named in the warning rather than surprised.
      seatsAffected: owner ? (team.memberCount || null) : null,
    };
  } catch (err) {
    // Never let a billing read block a deletion. Report the uncertainty
    // instead: "we could not check" is honest, "no subscription" is a
    // claim we would not be entitled to make.
    return { hasSubscription: false, checkFailed: true, error: err.message };
  }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  // ── Preview. What is about to happen, before anything happens. ────
  //
  // Exists so the confirmation screen states consequences it read from
  // the server rather than consequences somebody typed into HTML nine
  // months ago. Retention copy in particular has to come from the same
  // manifest the purge runs, or the screen will eventually promise an
  // erasure the code does not perform.
  if (request.method === 'GET') {
    const a = await auth(request);
    if (a.error) return a.error;
    const subscription = await subscriptionState(a.uid);
    return jsonResponse({
      ok: true,
      account: {
        email: a.decoded.email || null,
        signInProvider: a.decoded.firebase?.sign_in_provider || null,
      },
      confirmPhrase: CONFIRM_PHRASE,
      irreversible: true,
      subscription,
      retained: RETAINED,
      exportFirst: '/api/my-data-export',
      withdrawCorpusFirst: '/api/corpus-withdraw',
    }, 200, request);
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const a = await auth(request);
  if (a.error) return a.error;
  const { uid, decoded } = a;

  let body = {};
  try { body = await request.json(); } catch (e) { /* empty body -> fails the confirm check below */ }
  if (String(body.confirm || '').trim().toUpperCase() !== CONFIRM_PHRASE) {
    return errorResponse(`Type ${CONFIRM_PHRASE} to confirm.`, 400, request);
  }

  const gate = await checkLayers('delacct', 'uid_' + uid, LAYERS);
  if (!gate.ok) return errorResponse('Too many deletion attempts. Try again later.', 429, request);

  const db = getDb();
  const tombstone = db.collection(TOMBSTONE_COLLECTION).doc(uid);
  const failures = [];

  // The tombstone is written FIRST and carries no email and no name.
  // First, so a deletion that crashes halfway is a known incomplete
  // deletion rather than an invisible one. Nameless, because a record
  // that keeps the identity of the person who asked to be forgotten is
  // not much of a deletion. The uid is already opaque and is the only
  // key the sweep needs to finish the job.
  await tombstone.set({
    uid,
    status: 'in_progress',
    provider: decoded.firebase?.sign_in_provider || null,
    requestedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // ── 1. Stop the money. ────────────────────────────────────────────
  //
  // Before anything is destroyed, because the one outcome worse than an
  // incomplete deletion is a deleted account whose card is still being
  // charged every month with no surface left to cancel from. Cancelled
  // IMMEDIATELY rather than at period end, which is the opposite of what
  // /api/cancel-subscription does and is right for the opposite reason:
  // that flow keeps access somebody paid for, and here there is no
  // account left to have access.
  const subscription = await subscriptionState(uid);
  let subscriptionCancelled = false;
  if (subscription.hasSubscription && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      await stripe.subscriptions.cancel(subscription.subscriptionId);
      subscriptionCancelled = true;
    } catch (err) {
      failures.push(`stripe: ${err.message}`);
    }
  }

  // ── 2. Identity rows. Must finish before we say they are gone. ────
  const identity = await purgeIdentity(db, uid);
  failures.push(...identity.failures);

  // ── 3. The uploaded profile photo. ────────────────────────────────
  //
  // Netlify Blobs, not Firestore, so purgeIdentity cannot reach it and
  // deleting the profile row would leave the face behind in the store.
  for (const blob of BLOB_OBJECTS) {
    try { await getStore(blob.store).delete(blob.key(uid)); }
    catch (err) { failures.push(`blob ${blob.store}: ${err.message}`); }
  }

  // ── 4. Take the name off rounds that belong to two people. ────────
  const roundsRelabelled = await anonymizeRounds(db, uid);

  // ── 5. The Auth record. This is the deletion. ─────────────────────
  //
  // A failure here is the only one that makes the whole call a failure,
  // because it is the only one that leaves the person still able to sign
  // in. Reported as such rather than swallowed: the tombstone keeps what
  // was already purged, so a retry resumes rather than starting over.
  let accountDeleted = false;
  try {
    accountDeleted = await deleteAuthUser(uid);
  } catch (err) {
    failures.push(`auth: ${err.message}`);
    await tombstone.set({
      status: 'auth_delete_failed',
      failures,
      identityDeleted: identity.deleted,
      subscriptionCancelled,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.error('[delete-account] auth delete failed for', uid, err.message);
    return errorResponse(
      'We removed your profile but could not finish deleting the sign-in itself. Nothing was left half-done on purpose: try again in a minute, or email hello@itsdebatable.com and it will be finished by hand.',
      500,
      request,
    );
  }

  // ── 6. Bulk. Resumable; the sweep finishes whatever is left. ──────
  const bulk = await purgeBulk(db, uid, { deadline: Date.now() + BULK_BUDGET_MS });
  failures.push(...bulk.failures);

  await tombstone.set({
    status: bulk.done && !failures.length ? 'complete' : 'purging',
    accountDeleted: true,
    subscriptionCancelled,
    identityDeleted: identity.deleted,
    bulkDeleted: bulk.deleted,
    roundsRelabelled,
    remaining: bulk.remaining,
    failures: failures.slice(0, 20),
    attempts: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('[delete-account]', JSON.stringify({
    uid, accountDeleted: true, subscriptionCancelled,
    identityDeleted: identity.deleted, bulkDeleted: bulk.deleted,
    remaining: bulk.remaining.length, failures: failures.length,
  }));

  return jsonResponse({
    ok: true,
    // The two facts the client acts on. `accountDeleted` is what lets it
    // say the thing and drop the session; `purgeComplete` false is not a
    // failure and must not be rendered as one. The account is gone
    // either way and the remainder is a queued cleanup.
    accountDeleted: true,
    purgeComplete: bulk.done && !failures.length,
    subscriptionCancelled,
    deleted: {
      identityRecords: identity.deleted,
      storedRounds: bulk.deleted,
      roundsRelabelled,
    },
    retained: RETAINED,
  }, 200, request);
};

export const config = { path: '/api/delete-account-data' };

// Exported for the guard test, which asserts the endpoint's manifest and
// the sweep's manifest are the same list.
export const _bulkCollections = BULK_QUERIES.map((q) => q.collection);
