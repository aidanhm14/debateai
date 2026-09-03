// Finish account deletions the endpoint ran out of clock for.
//
// /api/delete-account-data has ~26s of execution before Netlify kills
// it, and it spends the first part of that on the things that must be
// true before a person is told their account is gone: the subscription,
// the identity rows, the Firebase Auth record. What is left after that
// is a private-to-them bulk purge (captured rounds, transcripts, saved
// ballots) which can be large and which nobody is waiting on.
//
// WITHOUT THIS FILE that remainder would be a promise nobody keeps. The
// endpoint would return "your account is deleted", which is true, and
// several thousand rows would sit in Firestore forever, orphaned from an
// Auth record that no longer exists, which is exactly the "we deleted
// your account (most of it)" outcome a deletion flow is supposed to
// rule out. The tombstone names which collections still have rows; this
// walks back through them until there are none.
//
// It is idempotent by construction: every pass re-runs the same queries
// and a query that matches nothing is a no-op, so a double run, a retry,
// or a crash mid-pass all converge on the same end state.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { TOMBSTONE_COLLECTION, purgeBulk } from './lib/account-deletion.mjs';

// One request's whole budget, minus room to write the results back. The
// per-account slice is smaller so a single enormous account cannot eat
// an entire run and starve the ones behind it; it just gets picked up
// again next hour.
const RUN_BUDGET_MS = 18000;
const PER_ACCOUNT_MS = 8000;
const MAX_ACCOUNTS = 12;

// A deletion that has failed this many times is not going to succeed by
// being retried again, and a row that retries forever is a row nobody
// ever looks at. Parked as `needs_attention` so it shows up as work
// rather than disappearing into a log.
const MAX_ATTEMPTS = 12;

export default async () => {
  if (process.env.NIGHTLY_PAUSED === '1') {
    return new Response(JSON.stringify({ ok: true, skipped: 'nightly_paused' }), { status: 200 });
  }

  const db = getDb();
  const started = Date.now();
  const summary = { scanned: 0, finished: 0, stillPurging: 0, parked: 0, deleted: 0, errors: [] };

  try {
    // Single-field equality, so the automatic index covers it and this
    // needs no composite index deployed before it will run. Ordering is
    // deliberately left to Firestore rather than sorted by age: adding
    // an orderBy here would need a composite index, and a sweep that
    // 500s on a missing index is a sweep that silently never finishes
    // anyone's deletion.
    const snap = await db.collection(TOMBSTONE_COLLECTION)
      .where('status', '==', 'purging')
      .limit(MAX_ACCOUNTS)
      .get();

    for (const doc of snap.docs) {
      if (Date.now() - started > RUN_BUDGET_MS) break;
      summary.scanned += 1;

      const row = doc.data() || {};
      const uid = row.uid || doc.id;

      if ((row.attempts || 0) >= MAX_ATTEMPTS) {
        await doc.ref.set({ status: 'needs_attention', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        summary.parked += 1;
        continue;
      }

      // `only` narrows the pass to the collections the last attempt
      // reported as unfinished. An empty or missing list means we do not
      // know where it stopped, so re-walk everything; over-scanning
      // costs a few empty queries and under-scanning leaves rows behind.
      const only = Array.isArray(row.remaining) && row.remaining.length ? row.remaining : null;
      const result = await purgeBulk(db, uid, {
        deadline: Math.min(Date.now() + PER_ACCOUNT_MS, started + RUN_BUDGET_MS),
        only,
      });

      summary.deleted += result.deleted;
      const done = result.done && !result.failures.length;
      if (done) summary.finished += 1; else summary.stillPurging += 1;
      if (result.failures.length) summary.errors.push(...result.failures.slice(0, 3));

      await doc.ref.set({
        status: done ? 'complete' : 'purging',
        remaining: result.remaining,
        bulkDeleted: FieldValue.increment(result.deleted),
        failures: result.failures.slice(0, 20),
        attempts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    console.log('[deletion-sweep]', JSON.stringify(summary));
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[deletion-sweep] crashed:', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Hourly. A deletion is a legal obligation with a stated window, not a
// nightly report, so it should not wait up to 24 hours for its first
// retry; hourly also means a transient Firestore blip costs an hour
// rather than a day.
export const config = { schedule: '17 * * * *' };
