// Execute the shared browser engine against an in-memory Firestore adapter.
// It applies transforms before enforcing the frozen-participant and own-typing
// rules. No real accounts, messages, notifications, or network requests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/js/dm-core.js', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../app/firestore.rules', import.meta.url), 'utf8');
assert.match(rules, /request\.resource\.data\.participants == resource\.data\.participants/);
const clone = value => JSON.parse(JSON.stringify(value));
const denied = () => Object.assign(new Error('Permission denied'), { code: 'permission-denied' });
const fv = {
  arrayUnion: (...values) => ({ op: 'union', values }),
  increment: value => ({ op: 'increment', value }),
  serverTimestamp: () => ({ op: 'timestamp' }),
  delete: () => ({ op: 'delete' }),
};
function merge(old = {}, patch) {
  const next = clone(old);
  for (const [key, value] of Object.entries(patch)) {
    if (value?.op === 'delete') delete next[key];
    else if (value?.op === 'increment') next[key] = (next[key] || 0) + value.value;
    else if (value?.op === 'timestamp') next[key] = { seconds: Date.now() / 1000 };
    else if (value?.op === 'union') next[key] = [...new Set([...(next[key] || []), ...value.values])];
    else if (value && typeof value === 'object' && !Array.isArray(value)) next[key] = merge(next[key], value);
    else next[key] = clone(value);
  }
  return next;
}
function fixture(initial) {
  let thread = initial ? clone(initial) : null;
  let sequence = 0;
  const messages = new Map(), clients = [], notifications = [];
  function open(uid, participants) {
    let failNext = false;
    const msgCollection = {
      doc: id => ({ id: id || 'message-' + (++sequence), async set(data) {
        if (!thread?.participants.includes(uid) || data.fromUid !== uid) throw denied();
        if (failNext) { failNext = false; throw Object.assign(new Error('Offline'), { code: 'unavailable' }); }
        messages.set(id, clone(data));
      } }),
      orderBy() { return this; }, limitToLast() { return this; }, onSnapshot() { return () => {}; },
    };
    const threadRef = {
      collection: () => msgCollection,
      onSnapshot() { return () => {}; }, // Hold listeners: sending before hydration must work.
      async set(patch) {
        const next = merge(thread || {}, patch);
        if (!(thread || next).participants.includes(uid)) throw denied();
        if (thread && JSON.stringify(next.participants) !== JSON.stringify(thread.participants)) throw denied();
        for (const key of new Set([...Object.keys(thread?.typing || {}), ...Object.keys(next.typing || {})])) {
          if (key !== uid && JSON.stringify(thread?.typing?.[key]) !== JSON.stringify(next.typing?.[key])) throw denied();
        }
        thread = next;
      },
    };
    const win = { addEventListener() {}, removeEventListener() {} };
    const context = {
      window: win, document: { addEventListener() {}, removeEventListener() {} }, console,
      setTimeout, clearTimeout,
      firebase: { firestore: { FieldValue: fv }, auth: () => ({ currentUser: { uid, getIdToken: async () => 'test-only' } }) },
      fetch: async (_url, options) => { notifications.push(JSON.parse(options.body)); return { status: 200 }; },
    };
    vm.runInNewContext(source, context);
    const dm = win.DBDM.open({
      db: { collection: () => ({ doc: () => threadRef }) }, uid, threadId: 'a_b',
      thread: { participants, participantInfo: {}, lastMessage: '' }, senderName: () => uid,
    });
    clients.push(dm);
    return { dm, failOnce: () => { failNext = true; } };
  }
  return { open, messages, notifications, thread: () => thread, close: () => clients.forEach(dm => dm.close()) };
}

// Exactly the reported failure: the recipient follows a Message deep link,
// reconstructs [recipient, sender], and replies before thread hydration.
const reversed = fixture({ participants: ['a', 'b'], typing: { a: { seconds: 123 }, b: { seconds: 456 } }, unread: { a: 0, b: 1 } });
const reply = reversed.open('b', ['b', 'a']).dm;
await reply.send('hi', { replyTo: { id: 'received', name: 'a', text: 'hhi' } });
assert.deepEqual(reversed.thread().participants, ['a', 'b']);
assert.equal(reversed.messages.size, 1);
assert.equal([...reversed.messages.values()][0].replyToText, 'hhi');
assert.deepEqual(reversed.thread().typing, { a: { seconds: 123 } });
assert.deepEqual(reversed.thread().unread, { a: 1, b: 0 });
assert.equal(reply.view().messages[0].failed, false);
assert.equal(reply.view().messages[0].pending, false);
assert.equal(reversed.notifications.length, 1);
await reversed.open('a', ['a', 'b']).dm.send('hello');
assert.equal(reversed.messages.size, 2, 'both participants can send');
reversed.close();

// Both sides can initiate simultaneously without reordering whoever created
// the thread first. Neither relies on a successful read of a missing thread.
const fresh = fixture();
const first = fresh.open('a', ['a', 'b']).dm;
const second = fresh.open('b', ['b', 'a']).dm;
await Promise.all([first.send('hello'), second.send('hi')]);
assert.deepEqual(fresh.thread().participants, ['a', 'b']);
assert.equal(fresh.messages.size, 2);
fresh.close();

const group = fixture({ participants: ['c', 'a', 'b'], typing: {} });
await group.open('b', ['b', 'c', 'a']).dm.send('group reply');
assert.deepEqual(group.thread().participants, ['c', 'a', 'b']);
assert.equal(group.messages.size, 1);
group.close();

const retry = fixture({ participants: ['a', 'b'] });
const client = retry.open('b', ['b', 'a']);
client.failOnce();
await assert.rejects(client.dm.send('keep these words'), { code: 'unavailable' });
const failed = client.dm.view().messages[0];
assert.equal(failed.failed, true);
assert.equal(retry.notifications.length, 0);
await client.dm.retry(failed.id);
assert.equal(retry.messages.get(failed.id).text, 'keep these words');
assert.equal(retry.messages.size, 1);
assert.equal(client.dm.view().messages.length, 1);
assert.equal(client.dm.view().messages[0].failed, false);
assert.equal(retry.notifications.length, 1);
retry.close();

const privateThread = fixture({ participants: ['a', 'b'] });
await assert.rejects(privateThread.open('a', ['a', 'stranger']).dm.send('replace peer'), { code: 'permission-denied' });
await assert.rejects(privateThread.open('stranger', ['a', 'b', 'stranger']).dm.send('break in'), { code: 'permission-denied' });
assert.deepEqual(privateThread.thread().participants, ['a', 'b']);
assert.equal(privateThread.messages.size, 0);
assert.equal(privateThread.notifications.length, 0);
privateThread.close();
console.log('test-dm-core: reversed deep-link reply, two-way send, concurrent first sends, group reply, typing, unread, retry and membership privacy passed');
