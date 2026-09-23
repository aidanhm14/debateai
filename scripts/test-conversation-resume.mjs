import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readPageSource } from './lib/page-source.mjs';

const source = readPageSource('app/live-round.html');
const engine = source.slice(source.indexOf('  var openSeg ='), source.indexOf('  function openScheduleSegPublish()'));
const edit = source.slice(source.indexOf('  function micNoteUserEdit()'), source.indexOf('  function micFail('));

function fixture({ saved = [], room = 'one', page = 'new-page', known = true, side = 'pro' } = {}) {
  let clock = 100, timer = 0;
  const textarea = { value: '' }, writes = [];
  const c = {
    window: { crypto: { randomUUID: () => page }, DBRoomClock: { now: () => ++clock } },
    state: { room, phase: 'round', timerState: 'running', user: { uid: 'me' },
      lastRoundDocRoom: known ? room : '', lastRoundDoc: known ? { proUid: 'me', proUid2: 'me', openSegs: { [side]: saved } } : null,
      micSupport: { engine: 'server' }, micActive: false },
    mic: { generation: 1, own: '', finals: [] }, bk: {},
    openMode: () => true, isSpectator: () => false,
    mySide: () => 'pro', myConversationKey: () => side,
    $: () => textarea, setInterval: () => ++timer, clearInterval() {}, clearTimeout() {},
    paintConversationFlow() {}, generateRoundNotes() {},
    openPublishSegs() { writes.push(c.openSeg.segs.map(s => ({ ...s }))); }, openScheduleSegPublish() {},
    Date, Math,
  };
  c.DBRoomClock = c.window.DBRoomClock;
  vm.createContext(c); vm.runInContext(engine + edit, c);
  c.maybeConversationNotes = () => {};
  return { c, textarea, writes, texts: () => Array.from(c.openSeg.segs, s => s.text) };
}

{
  const f = fixture();
  f.textarea.value = 'The original typed argument.';
  f.c.openSegStart(); f.c.openSegTick(true);
  f.c.openSegStop(); f.c.openSegStart(); f.c.openSegTick(true);
  assert.deepEqual(f.texts(), ['The original typed argument.'], 'Resume must neither erase nor duplicate text');
  f.textarea.value += ' A later reply.'; f.c.openSegTick(true);
  assert.deepEqual(f.texts(), ['The original typed argument.', 'A later reply.']);
  f.textarea.value += ' Unpunctuated final words'; f.c.openSegTick(true);
  assert.equal(f.texts().at(-1), 'Unpunctuated final words', 'Final flush includes the last clause without punctuation');
}

const prior = [
  { id: 'mic:earlier-page:1:0', at: 10, speakerUid: 'me', text: 'Repeated argument.' },
  { id: 'mic:earlier-page:1:1', at: 20, speakerUid: 'me', text: 'Repeated argument.' },
  { id: 'foreign', at: 25, speakerUid: 'other', text: 'Not my words.' },
];
for (const side of ['pro', 'pro2']) {
  const f = fixture({ saved: prior, side });
  f.c.openSegStart();
  assert.deepEqual(f.texts(), ['Repeated argument.', 'Repeated argument.'], 'Restore only this seat and preserve actual repetitions');
  f.c.mic.own = f.textarea.value = 'A new reply.';
  f.c.state.micActive = true;
  f.c.openCapturedSegment({ generation: 1, at: 30, endedAt: 35 }, 0, 'A new reply.');
  f.c.openSegTick(true);
  assert.equal(f.c.openSeg.segs.length, 3, 'The new page does not replace a prior mic slot or duplicate the visible ASR text');
  assert.equal(f.c.openSeg.segs[2].id, 'mic:new-page:1:0');
  f.c.openCapturedSegment({ generation: 1, at: 30, endedAt: 35 }, 0, 'A corrected reply.');
  assert.equal(f.c.openSeg.segs.length, 3, 'A retry revises its own slot');
  assert.equal(f.c.openSeg.segs[2].text, 'A corrected reply.');
  f.textarea.value = 'My typed correction.';
  f.c.micNoteUserEdit();
  assert.deepEqual(f.texts(), ['Repeated argument.', 'Repeated argument.', 'My typed correction.']);
  f.textarea.value = ''; f.c.micNoteUserEdit();
  assert.deepEqual(f.texts(), ['Repeated argument.', 'Repeated argument.'], 'Clearing current text cannot erase a restored prefix');
  assert.equal(f.writes.at(-1).length, 2, 'The removal of a typed suffix is saved');
  for (const value of ['H', 'He', 'Hello.', 'Hello. N', 'Hello. New reply']) {
    f.textarea.value = value; f.c.micNoteUserEdit();
  }
  assert.deepEqual(f.texts(), ['Repeated argument.', 'Repeated argument.', 'Hello. New reply'],
    'Per-keystroke edits cannot turn one word into separate transcript segments');
}

{
  const f = fixture({ saved: prior, known: false });
  f.c.openSegStart();
  f.textarea.value = 'Started before the snapshot.'; f.c.openSegTick(true);
  const current = Array.from(f.c.openSeg.segs);
  f.c.state.lastRoundDocRoom = 'one';
  f.c.state.lastRoundDoc = { proUid: 'me', openSegs: { pro: prior.concat(current) } };
  f.c.openRestoreOwnSegs();
  assert.deepEqual(f.texts(), ['Repeated argument.', 'Repeated argument.', 'Started before the snapshot.']);
  f.c.openRestoreOwnSegs();
  assert.equal(f.c.openSeg.segs.length, 3, 'Repeated snapshots cannot duplicate the restored prefix');
  f.c.state.room = 'two'; f.c.openSegStart();
  assert.equal(f.c.openSeg.segs.length, 0, 'A previous room document cannot populate a new room');
  f.c.state.lastRoundDocRoom = 'two';
  f.c.state.lastRoundDoc = { proUid: 'other', openSegs: { pro: prior } };
  f.c.openRestoreOwnSegs();
  assert.equal(f.c.openSeg.segs.length, 0, 'The round seat must belong to the current account');
}

assert.match(source, /if \(!f\.open \|\| openSeg\.resetInput\)\{\s*\$\('speechText'\)\.value = '';/,
  'Conversation rerenders cannot clear their active text buffer');
assert.match(source, /onRoundSnapshot\(doc\.data\(\) \|\| \{\}, ref\.id\)/);
assert.match(source, /function onRoundSnapshot\(d, roomId\)\{\s*if \(roomId && roomId !== state\.room\) return;/);
console.log('Conversation resume: pause, reload, seat ownership, repeated words, late retry, typed correction and stale-room guards passed.');
