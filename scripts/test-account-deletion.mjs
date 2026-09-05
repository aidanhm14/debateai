#!/usr/bin/env node

// Account deletion is an App Store release requirement (Guideline
// 5.1.1(v)) and a data-protection obligation, so it is guarded rather
// than trusted. Two halves:
//
//   1. BEHAVIOUR. The purge is driven against a stub Firestore, because
//      the bug this replaced was a logic bug that looked fine in review:
//      one .limit(500).get() with no loop, which deleted the first page
//      and left the rest, and reported success either way. A regex
//      cannot see that. A fake collection of 700 documents can.
//
//   2. PROMISES. The flow must delete the Firebase Auth record
//      server-side, must not reintroduce the browser-side user.delete()
//      that failed for anyone signed in more than a few minutes,
//      must cancel a subscription before destroying the account, must
//      refuse guests, and must render its retention copy from the
//      server manifest instead of restating it in HTML.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  IDENTITY_DOCS, IDENTITY_TREES, IDENTITY_QUERIES, BULK_QUERIES,
  DM_THREADS, RETAINED, TOMBSTONE_COLLECTION, BLOB_OBJECTS,
  purgeIdentity, purgeBulk, anonymizeRounds,
} from '../app/netlify/functions/lib/account-deletion.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

let pass = 0;
const ok = (name, fn) => {
  try { fn(); pass += 1; }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); process.exitCode = 1; }
};
const okAsync = async (name, fn) => {
  try { await fn(); pass += 1; }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); process.exitCode = 1; }
};

// ── Stub Firestore ────────────────────────────────────────────────
// Only the surface the lib touches: collection().doc().delete(),
// .where().limit().get(), and doc.ref.update(). Records every read and
// write so a test can assert on the SHAPE of the traffic, not just the
// end state.
function fakeDb(seed = {}) {
  const store = new Map();               // collection -> Map(id -> data)
  for (const [c, docs] of Object.entries(seed)) {
    store.set(c, new Map(Object.entries(docs)));
  }
  const log = { queries: 0, deletes: [], updates: [], recursive: [] };

  const col = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name);
  };

  function makeQuery(name, pred) {
    return {
      limit(n) {
        return {
          async get() {
            log.queries += 1;
            const hits = [...col(name).entries()].filter(([id, d]) => pred(id, d)).slice(0, n);
            return {
              empty: hits.length === 0,
              size: hits.length,
              docs: hits.map(([id, d]) => ({
                id, data: () => d,
                ref: {
                  __col: name, __id: id,
                  async delete() { log.deletes.push(name + '/' + id); col(name).delete(id); },
                  async update(patch) { log.updates.push({ col: name, id, patch }); Object.assign(col(name).get(id) || {}, patch); },
                },
              })),
            };
          },
        };
      },
    };
  }

  return {
    __store: store, __log: log,
    collection(name) {
      return {
        doc(id) {
          return {
            __col: name, __id: id,
            async delete() { log.deletes.push(name + '/' + id); col(name).delete(id); },
            async get() { const d = col(name).get(id); return { exists: !!d, data: () => d }; },
          };
        },
        where(field, op, value) {
          const pred = op === 'array-contains'
            ? (_id, d) => Array.isArray(d[field]) && d[field].includes(value)
            : (_id, d) => d[field] === value;
          return makeQuery(name, pred);
        },
      };
    },
    async recursiveDelete(ref) {
      log.recursive.push(ref.__col + '/' + ref.__id);
      log.deletes.push(ref.__col + '/' + ref.__id);
      col(ref.__col).delete(ref.__id);
    },
  };
}

const rows = (n, data) => Object.fromEntries(
  Array.from({ length: n }, (_, i) => ['d' + i, { ...data }]),
);

// ── 1. Behaviour ──────────────────────────────────────────────────

