import { getDb, FieldValue } from './lib/firestore.mjs';

// Scheduled ghost-reaper for the /spar matchmaking queue.
//
// Why this exists: queue docs land in `matchmaking_queue` with
// `status: 'waiting'` and only get cleaned up by the client's
// `pagehide` delete (spar.html) or by spar-pair.mjs's opportunistic
// `reapStaleDocs` sweep. `pagehide` is best-effort — iOS Safari
// frequently doesn't fire it when a tab is backgrounded or killed, and
// the delete network call can be cut off mid-flight — so abandoned
// sessions leave ghost `waiting` docs behind. spar-pair only reaps when
// SOMEONE is actively pairing, so a queue that goes quiet keeps its
// ghosts indefinitely: the meta strip read "7 in queue" off docs the
// matcher already knew were dead.
//
// This runs the same sweep on a cron so ghosts get cleared even when
// nobody is pairing. Marking them `cancelled` (not deleting) keeps the
// client contract intact: subscribeMyDoc in spar.html treats a
// `cancelReason: 'stale_reaper'` cancel as a system cancel and
// re-queues the user with a fresh doc instead of bouncing them — so a
// live debater who briefly stalled their timestamp resolution isn't
// ejected, they just get a fresh joinedAt.

const REAPER_MS = 6 * 60 * 1000;   // 6 min: anything older is abandoned
const BATCH_LIMIT = 200;           // cap writes per run

export default async () => {
  let db;
  try { db = getDb(); }
  catch (e) {
    console.warn('[spar-reaper] Firestore not configured', e.message);
    return new Response('skipped (no firestore)', { status: 200 });
  }

  const now = Date.now();
  const cutoffDate = new Date(now - REAPER_MS);
  const stats = { reaped: 0, errors: [] };

  try {
    // Page through stale docs in BATCH_LIMIT-sized chunks. A quiet queue
    // is usually a handful of docs, but a backlog after an outage could
    // be larger — loop until the query comes back empty (or we've done a
    // generous number of pages, as a runaway guard).
    for (let page = 0; page < 10; page++) {
      const snap = await db.collection('matchmaking_queue')
        .where('status', '==', 'waiting')
        .where('joinedAt', '<', cutoffDate)
        .orderBy('joinedAt', 'asc')
        .limit(BATCH_LIMIT)
        .get();
      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          status: 'cancelled',
          cancelledAt: FieldValue.serverTimestamp(),
          cancelReason: 'stale_reaper',
        });
      });
      await batch.commit();
      stats.reaped += snap.size;

      if (snap.size < BATCH_LIMIT) break;
    }
  } catch (err) {
    // Most likely cause: missing composite index on (status, joinedAt).
    // The same index spar-pair.mjs's reapStaleDocs needs — if that one
    // works, this one will too. Fail open so a hiccup never throws.
    stats.errors.push(err?.message || String(err));
    console.warn('[spar-reaper] sweep failed (likely missing composite index status+joinedAt):', err?.message || err);
  }

  console.log('[spar-reaper] stats', stats);
  return new Response(JSON.stringify(stats), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// Runs every 15 minutes — matches the credit-conscious cadence of the
// other scheduled functions (see soul.md credit-burn audit, 2026-05-18).
// Ghosts are hidden from the live count immediately by the client-side
// 3-min age filter; this sweep is the slower janitor that actually
// removes them so the matcher's per-tick query stays clean on a quiet
// queue.
export const config = {
  schedule: '*/15 * * * *',
};
