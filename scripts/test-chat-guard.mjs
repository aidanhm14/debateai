import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { chatFingerprint, blockedChatPromotion, chatIdentityKeys, activeChatBan, chatRateDecision, postChatMessage } from '../app/netlify/functions/lib/chat-guard.mjs';

const now = 2_000_000_000_000;
assert.equal(chatFingerprint(' Hello, WORLD! '), chatFingerprint('ｈｅｌｌｏ\u200b world'));
for (const text of ['visit trysetbuddy.com', 'TRYSETBUDDY . COM', 'tryset\u200buddy.com', 'trysetuddy.com']) assert.ok(blockedChatPromotion(text), text);
assert.equal(blockedChatPromotion('Read example.com for the study'), false);
assert.equal(activeChatBan({ active: true }, now), true);
assert.equal(activeChatBan({ active: true, until: now - 1 }, now), false);
assert.equal(activeChatBan({ active: false }, now), false);
assert.deepEqual(chatIdentityKeys({ uid: 'person', ip: 'IP' }), chatIdentityKeys({ uid: 'person', ip: ' ip ' }));
assert.equal(chatRateDecision([{ posts: [{ at: now - 5000, hash: 'same' }] }], 'same', now).reason, 'duplicate');
assert.equal(chatRateDecision([{ posts: [{ at: now - 600000, hash: 'same' }] }], 'same', now), null);
assert.equal(chatRateDecision([{ posts: [{ at: now - 1000, hash: 'other' }] }], 'new', now).reason, 'too-fast');
assert.equal(chatRateDecision([{ posts: Array.from({ length: 6 }, (_, i) => ({ at: now - 59000 + i * 5000, hash: '' + i })) }], 'new', now).reason, 'minute-limit');
assert.equal(chatRateDecision([{ posts: Array.from({ length: 40 }, (_, i) => ({ at: now - 3500000 + i * 60000, hash: '' + i })) }], 'new', now).reason, 'hour-limit');

function fixture() {
  const data = new Map(); let id = 0, queue = Promise.resolve();
  const snapshot = ref => ({ id: ref.id, exists: data.has(ref.path), data: () => structuredClone(data.get(ref.path)) });
  const db = {
    collection(name) {
      return { doc: (key = 'msg-' + ++id) => ({ id: key, path: name + '/' + key }),
        orderBy: () => ({ limit: n => ({ get: async () => ({ docs: [...data.entries()].filter(([k]) => k.startsWith(name + '/')).slice(-n).reverse().map(([path]) => snapshot({ path, id: path.split('/')[1] })) }) }) }) };
    },
    runTransaction(fn) {
      const work = queue.then(async () => {
        const writes = [];
        const result = await fn({ getAll: async (...refs) => refs.map(snapshot),
          set: (ref, value, opts) => writes.push(() => data.set(ref.path, opts?.merge ? { ...data.get(ref.path), ...value } : value)),
          create: (ref, value) => writes.push(() => { assert.equal(data.has(ref.path), false); data.set(ref.path, value); }) });
        if (db.fail) throw new Error('store unavailable');
        writes.forEach(write => write()); return result;
      });
      queue = work.catch(() => {}); return work;
    }, data,
  };
  return db;
}
const message = { uid: 'member', ip: 'one', handle: 'Alias', text: 'Anyone up for a round?', kind: 'message' };
let db = fixture();
const flood = await Promise.all(Array.from({ length: 12 }, () => postChatMessage(db, message, now)));
assert.equal(flood.filter(r => r.ok).length, 1, 'Only one concurrent duplicate is stored');
assert.equal([...db.data.keys()].filter(k => k.startsWith('community_chat/')).length, 1);
assert.equal((await postChatMessage(db, { ...message, text: 'A different post', ip: 'another' }, now + 5000)).reason, 'cooldown', 'Account cooldown survives IP rotation');
assert.equal((await postChatMessage(db, { ...message, uid: 'another', text: 'Different account' }, now + 5000)).reason, 'cooldown', 'IP cooldown survives account rotation');
assert.equal((await postChatMessage(db, { ...message, text: 'Can we debate remote work?' }, now + 301000)).ok, true);
assert.equal((await postChatMessage(db, message, now + 601000)).ok, true, 'A message can be repeated after the window expires');

db = fixture();
db.data.set('community_chat_bans/uid:member', { active: true });
assert.equal((await postChatMessage(db, message, now)).status, 403);
assert.equal([...db.data.keys()].filter(k => k.startsWith('community_chat/')).length, 0);
db = fixture(); db.fail = true;
await assert.rejects(postChatMessage(db, message, now));
assert.equal(db.data.size, 0, 'Failed transaction publishes nothing and spends no rate budget');

