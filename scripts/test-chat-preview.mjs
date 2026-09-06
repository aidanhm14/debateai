import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import vm from 'node:vm';
import { isChatPreviewEligible } from '../app/netlify/functions/lib/chat-preview.mjs';

const omitted = [
  'Nobody is here!', 'no one here', 'NOBODY’S HERE', 'no\u200bbody is online',
  'noone is actually chatting', 'There are zero people online',
  'nobody to debate with', 'Anyone here?', 'any one?', 'is there anyone',
  'is this an active page?', 'Is the server still active?', 'where is everyone?',
  'This server is dead', 'dead chat', 'this place is completely empty',
  'Oyaples dying rn cs of no updates', 'We havent seen any updates',
  'The app is broken', 'The app is bad', 'What a terrible app', 'this site sucks', 'it is a scam', 'nothing works',
  'I can’t find a match', 'I have been waiting for 20 minutes', 'wtf is this',
  'Safe introduction. '.repeat(12) + 'Nobody is here!',
];
const retained = [
  'Anyone up for a debate?', 'Anyone here want to debate remote work?',
  'I disagree with that argument', 'That policy is terrible',
  'Nobody is right about everything', 'Nobody should have to pay for parking',
  'The server is not dead', 'The app isnt broken', 'The app works now',
  'Remote work is bad for collaboration', 'The death of cash is overstated',
  'There are no people in this example', 'I am waiting for my friend to join',
  'Any updates on the next tournament?', 'Lots of people are hopping on',
  'working on app a lot today + UI but should be able to work with',
  'im down', 'We should get one today tho', 'Welcome to the server',
  'join discord to organize a time', 'wanna debate???', 'Ready in 10 minutes',
];
for (const text of omitted) assert.equal(isChatPreviewEligible(text), false, text);
for (const text of retained) assert.equal(isChatPreviewEligible(text), true, text);
for (const text of ['', '  ', null, {}, undefined]) assert.equal(isChatPreviewEligible(text), false);

// Run the actual public handler with read-only source fixtures. Filtering
// must happen before truncation and the 24-row cap, on every source path.
const sourceRow = text => ({ text, handle: 'Public handle', name: 'Public name',
  uid: 'private-account-id', photo: 'private-photo', createdAt: { seconds: 1700000000 } });
let commons = [sourceRow(omitted.at(-1)), sourceRow('wanna debate???')];
let channels = [sourceRow('The app is broken'), sourceRow('Remote work is bad for collaboration')];
let discord = [
  { content: 'Oyaples dying rn cs of no updates' },
  { content: 'Good start. '.repeat(15) + 'https://untrusted.example' },
  { content: '**Anyone up for a debate?**' },
  { content: 'Bot message', author: { bot: true } },
].map(m => ({ timestamp: '2026-09-06T18:00:00.000Z', author: { global_name: 'Public Discord name', id: 'private-discord-id' }, ...m }));
const original = JSON.stringify({ commons, channels, discord });
const snapshot = rows => ({ forEach: fn => rows.forEach(row => fn({ data: () => row })) });
const query = rows => ({ orderBy: () => ({ limit: n => ({ get: async () => snapshot(rows.slice(0, n)) }) }) });
const cache = new Map([['live-chats-v1', { messages: [{ text: 'Nobody is here!' }] }]]);
let cacheKey, reads = 0;
globalThis.__chatPreviewTest = {
  db: { collection(name) {
    reads++;
    if (name === 'community_chat') return query(commons);
    assert.equal(name, 'community_channels');
    return { doc: () => ({ collection: () => query(channels) }) };
  } },
  getCache: key => { cacheKey = key; return cache.get(key); },
  setCache: (key, value) => cache.set(key, value),
};
const hooks = registerHooks({ load(url, context, next) {
  if (url.endsWith('/lib/firestore.mjs')) return { format: 'module', shortCircuit: true,
    source: 'export const getDb=()=>globalThis.__chatPreviewTest.db; export const withDeadline=p=>p;' };
  if (url.endsWith('/lib/admin-cache.mjs')) return { format: 'module', shortCircuit: true,
    source: 'export const getCachedShared=k=>globalThis.__chatPreviewTest.getCache(k); export const setCachedShared=(k,v)=>globalThis.__chatPreviewTest.setCache(k,v); export const setCached=setCachedShared;' };
  return next(url, context);
} });
process.env.DISCORD_BOT_TOKEN = 'test-only';
process.env.DISCORD_CHAT_CHANNELS = '123456789012345';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.match(url, /^https:\/\/discord\.com\/api\/v10\/channels\/123456789012345\/messages\?limit=12$/);
  assert.equal(options.method, undefined, 'Discord is read only');
  return Response.json(discord);
};
const { default: handler } = await import('../app/netlify/functions/live-chats.mjs');
const call = () => handler(new Request('https://itsdebatable.com/api/live-chats'));
const payload = await (await call()).json();
assert.equal(cacheKey, 'live-chats-preview-v2', 'An old unfiltered cache must never be served');
assert.equal(payload.curated, true);
assert.equal(payload.messages.length, 9);
assert.ok(payload.messages.every(m => isChatPreviewEligible(m.text)));
assert.equal(payload.messages.find(m => m.room === 'discord').text, 'Anyone up for a debate?');
assert.equal(payload.messages.find(m => m.room === 'discord').at, Date.parse(discord[2].timestamp));
assert.equal(payload.messages.find(m => m.room === 'discord').handle, 'Public Discord name');
assert.doesNotMatch(JSON.stringify(payload), /private-account|private-discord|private-photo|untrusted/);
assert.equal(JSON.stringify({ commons, channels, discord }), original, 'Source messages remain untouched');
const previousReads = reads;
assert.deepEqual(await (await call()).json(), payload);
assert.equal(reads, previousReads, 'Shared preview cache still avoids repeat source reads');
commons = [sourceRow('Nobody is here!')]; channels = []; discord = [];
cache.clear();
assert.deepEqual((await (await call()).json()).messages, [], 'An all-filtered feed is empty, never padded');
hooks.deregister(); globalThis.fetch = originalFetch; delete globalThis.__chatPreviewTest;

