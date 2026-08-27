// Close out recordings whose round walked away.
//
// Capture starts only after every seated participant agrees. Once it is
// running, the client normally calls `finish`; a closed tab, crashed browser
// or abandoned round does not. That used to leave the round doc reading
// `recording` forever: measured 2026-08-19, four rounds were stuck that way,
// one of them for eleven hours. This job closes consented recordings whose
// clients disappeared and marks any legacy unconsented file for deletion.
//
// Liveness comes from `lastSeenAt`, the seat heartbeat both debaters write
// every 30 seconds (WATCH_HB_MS in live-round.html). Ten minutes of
// silence is twenty missed beats: the room is empty, not slow. Long rounds
// are safe precisely because a long round is still beating.

// firebase-admin is NOT a dependency of this project: lib/firestore.mjs
// wraps @google-cloud/firestore and re-exports FieldValue. Importing from
// 'firebase-admin/firestore' threw at module load, so the schedule fired
// into a function that could not start and the nine stuck rounds sat
// there through four slots looking exactly like a cron that never ran.
import { FieldValue, getDb } from './lib/firestore.mjs';
import { stopIfStarted } from './round-recording.mjs';

const OPEN_STATES = ['starting', 'recording', 'stopping', 'stop_failed'];
const STALE_MS = 10 * 60 * 1000;
const MAX_PER_RUN = 25;

function lastActivityMs(d){
  const beats = [
    d.lastSeenAt?.toMillis?.() || 0,
    d.recordingUpdatedAtMs || 0,
    d.recordingStartedAtMs || 0,
    Number(d.roundStartedAt) || 0,
  ];
  return Math.max(...beats);
}

export async function reapAbandonedRecordings(db, nowMs = Date.now()){
  const snap = await db.collection('live_rounds')
    .where('recordingStatus', 'in', OPEN_STATES)
    .limit(100)
    .get();

  let reaped = 0, purged = 0, skipped = 0;
  for (const doc of snap.docs){
    if (reaped >= MAX_PER_RUN) break;
    const d = doc.data() || {};
    const idle = nowMs - lastActivityMs(d);
    if (idle < STALE_MS){ skipped++; continue; }

    // Best effort, and deliberately before the write: if Daily refuses,
    // the doc still closes and the file still gets flagged for deletion.
    // A recording we could not stop is a stronger reason to mark it, not
    // a reason to leave the round open another fifteen minutes.
    try { await stopIfStarted(doc.id); } catch (e) {
      console.warn('[recording-reaper] stop failed for', doc.id, e?.message || e);
    }

    const consented = d.recordingPublishAllowed === true;
    const update = {
      recordingStatus: consented ? 'processing' : 'stopped',
      recordingClosed: true,
      recordingStopReason: 'abandoned',
      recordingStoppedAt: FieldValue.serverTimestamp(),
      recordingStoppedAtMs: nowMs,
      recordingUpdatedAt: FieldValue.serverTimestamp(),
      recordingUpdatedAtMs: nowMs,
    };
    // Nobody completed the consent, and nobody is left in the room to
    // complete it. The file goes on the next sync pass.
    if (!consented){ update.recordingDeleteRequested = true; purged++; }
    await doc.ref.set(update, { merge: true });
    reaped++;
    console.log('[recording-reaper]', doc.id, 'idle', Math.round(idle / 60000) + 'm', consented ? 'kept for publish' : 'marked for deletion');
  }
  return { open: snap.size, reaped, purged, skipped };
}

export default async () => {
  try {
    const result = await reapAbandonedRecordings(getDb());
    console.log('[recording-reaper]', JSON.stringify(result));
  } catch (error) {
    console.error('[recording-reaper] failed:', error?.message || error);
  }
};

// Five minutes ahead of the recordings sync it feeds, on the same */15
// cadence the other operational crons settled on after the 2026-05-18
// credit audit. Worst case a walked-away capture is stopped ~25 minutes
// after the room empties, and deleted on the sync pass after that.
export const config = { schedule: '5,20,35,50 * * * *' };
