import assert from 'node:assert/strict';
import { spinRoomTopic } from '../app/netlify/functions/lib/room-topic-spin.mjs';
import { matchDeskDraftConfig, POLITICAL_MOTIONS } from '../app/netlify/functions/lib/spar-match-profile.mjs';
import { DRAFT_MOTIONS } from '../app/netlify/functions/lib/draft-motions.mjs';

const round = { proUid: 'a', conUid: 'b', motion: 'Cities should fund more parks.', speechIdx: 0 };
const stamp = { eligible: true, uids: ['a', 'b'], draftConfig: matchDeskDraftConfig(
  { stances: { economy: 'redistribute', speech: 'moderate' } },
  { stances: { economy: 'markets', speech: 'skip' } }, 'room') };
const rows = new Map([['live_rounds/room', round], ['round_drafts/room', stamp]]);
const reads = [];
const db = { collection: name => ({ doc: id => ({ get: async () => {
  const path = name + '/' + id; reads.push(path);
  return { exists: rows.has(path), data: () => rows.get(path) };
} }) }) };
const spin = (uid = 'a', avoid = [], values = [0, 0]) => spinRoomTopic(db, uid, { room: 'room', avoid }, () => values.shift() ?? 0);
const before = JSON.stringify([...rows]);
const personal = await spin();
assert.ok(POLITICAL_MOTIONS.economy.includes(personal.motion));
assert.deepEqual(Object.keys(personal).sort(), ['from', 'motion'], 'no private answers, subject ids or reasons leave the server');
assert.equal(JSON.stringify([...rows]), before, 'a spin is a suggestion, never an accepted motion');
assert.notEqual((await spin('b', [personal.motion])).motion, personal.motion, 'recent spins are avoided');
assert.ok(DRAFT_MOTIONS.casual.includes((await spin('a', [], [0.9, 0])).motion), 'ordinary topics remain in the mix');
round.motion = personal.motion;
assert.notEqual((await spin()).motion, round.motion, 'current resolution never repeats');
await assert.rejects(spin('outsider'), { status: 403 });
stamp.uids = ['a', 'outsider'];
assert.ok(DRAFT_MOTIONS.casual.includes((await spin()).motion), 'stale or unrelated stamp cannot personalize the room');
stamp.uids = ['a', 'b'];
stamp.draftConfig = {};
assert.ok(DRAFT_MOTIONS.casual.includes((await spin()).motion), 'skipped answers keep the ordinary pool');
stamp.draftConfig = { suggestions: ['Abortion should be banned.'] };
assert.ok(DRAFT_MOTIONS.casual.includes((await spin()).motion), 'old unsafe suggestions cannot resurface');
for (const patch of [{ currentTimer: { state: 'running' } }, { speechIdx: 1 }, { tournamentId: 'event' }, { draft: { phase: 'offer' } }]) {
  Object.assign(round, patch);
  await assert.rejects(spin(), { status: 409 });
  for (const key of Object.keys(patch)) delete round[key];
}
stamp.draftConfig = { pool: ['Locked tournament topic.'] };
await assert.rejects(spin(), { status: 409 });
assert.ok(reads.every(path => !path.startsWith('spar_match_profiles/')), 'use only the pairing-stamped pool, never raw profile reads');
console.log('Topic spin: matching-inspired and general picks, recent/current exclusion, consent, private data isolation, seat checks and round locks passed.');

// Exercise the shipped click handler across slow requests and failed reads.
const { readFileSync } = await import('node:fs');
const vm = await import('node:vm');
const html = readFileSync('app/live-round.html','utf8');
const client = html.slice(html.indexOf("    var gmBtn = $('rebGenMotion');"), html.indexOf('    function requestRoundBrief(btn){'));
for (const scenario of ['success','offline','denied','motion changed','started','account changed','proposal changed']) {
  let click, release, locked = false, sent = [], requests = [];
  const button = { disabled: false, addEventListener: (event, fn) => { click = fn; } };
  const otherButton = { disabled: false };
  const user = { uid: 'a', getIdToken: async () => 'token' };
  const state = { user, room: 'room', motion: 'Current topic.' };
  const pending = new Promise(resolve => { release = resolve; });
  const context = { state, SPAR_MOTIONS: DRAFT_MOTIONS.casual, rmbRoll: otherButton,
    $: () => button, isSpectator: () => false, motionChangeLocked: () => locked,
    bothSeatsIdentified: () => true, myUid: () => state.user.uid,
    setMotion: (...args) => sent.push(args), toast: () => {}, gtag: () => {},
    AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push(JSON.parse(options.body)); await pending;
      if (scenario === 'offline') throw Error('offline');
      return { ok: scenario !== 'denied', status: scenario === 'denied' ? 403 : 200,
        json: async () => ({ from: 'Current topic.', motion: 'A matching-inspired topic.', error: 'No seat' }) };
    },
  };
  vm.runInNewContext(client, context);
  const first = click(); await new Promise(resolve => setImmediate(resolve));
  await click(); assert.equal(requests.length, 1, 'double click does not start another spin');
  assert.equal(button.disabled, true); assert.equal(otherButton.disabled, true);
  if (scenario === 'motion changed') state.motion = 'Changed while waiting.';
  if (scenario === 'started') locked = true;
  if (scenario === 'account changed') state.user = { uid: 'b' };
  if (scenario === 'proposal changed') state.motionProposal = { text: 'A new typed proposal.' };
  release(); await first;
  assert.equal(sent.length, ['success','offline'].includes(scenario) ? 1 : 0, scenario);
  if (scenario === 'success') assert.equal(sent[0][0], 'A matching-inspired topic.');
  if (scenario === 'offline') assert.ok(DRAFT_MOTIONS.casual.includes(sent[0][0]));
  assert.equal(state.motion, scenario === 'motion changed' ? 'Changed while waiting.' : 'Current topic.', 'selection only enters the existing proposal flow');
  assert.equal(button.disabled, false); assert.equal(otherButton.disabled, false);
}
console.log('Topic spin client: proposals, offline fallback, duplicate clicks, stale topic/account/proposal responses and speech-start races passed.');
