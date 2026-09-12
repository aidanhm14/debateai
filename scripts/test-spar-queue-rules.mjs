// FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 node scripts/test-spar-queue-rules.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Only a local emulator may run this test');
const project = 'demo-debatable';
const base = 'http://' + host;
const compile = await fetch(base + '/emulator/v1/projects/' + project + ':securityRules', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync(new URL('../app/firestore.rules', import.meta.url), 'utf8') }] } }),
});
const result = await compile.json();
assert.ok(compile.ok && !(result.issues || []).some(i => i.severity === 'ERROR'), JSON.stringify(result));
function token(uid, provider) {
  const now = Math.floor(Date.now() / 1000), enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  return enc({ alg: 'none', typ: 'JWT' }) + '.' + enc({ aud: project, iss: 'https://securetoken.google.com/' + project, sub: uid, user_id: uid, iat: now, exp: now + 3600, firebase: { sign_in_provider: provider } }) + '.';
}
const prefix = 'match-signin-' + Date.now() + '-';
async function request(id, auth, fields, expected, label) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = 'Bearer ' + auth;
  const res = await fetch(base + '/v1/projects/' + project + '/databases/(default)/documents/matchmaking_queue/' + id, {
    method: fields ? 'PATCH' : 'DELETE', headers,
    ...(fields ? { body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])) }) } : {}),
  });
  assert.equal(res.status, expected, label + ': ' + await res.text());
}
for (const provider of ['google.com', 'apple.com', 'password']) {
  const uid = prefix + provider, auth = token(uid, provider);
  const data = { uid, authProvider: provider, status: 'waiting' };
  await request(uid, auth, data, 200, provider + ' creates own queue entry');
  await request(uid, auth, { ...data, status: 'waiting' }, 200, provider + ' updates own entry');
  await request(uid + '-other', auth, data, 403, provider + ' cannot write another entry');
  await request(uid, auth, null, 200, provider + ' deletes own entry');
}
const uid = prefix + 'guest', anon = token(uid, 'anonymous');
const data = { uid, authProvider: 'anonymous', status: 'waiting' };
await request(uid, anon, data, 403, 'anonymous create is denied');
await request(uid, anon, { ...data, authProvider: 'google.com' }, 403, 'anonymous provider forgery is denied');
await request(uid, null, data, 403, 'signed-out create is denied');
await request(uid, 'owner', data, 200, 'emulator admin seeds a legacy guest entry');
await request(uid, anon, data, 403, 'legacy anonymous update is denied');
await request(uid, anon, null, 200, 'legacy anonymous owner can clean up');
console.log('PASS Firestore rules compile; named queue create/update, guest rejection, forged-provider rejection and legacy cleanup');
