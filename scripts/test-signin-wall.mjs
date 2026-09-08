import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../app/js/signin-wall.js', import.meta.url), 'utf8');
function page({ path = '/', storage = new Map(), user = null, native = false, sdk = true, inApp = false } = {}) {
  let now = 0, listener;
  const intervals = [], asks = [], events = [], nodes = new Map(), busy = new Set();
  const docEvents = {}, winEvents = {};
  const auth = { currentUser: user, onAuthStateChanged(cb) { listener = cb; cb(user); } };
  const document = {
    hidden: false, activeElement: null, body: { classList: { contains: key => busy.has(key) } },
    documentElement: { classList: { contains: key => busy.has(key) }, getAttribute() { return null; } },
    querySelector: selector => nodes.get(selector) || null, getElementById: id => nodes.get(id),
    addEventListener: (ev, cb) => { docEvents[ev] = cb; },
  };
  const window = { __DB_NATIVE: native, openAuthModal: (mode, opts) => asks.push(opts),
    __ditIsInAppBrowser: () => inApp,
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
    typing(el) { document.activeElement = el; },
    auth(user) { auth.currentUser = user; listener?.(user); },
    leave() { winEvents.pagehide?.(); },
  };
}
let p = page(); p.advance(299.75); assert.equal(p.asks.length, 0); p.advance(.25);
assert.equal(p.asks.length, 1); assert.equal(p.asks[0].locked, true);
assert.equal(p.asks[0].googleOnly, true); assert.ok(/Google/.test(p.asks[0].sub));
p.advance(80); assert.equal(p.asks.length, 1); console.log('PASS first page asks at five visible minutes, once, locked, Google only');

// Google refuses OAuth inside an in-app webview, so a locked Google-only card
// there would be a page with no way out. Those visitors keep the email door.
p = page({ inApp: true }); p.advance(300); assert.equal(p.asks.length, 1);
assert.equal(p.asks[0].locked, true); assert.equal(p.asks[0].googleOnly, false);
assert.ok(!/Google/.test(p.asks[0].sub));
console.log('PASS an in-app browser still gets a door it can actually open');
p = page(); p.advance(18); p.leave(); p = page({ path: '/practice', storage: p.storage }); p.advance(281.75); assert.equal(p.asks.length, 0); p.advance(.25); assert.equal(p.asks.length, 1);
const refresh = page({ storage: p.storage }); refresh.advance(400); assert.equal(refresh.asks.length, 0); console.log('PASS navigation preserves the budget; a reload after the ask does not ask again');
p = page(); p.advance(15); p.hidden(true); p.advance(320); p.hidden(false); p.advance(284.75); assert.equal(p.asks.length, 0); p.advance(.25); assert.equal(p.asks.length, 1); console.log('PASS background time does not count');
p = page({ user: { isAnonymous: true } }); p.advance(300); assert.equal(p.asks.length, 1);
p = page({ user: { isAnonymous: false } }); p.advance(400); assert.equal(p.asks.length, 0); p.auth(null); p.advance(300); assert.equal(p.asks.length, 1); console.log('PASS anonymous users are gated, signed-in users pass, sign-out rearms');
for (const path of ['/live-round', '/live-round.html', '/privacy', '/terms', '/admin']) { p = page({ path }); p.advance(400); assert.equal(p.asks.length, 0); }
p = page(); p.advance(30); p.nodes.set('lpip-mini', {}); p.advance(400); assert.equal(p.asks.length, 0); p.nodes.delete('lpip-mini'); p.advance(280); assert.equal(p.asks.length, 1); console.log('PASS direct rounds, legal pages and active mini player are uninterrupted');
p = page({ path: '/spar' }); p.nodes.set('sparGateCard', {}); p.advance(320); assert.equal(p.asks.length, 0); p.nodes.delete('sparGateCard'); p.window.__debatableRoundInFlight = true; p.advance(10); assert.equal(p.asks.length, 0); console.log('PASS no duplicate inline Google gate or interruption during room handoff');
p = page(); p.busy.add('signin-modal-open'); p.advance(320); assert.equal(p.asks.length, 0); p.busy.delete('signin-modal-open'); p.advance(.25); assert.equal(p.asks.length, 1); p.auth({ isAnonymous: false }); p.auth({ isAnonymous: false }); assert.equal(p.events.filter(e => e[1] === 'signin_wall_converted').length, 1); console.log('PASS existing dialog is not stacked; one conversion event');
p = page({ sdk: false }); p.advance(300); assert.equal(p.asks.length, 1); console.log('PASS unavailable Firebase does not disable the timer');
p = page(); p.busy.add('da-debate-invite-open'); p.advance(320); assert.equal(p.asks.length, 0);
p.busy.delete('da-debate-invite-open'); p.advance(.25); assert.equal(p.asks.length, 1);
console.log('PASS a debate invitation gets an answer before the account wall opens');

p = page({ path: '/spar' }); p.nodes.set('.match-profile-flow', {}); p.advance(320); assert.equal(p.asks.length, 0);
p.nodes.delete('.match-profile-flow'); p.advance(.25); assert.equal(p.asks.length, 1);
console.log('PASS the first three matching questions own the account ask, even after five minutes');

p = page(); p.advance(300); assert.equal(p.asks.length, 1);
p.asks[0].onDone(null, null); p.advance(200); assert.equal(p.asks.length, 1);
assert.equal(p.events.filter(e => e[1] === 'signin_wall_dismissed').length, 1);
const later = page({ path: '/watch', storage: p.storage }); later.advance(400); assert.equal(later.asks.length, 0);
later.auth({ isAnonymous: false }); later.auth(null); later.advance(300); assert.equal(later.asks.length, 1);
console.log('PASS the ask does not reopen in the same session; a sign-in then sign-out rearms it');

// A locked card that takes focus mid-sentence costs the sentence and cannot
// be closed to finish it, so an active text field defers rather than skips.
for (const el of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'input' }, { isContentEditable: true, tagName: 'DIV' }]) {
  p = page(); p.typing(el); p.advance(400); assert.equal(p.asks.length, 0);
  p.typing(null); p.advance(.25); assert.equal(p.asks.length, 1);
}
p = page(); p.typing({ tagName: 'DIV' }); p.advance(300); assert.equal(p.asks.length, 1);
console.log('PASS typing defers the ask and never loses it; a focused non-field does not');
