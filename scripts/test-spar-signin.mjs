// Exercise the real request handler with inert auth/storage dependencies.
// No Firebase project, account, or live queue is touched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../app/netlify/functions/spar-pair.mjs', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace('export default async (request) =>', 'globalThis.handler = async (request) =>');
let provider = 'anonymous', counter = 0, reads = 0, allowReads = false;
const collections = [];
const context = vm.createContext({
  process: { env: { GUEST_FREE_ROUNDS: '100' } }, console,
  setInterval: () => ({ unref() {} }),
  extractBearerToken: request => request.headers.get('Authorization'),
  verifyIdToken: async () => ({ sub: 'test-' + ++counter, firebase: { sign_in_provider: provider } }),
  getDb: () => ({ collection(name) {
    reads++; collections.push(name);
    if (!allowReads) throw new Error('Unexpected database access before gate');
    return { doc: () => ({ get: async () => ({ exists: false }) }) };
  } }),
  jsonResponse: (body, status) => ({ status, body }),
  errorResponse: (error, status) => ({ status, body: { error } }),
  corsResponse: () => ({ status: 204 }),
});
vm.runInContext(source, context);
for (const action of ['pair', 'consent', 'draft', 'cancel']) {
  const result = await context.handler(new Request('https://debatable.test/api/spar-pair', {
    method: 'POST', headers: { Authorization: 'fixture-token' },
    body: JSON.stringify({ action, peerUid: 'other', format: 'quick', accept: true }),
  }));
  assert.equal(result.status, 403, `anonymous ${action} is rejected`);
  assert.equal(result.body.code, 'SIGN_IN_REQUIRED');
}
assert.equal(reads, 0, 'rejected guests never reach storage, even with a stale environment allowance');
for (provider of ['google.com', 'apple.com', 'password']) {
  const result = await context.handler(new Request('https://debatable.test/api/spar-pair', {
    method: 'POST', headers: { Authorization: 'fixture-token' }, body: JSON.stringify({ action: 'pair' }),
  }));
  assert.equal(result.status, 400, `${provider} passes account gate and reaches peer validation`);
  assert.equal(result.body.error, 'Invalid peerUid');
}
console.log('PASS matcher rejects every guest human action before storage; Google, Apple and email pass the account gate');

// A converted guest's old ledger must not override their current account.
allowReads = true;
provider = 'password';
const converted = await context.handler(new Request('https://debatable.test/api/spar-pair', {
  method: 'POST', headers: { Authorization: 'fixture-token' },
  body: JSON.stringify({ action: 'pair', peerUid: 'converted-old-guest', format: 'quick' }),
}));
assert.equal(converted.body.code, 'AGE_BAND_REQUIRED', 'converted accounts reach the ordinary age check');
assert.ok(!collections.includes('guest_rounds'), 'retired guest counters never gate or charge named accounts');