await okAsync('bulk purge drains a collection larger than one page', async () => {
  // 700 > the 300-page size, so a single-page implementation leaves 400
  // behind. This is the exact defect the previous endpoint shipped.
  const db = fakeDb({ generations: rows(700, { uid: 'u1' }) });
  const r = await purgeBulk(db, 'u1', {});
  assert.equal(r.deleted, 700, `deleted ${r.deleted}, expected 700`);
  assert.equal(db.__store.get('generations').size, 0, 'rows survived the purge');
  assert.equal(r.done, true);
  assert.deepEqual(r.remaining, []);
});

await okAsync('bulk purge never touches another account', async () => {
  const db = fakeDb({ generations: { a: { uid: 'u1' }, b: { uid: 'u2' }, c: { uid: 'u1' } } });
  await purgeBulk(db, 'u1', {});
  const left = [...db.__store.get('generations').keys()];
  assert.deepEqual(left, ['b'], `left ${JSON.stringify(left)}, expected only u2's row`);
});

await okAsync('private judging cache purge drains every page and only matching participant records', async () => {
  const caches = ['private_judge_receipts', 'judge_explanation_sources'];
  const seed = {
    live_rounds: { shared: { proUid: 'u1', conUid: 'u2', transcript: 'Retained shared round' } },
  };
  for (const collection of caches) seed[collection] = {
    ...rows(700, { uids: ['u2', 'u1'], source: { transcript: 'Private transcript copy' } }),
    solo: { uids: ['u1'], source: { transcript: 'Submitted privately' } },
    other: { uids: ['u2', 'u3'], source: { transcript: 'Another pair' } },
    noMembership: { uids: [], uid: 'u1' },
  };
  const db = fakeDb(seed);
  const result = await purgeBulk(db, 'u1', { only: caches });
  assert.equal(result.deleted, 1402, 'a matching source or receipt survived pagination');
  assert.equal(result.done, true);
  assert.deepEqual(result.failures, []);
  assert.ok(db.__log.queries >= 6, 'each cache must be read across at least three pages');
  for (const collection of caches) {
    assert.deepEqual([...db.__store.get(collection).keys()], ['other', 'noMembership'],
      collection + ' removed a cache without this user in its participant array');
  }
  assert.equal(db.__store.get('live_rounds').get('shared').transcript, 'Retained shared round');
  assert.ok(!db.__log.deletes.some(path => path.startsWith('live_rounds/')));
});

await okAsync('private judging caches remain resumable after a deletion deadline', async () => {
  const caches = ['private_judge_receipts', 'judge_explanation_sources'];
  const db = fakeDb({
    private_judge_receipts: { receipt: { uids: ['u1'] }, other: { uids: ['u2'] } },
    judge_explanation_sources: { source: { uids: ['u1', 'u2'] } },
  });
  const stopped = await purgeBulk(db, 'u1', { only: caches, deadline: Date.now() - 1 });
  assert.equal(stopped.deleted, 0);
  assert.deepEqual(stopped.remaining, caches);
  const resumed = await purgeBulk(db, 'u1', { only: stopped.remaining });
  assert.equal(resumed.deleted, 2);
  assert.equal(resumed.done, true);
  assert.deepEqual([...db.__store.get('private_judge_receipts').keys()], ['other']);
});

await okAsync('private judging usage is deleted only for the account being removed', async () => {
  const db = fakeDb({ private_judge_usage: { u1: { used: 2 }, u2: { used: 1 } } });
  const result = await purgeIdentity(db, 'u1');
  assert.deepEqual(result.failures, []);
  assert.deepEqual([...db.__store.get('private_judge_usage').keys()], ['u2']);
});

await okAsync('a deadline stops the purge and reports what is left', async () => {
  // Past deadline before the first page: nothing deleted, everything
  // named as remaining. A purge that stopped early and reported done
  // would be a deletion that silently never finishes.
  const db = fakeDb({ generations: rows(50, { uid: 'u1' }), saved_rounds: rows(10, { uid: 'u1' }) });
  const r = await purgeBulk(db, 'u1', { deadline: Date.now() - 1 });
  assert.equal(r.deleted, 0);
  assert.equal(r.done, false);
  assert.equal(r.remaining.length, BULK_QUERIES.length, 'not every collection was reported unfinished');
  assert.equal(db.__store.get('generations').size, 50, 'rows were deleted past the deadline');
});

