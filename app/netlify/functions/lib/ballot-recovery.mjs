import { randomUUID } from 'node:crypto';
import { RECOVERY_GRACE_MS, SWEEP_LEASE_MS, SWEEP_JUROR_TIMEOUT_MS,
  timestampMillis, judgeLeaseWaitMs, recoveryWaitMs, transcriptSizeError } from '../live-judge.mjs';

export function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? Math.min(max, Math.floor(n)) : fallback;
}
export const CONCURRENCY = boundedInt(process.env.BALLOT_RECOVERY_CONCURRENCY, 3, 1, 10);
export const DISPATCH_LEASE_MS = 120_000;
// The panel can make one fallback call after the parallel jurors. Keep a
// slot until both calls and the existing per-room lease have expired.
export const WORKER_LEASE_MS = Math.max(SWEEP_LEASE_MS, 2 * SWEEP_JUROR_TIMEOUT_MS) + 60_000;
export const RECOVERY_COLLECTION = 'ballot_recovery'; // server-only, default-deny rules

// Bounded dispatch and global worker slots protect provider capacity.
export const MAX_PER_RUN = boundedInt(process.env.BALLOT_SWEEP_MAX_PER_RUN, 3, 1, 20);
// Scan width. Small because the healthy steady state is zero rows.
export const SCAN_LIMIT = 40;
// Past this, retrying is spending real provider calls on a round nobody
// is waiting for. Both debaters are long gone; the transcript is kept.
const MAX_AGE_MS = Number(process.env.BALLOT_SWEEP_MAX_AGE_MS || 24 * 60 * 60 * 1000);
const MAX_ATTEMPTS = Number(process.env.BALLOT_SWEEP_MAX_ATTEMPTS || 15);

// Pure, so the rules about WHICH rooms get another panel can be tested
// without a database or a provider key. Rows are {id, data} pairs.
export function selectSweepTargets(rows, now = Date.now(), opts = {}) {
  const maxPerRun = opts.maxPerRun != null ? opts.maxPerRun : MAX_PER_RUN;
  const maxAgeMs = opts.maxAgeMs != null ? opts.maxAgeMs : MAX_AGE_MS;
  const maxAttempts = opts.maxAttempts != null ? opts.maxAttempts : MAX_ATTEMPTS;
  const due = [];
  const skipped = { notPending: 0, coolingDown: 0, decided: 0, unresolved: 0, tooYoung: 0, leased: 0, abandoned: 0, noStamp: 0, missingParticipant: 0, transcriptTooLarge: 0 };
  for (const row of rows) {
    const d = (row && row.data) || {};
    if (d.ballotPending !== true) { skipped.notPending += 1; continue; }
    if (recoveryWaitMs(d, now) > 0 && timestampMillis(d.serverJudgeFailedAt)) { skipped.coolingDown += 1; continue; }
    if (d.ballot) { skipped.decided += 1; continue; }
    if (d.ballotUnresolved) { skipped.unresolved += 1; continue; }
    const pendingAt = timestampMillis(d.ballotPendingAt);
    if (!pendingAt) { skipped.noStamp += 1; continue; }
    const age = now - pendingAt;
    if (age < RECOVERY_GRACE_MS) { skipped.tooYoung += 1; continue; }
    if (age > maxAgeMs) { skipped.abandoned += 1; continue; }
    if ((Number(d.serverJudgeAttempt) || 0) >= maxAttempts) { skipped.abandoned += 1; continue; }
    if (judgeLeaseWaitMs(d, now) > 0) { skipped.leased += 1; continue; }
    // These requests cannot claim a panel. Unlike provider failures,
    // repeating them does not advance serverJudgeAttempt, so they would
    // consume worker slots until the age cutoff. Read the current shape
    // each time: a later repaired room can still recover normally.
    if (!d.proUid || !d.conUid) { skipped.missingParticipant += 1; continue; }
    if (transcriptSizeError(d.speeches)) { skipped.transcriptTooLarge += 1; continue; }
    due.push({ room: row.id, age });
  }
  // Oldest first: the round that has been waiting longest is the one
  // whose debaters are most likely to still be checking back.
  due.sort((a, b) => b.age - a.age);
  return { due, batch: due.slice(0, maxPerRun), skipped };
}


export function retryDelayMs(attempt) {
  return Math.min(15 * 60_000, 60_000 * 2 ** Math.min(4, Math.max(0, attempt - 1)));
}

export function internalRequest(room) {
  return new Request('https://itsdebatable.com/api/live-judge', {
    method: 'POST',
    headers: { 'content-type': 'application/json',
      'x-internal-judge-key': String(process.env.INTERNAL_JUDGE_KEY || '') },
    body: JSON.stringify({ room }),
  });
}

