// Offline handler regressions. No credentials, network, or production writes.
// Run: node scripts/test-predict-settlement.mjs [path/to/predict.mjs]
// The double models optimistic retries, query conflicts, read-before-write,
// and atomic commit failure. It is not a substitute for the Firestore SDK.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sourcePath = process.argv[2] || fileURLToPath(new URL('../app/netlify/functions/predict.mjs', import.meta.url));
const source = readFileSync(sourcePath, 'utf8').replace(/^import .*;\s*$/gm, '').replace('export default async', 'return async');
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const MARKET = 'predict_markets/round';
const JUDGMENT = 'judgments/live_round';
const BALANCE = (uid) => `predict_balances/${uid}`;
const LEADERBOARD = (uid) => `predict_leaderboard/${uid}`;
const fieldValue = {
  increment: (amount) => ({ _op: 'increment', amount }),
  serverTimestamp: () => ({ _op: 'timestamp' }),
};

class MemoryDb {
  constructor() {
    this.docs = new Map();
    this.versions = new Map();
    this.readLog = [];
    this.retries = 0;
    this.commits = 0;
  }
  seed(path, data) {
    this.docs.set(path, clone(data));
    this.versions.set(path, (this.versions.get(path) || 0) + 1);
  }
  data(path) { return clone(this.docs.get(path)); }
  snapshot() { return clone([...this.docs.entries()].sort(([a], [b]) => a.localeCompare(b))); }
  collection(path) { return this.query(path); }
  query(path, filters = [], maximum = Infinity) {
    return {
      path, isQuery: true, filters, maximum,
      doc: (id) => this.ref(`${path}/${id}`),
      get: () => this.read(this.query(path, filters, maximum)),
      orderBy: () => this.query(path, filters, maximum),
      limit: (n) => this.query(path, filters, n),
      where: (field, op, value) => {
        assert.equal(op, '==');
        return this.query(path, [...filters, [field, value]], maximum);
      },
    };
  }
  ref(path) {
    return {
      path, id: path.split('/').at(-1),
      collection: (name) => this.collection(`${path}/${name}`),
      get: () => this.read(this.ref(path)),
      set: (data, options) => this.commit([{ type: 'set', path, data, options }]),
      update: (data) => this.commit([{ type: 'update', path, data }]),
      create: (data) => this.commit([{ type: 'create', path, data }]),
    };
  }
  members(ref) {
    return [...this.docs.keys()].filter((path) => path.startsWith(`${ref.path}/`) && !path.slice(ref.path.length + 1).includes('/'))
      .filter((path) => ref.filters.every(([field, value]) => this.docs.get(path)[field] === value)).sort().slice(0, ref.maximum);
  }
  version(ref) {
    return ref.isQuery ? this.members(ref).map((path) => `${path}:${this.versions.get(path)}`).join('|') : (this.versions.get(ref.path) || 0);
  }
  async read(ref, transaction = false) {
    this.readLog.push(ref.path);
    if (this.failNextRead === ref.path) {
      this.failNextRead = null;
      throw new Error('injected read failure');
    }
    const version = this.version(ref);
    const docSnapshot = (path) => {
      const data = this.data(path);
      return { exists: data !== undefined, id: path.split('/').at(-1), ref: this.ref(path), data: () => clone(data) };
    };
    const docs = ref.isQuery ? this.members(ref).map(docSnapshot) : null;
    const result = ref.isQuery ? { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) } : docSnapshot(ref.path);
    result.readVersion = version;
    if (this.afterRead) await this.afterRead({ ref, transaction, result });
    return result;
  }
  writer(writes) {
    const writer = {};
    for (const type of ['set', 'update', 'create']) {
      writer[type] = (ref, data, options) => {
        writes.push({ type, path: ref.path, data: clone(data), options });
        return writer;
      };
    }
    return writer;
  }
  batch() {
    const writes = [];
    return { ...this.writer(writes), commit: () => this.commit(writes) };
  }
  async commit(writes, reads = []) {
    // Validate all reads before preparing any effect, then swap the complete
    // document map only after every write and the simulated commit succeed.
    if (reads.some(([ref, version]) => this.version(ref) !== version)) return false;
    const next = clone(this.docs);
    for (const { type, path, data, options } of writes) {
      if (type === 'update' && !next.has(path)) throw new Error('missing update target');
      if (type === 'create' && next.has(path)) throw Object.assign(new Error('already exists'), { code: 6 });
      const old = next.get(path) || {};
      const value = type === 'update' || options?.merge ? clone(old) : {};
      for (const [key, item] of Object.entries(data)) {
        value[key] = item?._op === 'increment' ? (typeof old[key] === 'number' ? old[key] : 0) + item.amount
          : item?._op === 'timestamp' ? 1700000000000 : clone(item);
      }
      next.set(path, value);
    }
    if (writes.length && this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error('injected commit failure');
    }
    this.docs = next;
    for (const { path } of writes) this.versions.set(path, (this.versions.get(path) || 0) + 1);
    if (writes.length) this.commits++;
    return true;
  }
  async runTransaction(callback) {
    for (let attempt = 0; attempt < 32; attempt++) {
      const reads = [], writes = [];
      const tx = {
        ...this.writer(writes),
        get: async (ref) => {
          assert.equal(writes.length, 0, 'Firestore transactions must read before writing');
          const snapshot = await this.read(ref, true);
          reads.push([ref, snapshot.readVersion]);
          return snapshot;
        },
      };
      const result = await callback(tx);
      if (await this.commit(writes, reads)) return result;
      this.retries++;
    }
    throw new Error('transaction retry limit');
  }
}