await okAsync('the sweep can resume just the collections left over', async () => {
  const db = fakeDb({ generations: rows(5, { uid: 'u1' }), voice_rounds: rows(5, { uid: 'u1' }) });
  const r = await purgeBulk(db, 'u1', { only: ['voice_rounds'] });
  assert.equal(r.deleted, 5);
  assert.equal(db.__store.get('generations').size, 5, 'resume touched a collection it was not asked to');
  assert.equal(db.__store.get('voice_rounds').size, 0);
});

await okAsync('identity purge removes every identity surface in one pass', async () => {
  const db = fakeDb({
    user_profiles: { u1: { name: 'x' } },
    public_profiles: { u1: { name: 'x' } },
    profile_handles: { cooldebater: { uid: 'u1' }, someoneelse: { uid: 'u2' } },
    leaderboard_entries: { e1: { uid: 'u1' }, e2: { uid: 'u2' } },
    matchmaking_queue: { u1: { status: 'waiting' } },
    team_members: { m1: { userId: 'u1' } },
    dm_threads: { 'u1_u2': { participants: ['u1', 'u2'] }, 'u2_u3': { participants: ['u2', 'u3'] } },
    push_subscriptions: { u1: {} },
  });
  const r = await purgeIdentity(db, 'u1');
  assert.equal(r.failures.length, 0, 'failures: ' + r.failures.join('; '));
  for (const c of ['user_profiles', 'public_profiles', 'matchmaking_queue', 'push_subscriptions']) {
    assert.equal(db.__store.get(c).size, 0, c + ' survived');
  }
  assert.deepEqual([...db.__store.get('profile_handles').keys()], ['someoneelse'], 'handle not released, or the wrong one was');
  assert.deepEqual([...db.__store.get('leaderboard_entries').keys()], ['e2']);
  assert.deepEqual([...db.__store.get('team_members').keys()], []);
  assert.deepEqual([...db.__store.get('dm_threads').keys()], ['u2_u3'], "another pair's thread was deleted");
  // A thread has a messages subcollection; deleting the doc alone would
  // strand it, so the thread must go through recursiveDelete.
  assert.ok(db.__log.recursive.includes('dm_threads/u1_u2'), 'DM thread was not recursively deleted');
  assert.ok(db.__log.recursive.includes('push_subscriptions/u1'), 'push subscription subtree was not recursively deleted');
});

await okAsync('one broken collection does not abort the rest of the identity purge', async () => {
  // The old flow ran these under Promise.allSettled and then reported a
  // count of rejections; the risk now is a for-loop that throws on the
  // first failure and leaves someone half-deleted AND still signed in.
  const db = fakeDb({ user_profiles: { u1: {} }, user_ratings: { u1: {} } });
  const realCollection = db.collection.bind(db);
  db.collection = (name) => {
    if (name === 'public_profiles') throw new Error('boom');
    return realCollection(name);
  };
  const r = await purgeIdentity(db, 'u1');
  assert.equal(r.failures.length, 1, 'the failure was not recorded');
  assert.match(r.failures[0], /public_profiles/);
  assert.equal(db.__store.get('user_profiles').size, 0, 'a later collection was skipped after one threw');
  assert.equal(db.__store.get('user_ratings').size, 0);
});