// Exercise the actual HTTP handler, including identity/privacy and spoofed headers.
globalThis.__chatGuardTest = { db: fixture() };
const hooks = registerHooks({ load(url, context, next) {
  if (url.endsWith('/lib/firestore.mjs')) return { format: 'module', shortCircuit: true,
    source: 'export const getDb=()=>globalThis.__chatGuardTest.db; export const FieldValue={serverTimestamp:()=>({seconds:2000000000})};' };
  if (url.endsWith('/lib/auth.mjs')) return { format: 'module', shortCircuit: true,
    source: `export const extractBearerToken=r=>(r.headers.get('authorization')||'').replace(/^Bearer /,'')||null;
    export const verifyIdToken=async t=>{if(t==='bad')throw Error('Invalid');return {sub:t,firebase:{sign_in_provider:'google.com'}}};
    export const isNamedAccount=d=>d.firebase.sign_in_provider!=='anonymous';` };
  return next(url, context);
} });
const { default: handler } = await import('../app/netlify/functions/chat-feed.mjs');
const send = (body, headers = {}) => handler(new Request('https://itsdebatable.com/api/chat-feed', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
assert.equal((await send({ handle: 'Alias', text: 'Hello' }, { authorization: 'Bearer bad' })).status, 401);
assert.equal((await send({ handle: 'Alias', text: 'visit trysetbuddy.com' })).status, 422);
assert.equal((await send(null)).status, 400);
let response = await send({ handle: 'Alias', text: 'Anyone up for a round?' }, { authorization: 'Bearer member', 'x-nf-client-connection-ip': 'real', 'x-forwarded-for': 'spoof' });
assert.equal(response.status, 200);
response = await send({ handle: 'Changed name', text: 'Anyone up for a round?' }, { authorization: 'Bearer member', 'x-nf-client-connection-ip': 'real', 'x-forwarded-for': 'other-spoof' });
assert.equal(response.status, 429); assert.ok(Number(response.headers.get('Retry-After')) > 0);
assert.ok([...globalThis.__chatGuardTest.db.data.keys()].includes('community_chat_limits/' + chatIdentityKeys({ ip: 'real' })[0]));
const publicFeed = await (await handler(new Request('https://itsdebatable.com/api/chat-feed'))).json();
assert.equal(publicFeed.rows.length, 1);
assert.equal(publicFeed.rows[0].named, true);
for (const field of ['uid', 'ip', 'photo', 'hash']) assert.equal(publicFeed.rows[0][field], undefined, field);
globalThis.__chatGuardTest.db.data.set('community_chat_bans/uid:member', { active: true });
assert.equal((await send({ handle: 'Alias', text: 'New message' }, { authorization: 'Bearer member' })).status, 403);
hooks.deregister(); delete globalThis.__chatGuardTest;

// Execute the shared chat renderer: removed rows disappear and failed sends keep drafts.
function element() {
  return { innerHTML: '', textContent: '', value: '', scrollTop: 0, scrollHeight: 100, clientHeight: 100, handlers: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {},
    addEventListener(k, fn) { this.handlers[k] = fn; }, appendChild(e) { this.children.push(e); },
    insertAdjacentHTML(_, html) { this.innerHTML += html; } };
}
const parent = element(), scroller = element(), input = element(), button = element();
scroller.parentNode = parent; input.parentNode = parent;
let rows = [{ id: 'removed', text: 'Spam to remove', handle: 'Spam' }, { id: 'kept', text: 'Hello', handle: 'Person' }];
let posts = 0, finishPost;
const context = { console, setInterval() {}, clearInterval() {}, requestAnimationFrame: fn => fn(),
  localStorage: { getItem: () => 'My alias' },
  document: { head: element(), createElement: element, dispatchEvent() {}, addEventListener() {} },
  CustomEvent: class {},
  fetch: async (_, opts) => {
    if (opts?.method === 'POST') { posts++; await new Promise(resolve => { finishPost = resolve; }); return { ok: false, json: async () => ({ error: 'You already posted that message.' }) }; }
    return { ok: true, json: async () => ({ rows, me: null }) };
  },
};
context.window = { addEventListener() {} };
vm.runInNewContext(readFileSync('app/js/community-chat.js', 'utf8'), context);
const chat = context.window.DEBATEAI_CHAT.init({ scroller, inputEl: input, sendBtn: button });
await new Promise(resolve => setImmediate(resolve));
assert.match(scroller.innerHTML, /Spam to remove/);
rows = [rows[1]]; await chat.refresh();
assert.doesNotMatch(scroller.innerHTML, /Spam to remove/);
assert.match(scroller.innerHTML, /Hello/);
rows = []; await chat.refresh(); assert.doesNotMatch(scroller.innerHTML, /Hello/);
input.value = 'Keep my draft';
const pending = button.handlers.click(); await button.handlers.click();
await new Promise(resolve => setImmediate(resolve));
assert.equal(posts, 1, 'Repeated clicks cannot submit while a request is pending');
finishPost(); await pending;
assert.equal(input.value, 'Keep my draft');
assert.match(parent.children[0].textContent, /already posted/);
assert.equal(button.disabled, false);
console.log('Chat protection: concurrent posts, rolling limits, normalized duplicates, cooldowns, bans, atomic failure, auth, privacy, deletion sync and draft retention passed.');
