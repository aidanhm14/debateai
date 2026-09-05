import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

// Exercise real signature verification and the deployed handlers without any
// provider calls. This key exists only in memory for this test process.
process.env.ANTHROPIC_API_KEY = 'test-unused';
process.env.OPENAI_API_KEY = 'test-unused';
process.env.APP_CHECK_REQUIRED = 'false';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'account-gate-test' };
let externalCalls = 0;
globalThis.fetch = async (url) => {
  if (String(url).includes('service_accounts/v1/jwk/securetoken')) {
    return Response.json({ keys: [jwk] });
  }
  externalCalls++;
  throw new Error('Unexpected external request: ' + String(url));
};
function token(provider, email) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [
    { alg: 'RS256', typ: 'JWT', kid: jwk.kid },
    { sub: 'account-gate-test', aud: 'debateos-78ac5', iss: 'https://securetoken.google.com/debateos-78ac5',
      iat: now, exp: now + 60, email, firebase: provider ? { sign_in_provider: provider } : {} },
  ].map(v => Buffer.from(JSON.stringify(v)).toString('base64url'));
  return parts.join('.') + '.' + sign('RSA-SHA256', Buffer.from(parts.join('.')), privateKey).toString('base64url');
}
function request(bearer, body = {}) {
  return new Request('https://itsdebatable.com/api/test', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(bearer ? { authorization: 'Bearer ' + bearer } : {}) },
    body: JSON.stringify(body),
  });
}
const { default: claude } = await import('../app/netlify/functions/claude.mjs');
const { default: realtime } = await import('../app/netlify/functions/realtime-session.mjs');
const { default: coach } = await import('../app/netlify/functions/coach-session.mjs');
const { requirePaidPlan } = await import('../app/netlify/functions/lib/auth.mjs');
for (const [name, handler] of [['Claude', claude], ['Realtime', realtime]]) {
  for (const [kind, bearer] of [['tokenless', null], ['anonymous', token('anonymous')], ['missing provider', token(null)], ['invalid token', 'invalid']]) {
    const response = await handler(request(bearer, { continuation: 'forged', messages: [] }));
    assert.equal(response.status, 401, name + ' rejects ' + kind);
    assert.equal((await response.json()).code, 'SIGN_IN_REQUIRED');
    console.log('PASS', name, 'rejects', kind, 'before spending');
  }
}
const anon = token('anonymous');
assert.equal((await coach(request(anon))).status, 401);
assert.equal((await requirePaidPlan(request(anon), 'GPT')).code, 'SIGN_IN_REQUIRED');
const owner = token('google.com', 'aidandavidhollinger@gmail.com');
assert.equal((await requirePaidPlan(request(owner), 'GPT')).ok, true);
assert.equal(externalCalls, 0, 'no model, quota, or Firestore calls for denied users');
console.log('PASS coach and paid brains refuse anonymous identities; a verified named owner is admitted');
