// Run the real notification handlers with storage, auth and delivery mocked.
// No real accounts, emails, SMS, device subscriptions, or network requests.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const values = new Map();
const clone = value => value === undefined ? value : structuredClone(value);
const snap = path => ({ id: path.split('/').at(-1), exists: values.has(path), data: () => clone(values.get(path)) });
function apply(path, patch, options) {
  const data = options?.merge ? clone(values.get(path) || {}) : {};
  for (const [k, v] of Object.entries(patch)) data[k] = v?.increment ? (data[k] || 0) + v.increment : clone(v);
  values.set(path, data);
}
const ref = path => ({ path, id: path.split('/').at(-1), get: async () => snap(path),
  collection: name => collection(path + '/' + name), set: async (v, o) => apply(path, v, o) });
const collection = path => ({ doc: id => ref(path + '/' + id), orderBy() { return this; }, limit() { return this; },
  get: async () => {
    const docs = [...values.keys()].filter(k => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).map(snap)
      .sort((a, b) => b.data().createdAt - a.data().createdAt).slice(0, 1);
    return { docs, empty: !docs.length };
  } });
let queue = Promise.resolve();
let retryPushClaim = false;
const db = { collection, doc: ref, runTransaction(fn) {
  const next = queue.then(async () => {
    let writes = [];
    const tx = { get: async r => { assert.equal(writes.length, 0); return snap(r.path); }, set: (r, v, o) => writes.push([r.path, v, o]) };
    let result = await fn(tx);
    if (retryPushClaim && writes.some(([, v]) => v.pushStatus === 'sending')) {
      // A competing invocation won while Firestore retried our callback.
      retryPushClaim = false;
      const [path] = writes[0]; apply(path, { pushStatus: 'sent' }, { merge: true });
      writes = []; result = await fn(tx);
    }
    for (const [path, v, o] of writes) apply(path, v, o);
    return result;
  });
  queue = next.catch(() => {}); return next;
} };
const state = { db, pushes: [], emails: [], rateOk: true,
  pushResult: { sent: 2, web: { sent: 1, subs: 1 }, native: { sent: 1, tokens: 1 } } };
