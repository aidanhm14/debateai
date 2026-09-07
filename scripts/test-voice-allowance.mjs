// Actual allowance route + actual minute gate, with only identity/storage mocked.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const values = new Map();
let reads = 0, fail = '', team = null, balance = 0;
const db = { collection: name => ({ doc: uid => ({ get: async () => {
  reads++; if (fail === name) throw Error('test unavailable');
  const data = values.get(name + '/' + uid); return { exists: !!data, data: () => data };
} }) }) };
globalThis.__voiceAllowanceTest = { db, team: async () => {
  reads++; if (fail === 'team') throw Error('test unavailable'); return team ? { team } : null;
}, balance: async () => { if (fail === 'tokens') throw Error('test unavailable'); return balance; } };
const hooks = registerHooks({ load(url, context, next) {
  let source;
  if (url.endsWith('/lib/firestore.mjs')) source = 'export const getDb=()=>globalThis.__voiceAllowanceTest.db;export const getUserTeam=()=>globalThis.__voiceAllowanceTest.team();export const FieldValue={serverTimestamp:()=>Date.now()};';
  if (url.endsWith('/lib/auth.mjs')) source = `export const extractBearerToken=r=>(r.headers.get('authorization')||'').replace('Bearer ','');export async function verifyIdToken(t){if(t==='invalid')throw Error('invalid');return {sub:t,email:t,firebase:{sign_in_provider:t==='guest'?'anonymous':'google.com'}};}export const isNamedAccount=d=>d.firebase.sign_in_provider!=='anonymous';export const isOwnerEmail=e=>e==='owner';`;
  if (url.endsWith('/lib/tokens.mjs')) source = 'export const getTokenBalance=()=>globalThis.__voiceAllowanceTest.balance();export const TOKENS={VOICE_ROUND:50};export const TOKENS_LIVE=false;';
  return source ? { format: 'module', shortCircuit: true, source } : next(url, context);
} });
const { default: handler } = await import('../app/netlify/functions/voice-allowance.mjs');
const { voiceGate } = await import('../app/netlify/functions/lib/voice-usage.mjs');
const { FREE_VOICE_MINUTES, PLAN_VOICE_MINUTES_MONTH, monthKey } = await import('../app/netlify/functions/lib/voice-minutes.mjs');
const request = (uid = 'alice', method = 'GET') => new Request('https://itsdebatable.com/api/voice-allowance', { method, headers: uid ? { authorization: 'Bearer ' + uid } : {} });
async function call(uid) {
  const response = await handler(request(uid));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  return response.json();
}
assert.equal((await handler(request('', 'POST'))).status, 405);
assert.equal((await handler(request('', 'OPTIONS'))).status, 204);
for (const uid of ['', 'invalid']) { const d = await call(uid); assert.equal(d.resolved, false); assert.equal(d.remaining, null); }
assert.equal((await call('guest')).reason, 'sign_in_required');
reads = 0; assert.equal((await call('owner')).reason, 'owner'); assert.equal(reads, 0, 'owner bypass precedes storage');
let data = await call();
assert.equal(data.remaining, FREE_VOICE_MINUTES); assert.equal(data.ok, true); assert.equal(data.unit, 'minutes');
values.set('voice_usage/alice', { usageVersion: 2, minutes: 1, rounds: 1 });
values.set('user_profiles/alice', { voiceSessionsUsed: 10 });
assert.equal((await call()).remaining, FREE_VOICE_MINUTES - 1, 'migrated minute history cannot be inflated by profile or modern rounds');
values.set('voice_usage/alice', { rounds: 1 });
values.set('user_profiles/alice', { voiceSessionsUsed: 2 });
assert.equal((await call()).used, 16, 'legacy profile and protected rounds overlap, not sum');
team = { plan: 'voice', status: 'active' };
values.set('voice_usage/alice', { usageVersion: 2, minutes: 999, monthKey: monthKey(Date.now()), monthMinutes: 119 });
data = await call(); assert.equal(data.period, 'month'); assert.equal(data.limit, PLAN_VOICE_MINUTES_MONTH);
assert.equal(data.remaining, 1); assert.equal(data.nextSessionMinutes, 1);
const gate = await voiceGate(db, 'alice', { named: true, hasPlan: true });
assert.equal(data.remaining, gate.remaining); assert.equal(data.ok, gate.allowed, 'route reports exactly the mint gate');
values.get('voice_usage/alice').monthMinutes = PLAN_VOICE_MINUTES_MONTH;
data = await call(); assert.equal(data.ok, false); assert.equal(data.reason, 'month_limit');
assert.equal(new Date(data.resetsAt).getUTCDate(), 1);
assert.equal(new Date(data.resetsAt).getUTCHours(), 0);
balance = 50; data = await call(); assert.equal(data.ok, true); assert.equal(data.tokenFunded, true); assert.equal(data.nextSessionMinutes, 8);
assert.equal(data.tokensLive, false, 'existing tokens remain usable when new purchases are disabled, matching the minter');
balance = 49; assert.equal((await call()).ok, false);
team = { plan: 'voice', status: 'canceled' }; data = await call(); assert.equal(data.hasPlan, false); assert.equal(data.reason, 'free_limit');
balance = 50; assert.equal((await call()).tokenFunded, true, 'free exhaustion also allows token funding'); balance = 0;
team = { plan: 'voice', status: 'active' };
values.get('voice_usage/alice').monthKey = '2020-01'; assert.equal((await call()).remaining, PLAN_VOICE_MINUTES_MONTH);
values.get('voice_usage/alice').monthKey = monthKey(Date.now());
for (const broken of ['user_profiles', 'team', 'voice_usage', 'tokens']) {
  fail = broken; data = await call(); assert.equal(data.resolved, false, broken + ' failure is unresolved'); assert.equal(data.remaining, null); assert.equal(data.ok, true, 'failed read does not invent a paywall');
}
fail = ''; process.env.VOICE_AI_ENABLED = 'false'; assert.equal((await call()).reason, 'voice_disabled'); delete process.env.VOICE_AI_ENABLED;
hooks.deregister(); delete globalThis.__voiceAllowanceTest;
console.log('Voice allowance: auth, owner, minute budgets, legacy migration, monthly cap/reset, tokens, read failures and no-store passed.');
