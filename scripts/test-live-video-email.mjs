import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const spar = read('app/spar.html');
const notices = read('app/js/notifications.js');
const providers = ['google.com', 'apple.com', 'password'];
const account = provider => ({ uid: 'email-user', isAnonymous: false, emailVerified: false, providerData: [{ providerId: provider }] });

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Missing end of ${name}`);
}

for (const [label, source] of [['foreground', spar], ['background', notices]]) {
  const declaration = source.match(/var LIVE_VIDEO_PROVIDERS = (\[[^;]+);/)[0];
  const canJoin = new Function('u', `${declaration}\n${functionSource(source, 'liveVideoProvider')}\nreturn !!liveVideoProvider(u);`);
  for (const provider of providers) assert.equal(canJoin(account(provider)), true, `${label} admits ${provider}`);
  for (const provider of ['anonymous', 'phone', 'custom']) assert.equal(canJoin(account(provider)), false, `${label} rejects ${provider}`);
  assert.equal(canJoin({ ...account('password'), isAnonymous: true }), false);
  assert.equal(canJoin(null), false);
}

for (const [path, name, takesUser] of [
  ['app/live-round.html', 'isLiveVideoUser', true],
  ['app/js/live-popup.js', 'googleUser', false],
  ['app/watch.html', 'canSpectate', false],
]) {
  const source = functionSource(read(path), name);
  for (const provider of [...providers, 'anonymous', 'phone']) {
    const user = account(provider);
    const firebase = { apps: [{}], auth: () => ({ currentUser: user }) };
    const check = new Function('u', 'firebase', 'window', `${source}\nreturn ${name}(${takesUser ? 'u' : ''});`);
    assert.equal(check(user, firebase, { firebase }), providers.includes(provider), `${path} handles ${provider}`);
  }
}

for (const path of ['app/netlify/functions/spar-pair.mjs', 'app/netlify/functions/create-daily-room.mjs', 'app/netlify/functions/stage.mjs']) {
  const declaration = read(path).match(/const LIVE_VIDEO_PROVIDERS = new Set\((\[[^;]+)\);/);
  assert.ok(declaration, `${path} defines its admission providers`);
  assert.deepEqual(new Function(`return ${declaration[1]};`)(), providers, `${path} accepts exactly Google, Apple and email`);
}
const rulesProviders = read('app/firestore.rules').match(/function isLiveVideoAccount\(\)[\s\S]*?sign_in_provider in (\[[^\]]+\])/)[1];
assert.deepEqual(new Function(`return ${rulesProviders};`)(), providers, 'Firestore accepts the same providers');

// A linked account signed in using email must write password, even when
// Google is first in providerData. Rules compare this marker with the token.
const linked = { ...account('google.com'), providerData: [...account('google.com').providerData, ...account('password').providerData], getIdTokenResult: async () => ({ signInProvider: 'password' }) };
let written;
const background = {
  myUser: linked, myUid: linked.uid, myRef: {}, available: true,
  localStorage: { getItem: () => null },
  db: { runTransaction: async fn => fn({ get: async () => ({ exists: false }), set: (_, data) => { written = data; } }) },
  busyElsewhere: () => false, declineUntil: 0, activePair: () => false, foreignLiveDoc: () => false,
  stampMs: () => 0, FOREIGN_FRESH_MS: 1000, shortNm: () => 'Alias', publicUsername: () => 'alias',
  agBand: () => 'adult', fmt: () => 'casual', ts: () => 1,
  stopTimers() {}, watchOwnDoc() {}, startTimers() {}, scan() {}, overlay: null, navigating: false, console,
};
vm.createContext(background);
vm.runInContext(functionSource(notices, 'writeAvailableDoc'), background);
await background.writeAvailableDoc(null);
assert.equal(written.authProvider, 'password', 'background queue uses active email token for a linked account');

written = null;
const foreground = {
  state: { user: linked }, ref: { set(data) { written = data; return new Promise(() => {}); } },
  shortName: 'Alias', publicUsername: 'alias', currentPublicAvatarIdentity: () => null,
  window: { daAgeBand: () => 'adult' }, formatParam: 'casual', matchProfile: { mode: 'fast' }, blockedUids: [],
  DRAFT_ENABLED_CLIENT: false, firebase: { firestore: { FieldValue: { serverTimestamp: () => 1 } } },
};
vm.createContext(foreground);
vm.runInContext(functionSource(spar, 'writeQueueDoc'), foreground);
foreground.writeQueueDoc();
await Promise.resolve();
assert.equal(written.authProvider, 'password', 'foreground queue uses active email token for a linked account');
console.log('PASS email live-video admission, spectator gates, server/rule parity, and linked-account queue markers');