await okAsync('a shared round is relabelled, never deleted', async () => {
  // Deleting live_rounds would delete the OTHER debater's round, their
  // transcript and their ballot to satisfy this person's request.
  const db = fakeDb({
    live_rounds: {
      r1: { proUid: 'u1', proName: 'Rin', conUid: 'u2', conName: 'Kai' },
      r2: { proUid: 'u2', proName: 'Kai', conUid: 'u1', conName: 'Rin' },
      r3: { proUid: 'u2', proName: 'Kai', conUid: 'u3', conName: 'Dev' },
    },
  });
  const n = await anonymizeRounds(db, 'u1');
  assert.equal(n, 2);
  assert.equal(db.__store.get('live_rounds').size, 3, 'a shared round was destroyed');
  assert.equal(db.__log.deletes.length, 0, 'anonymize issued a delete');
  const patched = db.__log.updates.map((u) => u.id + ':' + JSON.stringify(u.patch));
  assert.ok(patched.includes('r1:{"proName":"Deleted account"}'), patched.join(' '));
  assert.ok(patched.includes('r2:{"conName":"Deleted account"}'), patched.join(' '));
  assert.ok(!patched.some((p) => p.startsWith('r3:')), "a round the user was not in was relabelled");
});

// ── 2. Promises the flow makes ────────────────────────────────────

const endpoint = read('app/netlify/functions/delete-account-data.mjs');
const sweep = read('app/netlify/functions/scheduled-deletion-sweep.mjs');
const authAdmin = read('app/netlify/functions/lib/auth-admin.mjs');
const profile = read('app/profile.html');

ok('the Firebase Auth record is deleted server-side', () => {
  // The compliance-critical step. Without it the flow empties a profile
  // and leaves an account somebody can still sign into, which is a
  // deactivation, and Guideline 5.1.1(v) rejects deactivation.
  assert.match(authAdmin, /accounts:delete/, 'auth-admin cannot delete an Auth user');
  assert.match(authAdmin, /USER_NOT_FOUND/, 'a retried deletion of an already-gone account would report failure');
  assert.match(endpoint, /import \{ deleteAuthUser \}/);
  assert.match(endpoint, /await deleteAuthUser\(uid\)/);
});

ok('a failed Auth delete fails the request instead of claiming success', () => {
  assert.match(endpoint, /status: 'auth_delete_failed'/);
  assert.match(endpoint, /catch \(err\)[\s\S]{0,600}auth_delete_failed[\s\S]{0,900}errorResponse\(/);
});

ok('the browser no longer tries to delete the Auth account itself', () => {
  // user.delete() throws auth/requires-recent-login for any session more
  // than a few minutes old, which was every real user reaching this
  // screen. Reintroducing it recreates the exact broken flow.
  //
  // Line comments are stripped first: this file's own explanation of the
  // bug NAMES the call, and an assertion that a source file must never
  // contain a string is an assertion nobody can document around.
  const code = profile.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /user\.delete\(\)/, 'profile.html still calls user.delete()');
  assert.doesNotMatch(code, /requires-recent-login/, 'the recent-login workaround is back');
  assert.match(code, /auth\.signOut\(\)/);
});

ok('the account is deleted before the resumable bulk purge', () => {
  // Ordering is load-bearing: Netlify kills the invocation at ~26s, so a
  // bulk pass placed ahead of the Auth delete can starve the one step
  // that makes "your account is gone" true.
  const authAt = endpoint.indexOf('await deleteAuthUser(uid)');
  const bulkAt = endpoint.indexOf('await purgeBulk(');
  const identityAt = endpoint.indexOf('await purgeIdentity(');
  assert.ok(authAt > 0 && bulkAt > 0 && identityAt > 0);
  assert.ok(identityAt < authAt, 'identity rows must be purged before the account is deleted');
  assert.ok(authAt < bulkAt, 'the bulk purge runs before the Auth delete and can starve it');
});

ok('the bulk purge is bounded and its remainder is recorded', () => {
  assert.match(endpoint, /BULK_BUDGET_MS/);
  assert.match(endpoint, /deadline: Date\.now\(\) \+ BULK_BUDGET_MS/);
  assert.match(endpoint, /remaining: bulk\.remaining/);
  assert.match(endpoint, /status: bulk\.done[\s\S]{0,60}'purging'/);
});

ok('a queued remainder is not rendered to the user as a failure', () => {
  assert.match(endpoint, /purgeComplete/);
  assert.match(profile, /data\.accountDeleted/);
  assert.doesNotMatch(profile, /purgeComplete[\s\S]{0,80}(err|failed|Could not)/i);
});

