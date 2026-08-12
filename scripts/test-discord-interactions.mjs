#!/usr/bin/env node
// Guards the Discord interactions endpoint.
//
// The signature check is the whole security model: this URL is public, and
// anything that gets past verifyDiscordSignature can make the bot post in
// every server that installed it. Discord also REQUIRES a 401 on a bad
// signature and sends deliberately invalid ones while verifying the
// endpoint, so "rejects bad signatures" is both a security property and a
// functional one.
//
// Runs in the pre-commit hook.

import assert from 'node:assert';
import crypto from 'node:crypto';
import { verifyDiscordSignature, _internal } from '../app/netlify/functions/discord-interactions.mjs';

let pass = 0;
function ok(name, fn) {
  try { fn(); pass += 1; }
  catch (err) {
    console.error(`FAIL: ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}

// A real Ed25519 keypair, generated fresh. Testing the verifier against
// hand-written fixtures would only prove the fixtures match themselves.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicHex = publicKey.export({ format: 'der', type: 'spki' })
  .subarray(-32).toString('hex');

function sign(body, timestamp, key = privateKey) {
  return crypto.sign(null, Buffer.from(timestamp + body), key).toString('hex');
}

const BODY = JSON.stringify({ type: 1 });
const TS = '1723420000';

ok('accepts a correctly signed request', () => {
  assert.strictEqual(verifyDiscordSignature(BODY, sign(BODY, TS), TS, publicHex), true);
});

ok('rejects a signature over a DIFFERENT body', () => {
  const sig = sign(JSON.stringify({ type: 2 }), TS);
  assert.strictEqual(verifyDiscordSignature(BODY, sig, TS, publicHex), false);
});

ok('rejects a signature over a DIFFERENT timestamp (replay guard)', () => {
  const sig = sign(BODY, '1723999999');
  assert.strictEqual(verifyDiscordSignature(BODY, sig, TS, publicHex), false);
});

ok('rejects a signature from a DIFFERENT key', () => {
  const other = crypto.generateKeyPairSync('ed25519');
  assert.strictEqual(verifyDiscordSignature(BODY, sign(BODY, TS, other.privateKey), TS, publicHex), false);
});

// Discord's endpoint-verification probe sends exactly this shape of junk.
ok('returns false (never throws) on malformed input', () => {
  const junk = [
    [BODY, 'not-hex', TS, publicHex],
    [BODY, sign(BODY, TS), TS, 'not-a-key'],
    [BODY, '', TS, publicHex],
    [BODY, sign(BODY, TS), '', publicHex],
    ['', sign(BODY, TS), TS, publicHex],
    [BODY, 'ff'.repeat(64), TS, publicHex],
    [BODY, sign(BODY, TS), TS, 'ab'.repeat(32)],
    [null, null, null, null],
    [undefined, undefined, undefined, undefined],
  ];
  for (const args of junk) {
    const out = verifyDiscordSignature(...args);
    assert.strictEqual(out, false, `expected false for ${JSON.stringify(args).slice(0, 60)}`);
  }
});

ok('an empty public key never verifies', () => {
  assert.strictEqual(verifyDiscordSignature(BODY, sign(BODY, TS), TS, ''), false);
});

// ── Command surface ───────────────────────────────────────────────────
const { COMMANDS, optionValue, pick } = _internal;

ok('every command answers inside one synchronous call', () => {
  // The 3 second interaction deadline is the reason none of these may be
  // async or call a model. If one starts returning a Promise, this fails.
  for (const [name, fn] of Object.entries(COMMANDS)) {
    const out = fn({ id: '1234567890123456789', data: { name, options: [] } });
    assert.ok(out && typeof out.then !== 'function', `${name} returned a Promise; it must answer synchronously`);
    assert.strictEqual(out.type, 4, `${name} did not return a message response`);
    assert.ok(typeof out.data.content === 'string' && out.data.content.length > 0, `${name} returned empty content`);
    assert.ok(out.data.content.length <= 2000, `${name} exceeded Discord's 2000 character cap`);
    assert.deepStrictEqual(out.data.allowed_mentions, { parse: [] }, `${name} can ping people`);
  }
});

ok('no command output contains an em-dash', () => {
  for (const [name, fn] of Object.entries(COMMANDS)) {
    const out = fn({ id: '1234567890123456789', data: { name, options: [] } });
    assert.ok(!out.data.content.includes('—'), `${name} used an em-dash`);
  }
});

ok('/motion honours the format option', () => {
  const out = COMMANDS.motion({
    id: '1234567890123456789',
    data: { name: 'motion', options: [{ name: 'format', value: 'ld' }] },
  });
  assert.ok(out.data.content.includes('itsdebatable.com/practice'), 'no debate link');
});

ok('/motion survives an unknown format instead of erroring', () => {
  const out = COMMANDS.motion({
    id: '999', data: { name: 'motion', options: [{ name: 'format', value: 'kabaddi' }] },
  });
  assert.strictEqual(out.type, 4);
  assert.ok(out.data.content.length > 20, 'fell through to an empty answer');
});

ok('optionValue returns empty string for a missing option', () => {
  assert.strictEqual(optionValue({ data: { options: [] } }, 'format'), '');
  assert.strictEqual(optionValue({ data: {} }, 'format'), '');
  assert.strictEqual(optionValue({}, 'format'), '');
  assert.strictEqual(optionValue(null, 'format'), '');
});

ok('pick is stable for one seed and varies across seeds', () => {
  const arr = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.strictEqual(pick(arr, 'seed-1'), pick(arr, 'seed-1'), 'not stable for one seed');
  const seen = new Set(Array.from({ length: 40 }, (_, i) => pick(arr, 'id-' + i)));
  assert.ok(seen.size > 1, 'pick returned the same element for every seed');
  assert.strictEqual(pick([], 'x'), null, 'empty array did not return null');
});

ok('/blocks and /round are ephemeral, /motion is not', () => {
  const eph = (n) => COMMANDS[n]({ id: '1', data: { name: n, options: [] } }).data.flags;
  // A motion is content the whole channel benefits from seeing. A link to
  // go do something is noise for everyone except the person who asked.
  assert.strictEqual(eph('blocks'), 64, '/blocks should be ephemeral');
  assert.strictEqual(eph('round'), 64, '/round should be ephemeral');
  assert.strictEqual(eph('motion'), 0, '/motion should be public');
});

if (process.exitCode) {
  console.error(`\ntest-discord-interactions: ${pass} passed, failures above.`);
} else {
  console.log(`test-discord-interactions: ${pass}/${pass} checks passed.`);
}
