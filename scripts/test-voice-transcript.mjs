import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('app/js/voice-transcript.js', 'utf8');
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture({ consent = true, uid = 'person', chunkWrite, headerWrite } = {}) {
  const headers = [], chunks = new Map(), attempts = [], timers = new Map();
  let timerId = 0;
  const ref = { id: 'transcript', set: async patch => {
    if (headerWrite) await headerWrite(patch);
    headers.push(JSON.parse(JSON.stringify(patch)));
  }, collection: () => ({ doc: id => ({
    set: async chunk => {
      attempts.push(id);
      if (chunkWrite) await chunkWrite(chunk, chunks, id);
      if (chunks.has(id)) throw new Error('immutable');
      chunks.set(id, JSON.parse(JSON.stringify(chunk)));
    }, get: async () => ({ exists: chunks.has(id), data: () => chunks.get(id) })
  }) }) };
  const db = { collection: () => ({ doc: () => ref }) };
  const firestore = () => db;
  firestore.FieldValue = { serverTimestamp: () => 123 };
  const ctx = { console: { warn() {} }, window: null,
    firebase: { firestore, auth: () => ({ currentUser: uid ? { uid } : null }) },
    TranscriptConsent: { ensure: async () => consent },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' }
  };
  ctx.window = ctx;
  vm.runInNewContext(source, ctx);
  return { ctx, headers, chunks, attempts, timers, start: () => ctx.VoiceTranscript.start({ surface: 'test', roundId: 'round-1' }) };
}
for (const opts of [{ consent: false }, { uid: null }]) {
  const f = fixture(opts);
  assert.equal(await f.start(), null);
  assert.equal(f.headers.length, 0, 'no consent/account means no durable capture');
}
{
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const f = fixture({ chunkWrite: () => hold });
  const s = await f.start();
  s.push({ id: 'one', who: 'you', text: 'Opening words' });
  const finishing = s.finish({ status: 'complete' });
  await tick();
  assert.ok(!f.headers.some(h => h.status === 'complete'), 'pending writes cannot look complete');
  assert.equal(s.pending.length, 1, 'words remain queued before acknowledgement');
  release();
  assert.equal(await finishing, true);
  assert.equal(s.pending.length, 0);
  assert.equal(f.headers.at(-1).status, 'complete');
  assert.equal(f.headers.at(-1).turnCount, 1);
  assert.equal(f.chunks.get('00000').turns[0].sourceId, 'one');
}
{
  let offline = true;
  const f = fixture({ chunkWrite: () => { if (offline) throw new Error('offline'); } });
  const s = await f.start();
  s.push({ who: 'you', text: 'Do not lose me' });
  assert.equal(await s.finish(), false);
  assert.equal(s.pending.length, 1);
  assert.equal(f.headers.at(-1).status, 'incomplete');
  assert.equal(f.headers.at(-1).turnCount, 0, 'header counts acknowledged words only');
  offline = false;
  assert.equal(await s.flush(), true);
  assert.equal(f.chunks.size, 1);
  assert.deepEqual(f.attempts, ['00000', '00000'], 'retry keeps its immutable chunk identity');
  assert.equal(f.headers.at(-1).status, 'complete');
}
{
  const f = fixture({ chunkWrite: (chunk, chunks, id) => {
    chunks.set(id, { ...chunk, turns: chunk.turns.map(turn => Object.fromEntries(Object.entries(turn).reverse())) });
    throw new Error('acknowledgement lost after commit');
  } });
  const s = await f.start();
  s.push({ text: 'Saved once', who: 'you' });
  assert.equal(await s.finish(), true, 'readback confirms an ambiguous create without rewriting it');
  assert.equal(f.chunks.size, 1);
}
{
  const f = fixture({ chunkWrite: (chunk, chunks, id) => {
    chunks.set(id, { ...chunk, turns: [{ text: 'Different words' }] });
    throw new Error('conflict');
  } });
  const s = await f.start();
  s.push({ text: 'Original words' });
  assert.equal(await s.finish(), false, 'different stored content cannot acknowledge this chunk');
  assert.equal(f.headers.at(-1).status, 'incomplete');
}
{
  const f = fixture();
  const s = await f.start();
  const words = 'x'.repeat(3999) + '😀' + 'y'.repeat(3500);
  s.push({ id: 'long-speech', text: words, who: 'you', t: 42 });
  await s.finish();
  const parts = f.chunks.get('00000').turns;
  assert.ok(parts.every(turn => turn.text.length <= 4000));
  assert.equal(parts.map(turn => turn.text).join(''), words, 'long speech survives in full, including Unicode at a part boundary');
  assert.deepEqual(parts.map(turn => turn.sourceId), ['long-speech:part:0', 'long-speech:part:1']);
  assert.ok(parts.every(turn => turn.who === 'you' && turn.t === 42));
  assert.equal(f.headers.at(-1).status, 'complete');
  assert.equal(f.headers.at(-1).captureIssue, '');
}
{
  const f = fixture();
  const s = await f.start();
  for (let i = 0; i < 601; i++) s.push({ text: 'Turn ' + i });
  await s.finish();
  assert.equal(s.turnCount, 600);
  assert.equal(f.headers.at(-1).status, 'capped');
  assert.equal(f.headers.at(-1).captureIssue, 'session_limit');
}
// Execute the actual live-room capture helpers against both seats. Repeated
// operational publishes must not multiply archive turns or capture the peer.
const live = fs.readFileSync('app/live-round.html', 'utf8');
const helpers = live.slice(live.indexOf('  function capQueueTurn('), live.indexOf('  function capFinish('));
for (const side of ['pro', 'con']) {
  const pushed = [];
  const own = { id: 'own-segment', speakerUid: side, at: 2000, text: 'My words' };
  const peer = { id: 'peer-segment', speakerUid: side === 'pro' ? 'con' : 'pro', at: 2001, text: 'Their words' };
  const ctx = { cap: { done: false, session: { push: turn => pushed.push(turn) }, pending: [], seen: {} },
    state: { user: { uid: side }, roundStartedAt: 1000 }, openSeg: { segs: [own, peer] },
    openMode: () => true, capEligible: () => true, capMySideKey: () => side, capEnsure() {},
    TranscriptConsent: { state: () => 'granted', granted: () => true }, window: null };
  ctx.window = ctx;
  vm.runInNewContext(helpers, ctx);
  ctx.capPushSegments([own, peer]);
  ctx.capPushSegments([own, peer]);
  ctx.capPushSpeech({ open: true, side, text: 'Combined transcript must not be copied' });
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].text, 'My words');
  assert.equal(pushed[0].t, 1000);
  ctx.TranscriptConsent.granted = () => false;
  ctx.capPushSegments([{ ...own, id: 'after-denial' }]);
  assert.equal(pushed.length, 1, 'declining storage prevents subsequent segments');
}
const voice = fs.readFileSync('app/voice-debate.html', 'utf8');
const voiceHelpers = voice.slice(voice.indexOf('  function captureFinalVoiceTurn('), voice.indexOf('  // WS1 Phase 2: Queue turns'));
{
  const pushed = [], finished = [];
  let resolveStart;
  const ctx = { transcriptCaptureRef: { current: null }, currentAiTurnRef: { current: null },
    motion: 'Topic', mode: 'quickclash', side: 'pro', personaKey: 'clash',
    crypto: { randomUUID: () => 'abc123' }, VoiceTranscript: { start: () => new Promise(resolve => { resolveStart = resolve; }) } };
  ctx.window = ctx;
  vm.runInNewContext(voiceHelpers, ctx);
  ctx.beginVoiceCapture(null);
  ctx.captureFinalVoiceTurn({ id: 'turn-1', who: 'you', text: 'Early final turn' });
  ctx.captureFinalVoiceTurn({ id: 'turn-1', who: 'you', text: 'Early final turn' });
  ctx.finishVoiceCapture('complete');
  resolveStart({ push: turn => pushed.push(turn), finish: summary => finished.push(summary) });
  await tick();
  assert.equal(pushed.length, 1, 'final events deduplicate and survive asynchronous capture startup');
  assert.equal(finished[0].status, 'complete');
  assert.equal(finished[0].roundId, 'voice-abc123');
}
const rfd = fs.readFileSync('app/voice-rfd.html', 'utf8');
const loadSaved = rfd.slice(rfd.indexOf('  function loadPayloadResolved('), rfd.indexOf('  function getAnonSessionId('));
for (const permitted of [true, false]) {
  let authReady, reads = 0, result = undefined;
  const ctx = { URL, console: { warn() {} },
    window: { location: { href: 'https://example.test/voice-rfd?id=private-round' } },
    loadPayload: () => ({ id: 'another-round', rfd: 'Do not show this unrelated record' }),
    firebase: { auth: () => ({ currentUser: null, onAuthStateChanged: fn => { authReady = fn; return () => {}; } }),
      firestore: () => ({ collection: () => ({ doc: () => ({ get: async () => {
        reads++; if (!permitted) throw new Error('permission-denied');
        return { exists: true, data: () => ({ uid: 'owner', rfd: 'Owner decision' }) };
      } }) }) }) } };
  vm.runInNewContext(loadSaved, ctx);
  ctx.loadPayloadResolved(value => { result = value; });
  assert.equal(reads, 0, 'private history waits for restored auth');
  authReady(); await tick();
  assert.equal(reads, 1);
  assert.equal(result && result.rfd, permitted ? 'Owner decision' : null, 'denied history never falls back to another round');
}
assert.ok(!voice.includes('voice_round_incremental'), 'broken endpoint path is retired');
assert.ok(voice.includes("typeof firebase.firestore === 'function' && window.TranscriptConsent && TranscriptConsent.granted()"), 'completed history uses the same consent');
const rules = fs.readFileSync('app/firestore.rules', 'utf8');
const voiceRules = rules.slice(rules.indexOf('    match /voice_rounds/{roundId}'), rules.indexOf('      // ── polls'));
assert.ok(!/allow read:\s+if true/.test(voiceRules), 'private decisions and legacy turns are not publicly readable by default');
assert.ok(voiceRules.includes("resource.data.get('published', false) == true"));
assert.ok(voiceRules.includes("affectedKeys().hasOnly(['published', 'publishedAt'])"), 'sharing cannot edit evidence or owner');
console.log('Voice transcript: consent, acknowledged completion, retained failed writes, stable retries, ambiguous success, conflict rejection, explicit limits, own-seat incremental capture, finalized voice events and private history passed.');
