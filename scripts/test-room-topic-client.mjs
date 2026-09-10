import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

// Exercise the shipped client with its real async ordering and a controlled
// clock. These checks do not substitute for Daily/OpenAI audio in two browsers.
const source = readFileSync(new URL('../app/js/room-topic.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function fixture({ uid = 'a', holdOpen = false, holdSdp = false, holdResponses = false, holdPropose = false, rejectProposal = false, joined = true, streamless = false, rejectPublish = false, failSdp = false } = {}) {
  let now = 0, timerId = 0, releaseOpen, releaseSdp, releasePropose;
  const timers = new Map(), messages = [], pcs = [], tracks = [], elements = [], requests = [], sources = [], appMessages = [], network = [];
  const current = { id: 'talk-1', host: 'a', phase: 'listening', accepts: {}, proposals: 0, proposal: '', expiresAt: 180000 };
  const schedule = (fn, delay, interval = false) => {
    const id = ++timerId; timers.set(id, { fn, at: now + delay, delay, interval }); return id;
  };
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.classList = { toggle() {} }; elements.push(this); }
    setAttribute() {}
    addEventListener() {}
    appendChild(child) { this.children.push(child); child.isConnected = true; child.parentNode = this; return child; }
    insertBefore(child) { return this.appendChild(child); }
    replaceChildren() { this.children = []; }
    remove() { this.isConnected = false; }
    play() { return Promise.resolve(); }
  }
  const body = new Element('body'), anchor = new Element('details'); anchor.parentNode = body;
  const stage = new Element('div'); body.appendChild(stage);
  const mediaTrack = { id: 'mic', kind: 'audio', readyState: 'live', clone() { return { ...this, stop() { this.readyState = 'ended'; } }; } };
  const context = { uid, room: 'test', canChoose: true, joined, audioTrack: mediaTrack, stage,
    user: { getIdToken: async () => 'test-token' }, names: { a: 'Ari', b: 'Bea' },
    call: {
      sendAppMessage(data) { appMessages.push(data); },
      startCustomTrack({ trackName, track }) { tracks.push({ at: now, action: 'publish', name: trackName, track }); return rejectPublish ? Promise.reject(Error('Unable to publish')) : Promise.resolve(trackName); },
      stopCustomTrack(name) { tracks.push({ at: now, action: 'unpublish', name }); return Promise.resolve(); },
    },
  };
  class AudioContext {
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [mediaTrack] } }; }
    createMediaStreamSource(stream) { const source = { track: stream.getAudioTracks()[0], connected: false, connect() { this.connected = true; }, disconnect() { this.connected = false; } }; sources.push(source); return source; }
    resume() { return Promise.resolve(); }
    close() {}
  }
  class PeerConnection {
    constructor() { pcs.push(this); }
    addTrack() {}
    createDataChannel() {
      this.dc = { readyState: 'open', send: data => {
        const message = JSON.parse(data); messages.push({ at: now, ...message });
        if (message.type === 'response.create' && !holdResponses) schedule(() => {
          this.dc.onmessage({ data: JSON.stringify({ type: 'response.created' }) });
          this.dc.onmessage({ data: JSON.stringify({ type: 'response.done' }) });
        }, 0);
      }, close() { this.readyState = 'closed'; } };
      return this.dc;
    }
    async createOffer() { return { sdp: 'test-offer' }; }
    async setLocalDescription() {}
    async setRemoteDescription() {
      this.ontrack({ track: mediaTrack, streams: streamless ? [] : [{ getAudioTracks: () => [mediaTrack] }] });
      this.dc.onopen();
    }
    close() { this.closed = true; }
  }
  const window = { AudioContext, __lrTopicContext: () => context, addEventListener() {} };
  const mint = { client_secret: { value: 'test' }, greeting: 'Test greeting.', instructions: 'FULL LISTENING AND CONTENT RULES' };
  vm.runInNewContext(source, {
    window, console, RTCPeerConnection: PeerConnection, MediaStream: class { constructor(tracks) { this.tracks = tracks; } getAudioTracks() { return this.tracks; } },
    Date: { now: () => now },
    document: { body, createElement: tag => new Element(tag), getElementById: id => id === 'rmbTools' ? anchor : null, addEventListener() {} },
    setTimeout: (fn, delay) => schedule(fn, delay), setInterval: (fn, delay) => schedule(fn, delay, true),
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    fetch: async (url, options) => {
      if (url !== '/api/room-topic') {
        network.push(url);
        if (holdSdp) await new Promise(resolve => { releaseSdp = resolve; });
        return { ok: !failSdp, status: failSdp ? 503 : 200, text: async () => 'test-answer' };
      }
      const payload = JSON.parse(options.body), { action } = payload;
      requests.push(payload);
      if (action === 'open' && holdOpen) await new Promise(resolve => { releaseOpen = resolve; });
      if (action === 'cancel') current.phase = 'cancelled';
      if (action === 'propose') {
        if (holdPropose) await new Promise(resolve => { releasePropose = resolve; });
        if (rejectProposal) return { ok: false, json: async () => ({ error: 'That is not one declarative sentence.' }) };
        Object.assign(current, { phase: 'proposed', proposal: payload.motion, proposals: current.proposals + 1, accepts: {} });
      }
      return { ok: true, json: async () => ({ ok: true, talk: structuredClone(current), ...(action === 'open' ? { voice: mint } : {}) }) };
    },
  });
  return {
    context, current, messages, pcs, tracks, requests, sources, elements, appMessages, network, topic: window.RoomTopic,
    async open() { window.RoomTopic.open(); await flush(); },
    async release() { releaseOpen(); await flush(); },
    async releaseSdp() { releaseSdp(); await flush(); },
    async releasePropose() { releasePropose(); await flush(); },
    async event(type, fields = {}, pc = pcs.at(-1)) { pc.dc.onmessage({ data: JSON.stringify({ type, ...fields }) }); await flush(); },
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
    replies: () => messages.filter(m => m.type === 'response.create'),
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

test('accepting a topic ends the voice immediately without a farewell interruption', async () => {
  const f = fixture(); await f.open();
  const replies = f.replies().length;
  f.render({ phase: 'done' });
  assert.equal(f.topic.isPending(), false);
  assert.equal(f.pcs[0].closed, true);
  assert.equal(f.tracks.at(-1).action, 'unpublish');
  await f.tick(6000); assert.equal(f.replies().length, replies);
});

test('a slow open response cannot dial the judge after Start', async () => {
  const f = fixture({ holdOpen: true }); await f.open();
  f.context.canChoose = false; f.topic.dismiss(); await f.release();
  assert.equal(f.pcs[0].closed, true);
  assert.equal(f.network.length, 0, 'the prepared connection never dials OpenAI');
  assert.equal(f.strip(), false);
});

test('dismissing while opening cannot dial a late judge even if the room is still in setup', async () => {
  const f = fixture({ holdOpen: true }); await f.open();
  f.topic.dismiss(); await f.release();
  assert.equal(f.pcs[0].closed, true);
  assert.equal(f.network.length, 0, 'the prepared connection never dials OpenAI');
  assert.equal(f.strip(), false);
  assert.equal(f.requests.at(-1).action, 'cancel');
  assert.equal(f.requests.at(-1).id, 'talk-1');
});

test('a dial completing after Start cannot publish or play a late judge track', async () => {
  const f = fixture({ holdSdp: true }); await f.open();
  f.context.canChoose = false; f.topic.dismiss(); await f.releaseSdp();
  assert.equal(f.tracks.length, 0);
  assert.equal(f.pcs[0].closed, true);
});

test('a judge arriving before Daily joins is shared once the call connects', async () => {
  const f = fixture({ joined: false }); await f.open();
  assert.equal(f.tracks.length, 0);
  f.context.joined = true; await f.tick(1500);
  assert.equal(f.tracks.filter(t => t.action === 'publish').length, 1);
});

test('WebRTC audio delivered without a stream still reaches the other person', async () => {
  const f = fixture({ streamless: true }); await f.open();
  assert.equal(f.tracks.filter(t => t.action === 'publish').length, 1);
});

test('a failed Daily audio publication ends the judge instead of claiming to hear both people', async () => {
  const f = fixture({ rejectPublish: true }); await f.open();
  assert.equal(f.pcs[0].closed, true);
  assert.equal(f.strip(), false);
  assert.equal(f.topic.isPending(), false);
});

test('muting the host removes only that source and unmuting restores it', async () => {
  const f = fixture(); const peer = { id: 'peer', readyState: 'live' };
  f.context.peerAudioTrack = () => peer;
  await f.open();
  assert.equal(f.sources.filter(s => s.connected).length, 2);
  f.context.micOn = false; await f.tick(1500);
  assert.deepEqual(f.sources.filter(s => s.connected).map(s => s.track.id), ['peer']);
  f.context.micOn = true; await f.tick(1500);
  assert.equal(f.sources.filter(s => s.connected).length, 2);
  f.topic.dismiss();
  assert.equal(f.context.audioTrack.readyState, 'live', 'the person keeps their mic');
  assert.equal(f.tracks.find(t => t.action === 'publish').track.readyState, 'ended', 'the judge voice stops');
});

test('a call that never joins times out and closes the listening strip', async () => {
  const f = fixture({ joined: false }); await f.open();
  await f.tick(20000);
  assert.equal(f.pcs[0].closed, true);
  assert.equal(f.strip(), false);
  assert.equal(f.replies().length, 0, 'no private greeting while the other person cannot hear');
});

test('a failed WebRTC connection shuts down even when its data channel never closes', async () => {
  const f = fixture(); await f.open();
  f.pcs[0].connectionState = 'failed'; f.pcs[0].onconnectionstatechange(); await flush();
  assert.equal(f.pcs[0].closed, true);
  assert.equal(f.strip(), false);
});

test('a late SDP failure cannot cancel a newer discussion opened by the other person', async () => {
  const f = fixture({ holdSdp: true, failSdp: true }); await f.open();
  f.topic.dismiss(); await flush();
  f.render({ id: 'talk-2', host: 'b', phase: 'listening' });
  await f.releaseSdp();
  assert.equal(f.requests.filter(r => r.action === 'cancel').length, 1);
  assert.equal(f.current.phase, 'listening');
  assert.equal(f.strip(), true);
});

test('the host stops queued speech when the other seat starts', async () => {
  const f = fixture(); await f.open();
  f.context.canChoose = false; await f.tick(1000);
  assert.equal(f.pcs[0].closed, true);
  assert.equal(f.tracks.at(-1).at, 1000);
});

test('a brief pause and a handoff between people never trigger a judge response', async () => {
  const f = fixture(); await f.open(); await f.tick(4000);
  const config = f.messages.find(m => m.type === 'session.update').session.audio.input.turn_detection;
  assert.equal(config.create_response, false);
  assert.equal(config.interrupt_response, true);
  await f.event('input_audio_buffer.speech_started');
  await f.tick(1500); await f.event('input_audio_buffer.speech_stopped');
  await f.tick(3999); assert.equal(f.replies().length, 1);
  await f.event('input_audio_buffer.speech_started');
  await f.tick(8000); assert.equal(f.replies().length, 1);
  await f.event('input_audio_buffer.speech_stopped');
  await f.tick(3999); assert.equal(f.replies().length, 1);
  await f.tick(1); assert.equal(f.replies().length, 2);
  assert.match(f.replies().at(-1).response.instructions, /^FULL LISTENING AND CONTENT RULES/);
});

test('the greeting waits too when people are already talking', async () => {
  const f = fixture({ joined: false }); await f.open();
  await f.event('input_audio_buffer.speech_started'); await f.tick(12000);
  f.context.joined = true; await f.tick(1500);
  assert.equal(f.replies().length, 0);
});

test('audio prepares without microphone capture or a provider call, and the greeting has no four-second hold', async () => {
  const f = fixture(); f.topic.prepare(); await flush();
  const prepared = f.pcs[0];
  assert.equal(f.requests.length, 0);
  assert.equal(f.network.length, 0);
  assert.equal(f.sources.length, 0);
  assert.equal(f.tracks.length, 0);
  await f.open();
  assert.equal(f.pcs.length, 1, 'opening reuses the prepared transport');
  assert.equal(f.pcs[0], prepared);
  assert.equal(f.replies().length, 1);
  assert.equal(f.replies()[0].at, 0, 'greeting is requested as soon as the shared voice is ready');
});

test('unused preparation expires and starting a round cancels an in-flight preparation', async () => {
  const f = fixture(); f.topic.prepare(); await f.tick(30000);
  assert.equal(f.pcs[0].closed, true);
  assert.equal(f.network.length, 0);
  f.topic.prepare(); f.topic.dismiss();
  assert.equal(f.pcs[1].closed, true);
});

test('repeated taps never create a second session or greeting', async () => {
  const f = fixture(); await f.open(); await f.open(); await f.tick(6000); await f.open();
  assert.equal(f.requests.filter(r => r.action === 'open').length, 1);
  assert.equal(f.pcs.length, 1);
  assert.equal(f.tracks.filter(t => t.action === 'publish').length, 1);
  assert.equal(f.replies().length, 1);
});

test('judge transcript appears over the cameras and is relayed to the other seat', async () => {
  const f = fixture(); await f.open();
  const overlay = f.elements.find(e => e.id === 'topicJudgeStrip' && e.isConnected);
  assert.equal(overlay.parentNode, f.context.stage);
  await f.event('response.output_audio_transcript.delta', { item_id: 'intro', delta: "Hi, I'm " });
  await f.event('response.output_audio_transcript.delta', { item_id: 'intro', delta: 'your judge.' });
  await f.event('output_audio_buffer.started'); await f.tick(120);
  const caption = f.elements.filter(e => e.className === 'topic-strip-transcript').at(-1);
  assert.equal(caption.textContent, "Hi, I'm your judge.");
  const update = f.appMessages.at(-1);
  assert.equal(update.text, caption.textContent);
  assert.equal(update.status, 'Speaking');
  await f.event('response.output_audio_transcript.done', { item_id: 'intro', transcript: "Hi, I'm your judge." });
  assert.equal(caption.textContent, "Hi, I'm your judge.", 'done replaces the delta rather than duplicating it');
  const peer = fixture({ uid: 'b' }); peer.render({});
  peer.topic.receive(update, 'outsider');
  const remote = peer.elements.filter(e => e.className === 'topic-strip-transcript').at(-1);
  assert.notEqual(remote.textContent, update.text);
  peer.topic.receive(update, 'a'); assert.equal(remote.textContent, update.text);
  peer.topic.receive({ ...update, seq: update.seq - 1, text: 'stale' }, 'a'); assert.equal(remote.textContent, update.text);
  peer.topic.receive({ ...update, id: 'old-talk', seq: 999, text: 'wrong talk' }, 'a'); assert.equal(remote.textContent, update.text);
  peer.topic.dismiss(); peer.render({}); assert.equal(peer.strip(), false);
});

test('reminders cannot interrupt either a person or judge playback', async () => {
  const f = fixture(); await f.open(); await f.tick(4000);
  await f.event('input_audio_buffer.speech_started');
  await f.tick(71000); assert.equal(f.nudges().length, 0);
  await f.event('input_audio_buffer.speech_stopped'); await f.tick(4000);
  await f.event('output_audio_buffer.started');
  await f.tick(71000); assert.equal(f.nudges().length, 0);
});

test('barge-in clears playback and cancels a request crossing speech on the wire', async () => {
  const f = fixture({ holdResponses: true }); await f.open(); await f.tick(4000);
  await f.event('input_audio_buffer.speech_started');
  assert.equal(f.messages.at(-1).type, 'output_audio_buffer.clear');
  await f.event('response.created');
  assert.ok(f.messages.some(m => m.type === 'response.cancel'));
  await f.event('response.done'); await f.event('output_audio_buffer.cleared');
  await f.tick(5000); assert.equal(f.replies().length, 1);
  await f.event('input_audio_buffer.speech_stopped'); await f.tick(4000);
  assert.equal(f.replies().length, 2);
});

const motionCall = { name: 'propose_motion', call_id: 'call-1', arguments: JSON.stringify({ motion: 'Shared experiences matter more than owning nice things.' }) };
async function proposalTurn(f) {
  await f.open(); await f.tick(4000); await f.event('response.done');
  await f.event('input_audio_buffer.speech_started'); await f.event('input_audio_buffer.speech_stopped');
  await f.tick(4000); await f.event('response.created');
}
test('tool follow-up waits for response.done even when the HTTP request finishes first', async () => {
  const f = fixture({ holdResponses: true }); await proposalTurn(f);
  await f.event('response.function_call_arguments.done', motionCall);
  assert.equal(f.requests.filter(r => r.action === 'propose').length, 1);
  assert.equal(f.replies().length, 2);
  assert.equal(f.messages.at(-1).item.type, 'function_call_output');
  await f.event('response.done'); assert.equal(f.replies().length, 3);
});

test('a slow rejected proposal also waits for silence and the updated conversation', async () => {
  const f = fixture({ holdResponses: true, holdPropose: true, rejectProposal: true }); await proposalTurn(f);
  await f.event('response.function_call_arguments.done', motionCall);
  await f.event('response.done');
  await f.event('input_audio_buffer.speech_started'); await f.releasePropose();
  await f.tick(10000); assert.equal(f.replies().length, 2);
  await f.event('input_audio_buffer.speech_stopped'); await f.tick(4000);
  assert.equal(f.replies().length, 3);
  assert.match(f.replies().at(-1).response.instructions, /whole conversation/);
});

test('buffered playback must finish before a tool follow-up', async () => {
  const f = fixture({ holdResponses: true }); await proposalTurn(f);
  await f.event('output_audio_buffer.started');
  await f.event('response.function_call_arguments.done', motionCall); await f.event('response.done');
  assert.equal(f.replies().length, 2);
  await f.event('output_audio_buffer.stopped'); assert.equal(f.replies().length, 3);
});

test('no proposal before anyone speaks or from an interrupted response', async () => {
  const f = fixture({ holdResponses: true }); await f.open(); await f.tick(4000);
  await f.event('response.function_call_arguments.done', motionCall);
  assert.equal(f.requests.filter(r => r.action === 'propose').length, 0);
  await f.event('input_audio_buffer.speech_started');
  await f.event('response.function_call_arguments.done', motionCall);
  assert.equal(f.requests.filter(r => r.action === 'propose').length, 0);
});

test('a proposal completing after dismiss cannot talk into a newer session', async () => {
  const f = fixture({ holdResponses: true, holdPropose: true }); await proposalTurn(f);
  await f.event('response.function_call_arguments.done', motionCall);
  f.topic.dismiss(); await flush();
  f.render({ id: 'talk-2', phase: 'listening' }); await f.open();
  const count = f.messages.length;
  await f.releasePropose();
  assert.equal(f.messages.length, count, 'no old tool output or spoken follow-up reaches the new data channel');
  await f.event('response.function_call_arguments.done', motionCall, f.pcs[0]);
  assert.equal(f.requests.filter(r => r.action === 'propose').length, 1);
});
