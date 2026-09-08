import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runTopicAction, mintTopicVoice, topicNames } from '../app/netlify/functions/room-topic.mjs';
import { publicTopicTalk, topicRoundOpen, buildTopicJudgeInstructions, TOPIC_TOOLS, TOPIC_GREETING, TOPIC_MAX_MS, TOPIC_MAX_PROPOSALS } from '../app/netlify/functions/lib/room-topic.mjs';
import { validateProposedMotion } from '../app/netlify/functions/lib/spar-motion-generation.mjs';
import { buildAdjudicationBlock } from '../app/netlify/functions/lib/adjudication.mjs';
import { buildPrompt } from '../app/netlify/functions/live-judge.mjs';
import { RUBRICS, rubricHash, SEASONS } from '../app/netlify/functions/lib/judge-charter.mjs';

// 2026-09-06: the voice judge. The modal state machine (invited, lines,
// ready, generating) is gone; the judge hears the room and proposes
// through a tool call the HOST relays. Phases: listening -> proposed ->
// done | cancelled.
function fixture() {
  const rows = new Map([
    ['live_rounds/room', { proUid: 'a', conUid: 'b', proName: 'Ari', conName: 'Bea', motion: 'Economic growth matters more than economic equality.', speechIdx: 0, currentTimer: { state: 'ready' } }],
    ['round_drafts/room', { eligible: true, uids: ['a', 'b'] }],
    ['spar_match_profiles/a', { name: 'PRIVATE NAME', stances: { economy: 'redistribute' } }],
    ['spar_match_profiles/b', { stances: { economy: 'markets' } }],
  ]);
  let lock = Promise.resolve(), time = 1000;
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
  const action = (uid, action, extra = {}) => runTopicAction(db, uid, { room: 'room', id: rows.get('room_topic_talks/room')?.id, action, ...extra }, () => time).then(r => publicTopicTalk(r.talk));
  return { rows, action, elapse: ms => time += ms };
}
const PROPOSAL = 'Cities should replace most parking minimums with housing.';
const f = fixture();
await assert.rejects(f.action('outsider', 'open'), /Only the two/);
let t = await f.action('a', 'open');
assert.equal(t.phase, 'listening', 'no consent step: the judge announces itself in the room');
assert.equal(t.host, 'a');
assert.ok(!('uids' in t) && !('context' in t) && !('from' in t), 'the public projection carries no profile-derived context');
assert.ok(!JSON.stringify(t).includes('PRIVATE'));
const raw = f.rows.get('room_topic_talks/room');
assert.equal(raw.context.issue, 'economy', 'the signup contrast is a hint stored server-side only');
assert.ok(!JSON.stringify(buildTopicJudgeInstructions({ names: topicNames(f.rows.get('live_rounds/room'), raw.uids), from: raw.from, context: raw.context, attempt: 1 })).includes('redistribute'), 'the judge never learns what either person answered');
const resumed = await f.action('b', 'open');
assert.equal(resumed.id, t.id, 'a second tap joins the same talk');
assert.equal(resumed.host, 'a', 'and does not steal the judge');
await assert.rejects(f.action('b', 'propose', { motion: PROPOSAL }), /Only the judge/);
await assert.rejects(f.action('a', 'propose', { motion: 'Economic growth matters more than economic equality.' }), /already have/);
await assert.rejects(f.action('a', 'propose', { motion: 'Governments should fund torture.' }), /safer/);
await assert.rejects(f.action('a', 'propose', { motion: 'Should cities ban cars?' }), /not one declarative/);
await assert.rejects(f.action('a', 'propose', { motion: 'Banning cars helps pedestrians but hurts small shops.' }), /grants both sides/);
t = await f.action('a', 'propose', { motion: PROPOSAL });
assert.equal(t.phase, 'proposed'); assert.equal(t.proposal, PROPOSAL); assert.equal(t.proposals, 1);
const original = f.rows.get('live_rounds/room').motion;
await f.action('a', 'accept'); assert.equal(f.rows.get('live_rounds/room').motion, original, 'one vote changes nothing');
t = await f.action('a', 'propose', { motion: 'Public transit should be free at the point of use.' });
assert.deepEqual(t.accepts, {}, 'a fresh proposal clears earlier accepts');
assert.equal(t.proposals, 2);
await f.action('a', 'accept'); await f.action('b', 'accept');
assert.equal(f.rows.get('live_rounds/room').motion, 'Public transit should be free at the point of use.');
assert.equal(f.rows.get('room_topic_talks/room').phase, 'done');
assert.equal(f.rows.get('live_rounds/room').proUid, 'a', 'the judge does not assign sides');
assert.ok(!f.rows.get('live_rounds/room').speeches, 'setup never enters scored speeches');

const capped = fixture();
await capped.action('a', 'open');
for (let i = 0; i < TOPIC_MAX_PROPOSALS; i++) await capped.action('a', 'propose', { motion: 'Public libraries should lend power tools number ' + i + ' too.' });
await assert.rejects(capped.action('a', 'propose', { motion: 'Streaming services should charge for password sharing.' }), /Enough suggestions/);

