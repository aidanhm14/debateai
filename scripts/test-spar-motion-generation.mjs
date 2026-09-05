import assert from 'node:assert/strict';
import {
  buildMatchMotionContext, validateGeneratedMotion, ensurePairMotion, GENERATION_DEADLINE_MS,
} from '../app/netlify/functions/lib/spar-motion-generation.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fallback = 'Wealth taxes are necessary to prevent oligarchy.';
const answer = {
  motion: 'Governments should give every adult a tax-free savings allowance.',
  for: 'A protected savings floor helps people build security without relying on benefits.',
  against: 'Savings allowances mostly benefit people who already have money left over.',
};
const left = { uid: 'private-left', name: 'Private Left', stances: { economy: 'redistribute', speech: 'skip' }, economyNote: 'PRIVATE NOTE', creators: ['PRIVATE CREATOR'] };
const right = { uid: 'private-right', name: 'Private Right', stances: { economy: 'markets', immigration: 'selective' } };
const context = buildMatchMotionContext(left, right, 'private-room-seed');
assert.equal(GENERATION_DEADLINE_MS, 4000);
assert.deepEqual(context, {
  issue: 'economy', contrasts: ['Higher taxes on the rich and more spending on public services.', 'Lower taxes and more competition between businesses.'],
});
assert.deepEqual(context, buildMatchMotionContext(right, left, 'private-room-seed'));
assert.equal(buildMatchMotionContext(left, left), null, 'agreement is not an explicit disagreement');
assert.equal(buildMatchMotionContext(left, {}), null, 'missing answers must stay missing');
assert.equal(buildMatchMotionContext({ stances: { economy: 'nuanced' }, economyNote: 'markets' }, left), null);
assert.ok(!JSON.stringify(context).includes('private'));
assert.ok(!JSON.stringify(context).includes('PRIVATE'));
assert.deepEqual(Object.keys(context).sort(), ['contrasts', 'issue']);

const choices = {
  economy: ['skip', 'redistribute', 'markets'], immigration: ['skip', 'easier', 'selective'],
  speech: ['skip', 'moderate', 'hands_off'], democracy: ['skip', 'reform', 'stability'],
};
const profiles = Object.entries(choices).reduce((rows, [key, values]) =>
  rows.flatMap((row) => values.map((value) => ({ ...row, [key]: value }))), [{}]);
for (const a of profiles) for (const b of profiles) {
  const opposed = Object.keys(choices).filter((key) => a[key] !== 'skip' && b[key] !== 'skip' && a[key] !== b[key]);
  const got = buildMatchMotionContext({ stances: a }, { stances: b }, 'stable-room');
  assert.equal(!!got, opposed.length > 0);
  if (got) assert.ok(opposed.includes(got.issue));
  assert.deepEqual(got, buildMatchMotionContext({ stances: b }, { stances: a }, 'stable-room'));
}
assert.ok(validateGeneratedMotion(answer, context).ok);
for (const bad of [null, [], 'text', {}, { ...answer, extra: 'ignored?' }, { motion: answer.motion, for: answer.for }]) {
  assert.equal(validateGeneratedMotion(bad, context).ok, false, 'exact structured schema required');
}
for (const motion of [
  'Should governments raise taxes?', 'Taxes should rise. Governments should cut spending.',
  'Tax', 'x'.repeat(201), ' Governments should raise taxes.',
  'Governments should raise taxes.\nA second line.',
  'Governments should raise taxes\u2014immediately.',
  'Governments should fund torture through higher taxes.',
  'Governments should require abortion coverage through taxes.',
  '<b>Governments should raise taxes.</b>',
  'Governments should raise taxes at https://example.com.',
  'Governments should\u0009raise taxes.',
  'Governments should\u200braise taxes.',
]) assert.equal(validateGeneratedMotion({ ...answer, motion }, context).ok, false, motion);
assert.equal(validateGeneratedMotion({ ...answer, against: answer.for }, context).ok, false);
assert.equal(validateGeneratedMotion({ ...answer, against: 'Taxes should fund torture.' }, context).ok, false);
assert.equal(validateGeneratedMotion({ ...answer, motion: 'Schools should replace homework with group projects.' }, context).reason, 'unrelated_output');
assert.equal(validateGeneratedMotion(answer, { issue: 'economy', contrasts: ['arbitrary private content'] }).ok, false);
assert.equal(validateGeneratedMotion({ ...answer, motion: fallback }, context).reason, 'bank_repeat');
assert.equal(validateGeneratedMotion({ ...answer, motion: fallback.toUpperCase() }, context).reason, 'bank_repeat');
assert.equal(validateGeneratedMotion({ ...answer, motion: 'Your opponent thinks governments should raise taxes.' }, context).reason, 'attributed_output');
assert.equal(validateGeneratedMotion({ ...answer, for: 'These people prefer higher taxes on large businesses.' }, context).reason, 'attributed_output');

