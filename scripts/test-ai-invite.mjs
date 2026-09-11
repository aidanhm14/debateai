import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../app/js/ai-invite.js', import.meta.url), 'utf8');
const context = { module: { exports: {} } };
vm.runInNewContext(source, context);
const { canInvite } = context.module.exports;
const now = Date.now();
const empty = () => [{ online: 1, at: now }, { count: 0, debaters: [], at: now }, { count: 0, rounds: [], at: now }, { live: false }];
const eligible = data => canInvite(...data, 'me', now);
assert.equal(eligible(empty()), true, 'one visitor, nobody live');
const noPresenceYet = empty(); noPresenceYet[0].online = 0;
assert.equal(eligible(noPresenceYet), true, 'before own presence heartbeat');
const self = empty(); self[1] = { count: 1, debaters: [{ uid: 'me' }], at: now };
assert.equal(eligible(self), true, 'own Available pill is not another person');
const cases = [
  [0, { online: 2, at: now }, 'another visitor'],
  [0, { online: -1, at: now }, 'negative presence'],
  [0, { online: '0', at: now }, 'invalid presence'],
  [0, { online: 0, at: now - 360001 }, 'stale presence'],
  [1, { count: 1, debaters: [{ uid: 'peer' }], at: now }, 'another person waiting'],
  [1, { count: 2, debaters: [{ uid: 'me' }, { uid: 'peer' }], at: now }, 'self and peer'],
  [1, { count: 0, debaters: [], at: now - 60001 }, 'stale queue'],
  [1, { count: '0', debaters: [], at: now }, 'invalid queue'],
  [2, { count: 1, rounds: [{ room: 'live' }], at: now }, 'live round'],
  [2, { count: 0, rounds: [{ room: 'live' }], at: now }, 'inconsistent live list'],
  [2, { count: 0, rounds: [], at: now - 60001 }, 'stale watch list'],
  [3, { live: true }, 'active stream'],
  [3, {}, 'unknown stream'],
];
for (const [index, value, reason] of cases) {
  const data = empty(); data[index] = value;
  assert.equal(eligible(data), false, reason);
}
for (let i = 0; i < 4; i++) {
  const failed = empty(); failed[i].error = 'unavailable';
  assert.equal(eligible(failed), false, 'failed endpoint ' + i);
  const missing = empty(); missing[i] = null;
  assert.equal(eligible(missing), false, 'missing endpoint ' + i);
}
const stream = fs.readFileSync(new URL('../app/netlify/functions/stream-status.mjs', import.meta.url), 'utf8');
assert.match(stream, /out\.error = 'unavailable'/, 'a failed stream read must not report a confirmed empty site');
for (const [name, text] of [['hover', 'Hey, wanna debate me?'], ['alone', 'Wanna debate me? Press Debate the AI, and get a ranking.']]) {
  assert.equal(fs.readFileSync(new URL('../app/audio/ai-invite/' + name + '.txt', import.meta.url), 'utf8').trim(), text);
  assert.ok(fs.statSync(new URL('../app/audio/ai-invite/' + name + '.mp3', import.meta.url)).size > 1000);
}
console.log('AI invitations: real empty activity, self-filtering, other visitors, live rounds/streams, failed/stale/invalid reads and recorded scripts passed.');
