import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CONSENT_POLICY_VERSION, CONSENT_EVENTS, CONSENT_SURFACES } from '../app/netlify/functions/lib/consent.mjs';

const source = readFileSync(new URL('../app/netlify/functions/log-consent.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async', 'globalThis.handler = async').replace('export const config', 'const config');
function fixture({ fail = false, anonymous = false } = {}) {
  const writes = [], receipts = [], profile = {};
  const db = {
    collection: name => ({ doc: id => ({ name, id: id || 'receipt' }) }),
    batch: () => {
      const pending = [];
      return {
        set: (ref, value) => pending.push({ ref, value }),
        commit: async () => {
          if (fail) throw new Error('offline');
          writes.push(...pending);
          pending.forEach(({ ref, value }) => ref.name === 'consent_events' ? receipts.push(value) : Object.assign(profile, value));
        },
      };
    },
  };
  const ctx = {
    CONSENT_POLICY_VERSION, CONSENT_EVENTS, CONSENT_SURFACES,
    console: { error() {} }, setInterval() {},
    verifyIdToken: async () => ({ sub: 'person', firebase: { sign_in_provider: anonymous ? 'anonymous' : 'google.com' } }),
    extractBearerToken: () => 'token', getDb: () => db,
    FieldValue: { serverTimestamp: () => 'SERVER_TIME' },
    corsResponse: () => ({ status: 204 }),
    jsonResponse: (body, status) => ({ body, status }),
    errorResponse: (error, status) => ({ error, status }),
  };
  vm.runInNewContext(source, ctx);
  return { writes, receipts, profile, request: body => ctx.handler({ method: 'POST', json: async () => body }) };
}
const yes = { event: 'corpus_opt_in', surface: 'corpus-nudge', contribute: true, ageAttested: true, applyCorpusChoice: true };
for (const age of [undefined, false, 'true']) {
  const f = fixture();
  assert.equal((await f.request({ ...yes, ageAttested: age })).status, 400);
  assert.equal(f.writes.length, 0, 'no grant or receipt without adult confirmation');
}
for (const body of [{ ...yes, contribute: false }, { ...yes, event: 'transcript_grant' }]) {
  const f = fixture(); assert.equal((await f.request(body)).status, 400); assert.equal(f.writes.length, 0);
}
{
  const f = fixture({ anonymous: true }); assert.equal((await f.request(yes)).status, 401); assert.equal(f.writes.length, 0);
}
{
  const f = fixture({ fail: true }); assert.equal((await f.request(yes)).status, 500); assert.equal(f.writes.length, 0);
}
{
  const f = fixture(); assert.equal((await f.request(yes)).status, 200);
  assert.equal(f.profile.contributeToCorpus, true); assert.equal(f.profile.corpusAgeAttested, true);
  assert.equal(f.receipts[0].event, 'corpus_opt_in'); assert.equal(f.receipts[0].policyVersion, CONSENT_POLICY_VERSION);
  assert.equal(f.profile.contributeToCorpusUpdatedAt, 'SERVER_TIME');
  await f.request({ event: 'corpus_opt_out', contribute: false, applyCorpusChoice: true });
  assert.equal(f.profile.contributeToCorpus, false); assert.equal(f.profile.corpusAgeAttested, true, 'opting out does not invent or erase an age');
  assert.equal(f.receipts.length, 2);
}
{
  const f = fixture(); await f.request({ event: 'corpus_nudge_dismissed', surface: 'corpus-nudge' });
  assert.equal(f.profile.corpusNudgeDismissedAt, 'SERVER_TIME'); assert.equal(f.profile.contributeToCorpus, undefined);
  await f.request({ event: 'transcript_deny', surface: 'round-entry' });
  assert.equal(f.receipts.length, 2); assert.equal(f.profile.transcriptCapture, undefined, 'legacy receipt-only callers stay receipt-only');
}
const html = readFileSync(new URL('../app/profile.html', import.meta.url), 'utf8');
const render = html.slice(html.indexOf('function renderSettings('), html.indexOf('function wireSettings('));
for (const [profile, on, effective] of [ [{},true,false], [{contributeToCorpus:false,corpusAgeAttested:true},false,false], [{contributeToCorpus:true},true,false], [{contributeToCorpus:true,corpusAgeAttested:true},true,true] ]) {
  const storage = new Map();
  const ctx = { localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) }, escapeHtml: x => x, window: {} };
  vm.runInNewContext(render + '\nthis.render = renderSettings;', ctx);
  const output = ctx.render({}, profile);
  const checkbox = output.match(/<input id="setCorpus"[^>]*>/)[0];
  assert.equal(/checked/.test(checkbox), on);
  assert.equal(storage.get('debateos-corpus-contribute'), effective ? '1' : '0');
}
console.log('Research consent: adult gate, opt-outs, atomic receipts, save failure, dismissal, and profile defaults passed.');