function fixture(state = { status: 'ready', context, fallback }, { retry = false, members = ['left', 'right'], eligible = true } = {}) {
  let doc = { eligible, uids: members, motionGeneration: structuredClone(state) };
  let chain = Promise.resolve();
  let writes = 0;
  const snapshot = () => { const data = structuredClone(doc); return { exists: !!data, data: () => data }; };
  const ref = { get: async () => snapshot() };
  const db = {
    collection: (name) => {
      assert.equal(name, 'round_drafts', 'generation can only use the private eligibility stamp');
      return { doc: (room) => { assert.equal(room, 'test-room'); return ref; } };
    },
    runTransaction: (callback) => {
      const run = chain.then(async () => {
        const invoke = async (apply) => {
          const pending = [];
          const result = await callback({
            get: async (r) => { assert.equal(r, ref); return snapshot(); },
            update: (r, patch) => { assert.equal(r, ref); pending.push(structuredClone(patch)); },
          });
          if (apply) for (const patch of pending) { doc = { ...doc, ...patch }; writes++; }
          return result;
        };
        if (retry) await invoke(false);
        return invoke(true);
      });
      chain = run.catch(() => {});
      return run;
    },
  };
  return { db, state: () => structuredClone(doc.motionGeneration), writes: () => writes };
}

function response(value = answer) {
  return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(value) }] }));
}
function dependencies(extra = {}) {
  return { apiKey: 'offline-test-key', callerKey: 'uid_left', ip: '192.0.2.1',
    checkLayers: async () => ({ ok: true }), fetch: async () => response(), ...extra };
}

// Actual synthetic Haiku response captured on 2026-09-05, with provider IDs and
// usage metadata omitted. No participant data or provider request is involved.
const capturedAnswer = {
  motion: 'The government should raise the top income tax rate to fund expanded public transit.',
  for: 'Better public transit reduces car dependency, cuts household transportation costs for working people, and generates tax revenue without burdening small businesses.',
  against: 'Higher income taxes discourage investment and entrepreneurship, pushing wealth and jobs elsewhere, while private transit solutions are more efficient than government-run systems.',
};
for (const wrapper of ['json', '']) {
  const f = fixture();
  const got = await ensurePairMotion(f.db, 'test-room', 'left', dependencies({
    fetch: async () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{
      type: 'text', text: '```' + wrapper + '\n' + JSON.stringify(capturedAnswer, null, 2) + '\n```',
    }] })),
  }));
  assert.equal(got.status, 'generated', 'one complete JSON fence is a valid provider wrapper');
  assert.equal(got.motion, capturedAnswer.motion);
}
for (const text of [
  'Here is the JSON:\n```json\n' + JSON.stringify(answer) + '\n```',
  '```json\n' + JSON.stringify(answer) + '\n```\nThis is the motion.',
  '```json\n' + JSON.stringify(answer) + '\n```\n```json\n' + JSON.stringify(answer) + '\n```',
  '```json\n' + JSON.stringify(answer) + '\n' + JSON.stringify(answer) + '\n```',
  '```python\n' + JSON.stringify(answer) + '\n```',
  '```json\n' + JSON.stringify(answer),
]) {
  const f = fixture();
  const got = await ensurePairMotion(f.db, 'test-room', 'left', dependencies({
    fetch: async () => new Response(JSON.stringify({ content: [{ type: 'text', text }] })),
  }));
  assert.equal(got.status, 'fallback', 'a partial fence, prose or multiple payloads must fail closed');
  assert.equal(got.reason, 'malformed_output');
}

{
  const f = fixture(undefined, { retry: true });
  let calls = 0, sent;
  const opts = dependencies({ fetch: async (url, init) => {
    calls++; sent = JSON.parse(init.body);
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.ok(init.signal instanceof AbortSignal);
    await wait(10);
    return response();
  } });
  const results = await Promise.all([
    ensurePairMotion(f.db, 'test-room', 'left', opts),
    ensurePairMotion(f.db, 'test-room', 'right', opts),
  ]);
  assert.equal(calls, 1, 'concurrent participants and transaction retries must share one provider call');
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].status, 'generated');
  assert.equal(results[0].motion, answer.motion);
  assert.notEqual(results[0].motion, fallback, 'success must use the fresh generated claim');
  assert.equal(sent.messages[0].content, JSON.stringify(context));
  for (const privateValue of ['private-left', 'Private Left', 'PRIVATE NOTE', 'PRIVATE CREATOR', 'private-room-seed', 'test-room', 'uid_left']) {
    assert.ok(!JSON.stringify(sent).includes(privateValue), 'provider must not receive ' + privateValue);
  }
  assert.equal(f.state().context, undefined, 'terminal cache must erase contrast');
  assert.equal(f.state().claimId, undefined);
  assert.equal(f.state().for, undefined, 'generated side arguments are validation-only');
  assert.equal((await ensurePairMotion(f.db, 'test-room', 'left', opts)).motion, answer.motion);
  assert.equal(calls, 1, 'a later accept must reuse cached motion');
}