ok('an unfinished deletion is actually finished by a cron', () => {
  assert.match(sweep, /where\('status', '==', 'purging'\)/);
  assert.match(sweep, /purgeBulk\(/);
  assert.match(sweep, /export const config = \{ schedule:/);
  assert.match(sweep, /only/, 'the sweep does not resume the leftover collections');
  assert.match(sweep, /needs_attention/, 'a permanently failing deletion retries forever, unseen');
});

ok('the subscription is cancelled before the account is destroyed', () => {
  // Otherwise a deleted account keeps billing a card, with no surface
  // left to cancel from.
  const stripeAt = endpoint.indexOf('stripe.subscriptions.cancel');
  const authAt = endpoint.indexOf('await deleteAuthUser(uid)');
  assert.ok(stripeAt > 0, 'nothing cancels the subscription');
  assert.ok(stripeAt < authAt, 'the subscription is cancelled after the account is already gone');
  assert.match(profile, /Your subscription is cancelled with the account/);
});

ok('deletion needs a typed phrase, not a boolean', () => {
  assert.match(endpoint, /const CONFIRM_PHRASE = 'DELETE'/);
  assert.match(endpoint, /!== CONFIRM_PHRASE/);
  assert.match(profile, /confirm: 'DELETE'/);
  assert.match(profile, /toUpperCase\(\) !== 'DELETE'/);
  assert.doesNotMatch(profile, /confirm\('Delete your Debatable account/, 'back to a browser confirm() dialog');
});

ok('guests are refused rather than handed a free-tier reset', () => {
  // guest_rounds / voice_usage / age_bands are keyed to an anonymous
  // uid, which is free and unlimited to mint. A delete button over them
  // is a refill button, and for the age band a way to re-answer a
  // write-once question.
  // Asserted as the whole statement, not just a mention of the helper:
  // the first version of this guard matched `false && !isNamedAccount(...)`
  // and let a mutation that disabled the gate pass clean.
  assert.match(
    endpoint,
    /\n  if \(!isNamedAccount\(decoded\)\) \{\s*\n\s*return \{\s*\n\s*error: errorResponse\(/,
    'the guest gate is not an unconditional check that returns an error',
  );
  assert.match(endpoint, /403,/, 'the guest refusal is not a 403');
  for (const c of ['guest_rounds', 'voice_usage', 'age_bands']) {
    assert.ok(!IDENTITY_DOCS.includes(c) && !BULK_QUERIES.some((q) => q.collection === c),
      `${c} is in the manifest; deleting it resets a meter`);
  }
});

ok('the confirmation screen renders retention copy from the server', () => {
  // Retention copy written into HTML drifts from the code that deletes,
  // and on this screen the drift is a false promise about someone's data.
  assert.ok(RETAINED.length >= 4);
  for (const r of RETAINED) {
    assert.ok(r.what && r.why, 'a retained entry has no stated reason');
  }
  assert.match(endpoint, /retained: RETAINED/);
  assert.match(profile, /data\.retained/);
  assert.match(profile, /delKeepList\.innerHTML/);
});

ok('the person is pointed at export and corpus withdrawal first', () => {
  assert.match(endpoint, /exportFirst: '\/api\/my-data-export'/);
  assert.match(endpoint, /withdrawCorpusFirst: '\/api\/corpus-withdraw'/);
  assert.match(profile, /id="delExport"/);
  assert.match(profile, /id="delWithdraw"/);
});

ok('the deletion is rate limited and leaves a nameless tombstone', () => {
  assert.match(endpoint, /checkLayers\('delacct'/);
  assert.equal(TOMBSTONE_COLLECTION, 'deletion_requests');
  // A record of who asked to be forgotten, keeping their email, is not
  // much of a deletion. The uid is opaque and is all the sweep needs.
  assert.doesNotMatch(endpoint, /tombstone\.set\(\{[\s\S]{0,300}email/, 'the tombstone stores an email address');
});

ok('the delete control is reachable from the native first-run profile', () => {
  // An App Store reviewer's account has zero rounds, so it lands on the
  // native empty state. If renderSettings is not in that branch, the
  // control does not exist for the only account review will ever use.
  assert.match(profile, /function renderNativeEmpty\([\s\S]{0,3000}\$\{renderSettings\(user, profileData\)\}/);
  assert.match(profile, /id="deleteAccountBtn"/);
  assert.match(profile, /id="deletePanel"/);
});

ok('the deletions added on main survive the rewrite', () => {
  // These three were added to the old endpoint while this rewrite was in
  // flight and a wholesale file replacement would have dropped all of
  // them without a conflict anyone would notice at review time.
  assert.ok(IDENTITY_DOCS.includes('spar_match_profiles'), 'the match profile outlives the account');
  const friends = IDENTITY_QUERIES.find((q) => q.collection === 'friendships');
  assert.ok(friends, 'friendships are never deleted');
  assert.equal(friends.op, 'array-contains', 'a pair-keyed friendship needs array-contains, not equality');
  // A face is the most identifying thing this product stores, and it
  // lives in Netlify Blobs where the Firestore purge cannot reach it.
  assert.ok(BLOB_OBJECTS.some((b) => b.store === 'profile-photos'));
  assert.equal(BLOB_OBJECTS[0].key('abc'), 'avatar/abc.jpg');
  assert.match(endpoint, /getStore\(blob\.store\)\.delete\(blob\.key\(uid\)\)/);
});

ok('a query operator other than equality is actually honoured', () => {
  // A composite index that is not deployed makes the query 500, and a
  // deletion path that 500s is a deletion that silently does not happen.
  for (const q of [...IDENTITY_QUERIES, ...BULK_QUERIES]) {
    assert.equal(typeof q.collection, 'string');
    assert.equal(typeof q.field, 'string');
    assert.ok(!q.op || q.op === 'array-contains', 'an operator needing a composite index crept in');
  }
  assert.equal(DM_THREADS.op, 'array-contains');
  assert.ok(IDENTITY_DOCS.includes('user_profiles'));
  assert.ok(IDENTITY_DOCS.includes('public_profiles'), 'the public-facing profile would outlive the account');
  assert.ok(IDENTITY_TREES.includes('user_blocks'));
  assert.ok(IDENTITY_QUERIES.some((q) => q.collection === 'profile_handles'), 'the @handle stays claimed forever');
  assert.ok(BULK_QUERIES.some((q) => q.collection === 'generations'));
  assert.ok(new Set([...IDENTITY_DOCS, ...IDENTITY_TREES]).size === IDENTITY_DOCS.length + IDENTITY_TREES.length);
});

ok('privacy and support copy describe the flow that actually exists', () => {
  const privacy = read('app/privacy.html');
  const support = read('app/support.html');
  assert.match(privacy, /immediately|straight away|right away/i);
  assert.doesNotMatch(support, /email us from the address on the account and we will do it for you\./,
    'support still routes deletion through a human, which Guideline 5.1.1(v) rejects');
});


await okAsync('an array-contains identity query deletes the right rows', () => {
  // Declaring `op` in the manifest is worthless if purgeIdentity ignores it
  // and runs an equality query: that matches nothing, deletes nothing, and
  // reports zero failures, which is indistinguishable from success.
  const db = fakeDb({
    friendships: { 'a_b': { uids: ['a', 'b'] }, 'b_c': { uids: ['b', 'c'] }, 'a_c': { uids: ['a', 'c'] } },
  });
  return purgeIdentity(db, 'a').then(() => {
    assert.deepEqual([...db.__store.get('friendships').keys()], ['b_c'],
      "friendships were not deleted by uid pair (an equality query would leave all three)");
  });
});

if (process.exitCode) {
  console.error(`\ntest-account-deletion: ${pass} passed, failures above.`);
} else {
  console.log(`test-account-deletion: ${pass}/${pass} assertions passed.`);
}