// Exercise the shipped renderer through a populated poll followed by an
// empty poll. Previously an empty response left old messages on screen.
const landing = readFileSync('app/landing.html', 'utf8');
const renderer = landing.slice(landing.indexOf('  /* fsChats:'), landing.indexOf("    var canvas = document.getElementById('heroGlobeCanvas');"));
const code = renderer.slice(renderer.indexOf('(function(){'), renderer.lastIndexOf('  (function(){'));
function element() {
  const classes = new Set();
  return { children: [], innerHTML: '', scrollTop: 0, clientHeight: 100, scrollHeight: 200,
    appendChild(child) { this.children.push(child); }, setAttribute() {},
    classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) } };
}
const panel = element(), list = element();
list.innerHTML = '<div>Room links</div>';
let scheduled, nextPayload = payload;
const storage = new Map([['da-fs-chats', JSON.stringify({ at: Date.now(), messages: [{ text: 'Nobody is here!' }] })]]);
const context = { console, Date, setInterval: fn => { scheduled = fn; },
  sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  document: { hidden: false, getElementById: id => id === 'fsChats' ? panel : list,
    createDocumentFragment: element, createElement: element },
  fetch: async () => ({ ok: true, json: async () => nextPayload }),
};
context.window = { fetch: context.fetch, __fsChatsRooms: '<div>Room links</div>', matchMedia: () => ({ matches: true }) };
vm.createContext(context);
const kickoff = landing.indexOf('/* Parse-time, before the panel');
vm.runInContext(landing.slice(landing.indexOf('(function(){', kickoff), landing.indexOf('</script>', kickoff)), context);
assert.equal(context.window.__fsChatsCache, undefined, 'Old browser cache never becomes first paint');
vm.runInContext(code, context);
await new Promise(resolve => setImmediate(resolve));
assert.equal(panel.classList.contains('is-live'), true);
nextPayload = { messages: [], error: 'temporarily unavailable' };
scheduled();
await new Promise(resolve => setImmediate(resolve));
assert.equal(panel.classList.contains('is-live'), true, 'A failed poll preserves already curated messages');
nextPayload = { messages: [], curated: true };
scheduled();
await new Promise(resolve => setImmediate(resolve));
assert.equal(panel.classList.contains('is-live'), false);
assert.equal(list.innerHTML, '<div>Room links</div>');
assert.deepEqual(JSON.parse(storage.get('da-fs-chats-v2')).messages, []);
assert.doesNotMatch(landing, /getItem\('da-fs-chats'\)|setItem\('da-fs-chats'/);
console.log('Chat preview: selection, ordinary disagreement, complete-message checks, source privacy, cache migration and empty-feed clearing passed.');
