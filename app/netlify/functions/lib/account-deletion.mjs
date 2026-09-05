// Account deletion: the manifest, and the purge that runs it.
//
// WHY THIS IS A LIB AND NOT INLINE IN THE ENDPOINT. Three callers need
// to agree about exactly one thing, and they are written at different
// times by different people: the endpoint that deletes, the cron that
// finishes a deletion the endpoint ran out of clock for, and the screen
// that tells a person what is about to happen to their data. When the
// third one drifts from the first two, the product makes a promise the
// code does not keep, on the one surface where that is a legal problem
// rather than a copy bug. So the list is DATA, it is exported, and the
// confirmation screen renders RETAINED from here rather than restating
// it in HTML.
//
// APP STORE CONTEXT (Guideline 5.1.1(v)). An app that lets someone make
// an account must let them delete it from inside the app, and deleting
// means deleted, not deactivated, not "email support and we will do it".
// The compliance-critical step is therefore the Firebase Auth record,
// not the Firestore rows: the rows are a privacy obligation, the Auth
// record is what makes "your account is gone" a true sentence. That is
// why the endpoint deletes Auth BEFORE the bulk purge and why the bulk
// purge is allowed to be finished later by a cron. Getting that order
// backwards is how you ship a flow that empties someone's profile and
// leaves them able to sign back into the shell of it.
//
// SCOPE IS ONE UID, ALWAYS. Every query in here is keyed on the uid the
// caller's verified token names. There is no id parameter anywhere in
// this file, for the same reason my-data-export has none: a parameter is
// something an attacker can change, and the one bug this file must never
// have is deleting somebody else's account.

const PAGE = 300;

// ── What gets deleted ──────────────────────────────────────────────
//
// Split into IDENTITY and BULK on purpose, and the split is about
// FAILURE rather than about size. Identity rows are the ones that make a
// deleted person still visible to other people or still reachable by the
// product: their profile, their public handle, their board rows, their
// place in a queue, their messages. Those must be gone before the call
// returns, because the person is about to be told they are gone. Bulk
// rows are private to them and merely have to end up gone; a cron
// finishing those an hour later harms nobody and keeps the endpoint
// inside Netlify's ~26s execution ceiling.

// Documents whose id IS the uid. One delete each, no query, no index.
export const IDENTITY_DOCS = [
  'user_profiles',      // the account itself
  'public_profiles',    // what strangers can read
  'user_cases',         // saved case vault
  'user_fingerprints',  // the nightly "how I think" summary
  'matchmaking_queue',  // stop being matchable this second
  'spar_match_profiles',// the answers behind the match profile
  'partner_pool',       // same, for 2v2
  'notify_prefs',       // email + push preferences
  'phone_numbers',      // SMS opt-in
  'user_certificates',
  'user_ratings',       // Glicko record
  'learning_counters',
  'private_judge_usage', // this account's private-judging allowance and reservations
];

// Subtrees under a uid-keyed doc. Deleted recursively.
export const IDENTITY_TREES = [
  'push_subscriptions', // .../{uid}/subs and /native
  'user_blocks',        // .../{uid}/blocked/*
];

// Queried by a field. Every one of these is a single-field equality, so
// Firestore's automatic index covers it and none of this needs a
// composite index deployed before it will run. Keep it that way: a
// deletion path that 500s on a missing index is a deletion path that
// silently does not happen.
export const IDENTITY_QUERIES = [
  { collection: 'profile_handles', field: 'uid' },      // frees the @handle
  { collection: 'leaderboard_entries', field: 'uid' },  // the public board
  { collection: 'waitlist_posts', field: 'uid' },       // "looking for a round"
  { collection: 'team_members', field: 'userId' },      // seat on a team
  { collection: 'live_challenges', field: 'uid' },      // open callouts
  // A friendship is one doc per pair keyed on the sorted uid pair, so the
  // doc is the relationship rather than one side of it. Deleting it is
  // right here: a friendship with an account that no longer exists is a
  // row the other person cannot act on.
  { collection: 'friendships', field: 'uids', op: 'array-contains' },
];

