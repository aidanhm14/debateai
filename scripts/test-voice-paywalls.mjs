import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { registerHooks } from 'node:module';
import * as minutes from '../app/netlify/functions/lib/voice-minutes.mjs';
import { planBypassesVoiceCap } from '../app/netlify/functions/lib/plans.mjs';
import * as guard from '../app/netlify/functions/lib/content-guard.mjs';
const now = Date.now(), free = minutes.budgetFor({ named: true });
const full = { usageVersion: 2, minutes: free.minutes };
assert.throws(() => minutes.applyMint(full, free, now, 'no-funds', { reserve: 8 }), { code: 'VOICE_ALLOWANCE_EXHAUSTED' });
assert.equal(minutes.applyMint({ ...full, minutes: free.minutes - 1 }, free, now, 'last', { reserve: 8 }).reserve, 1, 'stale preflight reserve is reduced to the actual remaining budget');
assert.equal(minutes.applyMint(full, free, now, 'continued', { allowOverBudget: true }).reserve, 8);
const quiet = { log() {}, warn() {}, error() {} };
for (const stem of ['coach-session', 'room-judge-session']) {
  let unavailable = '', reads = 0, fetches = 0, chargeFailure = false, exhausted = false, minted;
  const ctx = { ...guard, Response, Request, console: quiet, process: { env: { OPENAI_API_KEY: 'test' } },
    checkAppCheck: async () => ({ ok: true }), extractBearerToken: () => 'token',
    verifyIdToken: async () => ({ sub: 'alice', email: 'alice@example.invalid', firebase: { sign_in_provider: 'password' } }),
    isNamedAccount: () => true, isOwnerEmail: () => false, publicIdentity: () => ({ name: 'Alias' }),
    getDb: () => ({ collection: name => ({ doc: () => ({ get: async () => { reads++; if (unavailable === name) throw Error('storage down'); return { exists: false }; } }) }) }),
    getUserTeam: async () => { if (unavailable === 'team') throw Error('storage down'); return { team: { plan: 'voice', status: 'active' } }; },
    planBypassesVoiceCap, FREE_VOICE_NAMED: 20,
    voiceGate: async () => unavailable === 'usage' ? null : ({ allowed: !exhausted, used: 119, reserve: 1, remaining: 1, budget: { minutes: 120 } }),
    openVoiceSession: async (_db, _uid, options) => { if (chargeFailure) throw Error('write down'); minted = options; return { used: 120, reserve: 1, remaining: 0 }; },
    fetch: async () => { fetches++; return new Response(JSON.stringify({ value: 'ephemeral-test', session: { id: 'sess_actual' } })); },
  };
  const src = readFileSync('app/netlify/functions/' + stem + '.mjs', 'utf8').replace(/^import\b[\s\S]*?from ['"][^'"]+['"];\s*/gm, '').replace('export default async', 'globalThis.handler = async').replace('export const config', 'const config');
  vm.createContext(ctx); vm.runInContext(src, ctx);
  let seq = 0;
  const call = () => ctx.handler(new Request('https://itsdebatable.com/api/' + stem, { method: 'POST', headers: { 'x-nf-client-connection-ip': 'test-' + ++seq }, body: '{}' }));
  for (const broken of ['user_profiles', 'team', 'usage']) {
    unavailable = broken; const r = await call(); assert.equal(r.status, 503, stem + '/' + broken); assert.equal(fetches, 0);
  }
  unavailable = ''; exhausted = true; assert.equal((await call()).status, 402); assert.equal(fetches, 0);
  exhausted = false; chargeFailure = true; let r = await call(); assert.equal(r.status, 503); assert.equal((await r.json()).client_secret, undefined);
  chargeFailure = false; r = await call(); assert.equal(r.status, 200); const body = await r.json();
  assert.equal(body.session_id, minted.sessionId); assert.equal(body.reserveMinutes, 1); assert.equal(body.period, 'month'); assert.equal(body.used, 120);
  console.log(stem + ': unreadable budgets, exhaustion, failed metering, settlement ID and remaining minutes passed.');
}
// Real Firestore adapter with serialized transactions: two admitted preflights
// contend for the last minute, and only one receives a usable session.
let row = { usageVersion: 2, minutes: free.minutes - 1 }, serial = Promise.resolve();
const ref = {};
const db = { collection: () => ({ doc: () => ref }), runTransaction: fn => {
  const result = serial.then(() => fn({ get: async () => ({ exists: true, data: () => structuredClone(row) }), set: (_ref, value) => { row = structuredClone(value); } }));
  serial = result.catch(() => {}); return result;
} };
const hook = registerHooks({ load(url, context, next) {
  if (url.endsWith('/lib/firestore.mjs')) return { format: 'module', shortCircuit: true, source: 'export const FieldValue={serverTimestamp:()=>0};' };
  return next(url, context);
} });
const { openVoiceSession } = await import('../app/netlify/functions/lib/voice-usage.mjs');
const results = await Promise.allSettled(['a', 'b'].map(sessionId => openVoiceSession(db, 'alice', { named: true, sessionId, reserve: 8, nowMs: now })));
assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
assert.equal(results.find(r => r.status === 'fulfilled').value.reserve, 1);
assert.equal(results.find(r => r.status === 'rejected').reason.code, 'VOICE_ALLOWANCE_EXHAUSTED');
assert.equal(row.minutes, free.minutes);
await openVoiceSession(db, 'alice', { named: true, sessionId: 'funded', tokenFunded: true, reserve: 8, nowMs: now });
assert.equal(row.open.reserve, 8, 'server-approved token funding remains usable after minute exhaustion');
hook.deregister();
console.log('Concurrent voice admission: last-minute race, stale reserve and explicit token funding passed.');
