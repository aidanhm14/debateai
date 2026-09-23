import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryFirestore } from './lib/memory-firestore.mjs';
import { createRecoveryQueue, retryDelayMs, DISPATCH_LEASE_MS, WORKER_LEASE_MS } from '../app/netlify/functions/lib/ballot-recovery.mjs';
import worker, { config } from '../app/netlify/functions/ballot-recovery-background.mjs';

process.env.INTERNAL_JUDGE_KEY = 'test-recovery-key-never-production';
let clock = 1_800_000_000_000;
const pending = extra => ({ proUid: 'pro-seat', conUid: 'con-seat', ballotPending: true, ballotPendingAt: clock - 100_000, ...extra });
const setup = (rows = [['room', pending()]]) => {
  const f = memoryFirestore(rows.map(([id, data]) => ['live_rounds/' + id, data]));
  f.queue = createRecoveryQueue({ db: f.db, documentId: '__name__', now: () => clock });
  return f;
};
const sendTo = jobs => async job => { jobs.push(job); };
const decide = f => async request => {
  const { room } = await request.json();
  assert.equal(request.headers.get('x-internal-judge-key'), process.env.INTERNAL_JUDGE_KEY);
  f.data.set('live_rounds/' + room, { ...f.data.get('live_rounds/' + room), ballotPending: false, ballot: { winner: 'pro' } });
  return Response.json({ ballot: { winner: 'pro' } });
};
assert.equal(config.background, true, 'patient judge is deployed in background mode');
const trigger = readFileSync(new URL('../app/netlify/functions/scheduled-ballot-sweep.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(trigger, /await\s+judgeHandler/, 'schedule never waits for a panel');
assert.match(trigger, /AbortSignal\.timeout\(8_000\)/, 'dispatch network wait is bounded');
// Neither malformed nor unauthorized requests can even initialize Firestore.
await worker(new Request('https://test/worker', { method: 'POST', body: '{}' }));
await worker(new Request('https://test/worker', { method: 'POST', headers: { 'x-internal-judge-key': process.env.INTERNAL_JUDGE_KEY }, body: 'bad json' }));

let f = setup(), jobs = [];
await Promise.all(Array.from({ length: 20 }, () => f.queue.dispatch(sendTo(jobs))));
assert.equal(jobs.length, 1, 'overlapping triggers enqueue a room once');
let release;
const gate = new Promise(resolve => { release = resolve; });
let panels = 0;
const slowJudge = async request => { panels++; await gate; return decide(f)(request); };
const first = f.queue.run(jobs[0], slowJudge);
await new Promise(resolve => setImmediate(resolve));
assert.equal((await f.queue.run(jobs[0], slowJudge)).code, 'stale_or_running');
clock += 90_000;
await f.queue.dispatch(sendTo(jobs));
assert.equal(jobs.length, 1, 'a 90-second panel retains its slot');
release();
assert.equal((await first).code, 'decided');
assert.equal(panels, 1, 'duplicate delivery never buys another panel');
assert.equal((await f.queue.run(jobs[0], slowJudge)).code, 'stale_or_running');

f = setup(); jobs = [];
await f.queue.dispatch(sendTo(jobs));
const failed = await f.queue.run(jobs[0], async () => Response.json({ code: 'judge_incomplete', retryAfterMs: 30_000 }, { status: 202 }));
assert.equal(failed.code, 'judge_incomplete');
assert.equal(f.data.get('ballot_recovery/slot:0').expiresAt, 0);
await f.queue.dispatch(sendTo(jobs));
assert.equal(jobs.length, 1, 'incomplete panel waits for durable retry delay');
clock += 60_001;
await f.queue.dispatch(sendTo(jobs));
assert.equal(jobs.length, 2);
await assert.rejects(f.queue.run(jobs[1], async () => { throw new Error('provider unavailable'); }));
assert.equal(f.data.get('ballot_recovery/job:room').lastCode, 'worker_failed');
assert.equal(f.data.get('ballot_recovery/job:room').nextAttemptAt, clock + 120_000);
assert.equal(retryDelayMs(100), 900_000, 'backoff is capped');

f = setup(); jobs = [];
await f.queue.dispatch(async job => { jobs.push(job); throw new Error('lost acknowledgement'); });
await f.queue.dispatch(sendTo(jobs));
assert.equal(jobs.length, 1, 'uncertain delivery keeps its reservation');
clock += DISPATCH_LEASE_MS + 1;
await f.queue.dispatch(sendTo(jobs));
assert.equal(jobs.length, 2, 'lost dispatch is retried after its lease');
assert.equal((await f.queue.run(jobs[0], decide(f))).code, 'stale_or_running', 'late worker cannot use replaced token');
await f.queue.run(jobs[1], decide(f));

// Forty abandoned documents before fifty legitimate rooms used to starve
// every later room. Exercise cursor wrap and completed-document removal.
f = setup([
  ...Array.from({ length: 40 }, (_, i) => ['a' + String(i).padStart(3, '0'), pending({ serverJudgeAttempt: 99 })]),
  ...Array.from({ length: 50 }, (_, i) => ['b' + String(i).padStart(3, '0'), pending()]),
]);
let recovered = 0, maxParallel = 0;
for (let tick = 0; tick < 100 && recovered < 50; tick++) {
  jobs = [];
  await f.queue.dispatch(sendTo(jobs));
  maxParallel = Math.max(maxParallel, jobs.length);
  recovered += jobs.length;
  await Promise.all(jobs.map(job => f.queue.run(job, decide(f))));
  clock += 60_000;
}
assert.equal(recovered, 50, 'all eligible rooms beyond the old scan window recover');
assert.ok(maxParallel <= 3, 'global worker limit remains bounded');
assert.equal([...f.data].filter(([k,v]) => k.startsWith('live_rounds/b') && v.ballot).length, 50);
assert.ok(WORKER_LEASE_MS > 2 * 90_000, 'worker lease covers patient panel and fallback');
console.log('[test-ballot-recovery-worker] dispatch, auth, duplicate delivery, slow panels, backoff, lost jobs and 50-room backlog passed');