// Bulk, private-to-them, resumable.
export const BULK_QUERIES = [
  { collection: 'generations', field: 'uid' },        // every AI turn captured
  { collection: 'voice_rounds', field: 'uid' },
  { collection: 'voice_transcripts', field: 'uid' },
  { collection: 'saved_rounds', field: 'uid' },
  { collection: 'consent_events', field: 'uid' },      // see the note in RETAINED
  { collection: 'rfd_ratings', field: 'uid' },
  { collection: 'usage_logs', field: 'userId' },
  { collection: 'user_style_summaries', field: 'uid' },
  // Private transcripts and derived explanations are disposable caches.
  // Either participant's deletion removes a shared cache; the live_rounds
  // record itself follows the existing retention policy below.
  { collection: 'private_judge_receipts', field: 'uids', op: 'array-contains' },
  { collection: 'judge_explanation_sources', field: 'uids', op: 'array-contains' },
];

// Direct message threads. A thread is a two-author object, so this is
// the one entry in the manifest that touches another person's words, and
// it is deliberate rather than sloppy: privacy.html has always said DMs
// are "deleted when you delete your account", the other participant was
// told the same thing about their own account, and a 1:1 thread whose
// counterparty no longer exists is unreachable in the product anyway
// (dm-core resolves threads out of the participants array). Deleting the
// thread doc alone would strand its messages subcollection, so this is a
// recursive delete of the whole thread.
export const DM_THREADS = { collection: 'dm_threads', field: 'participants', op: 'array-contains' };

// ── What stays, and why ────────────────────────────────────────────
//
// A deletion flow that claims to erase everything and quietly does not
// is worse than one that says what it keeps. Each entry names a reason a
// person can evaluate rather than "for legal reasons". The confirmation
// screen renders this array; do not restate it in HTML.
export const RETAINED = [
  {
    what: 'Payment and refund records',
    why: 'Financial records we are required to keep for tax and accounting. They keep the amount and the date and lose your name.',
  },
  {
    what: 'Rounds you debated against another person',
    why: 'That round is also their record of their own round, and their ballot. Your seat is relabelled to a deleted account; the transcript of what was said stays with them.',
  },
  {
    what: 'Judge audit rows for rounds you were in',
    why: 'The published judging record says which model decided a round under which rubric, and it is never edited after the fact. It carries no name.',
  },
  {
    what: 'Points-market ledger entries',
    why: 'A pari-mutuel pool settles across everyone in it, so removing one side of it would make the arithmetic wrong for the other people in that market. Entries are kept under an anonymous id.',
  },
  {
    what: 'Rounds you already contributed to the research corpus',
    why: 'Consent was recorded at the time and copies may already have shipped. Withdraw them first with "Withdraw my rounds from research" if you want them out, and do that BEFORE deleting the account.',
  },
  {
    what: 'Aggregate counts',
    why: 'Totals like "how many rounds ran in August" contain no identifying data and cannot be unpicked back to a person.',
  },
];

// A record that a deletion happened, so a later "did you actually delete
// me" question has an answer. Deliberately holds no email address and no
// name: a tombstone that carries the identity is not much of a deletion.
export const TOMBSTONE_COLLECTION = 'deletion_requests';

// Uploaded files live in Netlify Blobs, not Firestore, so deleting the
// profile row leaves the photo itself sitting in the store. A face is the
// most identifying thing this product holds; it goes with the account.
export const BLOB_OBJECTS = [
  { store: 'profile-photos', key: (uid) => `avatar/${uid}.jpg` },
];

// ── The purge ──────────────────────────────────────────────────────

function pastDeadline(deadline) {
  return typeof deadline === 'number' && Date.now() >= deadline;
}

async function deleteDocRef(db, ref, recursive) {
  if (recursive && typeof db.recursiveDelete === 'function') return db.recursiveDelete(ref);
  return ref.delete();
}

