import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { summarizeCampaign } from '../app/netlify/functions/admin-campaign.mjs';

const source = fs.readFileSync(new URL('../app/js/track.js', import.meta.url), 'utf8');

function storage(initial = {}, blocked = false) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(i) { return [...values.keys()][i]; },
    getItem(key) { if (blocked) throw new Error('Storage blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error('Storage blocked'); values.set(key, String(value)); },
    removeItem(key) { if (blocked) throw new Error('Storage blocked'); values.delete(key); },
  };
}

async function tracker({ session = storage(), local = storage(), search = '', pathname = '/', automated = true } = {}) {
  const events = [], listeners = {}, intervals = new Map();
  let authChanged;
  const context = {
    console, URL, URLSearchParams, Date, Math, Promise,
    location: { pathname, search, hash: '', hostname: 'itsdebatable.com' },
    sessionStorage: session, localStorage: local,
    crypto: { randomUUID: () => 'test-' + Math.random().toString(36).slice(2) },
    navigator: { webdriver: automated, userAgent: 'Test browser', language: 'en' },
    screen: { width: 1280, height: 800 },
    document: {
      hidden: false, visibilityState: 'visible', title: 'Debatable', referrer: 'https://example.com/clip',
      querySelector: () => ({}), addEventListener: () => {},
    },
    firebase: { apps: [{}], initializeApp() {}, auth: () => ({ onAuthStateChanged(fn) { authChanged = fn; fn(null); return () => {}; } }) },
    gtag() {},
    fetch: async (url, init) => { events.push({ url, ...JSON.parse(init.body) }); return { ok: true }; },
    setTimeout: () => 1, clearTimeout() {},
    setInterval(fn) { const id = Symbol(); intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    removeEventListener() {},
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'track.js' });
  await new Promise(setImmediate);
  return { context, events, intervals, auth: (u) => authChanged(u), fire: (name, event = {}) => (listeners[name] || []).forEach(fn => fn(event)) };
}

test('blocked storage keeps arrival, campaign and completion events observable', async () => {
  const h = await tracker({ session: storage({}, true), local: storage({}, true), search: '?utm_source=creator&utm_medium=video&utm_campaign=pilot&utm_content=clip-a' });
  await h.context.track('app_event', { name: 'live_round_ballot' });
  h.fire('pagehide');
  const events = h.events.filter(e => e.url === '/api/log-event');
  assert.deepEqual(events.map(e => e.event), ['session_start', 'page_view', 'app_event', 'session_end']);
  assert.equal(new Set(events.map(e => e.metadata.session_id)).size, 1);
  for (const event of events) {
    assert.equal(event.metadata.utm_campaign, 'pilot');
    assert.equal(event.metadata.utm_medium, 'video');
    assert.equal(event.metadata.utm_content, 'clip-a');
  }
});

test('campaign follows navigation without double-counting the session', async () => {
  const session = storage(), local = storage();
  await tracker({ session, local, search: '?utm_source=creator&utm_medium=video&utm_campaign=pilot' });
  const next = await tracker({ session, local, pathname: '/spar' });
  assert.equal(next.events.filter(e => e.event === 'session_start').length, 0);
  const page = next.events.find(e => e.event === 'page_view');
  assert.equal(page.metadata.utm_campaign, 'pilot');
  assert.equal(page.metadata.entry_path, '/');
});

test('malformed campaign stash recovers the current tagged link', async () => {
  const h = await tracker({ session: storage({ _da_utm: '{broken' }), search: '?utm_source=creator&utm_campaign=pilot' });
  assert.equal(h.events.find(e => e.event === 'page_view').metadata.utm_campaign, 'pilot');
});

test('signing out stops the signed-in heartbeat', async () => {
  const h = await tracker();
  const before = h.intervals.size;
  h.auth({ uid: 'person', isAnonymous: false, getIdToken: async () => 'test-token' });
  assert.equal(h.intervals.size, before + 1);
  h.auth(null);
  assert.equal(h.intervals.size, before);
});

const at = Date.parse('2026-09-01T12:00:00Z');
const row = (id, uid, name, offset, metadata = {}) => ({ id, data: { uid, anon: uid.startsWith('anon:'), event: 'app_event', createdAt: at + offset, metadata: { name, session_id: id, ...metadata } } });

test('a campaign never gets credit for rounds before the first tagged visit', () => {
  const tagged = [row('touch', 'person', 'page_view', 0)];
  const extra = [row('before', 'person', 'live_round_start', -60_000), row('after', 'person', 'live_round_start', 60_000)];
  const result = summarizeCampaign(tagged, extra);
  assert.equal(result.rounds.started, 1);
  assert.equal(result.rounds.recent[0].id, 'after');
});

