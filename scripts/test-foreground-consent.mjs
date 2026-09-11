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

// Execute the entry and subscription code offline. A fresh visitor must
// reach the real queue write without a questionnaire, while a queue count
// or a one-sided proposal must never navigate into a room.
const fn = name => {
  const found = source.match(new RegExp('  function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}'));
  assert.ok(found, name + ' exists');
  return found[0];
};
const settle = async () => { for (let n = 0; n < 15; n++) await Promise.resolve(); };
const writes = [], events = [];
let snapshot, allowed = true, age = 'adult';
const queue = {
  get: async () => ({ exists: false }),
  set: async data => { writes.push(data); },
  onSnapshot(cb) { snapshot = cb; return () => {}; },
};
const entry = {
  console, Promise, Date, JSON, Object, Array,
  DBLiveJourney: { event() {}, watch(ref, options) { return ref.onSnapshot(options.value); } },
  state: { user: { uid: 'me', getIdTokenResult: async () => ({ signInProvider: 'password' }) }, profileReady: false }, matchProfile: null,
  activeMatchProfileRun: null, shell: { innerHTML: '' },
  firebaseDb: { collection: () => ({ doc: () => queue }) },
  firebase: { firestore: { FieldValue: { serverTimestamp: () => ({ seconds: Date.now() / 1000 }) } } },
  localStorage: { getItem: () => null, setItem() {} },
  window: { daAskAgeBand: () => events.push('age'), daAgeBand: () => age },
  document: { body: { classList: { remove() {} } } },
  canQueue: () => allowed, renderGate: () => events.push('account'),
  cleanMatchProfile: value => value, MATCH_PROFILE_VERSION: 5,
  startMatchProfileFlow: () => { throw new Error('The questionnaire blocked entry'); },
  logSparAttempt() {}, shortNameOf: () => 'Alias', liveVideoProvider: () => 'google.com',
  currentPublicAvatarIdentity: () => null, formatParam: 'open', DRAFT_ENABLED_CLIENT: false,
  renderSearching() {}, startCountdown() {}, startQueueHeartbeat() {}, startMatchPolling: () => events.push('search'),
  stampMs: at => at ? at.seconds * 1000 : 0,
  pingMatchFound() {}, teardownQueue() {}, renderMatched: () => events.push('matched'),
  navigateToRound: () => events.push('navigate'), renderConsentGate: () => events.push('offer'),
  profileFromAnswers: answers => answers,
  saveMatchProfileLocal: () => events.push('save'),
};
vm.createContext(entry);
for (const name of ['defaultMatchProfile', 'joinQueue', 'subscribeMyDoc', 'closeMatchProfileForMatch']) {
  vm.runInContext(fn(name), entry);
}
entry.joinQueue(true); await settle();
assert.equal(writes.length, 1);
assert.equal(writes[0].status, 'waiting');
assert.equal(writes[0].authProvider, 'password', 'Email sign-in reaches the real queue with its active provider');
assert.equal(writes[0].matchMode, 'fast');
assert.equal(writes[0].matchProfileReady, false);
assert.equal('economy' in writes[0], false, 'Political answers never enter the public queue');
assert.deepEqual(events, ['search']);

entry.matchProfile = { mode: 'rating' };
entry.joinQueue(true); await settle();
assert.equal(writes[1].matchMode, 'rating', 'Saved preferences still apply');
allowed = false;
entry.joinQueue(true); await settle();
assert.equal(writes.length, 2); assert.equal(events.at(-1), 'account');
allowed = true; age = '';
entry.joinQueue(true); await settle();
assert.equal(writes.length, 2); assert.equal(events.at(-1), 'age');

events.length = 0;
snapshot({ exists: true, data: () => ({ status: 'waiting' }) });
assert.deepEqual(events, [], 'Waiting alone must not offer or enter a room');
entry.state.profileFlowOpen = true;
entry.activeMatchProfileRun = { answers: { mode: 'rating', economy: 'redistribute' }, close: () => events.push('close') };
snapshot({ exists: true, data: () => ({ status: 'consent', room: 'room', matchedWith: 'peer', consents: { me: false, peer: true } }) });
assert.deepEqual(events, ['save', 'close', 'offer'], 'A real invitation takes priority and preserves local progress');
assert.equal(entry.matchProfile.economy, 'redistribute');
assert.equal(entry.state.profileFlowOpen, false);
snapshot({ exists: true, data: () => ({ status: 'matched', room: 'room', matchedWith: 'peer' }) });
assert.deepEqual(events.slice(-2), ['matched', 'navigate'], 'Only a completed match enters the room');
console.log('Foreground entry: optional preferences, account/age gates, saved progress and ready-room priority passed.');
