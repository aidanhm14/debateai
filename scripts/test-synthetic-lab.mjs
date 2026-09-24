import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { authConfig, verifyPassword, issueSession, readSession, sessionCookie, COOKIE } from '../app/netlify/functions/lib/synthetic-lab-auth.mjs';
import { hash, RUBRIC, VERSION, DIMENSIONS, SPEECH_SCHEMA, validateExamples, validateJudgment, exportData, reviewTemplate, splitFor, repairPrompt, scorePredictions } from '../app/netlify/functions/lib/synthetic-lab-core.mjs';
import { advance, EXAMPLES, LAB_CONFIG, providerCall } from '../app/netlify/functions/lib/synthetic-lab-engine.mjs';
import { createHandler } from '../app/netlify/functions/synthetic-lab.mjs';

const salt = randomBytes(16).toString('hex');
const auth = { salt, hash: scryptSync('test-password', salt, 32).toString('hex'), key: randomBytes(32).toString('hex') };
process.env.SYNTHETIC_LAB_AUTH = JSON.stringify(auth);
process.env.OPENAI_API_KEY = 'test-openai'; process.env.ANTHROPIC_API_KEY = 'test-anthropic';
const id = '11111111-1111-1111-1111-111111111111';
const makeJob = () => ({ id, version: VERSION, rubricHash: hash(RUBRIC), example: EXAMPLES[0], config: { ...LAB_CONFIG, recordId: id }, variant: 0, calls: [], attempts: 0, createdAt: Date.now(), status: 'paused', lease: null });
async function mockCall(role, prompt, schema) {
  let result;
  if (schema.properties.preferred) result = { preferred: role === 'judgeA' ? 'B' : 'A', reason: 'The revision states a mechanism and qualifies its uncertain consequences.' };
  else if (schema.properties.text) result = { text: role === 'repair' ? 'Removing the fare directly helps existing riders. Any traffic benefit also depends on reliability and drivers switching.' : 'Removing fares helps current riders. It will solve traffic by itself.' };
  else result = { winner: 'con', decidingIssue: 'Whether removing fares changes drivers\' behavior.', rationale: 'The traffic claim has no mechanism connecting lower fares to drivers switching.', scores: Object.fromEntries(['pro', 'con'].map(side => [side, Object.fromEntries(DIMENSIONS.map(d => [d, 6]))])), mistakes: [{ turnId: 't1', tag: 'missing_mechanism', quote: 'It will solve traffic by itself.', explanation: 'The speaker did not explain why drivers would switch.', severity: 'major' }], factualChecksNeeded: [] };
  return { result, meta: { role, model: 'test', promptHash: hash(prompt) } };
}
async function completedJob(family) {
  let job = makeJob(); if (family) job.example = { ...job.example, family };
  while (job.status !== 'complete') job = { ...job, ...await advance(job, mockCall) };
  return job;
}
function approved(record) { return { ...reviewTemplate(record), status: 'approved', reviewer: 'test reviewer', factualChecksResolved: true, finalJudgment: structuredClone(record.judgments[0].judgment), approvedRepairIds: record.repairs.map(r => r.id) }; }

