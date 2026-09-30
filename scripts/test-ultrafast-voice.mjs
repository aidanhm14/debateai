import assert from 'node:assert/strict';
import { checkUltrafastAccess, reserveUltrafastVoice, ULTRAFAST_VOICE_MS } from '../app/netlify/functions/lib/ultrafast-voice.mjs';
import { liveVoiceConfig } from '../app/netlify/functions/lib/live-voice.mjs';

const access = { decoded: { sub: 'owner', email_verified: true, firebase: { sign_in_provider: 'google.com' } }, owner: true, live: true, byok: false, training: null };
checkUltrafastAccess(access);
for (const patch of [{ owner: false }, { decoded: null }, { decoded: { ...access.decoded, email_verified: false } }, { decoded: { ...access.decoded, firebase: { sign_in_provider: 'anonymous' } } }, { enabled: false }]) {
  assert.throws(() => checkUltrafastAccess({ ...access, ...patch }), { code: 'ULTRAFAST_PRIVATE' });
}
for (const patch of [{ live: false }, { byok: true }, { training: {} }]) {
  assert.throws(() => checkUltrafastAccess({ ...access, ...patch }), { code: 'ULTRAFAST_UNSUPPORTED' });
}

let stored = {}, chain = Promise.resolve();
const db = {
  collection: name => { assert.equal(name, 'voice_ultrafast_trials'); return { doc: uid => { assert.equal(uid, 'owner'); return uid; } }; },
  runTransaction(fn) {
    const result = chain.then(() => fn({ get: async () => ({ exists: true, data: () => stored }), set: (_ref, value) => { stored = value; } }));
    chain = result.catch(() => {}); return result;
  },
};
const now = Date.parse('2026-09-30T12:00:00Z');
const attempts = await Promise.allSettled([0, 1, 2, 3].map(offset => reserveUltrafastVoice(db, 'owner', { now: now + offset })));
assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 2, 'concurrent starts cannot exceed the daily allowance');
assert.equal(stored.rounds.length, 2);
assert.equal(attempts[2].reason.code, 'ULTRAFAST_DAILY_LIMIT');
const continuation = await reserveUltrafastVoice(db, 'owner', { continued: true, iat: now, now: now + 30_000 });
assert.equal(continuation.expiresAt, now + ULTRAFAST_VOICE_MS, 'a voice switch preserves the original deadline');
assert.equal(stored.rounds.length, 2, 'continuations consume no extra daily start');
await assert.rejects(reserveUltrafastVoice(db, 'owner', { continued: true, iat: now - 10, now }), { code: 'ULTRAFAST_EXPIRED' });
await assert.rejects(reserveUltrafastVoice(db, 'owner', { continued: true, iat: now, now: now + ULTRAFAST_VOICE_MS }), { code: 'ULTRAFAST_EXPIRED' });
const tomorrow = now + 86400_000;
assert.equal((await reserveUltrafastVoice(db, 'owner', { now: tomorrow })).expiresAt, tomorrow + ULTRAFAST_VOICE_MS);
assert.equal(stored.rounds.length, 1);
await assert.rejects(reserveUltrafastVoice({ ...db, runTransaction: async () => { throw Error('offline'); } }, 'owner'), /offline/);

const options = { instructions: 'Keep the side assigned.', motion: 'Cities should make buses free', side: 'gov', voice: 'marin', difficulty: 'standard' };
const normal = liveVoiceConfig(options), trial = liveVoiceConfig({ ...options, ultrafast: true });
assert.equal(normal.delegation.responses.service_tier, undefined);
assert.equal(trial.model, normal.model);
assert.equal(trial.delegation.responses.model, 'gpt-6-astra');
assert.equal(trial.delegation.responses.service_tier, 'ultrafast');
assert.equal(trial.delegation.responses.reasoning.effort, 'low');
assert.equal(trial.delegation.responses.max_output_tokens, 1200);
assert.match(trial.instructions, /Delegate each new argument before speaking it/);
assert.doesNotMatch(normal.instructions, /Delegate each new argument before speaking it/);
assert.deepEqual(trial.delegation.responses.tools, normal.delegation.responses.tools);
console.log('Ultrafast voice: owner isolation, daily admission, immutable continuation deadline, closed metering failures and scoped backend configuration passed.');
