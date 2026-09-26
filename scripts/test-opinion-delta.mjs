import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { memoryFirestore } from './lib/memory-firestore.mjs';
import * as sway from '../app/netlify/functions/lib/sway.mjs';

// Run the shipped HTTP handler, replacing only infrastructure boundaries.
const source = readFileSync(new URL('../app/netlify/functions/log-opinion-delta.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async', 'globalThis.handler = async')
  .replace('export const config', 'const config');
function fixture() {
  const f = memoryFirestore();
  let failCommit = false, uid = null;
  const collection = name => ({ doc(id = randomUUID()) {
    const ref = f.db.collection(name).doc(id);
    return { ...ref, id, collection: child => collection(name + '/' + id + '/' + child) };
  } });
  const db = { collection, runTransaction: fn => f.db.runTransaction(async tx => {
    const result = await fn({ ...tx, set(ref, value, options) {
      const resolved = Object.fromEntries(Object.entries(value).map(([key, v]) => [key,
        v && v.increment ? Number(f.data.get(ref.path)?.[key] || 0) + v.increment : v]));
      tx.set(ref, resolved, options);
    } });
    if (failCommit) { failCommit = false; throw new Error('Simulated commit failure'); }
    return result;
  }) };
  const context = vm.createContext({ ...sway, createHash, getDb: () => db,
    FieldValue: { serverTimestamp: () => Date.now(), increment: n => ({ increment: n }) },
    extractBearerToken: () => uid, verifyIdToken: async () => ({ sub: uid }),
    checkAppCheck: async () => ({ ok: true }),
    corsResponse: () => new Response(null, { status: 204 }),
    jsonResponse: (body, status) => Response.json(body, { status }),
    errorResponse: (error, status) => Response.json({ error }, { status }),
    console: { log() {}, error() {} }, setInterval: () => ({ unref() {} }),
  });
  vm.runInContext(source, context);
  return { ...f, fail: () => { failCommit = true; }, signIn: user => { uid = user; },
    async send(body) {
      const res = await context.handler(new Request('https://test/api/log-opinion-delta', {
        method: 'POST', body: JSON.stringify({ anonId: 'viewer-session', ...body }),
      }));
      return { status: res.status, ...await res.json() };
    },
  };
}
const roomFor = arm => Array.from({ length: 100 }, (_, i) => 'room-' + i)
  .find(room => sway.assignArm(room, 'viewer-session') === arm);
const opening = (arm = 'exposed') => ({ action: 'create', requestId: randomUUID(), roundId: roomFor(arm),
  motion: 'Cities should make buses free.', format: 'open', sideBefore: 'pro', confBefore: 70 });
const closing = id => ({ action: 'update', id, sideAfter: 'con', confAfter: 80, watchMs: 120000,
  movedAt: [20000, 60000], whys: [{ at: 60000, text: 'The funding argument' }] });

for (const arm of ['exposed', 'holdout']) {
  const f = fixture(), payload = opening(arm);
  const results = await Promise.all([f.send(payload), f.send(payload), f.send(payload)]);
  assert(results.every(r => r.ok && r.id === results[0].id));
  const id = results[0].id;
  assert.equal([...f.data.keys()].filter(k => k.startsWith('opinion_deltas/')).length, 1);
  assert.equal(f.data.get('opinion_deltas/' + id).sideBefore, arm === 'exposed' ? 'pro' : null);
  if (arm === 'exposed') assert.equal(f.data.get('sway_rounds/' + payload.roundId).tally.pre.pro, 1);
  const closed = await Promise.all([f.send(closing(id)), f.send(closing(id)), f.send(closing(id))]);
  assert.equal(closed.filter(r => r.counted).length, 1, 'concurrent closing votes count once');
  assert.equal(f.data.get('sway_voters/viewer-session').roundsVoted, 1);
  assert.equal(f.data.get('sway_rounds/' + payload.roundId).tally[arm === 'exposed' ? 'counted' : 'holdoutCounted'], 1);
  await f.send({ action: 'update', id, movedAt: [20000] });
  assert.deepEqual(f.data.get('opinion_deltas/' + id).movedAt, [20000, 60000], 'late flush cannot erase final flags');
  assert.equal((await f.send({ ...closing(id), anonId: 'someone-else' })).status, 404);
}
{
  const f = fixture(), payload = opening();
  f.fail();
  assert.equal((await f.send(payload)).status, 500);
  assert.equal(f.data.size, 0, 'opening and tally roll back together');
  const { id } = await f.send(payload);
  f.fail();
  assert.equal((await f.send(closing(id))).status, 500);
  assert.equal(f.data.get('opinion_deltas/' + id).sideAfter, null);
  assert.equal(f.data.get('sway_rounds/' + payload.roundId).tally.counted, 0);
  assert.equal(f.data.has('sway_voters/viewer-session'), false);
  assert.equal((await f.send(closing(id))).counted, true, 'same answer can retry a failed commit');
  assert.equal(f.data.get('sway_rounds/' + payload.roundId).tally.counted, 1);
}
{
  const f = fixture();
  const { id } = await f.send(opening());
  assert.equal((await f.send({ ...closing(id), watchMs: 1 })).counted, false);
  assert.equal(f.data.get('opinion_deltas/' + id).sideAfter, 'con', 'saved does not promise counted');
  assert.equal((await f.send({ ...opening(), requestId: '../../bad' })).status, 400);
  const legacy = opening(); delete legacy.requestId;
  assert.equal((await f.send(legacy)).ok, true, 'existing clients can still save');
}
for (const staked of [false, true]) {
  const f = fixture(), payload = opening();
  f.signIn('signed-viewer');
  if (staked) f.data.set('floor_markets/' + payload.roundId + '/positions/signed-viewer', { points: 1 });
  const { id } = await f.send(payload);
  assert.equal((await f.send(closing(id))).counted, !staked, 'signed-in eligibility keeps the existing stake exclusion');
  assert.equal(f.data.get('opinion_deltas/' + id).uid, 'signed-viewer');
  const other = await f.send({ ...payload, roundId: 'different-round' });
  assert.notEqual(id, other.id, 'a request identity is scoped to the round');
}
console.log('Opinion response saves: idempotency, concurrent closing, ownership, rollback, holdout and legacy checks passed');