test('anonymous acquisition can be joined to a later signed-in round on that device', () => {
  const tagged = [row('touch', 'anon:device-a', 'page_view', 0, { anon_id: 'device-a' })];
  const extra = [row('round', 'person', 'live_round_start', 60_000, { anon_id: 'device-a' }), row('other', 'stranger', 'live_round_start', 60_000, { anon_id: 'device-b' })];
  assert.equal(summarizeCampaign(tagged, extra).rounds.started, 1);
});

test('distinct starters use full identities, even when displayed prefixes collide', () => {
  const tagged = [row('a', 'same-prefix-person-a', 'live_round_start', 0), row('b', 'same-prefix-person-b', 'live_round_start', 0)];
  assert.equal(summarizeCampaign(tagged, []).rounds.distinctStarters, 2);
});

test('overlapping query results do not count the same completion twice', () => {
  const complete = row('ballot', 'person', 'live_round_ballot', 60_000);
  const result = summarizeCampaign([row('touch', 'person', 'page_view', 0), complete, complete], [complete]);
  assert.equal(result.rounds.completed, 1);
});

test('an untagged later completion is attributed and reported separately', () => {
  const result = summarizeCampaign([row('touch', 'person', 'page_view', 0)], [row('ballot', 'person', 'live_round_ballot', 60_000)]);
  assert.equal(result.rounds.completed, 1);
  assert.equal(result.rounds.completedViaDevice, 1);
});

test('missing timestamps and unrelated devices never receive assisted credit', () => {
  const touch = row('touch', 'alice', 'page_view', 0, { anon_id: 'device-a' });
  const missing = row('missing', 'alice', 'voice_session_start', 1);
  delete missing.data.createdAt;
  const unrelated = row('other', 'bob', 'voice_session_start', 2, { anon_id: 'device-b' });
  assert.equal(summarizeCampaign([touch], [missing, unrelated]).rounds.started, 0);
});

const voiceSource = fs.readFileSync(new URL('../app/newvoice.html', import.meta.url), 'utf8');
const voiceHelper = voiceSource.slice(voiceSource.indexOf('function trackVoiceEvent('), voiceSource.indexOf('\n}', voiceSource.indexOf('function trackVoiceEvent(')) + 2);
const judgeFunction = voiceSource.slice(voiceSource.indexOf('function judgeRound(){'), voiceSource.indexOf('\n/* Feed the learning loop'));
async function voiceBallot(text) {
  const events = [], elements = new Map();
  function element() {
    const node = { hidden: false, className: '', appendChild() {}, querySelector() { return null; } };
    node.classList = { add() {}, remove() {}, contains(name) { return node.className.split(' ').includes(name); } };
    return node;
  }
  const context = {
    window: { track(event, metadata) { events.push({ event, metadata }); } },
    $: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    document: { createElement: element, createTextNode: () => ({}) },
    analyticsRoundId: 'finished-round', lastVerdictText: '', lastScore: null,
    turns: [{ who: 'you', text: 'My argument.' }, { who: 'ai', text: 'The objection.' }, { who: 'you', text: 'My reply.' }],
    roundStartIdx: 0, currentMotion: 'Cities should have more parks.', side: 'for', roundJudge: null,
    SCORE_CALIBRATION: '', postLeaderboard() {},
    fetch: async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ text }] }) }),
  };
  vm.runInNewContext(voiceHelper + '\n' + judgeFunction + '\njudgeRound();', context);
  context.analyticsRoundId = 'next-round';
  await new Promise(setImmediate);
  return events;
}

test('Voice AI records a valid verdict through the accepted event envelope, tied to the finished round', async () => {
  const events = await voiceBallot('Winner: The machine.\nScore: 42\nThe reply did not answer the objection.');
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'app_event');
  assert.equal(events[0].metadata.name, 'voice_rfd_handoff');
  assert.equal(events[0].metadata.round_id, 'finished-round');
  assert.equal(events[0].metadata.outcome, 'loss');
  assert.equal(events[0].metadata.surface, 'newvoice');
});

test('empty or malformed Voice AI verdicts do not count as completed rounds', async () => {
  for (const text of ['', 'No verdict available.', 'Winner: You.\nScore: 999\nBad score.']) {
    assert.equal((await voiceBallot(text)).length, 0);
  }
});

test('storage fallback preserves the trusted-human presence gate and invalidates legacy trust', async () => {
  for (const session of [storage({ _da_pgate: '1', _da_plast: String(Date.now()) }), storage({}, true)]) {
    const t = await tracker({ session, automated: false });
    const beats = () => t.events.filter(e => e.url === '/api/presence-live').length;
    assert.equal(beats(), 0);
    t.fire('pointerdown', { isTrusted: false });
    assert.equal(beats(), 0);
    t.fire('pointerdown', { isTrusted: true });
    assert.equal(beats(), 1);
    t.fire('pointerdown', { isTrusted: true });
    assert.equal(beats(), 1);
  }
});
