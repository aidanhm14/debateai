import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('app/spar.html', 'utf8');
const marker = source.indexOf("event.target.closest('[data-consent-unavailable]')");
const script = source.slice(source.lastIndexOf("  document.addEventListener('click'", marker), source.indexOf('  // Re-render the consent card', marker));
assert.ok(marker > 0);
async function scenario({ consent = true, matched = false, release = true } = {}) {
  let click, answer, deleted = false, recovered = false, unmatches = 0;
  const button = { disabled: false };
  const state = { lastConsentDoc: { matchedWith: 'peer' } };
  const context = {
    state, Promise, Error, shell: { innerHTML: '' }, localStorage: { setItem() {} },
    document: { addEventListener: (_, fn) => { click = fn; }, getElementById: () => ({}) },
    sendConsent: () => new Promise(resolve => { answer = resolve; }),
    leaveQueueQuietly: () => { deleted = true; }, recoverConsentCard: () => { recovered = true; }, joinQueue() {},
    firebaseAuth: { currentUser: { getIdToken: async () => 'fixture' } },
    fetch: async () => { unmatches++; return { ok: release }; },
  };
  vm.createContext(context); vm.runInContext(script, context);
  click({ target: { closest: () => button } });
  assert.equal(state.pausingMatch, true);
  assert.equal(deleted, false, 'Do not delete our queue doc while peer release is in flight');
  if (matched) state.pausedMatchDoc = { status: 'matched' };
  answer(consent);
  for (let i = 0; i < 15; i++) await Promise.resolve();
  assert.equal(deleted, consent && release);
  assert.equal(recovered, !consent || !release);
  assert.equal(unmatches, consent && matched ? 1 : 0);
}
await scenario(); await scenario({ consent: false });
await scenario({ matched: true }); await scenario({ matched: true, release: false });
console.log('Foreground Unavailable: consent release, failure recovery and simultaneous completed match passed.');
