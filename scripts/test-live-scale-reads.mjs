import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../app/spar.html', import.meta.url), 'utf8');
const source = page.slice(page.indexOf('  function tryMatch(){'), page.indexOf('\n  // 2026-05-18:', page.indexOf('  function tryMatch(){')));
let time = 1_800_000_000_000;
function client() {
  const f = { reads: 0, pairs: 0, state: { user: { uid: 'me' }, queueSnapshotAt: time, queueSnapshot: { docs: [{ id: 'peer', data: () => ({}) }] } },
    firebaseDb: {}, Date: { now: () => time }, Promise, setTimeout, clearTimeout, console,
    waitingQueueQuery: () => ({ get: async () => { f.reads++; return f.state.queueSnapshot; } }),
    queuePeerCanMatch: () => true, setQuietQueue() {}, document: { getElementById: () => null }, updateDiag() {},
    orderMatchCandidates: async peers => peers, attemptMatch: () => { f.pairs++; }, matchProfile: null };
  vm.createContext(f); vm.runInContext(source, f); return f;
}
const clients = Array.from({ length: 100 }, client);
for (let i = 0; i < 4; i++) {
  // Active listener delivery stays healthy during an arrival burst.
  for (const f of clients) f.state.queueSnapshotAt = time;
  await Promise.all(clients.flatMap(f => [f.tryMatch(), f.tryMatch(), f.tryMatch()]));
  time += 15_000;
}
assert.equal(clients.reduce((n,f) => n+f.reads,0), 0, '100 healthy listeners reuse candidates through 400 fallback ticks');
assert.equal(clients.reduce((n,f) => n+f.pairs,0), 400, 'overlapping notifications coalesce before ranking');
time += 45_000;
await Promise.all(clients.map(f => f.tryMatch()));
assert.equal(clients.reduce((n,f) => n+f.reads,0), 100, 'stalled listeners refresh once per client');
const f = client(); f.state.queueSnapshotAt = 0;
let release; f.waitingQueueQuery = () => ({ get: () => { f.reads++; return new Promise(resolve => { release=resolve; }); } });
const pending = f.tryMatch(); await f.tryMatch();
assert.equal(f.reads, 1, 'an in-flight fallback cannot fan out');
f.state.cancelled = true; release(f.state.queueSnapshot); await pending;
assert.equal(f.pairs, 0, 'leaving during a read cannot propose a match');
const ineligible = client(); ineligible.queuePeerCanMatch = () => false;
await ineligible.tryMatch();
assert.equal(ineligible.state.waitingPeers, 0, 'ineligible peers are excluded from the count');
assert.equal(ineligible.pairs, 0, 'ineligible peers cannot be proposed from the cached snapshot');
console.log('[test-live-scale-reads] 100-client listener burst, stale fallback, coalescing and cancellation passed');
