// Test harness for app/js/prefs-sync.js.  node scripts/test-prefs-sync.mjs
//
// Stubs localStorage plus the slice of the firebase compat API the module
// touches, then walks the merge cases that are painful to reproduce by
// hand (they need two devices and a real account). Covers: server-newer
// wins, local-newer wins, first sign-in after this shipped, live edits
// debouncing upward, excluded keys never travelling, and signed-out being
// completely inert.
//
// The 400ms waits are not arbitrary: the module polls every 250ms for a
// deferred Firebase to appear before it subscribes to auth.
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../app/js/prefs-sync.js', import.meta.url), 'utf8');

function makeEnv({ localData = {}, serverPrefs = {}, uid = 'u1' } = {}) {
  const store = { ...localData };
  const written = {};   // what the module pushed
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  let authCb = null;
  const docRef = {
    get: () => Promise.resolve({ exists: true, data: () => ({ prefs: serverPrefs }) }),
    set: () => Promise.resolve(),
    update: (patch) => { Object.assign(written, patch); return Promise.resolve(); }
  };
  const firebase = {
    apps: [{}],
    auth: () => ({ onAuthStateChanged: (cb) => { authCb = cb; } }),
    firestore: () => ({ collection: () => ({ doc: () => docRef }) })
  };
  const listeners = {};
  const win = {
    firebase,
    addEventListener: (t, cb) => { (listeners[t] ||= []).push(cb); },
    dispatchEvent: (e) => { (listeners[e.type] ||= []).forEach((cb) => cb(e)); },
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } }
  };
  const html = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const ctx = {
    window: win, localStorage, setTimeout, clearTimeout, setInterval, clearInterval,
    console, Date, JSON, Object,
    document: { documentElement: html, createElement: () => ({}), body: null, head: null },
    CustomEvent: win.CustomEvent
  };
  ctx.globalThis = ctx;
  Object.assign(ctx, { firebase });
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { store, written, html, signIn: () => authCb && authCb({ uid }), ctx, localStorage };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS', name);
  else { fails++; console.log('  FAIL', name, extra ? JSON.stringify(extra) : ''); }
}

// 1. Server value is newer than local → local adopts it.
{
  console.log('case 1: server newer wins');
  const now = Date.now();
  const env = makeEnv({
    localData: { 'da-theme': 'grey', 'debateos-prefs-meta': JSON.stringify({ 'da-theme': now - 10000 }) },
    serverPrefs: { 'da-theme': { v: 'light', t: now } }
  });
  await sleep(400); env.signIn(); await sleep(80);
  check('local theme replaced by server', env.store['da-theme'] === 'light', env.store['da-theme']);
  check('theme applied to <html>', env.html.attrs['data-theme'] === 'light', env.html.attrs);
}

// 2. Local edit is newer than server → local wins and is pushed up.
{
  console.log('case 2: local newer wins');
  const now = Date.now();
  const env = makeEnv({
    localData: { 'da-theme': 'grey', 'debateos-prefs-meta': JSON.stringify({ 'da-theme': now }) },
    serverPrefs: { 'da-theme': { v: 'light', t: now - 10000 } }
  });
  await sleep(400); env.signIn(); await sleep(80);
  check('local theme kept', env.store['da-theme'] === 'grey', env.store['da-theme']);
  check('local value pushed', env.written['prefs.da-theme']?.v === 'grey', env.written);
}

// 3. Pre-existing local pref, server has never seen the key → adopted upward.
{
  console.log('case 3: first sign-in after shipping');
  const env = makeEnv({
    localData: { 'debateos-tts-provider': 'inworld' },   // no meta at all
    serverPrefs: {}
  });
  await sleep(400); env.signIn(); await sleep(80);
  check('pushed despite no local timestamp', env.written['prefs.debateos-tts-provider']?.v === 'inworld', env.written);
}

// 4. Live edit after sign-in gets debounced up.
{
  console.log('case 4: live edit pushes');
  const env = makeEnv({ localData: {}, serverPrefs: {} });
  await sleep(400); env.signIn(); await sleep(80);
  env.localStorage.setItem('debateos-judge-paradigm', 'weigh probability first');
  await sleep(2200);
  check('edit reached the server', env.written['prefs.debateos-judge-paradigm']?.v === 'weigh probability first', env.written);
}

// 5. Excluded keys never travel.
{
  console.log('case 5: secrets and A/B arms excluded');
  const env = makeEnv({
    localData: { 'debateos-anthropic-key': 'sk-ant-secret', 'da-hero-ab': 'B', 'da-device-id': 'dev1' },
    serverPrefs: {}
  });
  await sleep(400); env.signIn(); await sleep(80);
  env.localStorage.setItem('debateos-anthropic-key', 'sk-ant-secret2');
  env.localStorage.setItem('da-hero-ab', 'A');
  await sleep(2200);
  const keys = Object.keys(env.written).join(',');
  check('no anthropic key pushed', !keys.includes('anthropic'), keys);
  check('no A/B arm pushed', !keys.includes('hero-ab'), keys);
  check('no device id pushed', !keys.includes('device-id'), keys);
}

// 6. Signed out: nothing is pushed anywhere.
{
  console.log('case 6: signed out is inert');
  const env = makeEnv({ localData: {}, serverPrefs: {} });
  env.localStorage.setItem('da-theme', 'light');
  await sleep(2200);
  check('nothing written while signed out', Object.keys(env.written).length === 0, env.written);
  check('page storage still worked', env.store['da-theme'] === 'light', env.store);
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nall cases pass');
process.exit(fails ? 1 : 0);