const cancelled = fixture();
await cancelled.action('a', 'open');
assert.equal((await cancelled.action('b', 'cancel')).phase, 'cancelled', 'either seat can send the judge away');
assert.equal(cancelled.rows.get('room_topic_talks/room').context, null);
await assert.rejects(cancelled.action('a', 'propose', { motion: PROPOSAL }).then(x => { if (x.phase === 'cancelled') throw new Error('stays cancelled'); }), /stays cancelled/);

for (const patch of [
  { speechIdx: 1 }, { speeches: [{ text: 'Speech started' }] }, { currentTimer: { state: 'running' } },
  { currentTimer: { state: 'paused', accumulatedMs: 1 } }, { status: 'complete' }, { ballotPending: true }, { tournamentRound: true },
]) {
  const x = fixture(); Object.assign(x.rows.get('live_rounds/room'), patch);
  assert.equal(topicRoundOpen(x.rows.get('live_rounds/room')), false);
  await assert.rejects(x.action('a', 'open'), /before the round starts/);
}
const stale = fixture(); await stale.action('a', 'open'); stale.elapse(TOPIC_MAX_MS);
assert.equal((await stale.action('a', 'propose', { motion: PROPOSAL })).phase, 'cancelled');
const changed = fixture(); await changed.action('a', 'open');
changed.rows.get('live_rounds/room').motion = 'Another agreed claim.';
assert.equal((await changed.action('a', 'propose', { motion: PROPOSAL })).phase, 'cancelled');
const bad = fixture(); bad.rows.get('round_drafts/room').uids = ['a', 'outsider'];
await assert.rejects(bad.action('a', 'open'), /Only the two/);

const started = fixture(); await started.action('a', 'open');
started.rows.get('live_rounds/room').currentTimer = { state: 'running' };
await assert.rejects(started.action('b', 'open'), error => error.code === 'ROUND_STARTED');
assert.equal((await started.action('a', 'cancel')).phase, 'cancelled', 'dismiss can finish after the Start clock write wins the transaction race');
assert.equal(started.rows.get('live_rounds/room').motion, original);

// The judge's brief and its one tool.
assert.equal(TOPIC_TOOLS.length, 1); assert.equal(TOPIC_TOOLS[0].name, 'propose_motion');
assert.ok(!/Example:/.test(TOPIC_TOOLS[0].parameters.properties.motion.description), 'no example motion in the schema: the mini model proposed it verbatim before anyone spoke');
const brief = buildTopicJudgeInstructions({ names: ['Ari', 'Bea'], from: 'Old claim here.', context: { issue: 'speech' }, attempt: 2 });
for (const line of ['Never take a side', 'Never assign sides', 'propose_motion', 'three tries', 'abortion', 'Ari', 'Bea', 'not their first attempt', 'Start conversation', 'Start timed speeches', 'only BEFORE the round starts']) assert.ok(brief.includes(line), 'brief: ' + line);
assert.ok(!brief.includes('—'), 'no em dashes in the brief');
assert.ok(brief.includes('NEVER call propose_motion before'));
assert.ok(!brief.includes(TOPIC_GREETING), 'the ongoing brief must not re-request the arrival greeting on every response');
assert.equal(validateProposedMotion('  Cities  should build more housing near transit. ', '').motion, 'Cities should build more housing near transit.');
assert.equal(validateProposedMotion('Your view is wrong about housing policy.', '').ok, false);
assert.equal(validateProposedMotion('Too short.', '').ok, false);
assert.equal(validateProposedMotion('Banning cars downtown helps pedestrians but hurts small shops.', '').reason, 'hedged_output');
assert.ok(buildTopicJudgeInstructions({ names: ['A', 'B'], from: '', context: null, attempt: 1 }).includes('Take ONE side'));

// The mint disables automatic replies before the first audio can arrive.
{
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ value: 'ek_test', expires_at: 1 }) }; };
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
  const mint = await mintTopicVoice('brief', fakeFetch);
  assert.equal(mint.client_secret.value, 'ek_test');
  assert.equal(mint.greeting, TOPIC_GREETING);
  assert.equal(mint.instructions, 'brief', 'per-response instructions must preserve the full session brief');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/realtime/client_secrets');
  assert.equal(calls[0].body.session.tools[0].name, 'propose_motion');
  assert.equal(calls[0].body.session.instructions, 'brief');
  assert.match(calls[0].body.session.model, /^gpt-realtime/);
  assert.equal(calls[0].body.session.audio.input.turn_detection.create_response, false);
  assert.equal(calls[0].body.session.audio.input.turn_detection.interrupt_response, true);
  assert.equal(calls[0].body.session.audio.input.turn_detection.threshold, 0.5);
  const failing = async () => ({ ok: false, status: 401, text: async () => 'nope' });
  await assert.rejects(mintTopicVoice('brief', failing), /REALTIME_MINT_FAILED/);
}

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
assert.ok(page.includes('window.RoomTopic.dismiss()'), 'starting a speech sends the judge away rather than being refused by it');
assert.ok(!/isPending\(\)\)\{ toast\(/.test(page), 'the old blocking toast is gone');
assert.ok(page.includes('Debate something else'));
console.log('room topic: voice judge host, private hint, proposal relay, two votes, proposal cap, cancellations, stale replies, lock checks, mint shape and conversational judge routing passed');
await import('./test-room-topic-client.mjs');
