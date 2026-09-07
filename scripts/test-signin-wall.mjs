import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../app/js/signin-wall.js', import.meta.url), 'utf8');
function page({ path = '/', storage = new Map(), user = null, native = false, sdk = true } = {}) {
  let now = 0, listener;
  const intervals = [], asks = [], events = [], nodes = new Map(), busy = new Set();
  const docEvents = {}, winEvents = {};
  const auth = { currentUser: user, onAuthStateChanged(cb) { listener = cb; cb(user); } };
  const document = {
    hidden: false, body: { classList: { contains: key => busy.has(key) } },
    documentElement: { classList: { contains: key => busy.has(key) }, getAttribute() { return null; } },
    querySelector: selector => nodes.get(selector) || null, getElementById: id => nodes.get(id),
    addEventListener: (ev, cb) => { docEvents[ev] = cb; },
  };
  const window = { __DB_NATIVE: native, openAuthModal: (mode, opts) => asks.push(opts),
    gtag: (...args) => events.push(args), addEventListener: (ev, cb) => { winEvents[ev] = cb; } };
  const firebase = { apps: [{}], auth: () => auth };
  if (sdk) window.firebase = firebase;
  const sandbox = { window, document, firebase, navigator: { userAgent: 'Mozilla/5.0' }, location: { pathname: path, search: '' },
    performance: { now: () => now }, sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    setInterval: cb => intervals.push(cb) };
  vm.runInNewContext(source, sandbox);
  return { asks, events, storage, nodes, busy, window,
    advance(seconds) { for (let n = 0; n < seconds * 4; n++) { now += 250; intervals.forEach(cb => cb()); } },
    hidden(value) { document.hidden = value; docEvents.visibilitychange?.(); },
    auth(user) { auth.currentUser = user; listener?.(user); },
    leave() { winEvents.pagehide?.(); },
  };
}
let p = page(); p.advance(179.75); assert.equal(p.asks.length, 0); p.advance(.25);
assert.equal(p.asks.length, 1); assert.equal(p.asks[0].locked, true);
assert.ok(!p.asks[0].googleOnly); assert.ok(!p.asks[0].liveVideo);
p.advance(80); assert.equal(p.asks.length, 1); console.log('PASS first page locks at three visible minutes, once, with every general sign-in option');
p = page(); p.advance(18); p.leave(); p = page({ path: '/practice', storage: p.storage }); p.advance(161.75); assert.equal(p.asks.length, 0); p.advance(.25); assert.equal(p.asks.length, 1);
const refresh = page({ storage: p.storage }); refresh.advance(.25); assert.equal(refresh.asks.length, 1); console.log('PASS navigation and reload preserve the budget');
p = page(); p.advance(15); p.hidden(true); p.advance(200); p.hidden(false); p.advance(164.75); assert.equal(p.asks.length, 0); p.advance(.25); assert.equal(p.asks.length, 1); console.log('PASS background time does not count');
p = page({ user: { isAnonymous: true } }); p.advance(180); assert.equal(p.asks.length, 1);
p = page({ user: { isAnonymous: false } }); p.advance(300); assert.equal(p.asks.length, 0); p.auth(null); p.advance(180); assert.equal(p.asks.length, 1); console.log('PASS anonymous users are gated, signed-in users pass, sign-out rearms');
for (const path of ['/live-round', '/live-round.html', '/privacy', '/terms', '/admin']) { p = page({ path }); p.advance(300); assert.equal(p.asks.length, 0); }
p = page(); p.advance(30); p.nodes.set('lpip-mini', {}); p.advance(300); assert.equal(p.asks.length, 0); p.nodes.delete('lpip-mini'); p.advance(150); assert.equal(p.asks.length, 1); console.log('PASS direct rounds, legal pages and active mini player are uninterrupted');
p = page({ path: '/spar' }); p.nodes.set('sparGateCard', {}); p.advance(200); assert.equal(p.asks.length, 0); p.nodes.delete('sparGateCard'); p.window.__debatableRoundInFlight = true; p.advance(10); assert.equal(p.asks.length, 0); console.log('PASS no duplicate inline Google gate or interruption during room handoff');
p = page(); p.busy.add('signin-modal-open'); p.advance(180); assert.equal(p.asks.length, 0); p.busy.delete('signin-modal-open'); p.advance(.25); assert.equal(p.asks.length, 1); p.auth({ isAnonymous: false }); p.auth({ isAnonymous: false }); assert.equal(p.events.filter(e => e[1] === 'signin_wall_converted').length, 1); console.log('PASS existing dialog is not stacked; one conversion event');
p = page({ sdk: false }); p.advance(180); assert.equal(p.asks.length, 1); console.log('PASS unavailable Firebase does not disable the timer');
p = page(); p.busy.add('da-debate-invite-open'); p.advance(200); assert.equal(p.asks.length, 0);
p.busy.delete('da-debate-invite-open'); p.advance(.25); assert.equal(p.asks.length, 1);
console.log('PASS a debate invitation gets an answer before the account wall opens');

p = page({ path: '/spar' }); p.nodes.set('.match-profile-flow', {}); p.advance(200); assert.equal(p.asks.length, 0);
p.nodes.delete('.match-profile-flow'); p.advance(.25); assert.equal(p.asks.length, 1);
console.log('PASS the first three matching questions own the account ask, even after three minutes');