for (const [label, value, expected] of [
  ['malformed', { text: 'not the schema' }, 'malformed_output'],
  ['unrelated', { ...answer, motion: 'Schools should require uniforms for every student.' }, 'unrelated_output'],
  ['unsafe', { ...answer, motion: 'Governments should pay for torture with higher taxes.' }, 'unsafe_output'],
  ['bank repeat', { ...answer, motion: fallback }, 'bank_repeat'],
  ['attribution', { ...answer, motion: 'Your opponent thinks governments should raise taxes.' }, 'attributed_output'],
]) {
  const f = fixture(); let calls = 0;
  const opts = dependencies({ fetch: async () => { calls++; return response(value); } });
  const got = await ensurePairMotion(f.db, 'test-room', 'left', opts);
  assert.equal(got.status, 'fallback', label);
  assert.equal(got.reason, expected);
  assert.equal(got.motion, fallback);
  assert.equal(f.state().context, undefined);
  await ensurePairMotion(f.db, 'test-room', 'right', opts);
  assert.equal(calls, 1, 'failed outputs never retry the provider');
}

for (const [label, fetcher] of [
  ['http error', async () => new Response('private provider error', { status: 503 })],
  ['network error', async () => { throw new Error('private key or input must not be reported'); }],
  ['malformed envelope', async () => new Response('not JSON')],
  ['truncated output', async () => new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [{ type: 'text', text: JSON.stringify(answer) }] }))],
]) {
  const f = fixture();
  const got = await ensurePairMotion(f.db, 'test-room', 'left', dependencies({ fetch: fetcher }));
  assert.equal(got.status, 'fallback', label);
  assert.equal(got.motion, fallback);
  assert.ok(!JSON.stringify(got).includes('private'));
}

for (const stalledPart of ['limiter', 'fetch', 'body']) {
  const f = fixture(); let calls = 0, signal;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const opts = dependencies({
    deadlineMs: 25,
    checkLayers: async () => stalledPart === 'limiter' ? pending : { ok: true },
    fetch: async (_, init) => {
      calls++; signal = init.signal;
      if (stalledPart === 'fetch') return pending;
      if (stalledPart === 'body') return { ok: true, text: () => pending };
      return response();
    },
  });
  const began = Date.now();
  const got = await ensurePairMotion(f.db, 'test-room', 'left', opts);
  assert.equal(got.status, 'fallback', stalledPart);
  assert.equal(got.reason, 'timeout');
  assert.ok(Date.now() - began < 1000, 'hung ' + stalledPart + ' must not block an accept');
  if (signal) assert.equal(signal.aborted, true);
  const terminal = f.state();
  release(stalledPart === 'limiter' ? { ok: true }
    : stalledPart === 'fetch' ? response()
      : JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(answer) }] }));
  await wait(10);
  assert.deepEqual(f.state(), terminal, 'late ' + stalledPart + ' result must never overwrite fallback');
  if (stalledPart === 'limiter') assert.equal(calls, 0, 'late limiter must never begin provider spend');
}

{
  const f = fixture({ status: 'running', claimId: 'old-claim', startedAt: 1, deadlineAt: 2, context, fallback });
  let calls = 0;
  const got = await ensurePairMotion(f.db, 'test-room', 'right', dependencies({ fetch: async () => { calls++; return response(); } }));
  assert.equal(got.status, 'fallback', 'abandoned claims must terminate without retrying a provider');
  assert.equal(got.reason, 'timeout');
  assert.equal(calls, 0);
}
{
  const f = fixture(); let key;
  await ensurePairMotion(f.db, 'test-room', 'left', dependencies({ callerKey: 'anon_disposable', checkLayers: async (_, k) => { key = k; return { ok: false }; }, fetch: () => { throw new Error('must not run'); } }));
  assert.equal(key, 'ip_192.0.2.1', 'anonymous identity must use IP cap');
  assert.equal(f.state().reason, 'rate_limited');
}
for (const [state, settings, uid] of [
  [{ status: 'ready', context, fallback }, { eligible: false }, 'left'],
  [{ status: 'ready', context, fallback }, {}, 'stranger'],
  [null, {}, 'left'],
  [{ status: 'ready', context: null, fallback }, {}, 'left'],
  [{ status: 'ready', context: { issue: 'economy', contrasts: ['PRIVATE NOTE'] }, fallback }, {}, 'left'],
]) {
  const f = fixture(state, settings); let calls = 0;
  const got = await ensurePairMotion(f.db, 'test-room', uid, dependencies({ fetch: async () => { calls++; return response(); } }));
  assert.notEqual(got.status, 'generated');
  assert.equal(calls, 0, 'no provider call without a valid server stamp and context');
}
{
  const f = fixture();
  const got = await ensurePairMotion(f.db, 'test-room', 'left', dependencies({ apiKey: '' }));
  assert.equal(got.reason, 'unconfigured');
  assert.equal(f.state().status, 'fallback');
}

console.log('spar motion generation: 6561 anonymous context pairs, single-call races, retries, deadline including limiter/body, late replies, schema/content/relevance and privacy passed');
