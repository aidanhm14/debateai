import { readPageSource } from './lib/page-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const elements = new Map();
function element(id) {
  const classes = new Set();
  const el = { value: '', hidden: false, disabled: false, textContent: '', handlers: {},
    addEventListener: (name, fn) => { el.handlers[name] = fn; },
    classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) },
    requestSubmit: () => el.handlers.submit({ preventDefault() {} }) };
  elements.set(id, el);
  return el;
}
const panel = element('fsChats'), form = element('fsChatCompose'), input = element('fsChatInput');
const send = element('fsChatSend'), status = element('fsChatStatus'), join = element('fsChatsJoin');
let posts = [], result = { ok: true, status: 200, data: { ok: true, row: { id: 'saved' } } };
const context = {
  document: { getElementById: id => elements.get(id) },
  window: { DBIdentity: { forUser: () => ({ name: 'Public Alias' }) }, addEventListener() {} },
  fetch: async (url, options) => {
    posts.push({ url, ...options });
    return { ok: result.ok, status: result.status, json: async () => result.data };
  }
};
vm.runInNewContext(readPageSource('app/js/landing-chat.js', 'utf8'), context);
const user = { uid: 'member', displayName: 'Private Real Name', email: 'private@example.test', getIdToken: async () => 'account-token' };
const setUser = context.window.DBLandingChat.setUser;
const submit = () => form.handlers.submit({ preventDefault() {} });
setUser(null);
input.value = 'A guest message';
await submit();
assert.equal(posts.length, 0);
assert.equal(form.hidden, true);
setUser({ ...user, isAnonymous: true });
await submit();
assert.equal(posts.length, 0, 'Anonymous accounts cannot submit from the homepage');
setUser(user);
assert.equal(form.hidden, false);
assert.equal(join.hidden, true);
assert.equal(panel.classList.contains('is-member'), true, 'A member can compose even with an empty feed');
assert.match(status.textContent, /Public Alias/);
input.value = '  Anyone up for a debate?  ';
await submit();
assert.equal(posts.length, 1);
assert.equal(posts[0].url, '/api/chat-feed');
assert.equal(posts[0].headers.Authorization, 'Bearer account-token');
assert.deepEqual(JSON.parse(posts[0].body), { handle: 'Public Alias', text: 'Anyone up for a debate?' });
assert.doesNotMatch(posts[0].body, /Private Real Name|private@example/);
assert.equal(input.value, '');
assert.equal(status.textContent, 'Sent to The Commons.');

for (const failure of [
  { ok: false, status: 429, data: { reason: 'too-fast' } },
  { ok: false, status: 422, data: { error: 'Please revise your message.' } },
  { ok: true, status: 200, data: { ok: false, reason: 'no-store' } }
]) {
  result = failure;
  input.value = 'Keep this draft';
  await submit();
  assert.equal(input.value, 'Keep this draft', 'Failed sends preserve the draft');
  assert.equal(send.disabled, false);
  assert.equal(status.classList.contains('is-error'), true);
}
const before = posts.length;
setUser({ ...user, getIdToken: async () => { throw new Error('Token unavailable'); } });
await submit();
assert.equal(posts.length, before, 'Token failure never falls back to anonymous posting');

let release;
setUser({ ...user, getIdToken: () => new Promise(resolve => { release = resolve; }) });
const pending = submit();
await submit();
assert.equal(send.disabled, true);
setUser(null);
release('old-token');
await pending;
assert.equal(posts.length, before, 'Signing out during token refresh cancels the pending send');
assert.equal(input.value, '');
assert.equal(join.hidden, false);
assert.equal(form.hidden, true);

let submits = 0;
form.requestSubmit = () => { submits++; };
for (const event of [{ key: 'Enter', isComposing: true }, { key: 'Enter', shiftKey: true }]) {
  input.handlers.keydown({ ...event, preventDefault() {} });
}
assert.equal(submits, 0, 'IME confirmation and Shift+Enter do not send');
input.handlers.keydown({ key: 'Enter', preventDefault() {} });
assert.equal(submits, 1);

const landing = readPageSource('app/landing.html', 'utf8');
assert.match(landing, /DBLandingChat\.setUser\(realUser\)/, 'The existing Firebase listener updates the composer');
assert.match(landing, /maxlength="280"/);
assert.match(landing, /first-screen-spar[^>]*>Meet someone/);
assert.match(landing, /mh-primary-label">Meet someone/);
console.log('Homepage chat: account gates, public alias, authenticated sends, failure retention, duplicate prevention, sign-out cancellation and keyboard input passed.');
