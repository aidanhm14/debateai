import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

// Exercise the shipped client with its real async ordering and a controlled
// clock. These checks do not substitute for Daily/OpenAI audio in two browsers.
const source = readFileSync(new URL('../app/js/room-topic.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function fixture({ uid = 'a', holdOpen = false, holdSdp = false } = {}) {
  let now = 0, timerId = 0, releaseOpen, releaseSdp;
  const timers = new Map(), messages = [], pcs = [], tracks = [], elements = [];
  const current = { id: 'talk-1', host: 'a', phase: 'listening', accepts: {}, proposals: 0, proposal: '', expiresAt: 180000 };
  const schedule = (fn, delay, interval = false) => {
    const id = ++timerId; timers.set(id, { fn, at: now + delay, delay, interval }); return id;
  };
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.classList = { toggle() {} }; elements.push(this); }
    setAttribute() {}
    addEventListener() {}
    appendChild(child) { this.children.push(child); child.isConnected = true; return child; }
    insertBefore(child) { return this.appendChild(child); }
    replaceChildren() { this.children = []; }
    remove() { this.isConnected = false; }
    play() { return Promise.resolve(); }
  }
  const body = new Element('body'), anchor = new Element('details'); anchor.parentNode = body;
  const mediaTrack = { id: 'mic', readyState: 'live' };
  const context = { uid, room: 'test', canChoose: true, joined: true, audioTrack: mediaTrack,
    user: { getIdToken: async () => 'test-token' }, names: { a: 'Ari', b: 'Bea' },
    call: {
      startCustomTrack({ trackName }) { tracks.push({ at: now, action: 'publish', name: trackName }); return Promise.resolve(); },
      stopCustomTrack(name) { tracks.push({ at: now, action: 'unpublish', name }); return Promise.resolve(); },
    },
  };
  class AudioContext {
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [mediaTrack] } }; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    resume() { return Promise.resolve(); }
    close() {}
  }
  class PeerConnection {
    constructor() { pcs.push(this); }
    addTrack() {}
    createDataChannel() {
      this.dc = { readyState: 'open', send: data => messages.push({ at: now, ...JSON.parse(data) }), close() { this.readyState = 'closed'; } };
      return this.dc;
    }
    async createOffer() { return { sdp: 'test-offer' }; }
    async setLocalDescription() {}
    async setRemoteDescription() {
      this.ontrack({ streams: [{ getAudioTracks: () => [mediaTrack] }] });
      this.dc.onopen();
    }
    close() { this.closed = true; }
  }
  const window = { AudioContext, __lrTopicContext: () => context, addEventListener() {} };
  const mint = { client_secret: { value: 'test' }, greeting: 'Test greeting.' };
  vm.runInNewContext(source, {
    window, console, RTCPeerConnection: PeerConnection, MediaStream: class {},
    Date: { now: () => now },
    document: { body, createElement: tag => new Element(tag), getElementById: id => id === 'rmbTools' ? anchor : null, addEventListener() {} },
    setTimeout: (fn, delay) => schedule(fn, delay), setInterval: (fn, delay) => schedule(fn, delay, true),
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    fetch: async (url, options) => {
      if (url !== '/api/room-topic') {
        if (holdSdp) await new Promise(resolve => { releaseSdp = resolve; });
        return { ok: true, text: async () => 'test-answer' };
      }
      const { action } = JSON.parse(options.body);
      if (action === 'open' && holdOpen) await new Promise(resolve => { releaseOpen = resolve; });
      if (action === 'cancel') current.phase = 'cancelled';
      return { ok: true, json: async () => ({ ok: true, talk: structuredClone(current), ...(action === 'open' ? { voice: mint } : {}) }) };
    },
  });
  return {
    context, current, messages, pcs, tracks, topic: window.RoomTopic,
    async open() { window.RoomTopic.open(); await flush(); },
    async release() { releaseOpen(); await flush(); },
    async releaseSdp() { releaseSdp(); await flush(); },
    render(patch) { Object.assign(current, patch); window.RoomTopic.render(structuredClone(current)); },
    strip: () => elements.some(e => e.id === 'topicJudgeStrip' && e.isConnected),
    async tick(ms) {
      const end = now + ms;
      for (;;) {
        const entry = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [id, timer] = entry; now = timer.at;
        if (timer.interval) timer.at += timer.delay; else timers.delete(id);
        timer.fn(); await flush();
      }
      now = end; await flush();
    },
    nudges: () => messages.filter(m => m.type === 'response.create' && /Then keep listening/.test(m.response.instructions)),
  };
}

test('opening arms two listening reminders after the voice exists', async () => {
  const f = fixture(); await f.open();
  assert.equal(f.pcs.length, 1);
  await f.tick(74999); assert.equal(f.nudges().length, 0);
  await f.tick(1); assert.deepEqual(f.nudges().map(m => m.at), [75000]);
  await f.tick(75000); assert.deepEqual(f.nudges().map(m => m.at), [75000, 150000]);
});

test('a suggestion requests reminders at 30 and 60 seconds and then stays quiet', async () => {
  const f = fixture(); await f.open();
  f.render({ phase: 'proposed', proposals: 1, proposal: 'Cities should build more homes.' });
  await f.tick(29999); assert.equal(f.nudges().length, 0);
  await f.tick(1); assert.equal(f.nudges().length, 1);
  await f.tick(70000); assert.deepEqual(f.nudges().map(m => m.at), [30000, 60000]);
});

test('the other seat never runs reminder timers', async () => {
  const f = fixture({ uid: 'b' }); f.render({});
  await f.tick(160000); assert.equal(f.messages.length, 0);
});

test('Start tears down the judge immediately and stale snapshots cannot restore its strip', async () => {
  const f = fixture(); await f.open();
  f.context.canChoose = false; f.topic.dismiss();
  f.render({ phase: 'listening' });
  assert.equal(f.pcs[0].closed, true);
  assert.equal(f.strip(), false);
  assert.equal(f.tracks.at(-1).action, 'unpublish');
});

test('Start during the farewell stops its track without waiting 4.5 seconds', async () => {
  const f = fixture(); await f.open();
  f.render({ phase: 'done' });
  assert.equal(f.topic.isPending(), true, 'the farewell is still audible');
  f.context.canChoose = false; f.topic.dismiss();
  assert.equal(f.pcs[0].closed, true);
  assert.equal(f.tracks.at(-1).action, 'unpublish');
});

test('a slow open response cannot dial the judge after Start', async () => {
  const f = fixture({ holdOpen: true }); await f.open();
  f.context.canChoose = false; f.topic.dismiss(); await f.release();
  assert.equal(f.pcs.length, 0);
  assert.equal(f.strip(), false);
});

test('a dial completing after Start cannot publish or play a late judge track', async () => {
  const f = fixture({ holdSdp: true }); await f.open();
  f.context.canChoose = false; f.topic.dismiss(); await f.releaseSdp();
  assert.equal(f.tracks.length, 0);
  assert.equal(f.pcs[0].closed, true);
});

test('the host stops a farewell when the other seat starts', async () => {
  const f = fixture(); await f.open(); f.render({ phase: 'done' });
  f.context.canChoose = false; await f.tick(1000);
  assert.equal(f.pcs[0].closed, true);
  assert.equal(f.tracks.at(-1).at, 1000);
});
