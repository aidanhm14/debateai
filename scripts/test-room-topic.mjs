import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runTopicAction } from '../app/netlify/functions/room-topic.mjs';
import { publicTopicTalk, topicRoundOpen, topicGenerationInput, TOPIC_MAX_MS } from '../app/netlify/functions/lib/room-topic.mjs';
import { buildAdjudicationBlock } from '../app/netlify/functions/lib/adjudication.mjs';
import { buildPrompt } from '../app/netlify/functions/live-judge.mjs';
import { RUBRICS, rubricHash, SEASONS } from '../app/netlify/functions/lib/judge-charter.mjs';

function fixture() {
  const rows = new Map([
    ['live_rounds/room', { proUid: 'a', conUid: 'b', motion: 'Economic growth matters more than economic equality.', speechIdx: 0, currentTimer: { state: 'ready' } }],
    ['round_drafts/room', { eligible: true, uids: ['a', 'b'] }],
    ['spar_match_profiles/a', { name: 'PRIVATE NAME', stances: { economy: 'redistribute' } }],
    ['spar_match_profiles/b', { stances: { economy: 'markets' } }],
  ]);
  let lock = Promise.resolve(), calls = 0, time = 1000;
  const db = {
    collection: name => ({ doc: id => ({ path: name + '/' + id }) }),
    runTransaction(fn) {
      const job = lock.then(async () => {
        const writes = [];
        const result = await fn({
          get: async ref => ({ exists: rows.has(ref.path), data: () => structuredClone(rows.get(ref.path)) }),
          set: (ref, data) => writes.push(() => rows.set(ref.path, structuredClone(data))),
          update: (ref, data) => writes.push(() => rows.set(ref.path, { ...rows.get(ref.path), ...data })),
        });
        writes.forEach(write => write()); return result;
      });
      lock = job.catch(() => {}); return job;
    },
  };
  let generate = async input => {
    calls++;
    assert.ok(!JSON.stringify(input).includes('PRIVATE'));
    assert.ok(!JSON.stringify(input).includes('redistribute'));
    assert.deepEqual(Object.keys(input).sort(), ['dialogue', 'issue', 'question']);
    return { motion: 'Governments should give every adult a tax-free savings allowance.', for: 'A protected savings floor helps people build financial security.', against: 'Savings allowances favor people who already have disposable income.' };
  };
  const action = (uid, action, extra = {}) => runTopicAction(db, uid, { room: 'room', id: rows.get('room_topic_talks/room')?.id, action, ...extra }, input => generate(input), () => time);
  return { rows, action, calls: () => calls, setGenerator: fn => generate = fn, elapse: ms => time += ms };
}
const f = fixture();
await assert.rejects(f.action('outsider', 'open'), /Only the two/);
let t = await f.action('a', 'open');
assert.equal(t.phase, 'invited');
assert.ok(!('lines' in t) && !('context' in t) && !('uids' in t));
await f.action('a', 'line', { text: 'I favor lower taxes for businesses.', lineId: 'early' });
assert.equal(f.rows.get('room_topic_talks/room').lines.length, 0, 'nothing captured before mutual consent');
t = await f.action('b', 'consent'); assert.equal(t.phase, 'listening');
await assert.rejects(f.action('a', 'ready'), /Say or type/);
await f.action('a', 'line', { text: 'I want workers to keep more of their income.', lineId: 'a1' });
await f.action('a', 'line', { text: 'I want workers to keep more of their income.', lineId: 'a1' });
assert.equal(f.rows.get('room_topic_talks/room').lines.length, 1, 'retries are idempotent');
await f.action('b', 'line', { text: 'I prefer services paid for through progressive taxes.', lineId: 'b1' });
await assert.rejects(f.action('a', 'line', { text: 'Governments should fund torture.', lineId: 'unsafe' }), /safer/);
assert.equal(topicGenerationInput(f.rows.get('room_topic_talks/room')).dialogue[0].seat, 'A');
await Promise.all([f.action('a', 'ready'), f.action('b', 'ready'), f.action('b', 'ready')]);
assert.equal(f.calls(), 1, 'concurrent ready clicks own one model call');
assert.equal(f.rows.get('room_topic_talks/room').phase, 'proposed');
assert.deepEqual(f.rows.get('room_topic_talks/room').lines, [], 'setup text erased after generation');
const original = f.rows.get('live_rounds/room').motion;
await f.action('a', 'accept'); assert.equal(f.rows.get('live_rounds/room').motion, original, 'one vote changes nothing');
await f.action('b', 'accept'); assert.notEqual(f.rows.get('live_rounds/room').motion, original);
assert.equal(f.rows.get('live_rounds/room').proUid, 'a', 'generation does not assign sides');
assert.ok(!f.rows.get('live_rounds/room').speeches, 'setup never enters scored speeches');
const newMotion = f.rows.get('live_rounds/room').motion;
await f.action('b', 'accept'); assert.equal(f.rows.get('live_rounds/room').motion, newMotion);

