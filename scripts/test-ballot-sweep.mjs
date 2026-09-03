#!/usr/bin/env node
// Guards on the patient judge path (2026-09-03).
//
// The sweep is the thing that finally lands a ballot when the pinned
// jurors are slower than a synchronous invocation, so its two dangerous
// properties are (a) the internal door it opens in live-judge and (b)
// which rooms it decides to spend three provider calls on. Both are
// pure and both are pinned here. Runs in the pre-commit hook.

process.env.INTERNAL_JUDGE_KEY = 'k'.repeat(32);

const { isInternalJudgeCall, judgeLeaseWaitMs, JUDGE_LEASE_MS, SWEEP_LEASE_MS, SWEEP_UID, RECOVERY_GRACE_MS } =
  await import('../app/netlify/functions/live-judge.mjs');
const { selectSweepTargets } =
  await import('../app/netlify/functions/scheduled-ballot-sweep.mjs');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass += 1; } else { fail += 1; console.error('  FAIL:', msg); } };
const req = (key) => new Request('https://x/api/live-judge', {
  method: 'POST',
  headers: key == null ? {} : { 'x-internal-judge-key': key },
});

// ── the internal door ───────────────────────────────────────────────
ok(isInternalJudgeCall(req('k'.repeat(32))) === true, 'correct key is accepted');
ok(isInternalJudgeCall(req(null)) === false, 'no header is rejected');
ok(isInternalJudgeCall(req('')) === false, 'empty header is rejected');
ok(isInternalJudgeCall(req('k'.repeat(31))) === false, 'short key is rejected');
ok(isInternalJudgeCall(req('k'.repeat(33))) === false, 'long key is rejected');
ok(isInternalJudgeCall(req('j'.repeat(32))) === false, 'wrong key of right length is rejected');

// An UNSET secret must never mean "everybody is the sweep". This is the
// single most dangerous failure available here: it would hand panel
// access, with no App Check and no sign-in, to any caller.
const saved = process.env.INTERNAL_JUDGE_KEY;
process.env.INTERNAL_JUDGE_KEY = '';
ok(isInternalJudgeCall(req('')) === false, 'unset secret rejects an empty header');
ok(isInternalJudgeCall(req('anything')) === false, 'unset secret rejects any header');
process.env.INTERNAL_JUDGE_KEY = 'short';
ok(isInternalJudgeCall(req('short')) === false, 'a too-short configured secret is refused outright');
process.env.INTERNAL_JUDGE_KEY = saved;

// The sweep must never look like a debater, or it could be read as a
// participant and skip the recovery window it exists to respect.
ok(typeof SWEEP_UID === 'string' && SWEEP_UID.length !== 28, 'sweep uid cannot collide with a Firebase uid');

// ── the lease ───────────────────────────────────────────────────────
const running = (startedAt, leaseMs) => ({
  serverJudgeState: 'running', serverJudgeStartedAt: startedAt,
  ...(leaseMs ? { serverJudgeLeaseMs: leaseMs } : {}),
});
const T = 1_000_000;
ok(judgeLeaseWaitMs({ serverJudgeState: 'incomplete' }, T) === 0, 'a room nobody holds is free');
ok(judgeLeaseWaitMs(running(T - 1000), T) > 0, 'a fresh short lease is held');
ok(judgeLeaseWaitMs(running(T - JUDGE_LEASE_MS - 1), T) === 0, 'an expired short lease is free');
// A sweep run legitimately outlives the request-path lease. Without this
// a second sweeper claims a room mid-panel and pays for it twice.
ok(judgeLeaseWaitMs(running(T - JUDGE_LEASE_MS - 1, SWEEP_LEASE_MS), T) > 0,
   'a sweep lease outlives the request lease');
ok(judgeLeaseWaitMs(running(T - SWEEP_LEASE_MS - 1, SWEEP_LEASE_MS), T) === 0,
   'an expired sweep lease is free');
// A doc written before the field existed must not be readable as an
// unbounded hold.
ok(judgeLeaseWaitMs(running(T - JUDGE_LEASE_MS - 1, 0), T) === 0, 'a missing lease falls back to the short one');
ok(judgeLeaseWaitMs(running(T - SWEEP_LEASE_MS - 1, 99 * SWEEP_LEASE_MS), T) === 0,
   'a forged huge lease is capped');

// ── which rooms get another panel ───────────────────────────────────
const OLD = RECOVERY_GRACE_MS + 60_000;
const row = (id, data) => ({ id, data });
const pending = (agoMs, extra = {}) => ({ ballotPending: true, ballotPendingAt: T - agoMs, ...extra });

let r = selectSweepTargets([row('a', pending(OLD))], T);
ok(r.batch.length === 1 && r.batch[0].room === 'a', 'a stuck round is picked up');

r = selectSweepTargets([row('a', pending(OLD, { ballot: { winner: 'pro' } }))], T);
ok(r.batch.length === 0, 'a decided round is never re-judged');

r = selectSweepTargets([row('a', pending(OLD, { ballotUnresolved: { resolution: 'unresolved' } }))], T);
ok(r.batch.length === 0, 'a real no-winner result is left alone');

// The grace window is what stops the sweep racing the finishing browser.
r = selectSweepTargets([row('a', pending(RECOVERY_GRACE_MS - 5_000))], T);
ok(r.batch.length === 0 && r.skipped.tooYoung === 1, 'the finishing browser keeps its grace window');

r = selectSweepTargets([row('a', { ...pending(OLD), ...running(T - 1000, SWEEP_LEASE_MS) })], T);
ok(r.batch.length === 0 && r.skipped.leased === 1, 'a room mid-panel is not claimed twice');

r = selectSweepTargets([row('a', pending(OLD, { serverJudgeAttempt: 99 }))], T);
ok(r.batch.length === 0, 'a round that has already burned its attempts stops costing provider calls');

r = selectSweepTargets([row('a', pending(400 * 24 * 3600 * 1000))], T);
ok(r.batch.length === 0, 'an ancient orphan is not retried forever');

r = selectSweepTargets([row('a', { ballotPending: true })], T);
ok(r.batch.length === 0 && r.skipped.noStamp === 1, 'a row with no pending stamp is skipped');

// Bounded fan-out: a backlog must not become one enormous provider bill.
const many = Array.from({ length: 20 }, (_, i) => row('r' + i, pending(OLD + i * 1000)));
r = selectSweepTargets(many, T);
ok(r.due.length === 20, 'all stuck rounds are counted');
ok(r.batch.length <= 3, 'the run is bounded');
ok(r.batch[0].room === 'r19', 'the longest-waiting round goes first');

console.log(`[test-ballot-sweep] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