// A serialized transaction fake exercises authentication, limits and stale-step handling
// without making provider requests or touching a real database.
function memoryDb() {
  const data = new Map(); let queue = Promise.resolve();
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const snapshot = key => ({ exists: data.has(key), data: () => clone(data.get(key)) });
  const doc = key => ({ key, get: async () => snapshot(key), update: async values => data.set(key, { ...data.get(key), ...clone(values) }) });
  return {
    data,
    collection(name) {
      const state = { predicate: () => true, order: null, max: Infinity };
      const query = { doc: key => doc(`${name}/${key}`), where: (key, op, value) => { state.predicate = row => row[key] === value; return query; }, orderBy: (key, direction) => { state.order = [key, direction]; return query; }, limit: max => { state.max = max; return query; }, get: async () => {
        let rows = [...data].filter(([k, v]) => k.startsWith(name + '/') && state.predicate(v));
        if (state.order) rows.sort((a, b) => (a[1][state.order[0]] - b[1][state.order[0]]) * (state.order[1] === 'desc' ? -1 : 1));
        return { docs: rows.slice(0, state.max).map(([key]) => snapshot(key)) };
      } }; return query;
    },
    runTransaction(fn) {
      const operation = queue.then(async () => {
        const writes = [];
        const tx = { get: async ref => snapshot(ref.key), set: (ref, values) => writes.push(() => data.set(ref.key, clone(values))), create: (ref, values) => writes.push(() => { assert(!data.has(ref.key)); data.set(ref.key, clone(values)); }), update: (ref, values) => writes.push(() => data.set(ref.key, { ...data.get(ref.key), ...clone(values) })) };
        const result = await fn(tx); writes.forEach(write => write()); return result;
      });
      queue = operation.catch(() => {}); return operation;
    },
  };
}
function request(body, { cookie = true, origin = 'https://itsdebatable.com', query = '' } = {}) {
  const headers = {}; if (cookie) headers.cookie = COOKIE + '=' + issueSession(auth);
  if (body) { headers.origin = origin; headers['content-type'] = 'application/json'; }
  return new Request('https://itsdebatable.com/api/synthetic-lab' + query, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
}

test('server password verification, cookie flags, expiry and tamper resistance', async () => {
  assert(authConfig()); assert(await verifyPassword('test-password', auth)); assert.equal(await verifyPassword('wrong', auth), false);
  const now = Date.now(), token = issueSession(auth, now), cookie = sessionCookie(token);
  assert(cookie.includes('HttpOnly') && cookie.includes('Secure') && cookie.includes('SameSite=Strict'));
  assert(readSession(cookie, auth, now)); assert.equal(readSession(cookie, auth, now + 9 * 3600000), null);
  assert.equal(readSession(COOKIE + '=' + token + 'x', auth, now), null); assert.equal(authConfig('{}'), null);
});
test('all data, generation and export routes refuse unauthenticated callers before database access', async () => {
  const handler = createHandler({ database: () => { throw new Error('must not access DB'); } });
  for (const body of [null, { action: 'create' }, { action: 'step', id }, { action: 'review', id }, { action: 'export' }]) assert.equal((await handler(request(body, { cookie: false }))).status, 401);
  assert.equal((await handler(request(null, { cookie: false, query: '?id=' + id + '&raw=1' }))).status, 401);
  assert.equal((await handler(request({ action: 'create' }, { origin: 'https://evil.example' }))).status, 403);
});
test('login is transactional and rate limited across requests', async () => {
  const db = memoryDb(), handler = createHandler({ database: () => db });
  const ok = await handler(request({ action: 'login', password: 'test-password' }, { cookie: false }));
  assert.equal(ok.status, 200); assert(ok.headers.get('set-cookie').includes('HttpOnly'));
  for (let n = 0; n < 7; n++) assert.equal((await handler(request({ action: 'login', password: 'wrong' }, { cookie: false }))).status, 401);
  assert.equal((await handler(request({ action: 'login', password: 'wrong' }, { cookie: false }))).status, 429);
});
test('resumption makes exactly one new call per step and preserves model provenance', async () => {
  let job = makeJob(), count = 0;
  while (job.status !== 'complete') {
    const before = count; job = { ...job, ...await advance(job, async (...args) => { count++; return mockCall(...args); }) };
    assert.equal(count - before, 1);
  }
  assert.equal(count, 11); assert.equal(job.record.turns.length, 6); assert.equal(job.record.judgments.length, 2);
  assert(job.record.repairs[0].passesPreference); assert.equal(job.record.id, id);
  await advance(job, async () => { throw new Error('must not recall provider'); });
});
test('stored signatures detect prompt drift; canonical hashes survive map key reordering', async () => {
  assert.equal(hash({ a: 1, b: { c: 2, d: 3 } }), hash({ b: { d: 3, c: 2 }, a: 1 }));
  const job = { ...makeJob(), ...await advance(makeJob(), mockCall) };
  job.calls[0].signature = 'corrupt'; await assert.rejects(() => advance(job, mockCall), /Saved prompt changed/);
});
test('parallel steps and stale retries cannot duplicate a provider call', async () => {
  const db = memoryDb(); db.data.set('synthetic_lab_runs/' + id, makeJob()); let count = 0;
  const handler = createHandler({ database: () => db, advanceRound: job => advance(job, async (...args) => { count++; await new Promise(resolve => setTimeout(resolve, 30)); return mockCall(...args); }) });
  const results = await Promise.all([handler(request({ action: 'step', id, expectedStep: 0 })), handler(request({ action: 'step', id, expectedStep: 0 }))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(count, 1);
  assert.equal((await handler(request({ action: 'step', id, expectedStep: 0 }))).status, 200); assert.equal(count, 1);
});
test('failed provider call releases the lease and preserves completed steps', async () => {
  const db = memoryDb(); const job = { ...makeJob(), ...await advance(makeJob(), mockCall) }; db.data.set('synthetic_lab_runs/' + id, job);
  const handler = createHandler({ database: () => db, advanceRound: async () => { throw new Error('provider unavailable'); } });
  assert.equal((await handler(request({ action: 'step', id, expectedStep: 1 }))).status, 502);
  const saved = db.data.get('synthetic_lab_runs/' + id); assert.equal(saved.calls.length, 1); assert.equal(saved.lease, null); assert.equal(saved.status, 'paused');
});
test('topic guards and durable family assignments reject invalid inputs', async () => {
  assert.throws(() => validateExamples([{ ...EXAMPLES[0], motion: 'Should capital punishment be expanded?' }]), /sensitive_motion/);
  const db = memoryDb(), handler = createHandler({ database: () => db });
  assert.equal((await handler(request({ action: 'create', exampleId: 'free-buses' }))).status, 201);
  const duplicate = await handler(request({ action: 'create', motion: EXAMPLES[0].motion, family: 'different-family' })); assert.equal(duplicate.status, 400);
});
test('fabricated judge quotes and future-turn leakage are rejected', async () => {
  const { record } = await completedJob(); const judgment = structuredClone(record.judgments[0].judgment);
  judgment.mistakes[0].quote = 'Nobody said this'; assert.throws(() => validateJudgment(judgment, record.turns), /fabricated quote/);
  const prompt = repairPrompt(record, record.judgments[0].judgment.mistakes[0]);
  assert.equal(JSON.parse(prompt[1].content).transcript.length, 0);
  assert(!JSON.stringify(prompt).includes(record.judgments[0].judgment.rationale));
});
test('unreviewed data produces no training rows; stale approvals and unresolved facts cannot export', async () => {
  const { record } = await completedJob();
  assert(Object.values(exportData([record], [reviewTemplate(record)])).every(rows => rows.length === 0));
  const review = approved(record); review.recordHash = 'wrong'; assert.throws(() => exportData([record], [review]), /changed after review/);
  const unresolved = approved(record); unresolved.finalJudgment.factualChecksNeeded = ['Check this claim']; assert.throws(() => exportData([record], [unresolved]), /Resolve factual checks/);
});
test('held-out families export benchmark rows and no training rows', async () => {
  let family; for (let i = 0; i < 1000; i++) if (splitFor('heldout-' + i) === 'test') { family = 'heldout-' + i; break; }
  const { record } = await completedJob(family), data = exportData([record], [approved(record)]);
  assert.equal(data['judge-test-prompts'].length, 1); assert.equal(data['debater-test'].length, 1);
  for (const [key, rows] of Object.entries(data)) if (/train|validation/.test(key)) assert.equal(rows.length, 0);
});
test('training pairs share an exact prefix, while weak answers appear only as rejected', async () => {
  let family; for (let i = 0; i < 1000; i++) if (splitFor('training-' + i) === 'train') { family = 'training-' + i; break; }
  const { record } = await completedJob(family), data = exportData([record], [approved(record)]);
  assert.deepEqual(data['debater-train'][0].prompt, data['preferences-train'][0].prompt);
  assert.deepEqual(data['debater-train'][0].completion, data['preferences-train'][0].chosen);
  assert.notDeepEqual(data['preferences-train'][0].chosen, data['preferences-train'][0].rejected);
});
test('provider truncations, refusals and malformed output never become data', async () => {
  for (const body of [{ status: 'incomplete' }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'not JSON' }] }] }]) {
    await assert.rejects(() => providerCall('debaterB', [], { properties: {} }, LAB_CONFIG, async () => ({ ok: true, json: async () => body })));
  }
});
test('Anthropic uses native structured output and preserves the configured effort', async () => {
  let body;
  const response = await providerCall('judgeA', [{ role: 'system', content: 'test' }, { role: 'user', content: 'test' }], SPEECH_SCHEMA, LAB_CONFIG, async (url, request) => {
    body = JSON.parse(request.body);
    return { ok: true, json: async () => ({ id: 'mock', model: 'mock', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"text":"Valid output."}' }] }) };
  });
  assert.equal(body.output_config.effort, 'low'); assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.output_config.format.schema.additionalProperties, false); assert(response.meta.settings.structuredOutput);
});
test('scoring accounts for missing predictions and rejects duplicate ids', () => {
  const labels = [{ id: 'a', judgment: { winner: 'pro' } }, { id: 'b', judgment: { winner: 'con' } }];
  assert.equal(scorePredictions(labels, [{ id: 'a', winner: 'pro' }]).accuracy, .5);
  assert.throws(() => scorePredictions(labels, [{ id: 'a', winner: 'pro' }, { id: 'a', winner: 'con' }]), /Duplicate/);
});
test('private collection has no client rule and frontend contains no embedded access credential', () => {
  const rules = readFileSync(new URL('../app/firestore.rules', import.meta.url), 'utf8'); assert(!/match \/synthetic_lab_/.test(rules));
  const page = readFileSync(new URL('../app/synthetic-lab.html', import.meta.url), 'utf8'), js = readFileSync(new URL('../app/js/synthetic-lab.js', import.meta.url), 'utf8');
  assert(page.includes('noindex,nofollow,noarchive')); assert(!js.includes('localStorage')); assert(!js.includes('innerHTML'));
});