function handler(db) {
  const dependencies = {
    verifyIdToken: async (uid) => ({ sub: uid, name: uid }),
    extractBearerToken: (request) => request.uid,
    corsResponse: () => ({ status: 204 }),
    jsonResponse: (body, status) => ({ body, status }),
    errorResponse: (error, status) => ({ body: { error }, status }),
    getDb: () => db, FieldValue: fieldValue,
    checkWagerEligibility: async () => ({ ok: true }),
    checkWagerAge: async () => ({ ok: true }),
    invalidateWagerEligibility: () => {}, MINOR_AGE_RANGES: new Set(),
    judgmentId: (kind, room) => `${kind}_${room}`,
  };
  return new Function(...Object.keys(dependencies), source)(...Object.values(dependencies));
}

function fixture(judgment = null, { empty = false } = {}) {
  const db = new MemoryDb();
  db.seed(MARKET, {
    room: 'round', proUid: 'participant-a', conUid: 'participant-b',
    status: 'open', liveKey: 'live_open', lockAt: Date.now() + 3600000,
    poolPro: empty ? 0 : 10, poolCon: empty ? 0 : 10, betCount: empty ? 0 : 2,
  });
  if (!empty) {
    for (const [uid, pick] of [['backer-pro', 'pro'], ['backer-con', 'con']]) {
      db.seed(`${MARKET}/bets/${uid}`, { uid, name: uid, pick, stake: 10 });
      db.seed(BALANCE(uid), { balance: 90 });
      db.seed(LEADERBOARD(uid), { uid, name: uid, rating: 1000, bets: 0, wins: 0, net: 0 });
    }
  }
  if (judgment) db.seed(JUDGMENT, judgment);
  const run = handler(db);
  const request = async (action, body = {}, uid = 'participant-a') => {
    try { return await run({ method: 'POST', uid, json: async () => ({ action, room: 'round', ...body }) }, {}); }
    catch (error) { return { status: 500, body: { error: String(error.message || error) } }; }
  };
  return { db, request };
}

function pauseNextRead(db, path) {
  let reached, release;
  const waiting = new Promise((resolve) => { reached = resolve; });
  const released = new Promise((resolve) => { release = resolve; });
  let used = false;
  db.afterRead = async ({ ref }) => {
    if (ref.path !== path || used) return;
    used = true;
    reached();
    await released;
  };
  return { waiting, release };
}
const serverWinner = { verdictSource: 'server', winner: 'a', sideLabels: { a: 'pro', b: 'con' } };
const tests = [];
const test = (name, run) => tests.push({ name, run });
const success = (result) => assert.equal(result.status, 200, JSON.stringify(result.body));