const cancelled = fixture();
await cancelled.action('a', 'open'); await cancelled.action('b', 'consent');
await cancelled.action('a', 'line', { text: 'Taxes should be lower for workers.', lineId: 'a1' });
await cancelled.action('b', 'line', { text: 'Services need predictable public funding.', lineId: 'b1' });
let release, reached;
const started = new Promise(resolve => reached = resolve);
cancelled.setGenerator(() => { reached(); return new Promise(resolve => release = resolve); });
await cancelled.action('a', 'ready');
const pending = cancelled.action('b', 'ready'); await started;
await cancelled.action('a', 'cancel');
release({ motion: 'Governments should give every adult a tax-free savings allowance.', for: 'A savings floor protects working people from economic uncertainty.', against: 'Savings allowances favor those with income left over to save.' });
await pending;
assert.equal(cancelled.rows.get('room_topic_talks/room').phase, 'cancelled', 'late generation cannot resurrect a cancelled discussion');
assert.equal(cancelled.rows.get('room_topic_talks/room').context, null);
assert.deepEqual(cancelled.rows.get('room_topic_talks/room').lines, []);

for (const patch of [
  { speechIdx: 1 }, { speeches: [{ text: 'Speech started' }] }, { currentTimer: { state: 'running' } },
  { currentTimer: { state: 'paused', accumulatedMs: 1 } }, { status: 'complete' }, { ballotPending: true }, { tournamentRound: true },
]) {
  const x = fixture(); Object.assign(x.rows.get('live_rounds/room'), patch);
  assert.equal(topicRoundOpen(x.rows.get('live_rounds/room')), false);
  await assert.rejects(x.action('a', 'open'), /before the round starts/);
}
const stale = fixture(); await stale.action('a', 'open'); stale.elapse(TOPIC_MAX_MS);
assert.equal((await stale.action('b', 'consent')).phase, 'cancelled');
const changed = fixture(); await changed.action('a', 'open');
changed.rows.get('live_rounds/room').motion = 'Another agreed claim.';
assert.equal((await changed.action('b', 'consent')).phase, 'cancelled');
const bad = fixture(); bad.rows.get('round_drafts/room').uids = ['a', 'outsider'];
await assert.rejects(bad.action('a', 'open'), /Only the two/);

const open = buildPrompt({ format: 'open', speeches: [] }).system;
assert.ok(open.includes('LIVE CONVERSATION JUDGING METHOD'));
assert.ok(!open.includes('TIME DISCIPLINE:') && !open.includes('Heckling, badgering'));
assert.ok(buildPrompt({ format: 'quick', speeches: [] }).system.includes('TIME DISCIPLINE:'));
for (const format of ['quick', 'casual', 'open', 'conversation']) {
  const prompt = buildAdjudicationBlock({ format });
  for (const line of ['Concessions have scope', 'Interpreting the resolution', 'Missing capture is not a concession', 'Follow the conversation over time']) assert.ok(prompt.includes(line), format + ': ' + line);
  assert.ok(!prompt.includes('"Fine, but" and "sure, though" are real concessions'));
}
assert.equal(SEASONS.at(-1).rubricVersion, 'adjudication-2026-09-flex');
assert.deepEqual(RUBRICS['adjudication-2026-09-flex'].dimensions, RUBRICS['adjudication-2026-08c'].dimensions);
assert.deepEqual(SEASONS.at(-1).panel, SEASONS.at(-2).panel);
assert.notEqual(rubricHash('adjudication-2026-09-flex'), rubricHash('adjudication-2026-08c'));
const page = readFileSync(new URL('../app/live-round.html', import.meta.url), 'utf8');
assert.ok(page.includes('window.RoomTopic.isPending()'), 'a pending topic discussion blocks speech start');
assert.ok(page.includes('Debate something else'));
console.log('room topic: mutual consent, capture attribution, privacy, one-call races, two votes, cancellations, stale replies, lock checks and conversational judge routing passed');
