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
    querySelector() { return null; }, getElementById: id => nodes.get(id),
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
let p = page(); p.advance(39.75); assert.equal(p.asks.length, 0); p.advance(.25);
assert.equal(p.asks.length, 1); assert.equal(p.asks[0].locked, true); assert.equal(p.asks[0].googleOnly, true);
p.advance(80); assert.equal(p.asks.length, 1); console.log('PASS first page locks at 40 seconds, once, with Google');
p = page(); p.advance(18); p.leave(); p = page({ path: '/newvoice', storage: p.storage }); p.advance(21.75); assert.equal(p.asks.length, 0); p.advance(.25); assert.equal(p.asks.length, 1);
const refresh = page({ storage: p.storage }); refresh.advance(.25); assert.equal(refresh.asks.length, 1); console.log('PASS navigation and reload preserve the budget');
p = page(); p.advance(15); p.hidden(true); p.advance(200); p.hidden(false); p.advance(24.75); assert.equal(p.asks.length, 0); p.advance(.25); assert.equal(p.asks.length, 1); console.log('PASS background time does not count');
p = page({ user: { isAnonymous: true } }); p.advance(40); assert.equal(p.asks.length, 1);
p = page({ user: { isAnonymous: false } }); p.advance(100); assert.equal(p.asks.length, 0); p.auth(null); p.advance(40); assert.equal(p.asks.length, 1); console.log('PASS anonymous users are gated, signed-in users pass, sign-out rearms');
for (const path of ['/live-round', '/live-round.html', '/privacy', '/terms', '/admin']) { p = page({ path }); p.advance(100); assert.equal(p.asks.length, 0); }
p = page(); p.advance(30); p.nodes.set('lpip-mini', {}); p.advance(100); assert.equal(p.asks.length, 0); p.nodes.delete('lpip-mini'); p.advance(10); assert.equal(p.asks.length, 1); console.log('PASS direct rounds, legal pages and active mini player are uninterrupted');
p = page({ path: '/spar' }); p.nodes.set('sparGateCard', {}); p.advance(60); assert.equal(p.asks.length, 0); p.nodes.delete('sparGateCard'); p.window.__debatableRoundInFlight = true; p.advance(10); assert.equal(p.asks.length, 0); console.log('PASS no duplicate inline Google gate or interruption during room handoff');
p = page(); p.busy.add('signin-modal-open'); p.advance(40); assert.equal(p.asks.length, 0); p.busy.delete('signin-modal-open'); p.advance(.25); assert.equal(p.asks.length, 1); p.auth({ isAnonymous: false }); p.auth({ isAnonymous: false }); assert.equal(p.events.filter(e => e[1] === 'signin_wall_converted').length, 1); console.log('PASS existing dialog is not stacked; one conversion event');
p = page({ sdk: false }); p.advance(40); assert.equal(p.asks.length, 1); console.log('PASS unavailable Firebase does not disable the timer');
