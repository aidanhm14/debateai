import { FieldValue } from './firestore.mjs';
import { sendWelcomeTo } from './welcome-email.mjs';

const WAITING = new Set(['pending', 'retry']);
const TEMPORARY = new Set(['queued', 'retry_later', 'daily_cap', 'claimed', 'claim_failed', 'welcome_not_configured']);

// Conditional cleanup cannot overwrite a concurrent sender's claim or receipt.
async function finishWaiting(db, ref, now) {
  await db.runTransaction(async tx => {
    const state = (await tx.get(ref)).data();
    if (!state || !(state.nextAttemptAt <= now())) return;
    tx.set(ref, { ...(WAITING.has(state.status) ? { status: 'suppressed' } : {}),
      nextAttemptAt: FieldValue.delete() }, { merge: true });
  });
}

export async function runWelcomeQueue({ db, lookupUser, send = sendWelcomeTo, now = Date.now }) {
  // Single-field range query uses Firestore's automatic index. Only due jobs
  // are read; the whole Auth directory stays in the half-hour recovery sweep.
  const due = await db.collection('welcome_deliveries')
    .where('nextAttemptAt', '<=', now()).orderBy('nextAttemptAt').limit(5).get();
  const tally = { due: due.docs.length, sent: 0, skipped: 0, errors: 0 };
  // Bound the fan-out to five independent messages within the scheduled
  // function's 30-second limit. Claims and the daily budget stay transactional.
  await Promise.all(due.docs.map(async doc => {
    try {
      if (!WAITING.has(doc.data().status)) {
        await finishWaiting(db, doc.ref, now);
        tally.skipped++; return;
      }
      const user = await lookupUser(doc.id);
      if (!user) {
        await finishWaiting(db, doc.ref, now);
        tally.skipped++; return;
      }
      const result = await send(db, user, { source: 'queue', now });
      if (result.sent) tally.sent++;
      else {
        tally.skipped++;
        if (!TEMPORARY.has(result.reason)) await finishWaiting(db, doc.ref, now);
      }
    } catch { tally.errors++; }
  }));
  return tally;
}