// Inject only infrastructure boundaries so tests exercise the real queue,
// claim, retry and release decisions without credentials or paid calls.
export function createRecoveryQueue({ db, documentId, now = Date.now, uuid = randomUUID,
  concurrency = CONCURRENCY, maxPerRun = MAX_PER_RUN }) {
  const control = db.collection(RECOVERY_COLLECTION);
  const cursorRef = control.doc('cursor');
  const jobRef = room => control.doc('job:' + room);
  const slotRef = slot => control.doc('slot:' + slot);

  async function candidates() {
    const cursor = (await cursorRef.get()).data()?.after || '';
    let query = db.collection('live_rounds').where('ballotPending', '==', true)
      .orderBy(documentId).limit(SCAN_LIMIT);
    let snap = await (cursor ? query.startAfter(cursor) : query).get();
    // Rotate through the whole pending set, including abandoned/leased
    // documents, so the first 40 can never hide later eligible rooms.
    if (snap.empty && cursor) snap = await query.get();
    await cursorRef.set({ after: snap.docs.at(-1)?.id || '', scannedAt: now() });
    const rows = snap.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    return selectSweepTargets(rows, now(), { maxPerRun: SCAN_LIMIT });
  }

  async function reserve(room, slot) {
    const token = uuid();
    return db.runTransaction(async tx => {
      const [s, j] = await Promise.all([tx.get(slotRef(slot)), tx.get(jobRef(room))]);
      const t = now();
      if ((s.data()?.expiresAt || 0) > t || (j.data()?.nextAttemptAt || 0) > t) return null;
      const attempts = (j.data()?.attempts || 0) + 1;
      const expiresAt = t + DISPATCH_LEASE_MS;
      tx.set(slotRef(slot), { room, token, state: 'queued', expiresAt });
      tx.set(jobRef(room), { token, attempts, nextAttemptAt: expiresAt, queuedAt: t }, { merge: true });
      return { room, slot, token };
    });
  }

  async function dispatch(send) {
    const selected = await candidates();
    if (!selected.batch.length) return { due: 0, skipped: selected.skipped, results: [] };
    const slots = await db.getAll(...Array.from({ length: concurrency }, (_, i) => slotRef(i)));
    const available = slots.flatMap((s, i) => (s.data()?.expiresAt || 0) > now() ? [] : [i]).slice(0, maxPerRun);
    if (!available.length) return { due: selected.due.length, skipped: selected.skipped, results: [] };
    const jobs = await db.getAll(...selected.batch.map(item => jobRef(item.room)));
    const ready = selected.batch.filter((_, i) => (jobs[i].data()?.nextAttemptAt || 0) <= now());
    const claims = [];
    // Bounded transactions even if another dispatcher wins every slot.
    // Do not serially try all 40 candidates against every occupied slot.
    for (const [i, slot] of available.entries()) {
      if (!ready[i]) break;
      const claim = await reserve(ready[i].room, slot);
      if (claim) claims.push(claim);
    }
    const results = await Promise.all(claims.map(async claim => {
      try {
        await send({ slot: claim.slot, token: claim.token });
        return { room: claim.room, dispatched: true };
      } catch (error) {
        // A timeout can mean Netlify accepted the invocation. Keep its
        // token/lease until expiry; an uncertain send must not double-buy.
        return { room: claim.room, dispatched: false, error: error.name || 'Error' };
      }
    }));
    return { due: selected.due.length, skipped: selected.skipped, results };
  }

  async function run({ slot, token }, judge) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= 10 || typeof token !== 'string') return { code: 'invalid_job' };
    // Reject unsafe configuration rather than start work that outlives
    // Netlify's 15-minute worker or its lease.
    if (!Number.isFinite(WORKER_LEASE_MS) || WORKER_LEASE_MS > 14 * 60_000) throw new Error('Recovery lease exceeds worker budget');
    const claim = await db.runTransaction(async tx => {
      const s = await tx.get(slotRef(slot));
      const d = s.data();
      if (!d || d.token !== token || d.state !== 'queued' || d.expiresAt <= now()) return null;
      const j = await tx.get(jobRef(d.room));
      if (j.data()?.token !== token) return null;
      tx.update(slotRef(slot), { state: 'running', expiresAt: now() + WORKER_LEASE_MS });
      tx.update(jobRef(d.room), { nextAttemptAt: now() + WORKER_LEASE_MS });
      return { room: d.room, attempts: j.data().attempts };
    });
    if (!claim) return { code: 'stale_or_running' };

    const started = now();
    let code = 'worker_failed', status = 500, retryAfterMs = 0;
    try {
      const response = await judge(internalRequest(claim.room), {});
      status = response.status;
      const body = await response.json();
      code = String(body.code || (body.ballot ? 'decided' : 'pending')).slice(0, 80);
      retryAfterMs = Math.max(0, Number(body.retryAfterMs) || 0);
    } finally {
      // Also release on thrown network/provider errors. A retry is driven
      // by durable pending state, never by an unbounded in-process loop.
      await db.runTransaction(async tx => {
        const s = await tx.get(slotRef(slot));
        const j = await tx.get(jobRef(claim.room));
        if (s.data()?.token !== token || j.data()?.token !== token) return;
        const t = now();
        tx.update(jobRef(claim.room), { lastCode: code, lastStatus: status,
          finishedAt: t, durationMs: t - started,
          nextAttemptAt: t + Math.max(retryDelayMs(claim.attempts), retryAfterMs) });
        tx.update(slotRef(slot), { state: 'idle', expiresAt: 0 });
      });
    }
    return { room: claim.room, code, status, ms: now() - started };
  }
  return { dispatch, run };
}