// Delete every document a query matches, a page at a time, until the
// query is empty or the clock runs out.
//
// THE PAGINATION IS THE POINT. The version this replaced ran a single
// .limit(500).get() and deleted what came back, which means an account
// with 501 captured rounds kept one, an account with 5,000 kept 4,500,
// and nothing anywhere reported a number. It looked identical to a
// working deletion from the outside, which is the failure mode this
// codebase keeps rediscovering.
async function purgeQuery(db, query, { deadline, recursive = false } = {}) {
  let deleted = 0;
  for (;;) {
    if (pastDeadline(deadline)) return { deleted, done: false };
    const snap = await query.limit(PAGE).get();
    if (snap.empty) return { deleted, done: true };
    // Sequential-ish in chunks rather than one Promise.all over 300
    // recursive deletes, which is how you turn a purge into a write
    // storm and get throttled by Firestore mid-deletion.
    for (let i = 0; i < snap.docs.length; i += 25) {
      await Promise.all(snap.docs.slice(i, i + 25).map((d) => deleteDocRef(db, d.ref, recursive)));
    }
    deleted += snap.size;
    if (snap.size < PAGE) return { deleted, done: true };
  }
}

/**
 * Remove the identity-bearing rows. Must finish before a caller is told
 * their account is gone.
 *
 * Returns { deleted, failures }. Failures are collected rather than
 * thrown, because one unreachable collection must not stop the other
 * fourteen from being deleted, and must not stop the Auth record from
 * being deleted after them.
 */
export async function purgeIdentity(db, uid) {
  let deleted = 0;
  const failures = [];

  const run = async (label, fn) => {
    try { deleted += (await fn()) || 0; }
    catch (err) { failures.push(`${label}: ${err.message}`); }
  };

  for (const name of IDENTITY_DOCS) {
    await run(name, async () => {
      await db.collection(name).doc(uid).delete();
      return 1;
    });
  }
  for (const name of IDENTITY_TREES) {
    await run(name, async () => {
      await deleteDocRef(db, db.collection(name).doc(uid), true);
      return 1;
    });
  }
  for (const q of IDENTITY_QUERIES) {
    await run(q.collection, async () => {
      const r = await purgeQuery(db, db.collection(q.collection).where(q.field, q.op || '==', uid));
      return r.deleted;
    });
  }
  await run(DM_THREADS.collection, async () => {
    const r = await purgeQuery(
      db,
      db.collection(DM_THREADS.collection).where(DM_THREADS.field, DM_THREADS.op, uid),
      { recursive: true },
    );
    return r.deleted;
  });

  return { deleted, failures };
}

/**
 * Relabel the seats a deleted debater held in shared rounds.
 *
 * A live round belongs to two people. Deleting it would delete the other
 * debater's round, their transcript and their ballot, which is taking
 * one person's data away to satisfy another person's request. So the
 * round survives and the NAME comes off it. Bounded, because a prolific
 * debater has hundreds of rounds and this is not the compliance-critical
 * part of the call.
 */
export async function anonymizeRounds(db, uid, { limit = 200 } = {}) {
  let updated = 0;
  for (const [uidField, nameField] of [['proUid', 'proName'], ['conUid', 'conName']]) {
    try {
      const snap = await db.collection('live_rounds').where(uidField, '==', uid).limit(limit).get();
      for (let i = 0; i < snap.docs.length; i += 25) {
        await Promise.all(snap.docs.slice(i, i + 25).map((d) =>
          d.ref.update({ [nameField]: 'Deleted account' }).catch(() => {})));
      }
      updated += snap.size;
    } catch (err) { /* a shared round keeping a stale label is not worth failing a deletion over */ }
  }
  return updated;
}

/**
 * The resumable half. Walks BULK_QUERIES until the deadline and reports
 * which collections still have rows, so the caller can either say so or
 * hand the remainder to the sweep.
 */
export async function purgeBulk(db, uid, { deadline, only } = {}) {
  let deleted = 0;
  const remaining = [];
  const failures = [];
  const list = only && only.length
    ? BULK_QUERIES.filter((q) => only.includes(q.collection))
    : BULK_QUERIES;

  for (const q of list) {
    if (pastDeadline(deadline)) { remaining.push(q.collection); continue; }
    try {
      const r = await purgeQuery(db, db.collection(q.collection).where(q.field, q.op || '==', uid), { deadline });
      deleted += r.deleted;
      if (!r.done) remaining.push(q.collection);
    } catch (err) {
      failures.push(`${q.collection}: ${err.message}`);
      remaining.push(q.collection);
    }
  }
  return { deleted, remaining, failures, done: remaining.length === 0 };
}