globalThis.__dmPushTest = state;
globalThis.fetch = async () => { throw Error('Unexpected network access'); };
const hook = registerHooks({ load(url, context, next) {
  if (!url.includes('/app/netlify/functions/lib/')) return next(url, context);
  const mocks = {
    'firestore.mjs': `export const getDb=()=>globalThis.__dmPushTest.db; export const FieldValue={serverTimestamp:()=>Date.now(),increment:n=>({increment:n})};`,
    'auth.mjs': `export const extractBearerToken=r=>r.headers.get('Authorization')?.replace('Bearer ','');export const verifyIdToken=async token=>{if(token==='invalid') throw Error('bad token');return {sub:token,name:'PRIVATE REAL NAME'};};`,
    'auth-admin.mjs': `export const getAuthUserByUid=async uid=>({email:uid+'@example.invalid'});`,
    'rate-limit.mjs': `export const checkLayers=async()=>({ok:globalThis.__dmPushTest.rateOk});`,
    'webpush.mjs': `export const pushConfigured=()=>false;export const sendToUser=async(uid,payload)=>{globalThis.__dmPushTest.pushes.push({uid,payload});return globalThis.__dmPushTest.pushResult;};`,
    'sms.mjs': `export const sendSmsToUser=async()=>({sent:0});`,
    'email.mjs': `export const esc=String,brandHeader=()=>'',renderFooter=()=>'',SITE_URL='https://itsdebatable.com';export const isOptedOut=p=>!!p.optOut;export const sendEmail=async mail=>{globalThis.__dmPushTest.emails.push(mail);return {ok:true,id:'test-only'};};`,
  };
  const source = mocks[url.split('/').at(-1)];
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { default: notify } = await import('../app/netlify/functions/notify-dm.mjs');
const { default: legacy } = await import('../app/netlify/functions/push-send.mjs');
hook.deregister();
const threadPath = 'dm_threads/a_b';
function fixture(parts = ['a', 'b']) {
  values.clear(); state.pushes.length = 0; state.emails.length = 0; state.rateOk = true;
  state.pushResult = { sent: 2, web: { sent: 1, subs: 1 }, native: { sent: 1, tokens: 1 } };
  values.set(threadPath, { participants: parts, participantInfo: { a: { name: 'Public Alias' } }, groupName: 'Friends' });
  addMessage('one');
}
function addMessage(id, fromUid = 'a', createdAt = Date.now()) {
  values.set(threadPath + '/messages/' + id, { fromUid, createdAt, text: 'PRIVATE MESSAGE TEXT' });
}
async function call(handler = notify, body = { threadId: 'a_b', messageId: 'one' }, token = 'a') {
  const response = await handler(new Request('https://itsdebatable.com/api/test', {
    method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
}
const oldBody = { threadId: 'a_b', recipientUid: 'b', messageId: 'one' };

fixture();
let result = await call();
assert.equal(result.status, 200); assert.equal(result.body.push.sent, 2);
assert.equal(state.pushes[0].uid, 'b');
assert.equal(state.pushes[0].payload.title, 'New message from Public Alias');
assert.equal(state.pushes[0].payload.url, '/messages?thread=a_b');
assert.doesNotMatch(JSON.stringify(state.pushes), /PRIVATE/);
assert.doesNotMatch(JSON.stringify(state.emails), /PRIVATE|Public Alias|Friends|a_b/);
await call(); await call(legacy, oldBody); await call(legacy, { threadId: 'a_b', recipientUid: 'b' });
assert.equal(state.pushes.length, 1, 'new, legacy, and retry callers share one device claim');
assert.equal(state.emails.length, 1);
addMessage('two');
await call(notify, { threadId: 'a_b', messageId: 'two' });
assert.equal(state.pushes.length, 2, 'email cooldown must not suppress the next DM push');
assert.equal(state.emails.length, 1, 'email cooldown still applies');

fixture(['a', 'b', 'c', 'd']);
values.set('notify_prefs/c', { mutedThreads: ['a_b'] });
values.set('user_profiles/d', { optOut: true });
await call();
assert.deepEqual(state.pushes.map(p => p.uid).sort(), ['b', 'd'], 'mute silences all devices; email opt-out does not disable push');
assert.equal(state.pushes[0].payload.title, 'Public Alias posted in Friends');

fixture();
await Promise.all([call(), call(), call(legacy, oldBody)]);
assert.equal(state.pushes.length, 1, 'simultaneous callers cannot duplicate device alerts');
assert.equal(state.emails.length, 1);
fixture(); retryPushClaim = true;
await call();
assert.equal(state.pushes.length, 0, 'a retried transaction uses its final claim result');

fixture();
state.pushResult = { sent: 0, web: { sent: 0, subs: 1 }, native: { sent: 0, tokens: 0 } };
assert.equal((await call()).status, 502, 'failed provider delivery is retryable');
state.pushResult = { sent: 1, native: { sent: 1, tokens: 1 }, web: { configured: false, sent: 0 } };
assert.equal((await call()).body.push.sent, 1, 'native-only device succeeds without VAPID');
assert.equal(state.pushes.length, 2); assert.equal(state.emails.length, 1);
fixture(); state.pushResult = { sent: 1, native: { sent: 1, tokens: 1 }, web: { configured: false, sent: 0 } };
assert.equal((await call(legacy, oldBody)).body.sent, 1, 'legacy native-only send is also reachable');
fixture(); state.pushResult = { sent: 0, web: { subs: 0 }, native: { tokens: 0 } };
assert.equal((await call()).status, 200, 'no subscribed devices is a quiet no-op');

for (const [token, body, status] of [
  ['', { threadId: 'a_b', messageId: 'one' }, 401], ['invalid', { threadId: 'a_b', messageId: 'one' }, 401],
  ['c', { threadId: 'a_b', messageId: 'one' }, 403], ['b', { threadId: 'a_b', messageId: 'one' }, 403],
  ['a', { threadId: '../other', messageId: 'one' }, 400], ['a', { threadId: 'a_b', messageId: 'missing' }, 404],
]) {
  fixture(); assert.equal((await call(notify, body, token)).status, status); assert.equal(state.pushes.length, 0);
}
fixture(); addMessage('one', 'a', Date.now() - 11 * 60_000);
assert.equal((await call()).status, 409); assert.equal((await call(legacy, oldBody)).status, 409);
fixture(); assert.equal((await call(legacy, { ...oldBody, recipientUid: 'c' })).status, 403);
assert.equal((await call(legacy, oldBody, 'b')).status, 400);
addMessage('one', 'b'); assert.equal((await call(legacy, oldBody)).status, 403);
fixture(); state.rateOk = false;
assert.equal((await call()).status, 429); assert.equal((await call(legacy, oldBody)).status, 429);
assert.equal(state.pushes.length, 0);

// Run the real service worker in a mobile-like context with NO Notification
// constructor and no open tabs. Persistent notifications must still appear.
const handlers = {}, shown = [], opened = [];
const worker = { location: { origin: 'https://itsdebatable.com' }, addEventListener: (name, fn) => { handlers[name] = fn; },
  registration: { showNotification: async (title, options) => shown.push({ title, options }) },
  clients: { matchAll: async () => [], openWindow: async url => opened.push(url) } };
vm.runInNewContext(readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8'), { self: worker, URL, console });
let pending;
handlers.push({ data: { json: () => ({ title: 'New message from Public Alias', body: 'Tap to reply on Debatable.', tag: 'da-dm-a_b', url: '/messages?thread=a_b' }) }, waitUntil: p => { pending = p; } });
await pending; assert.equal(shown.length, 1);
handlers.notificationclick({ notification: { tag: 'da-dm-a_b', data: shown[0].options.data, close() {} }, waitUntil: p => { pending = p; } });
await pending; assert.equal(opened[0], '/messages?thread=a_b&src=push&pk=dm');

// In-page badge and toast remain, while the DM's OS banner comes from push.
const source = readFileSync(new URL('../app/js/notifications.js', import.meta.url), 'utf8');
const client = { myUid: 'b', prevUnread: {}, firstSnap: true, dmRows: [], dmUnread: 0, panel: null, pageEl: null,
  daIsMuted: () => false, renderBadge() {}, threadDisplay: () => ({ name: 'Public Alias' }), announce: (...args) => client.announced.push(args), announced: [] };
vm.runInNewContext(source.slice(source.indexOf('    function onThreads('), source.indexOf('    // ── panel', source.indexOf('    function onThreads('))) + '\nthis.onThreads = onThreads;', client);
const inbound = n => ({ forEach: fn => fn({ id: 'a_b', data: () => ({ unread: { b: n }, lastMessageFrom: 'a', lastMessage: 'Hello' }) }) });
client.onThreads(inbound(0)); client.onThreads(inbound(1));
assert.equal(client.dmUnread, 1); assert.equal(client.announced.length, 1); assert.equal(client.announced[0][2], true);
client.daIsMuted = () => true; client.onThreads(inbound(2));
assert.equal(client.dmUnread, 0); assert.equal(client.announced.length, 1);
const attention = { showToast() {}, daPing() {}, daFlashTitle() {}, daCanOsNotify: () => true, Notification: function () { attention.constructors++; }, constructors: 0 };
vm.runInNewContext(source.slice(source.indexOf('    function announce(disp'), source.indexOf('    function showToast(disp')) + '\nthis.announce = announce;', attention);
attention.announce({ name: 'Public Alias' }, 'private preview', true);
assert.equal(attention.constructors, 0, 'DMs rely on the persistent push banner, with no second OS constructor');
attention.announce({ name: 'Forum', isGroup: true }, 'Public reply');
assert.equal(attention.constructors, 1, 'existing forum reply notifications survive');

for (const page of ['spar', 'messages', 'friends', 'live-round']) {
  const html = readFileSync(new URL('../app/' + page + '.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=|\btype\s*=\s*["'](?:application\/ld\+json|module)["']/i.test(match[1])) continue;
    new vm.Script(match[2], { filename: page + '.html' });
  }
}
console.log('test-dm-push: actual handlers passed delivery, cooldown independence, mute, retry/deduplication, authorization, native-only, mobile worker, bell, and client syntax checks');