test('simultaneous participant refunds return every stake once', async () => {
  const { db, request } = fixture();
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => request('settle', {}, i % 2 ? 'participant-b' : 'participant-a')));
  results.forEach(success);
  assert.equal(db.data(BALANCE('backer-pro')).balance, 100);
  assert.equal(db.data(BALANCE('backer-con')).balance, 100);
  assert.equal(db.data(MARKET).status, 'voided');
  assert.equal(db.data(LEADERBOARD('backer-pro')).bets, 0);
  assert.equal(results.filter((r) => !r.body.already).length, 1);
  assert.ok(db.retries > 0, 'concurrent settlement must exercise retry behavior');
});

test('simultaneous payouts change balances and leaderboard once', async () => {
  const { db, request } = fixture(serverWinner);
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => request('settle', {}, i % 2 ? 'participant-b' : 'participant-a')));
  results.forEach(success);
  assert.equal(db.data(BALANCE('backer-pro')).balance, 110);
  assert.equal(db.data(BALANCE('backer-con')).balance, 90);
  for (const [uid, expected] of [['backer-pro', { rating: 1021, bets: 1, wins: 1, net: 10 }], ['backer-con', { rating: 979, bets: 1, wins: 0, net: -10 }]]) {
    const row = db.data(LEADERBOARD(uid));
    for (const [key, value] of Object.entries(expected)) assert.equal(row[key], value, `${uid}.${key}`);
  }
  assert.equal(db.data(MARKET).verdict, 'pro');
  assert.equal(results.filter((r) => !r.body.already).length, 1);
});

for (const [label, judgment] of [['refund', null], ['payout', serverWinner]]) {
  test(`retry after a lost ${label} response is a read-only success`, async () => {
    const { db, request } = fixture(judgment);
    success(await request('settle'));
    const before = db.snapshot();
    const result = await request('settle');
    success(result);
    assert.equal(result.body.already, true);
    assert.deepEqual(db.snapshot(), before);
  });
  test(`failed ${label} commit has no partial effects and remains retryable`, async () => {
    const { db, request } = fixture(judgment);
    const before = db.snapshot();
    db.failNextCommit = true;
    assert.ok((await request('settle')).status >= 500);
    assert.deepEqual(db.snapshot(), before);
    success(await request('settle'));
    assert.equal(db.data(BALANCE('backer-pro')).balance, judgment ? 110 : 100);
  });
  test(`stale lock request cannot reopen a ${label} market`, async () => {
    const { db, request } = fixture(judgment);
    const pause = pauseNextRead(db, MARKET);
    const lock = request('lock');
    await pause.waiting;
    try { success(await request('settle')); } finally { pause.release(); }
    success(await lock);
    assert.equal(db.data(MARKET).status, judgment ? 'settled' : 'voided');
    success(await request('settle'));
    assert.equal(db.data(BALANCE('backer-pro')).balance, judgment ? 110 : 100);
  });
}

for (const [label, judgment] of [
  ['missing', null], ['participant supplied', { verdictSource: 'participant', winner: 'a' }],
  ['tied', { verdictSource: 'server', winner: null }], ['invalid side', { verdictSource: 'server', winner: 'a', sideLabels: { a: 'unknown' } }],
]) {
  test(`${label} verdict refunds without using caller verdict or ratings`, async () => {
    const { db, request } = fixture(judgment);
    success(await request('settle', { verdict: 'con' }));
    assert.equal(db.data(MARKET).status, 'voided');
    assert.equal(db.data(BALANCE('backer-pro')).balance, 100);
    assert.equal(db.data(BALANCE('backer-con')).balance, 100);
    assert.equal(db.data(LEADERBOARD('backer-pro')).rating, 1000);
  });
}

test('server side labels determine payout, even when sides are reversed', async () => {
  const { db, request } = fixture({ verdictSource: 'server', winner: 'a', sideLabels: { a: 'con', b: 'pro' } });
  success(await request('settle', { verdict: 'pro' }));
  assert.equal(db.data(MARKET).verdict, 'con');
  assert.equal(db.data(BALANCE('backer-pro')).balance, 90);
  assert.equal(db.data(BALANCE('backer-con')).balance, 110);
});

test('judgment read failure leaves all stakes held for a later retry', async () => {
  const { db, request } = fixture(serverWinner);
  const before = db.snapshot();
  db.failNextRead = JUDGMENT;
  assert.ok((await request('settle')).status >= 500);
  assert.deepEqual(db.snapshot(), before);
  success(await request('settle'));
  assert.equal(db.data(BALANCE('backer-pro')).balance, 110);
});

test('unauthorized and missing-market requests cannot mutate balances', async () => {
  const { db, request } = fixture(serverWinner);
  const before = db.snapshot();
  assert.equal((await request('settle', {}, 'stranger')).status, 403);
  assert.equal((await request('lock', {}, 'stranger')).status, 403);
  assert.equal((await request('settle', { room: 'missing' })).status, 404);
  assert.equal((await request('settle', {}, null)).status, 401);
  assert.deepEqual(db.snapshot(), before);
});

test('a delayed duplicate open cannot overwrite an already settled market', async () => {
  const { db, request } = fixture(serverWinner);
  const path = 'predict_markets/new-round';
  const body = { room: 'new-round', proUid: 'participant-a', conUid: 'participant-b' };
  db.seed('judgments/live_new-round', serverWinner);
  const pause = pauseNextRead(db, path);
  const delayedOpen = request('open', body);
  await pause.waiting;
  try {
    success(await request('open', body));
    success(await request('settle', { room: 'new-round' }));
  } finally { pause.release(); }
  success(await delayedOpen);
  assert.equal(db.data(path).status, 'settled');
});

test('a delayed first balance request cannot replace a concurrent stake debit', async () => {
  const { db, request } = fixture(serverWinner, { empty: true });
  const pause = pauseNextRead(db, BALANCE('new-backer'));
  const delayedState = request('state', {}, 'new-backer');
  await pause.waiting;
  try { success(await request('bet', { pick: 'pro', stake: 10 }, 'new-backer')); }
  finally { pause.release(); }
  success(await delayedState);
  assert.equal(db.data(BALANCE('new-backer')).balance, 990);
  assert.equal(db.data(`${MARKET}/bets/new-backer`).stake, 10);
});

test('a bet that commits while settlement reads is included in the final pool', async () => {
  const { db, request } = fixture(serverWinner);
  db.seed(BALANCE('late-backer'), { balance: 100 });
  const pause = pauseNextRead(db, MARKET);
  const settlement = request('settle');
  await pause.waiting;
  try { success(await request('bet', { pick: 'pro', stake: 10 }, 'late-backer')); }
  finally { pause.release(); }
  success(await settlement);
  // Final pool is 20 pro / 10 con, so each winning 10-point stake pays 15.
  assert.equal(db.data(BALANCE('backer-pro')).balance, 105);
  assert.equal(db.data(BALANCE('late-backer')).balance, 105);
  assert.equal(db.data(MARKET).poolPro, 20);
  assert.equal(db.data(LEADERBOARD('late-backer')).bets, 1);
});

test('a bet still pending when settlement commits is rejected without debit', async () => {
  const { db, request } = fixture(serverWinner);
  db.seed(BALANCE('late-backer'), { balance: 100 });
  const pause = pauseNextRead(db, MARKET);
  const bet = request('bet', { pick: 'pro', stake: 10 }, 'late-backer');
  await pause.waiting;
  try { success(await request('settle')); } finally { pause.release(); }
  assert.equal((await bet).status, 400);
  assert.equal(db.data(BALANCE('late-backer')).balance, 100);
  assert.equal(db.data(`${MARKET}/bets/late-backer`), undefined);
  assert.equal(db.data(MARKET).poolPro, 10);
});

let failed = 0;
for (const { name, run } of tests) {
  let timer;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('test timed out')), 5000); }),
    ]);
    console.log(`PASS ${name}`);
  }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack || error}`); }
  finally { clearTimeout(timer); }
}
console.log(`\npredict-settlement: ${tests.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
