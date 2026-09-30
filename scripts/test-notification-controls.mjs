import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('app/js/notifications.js');
const age = read('app/js/age-gate.js');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

// Use the shipped age API and click handler together. The retired age ask
// returns synchronously without storing a band, which used to recurse until
// the click threw and never reached the queue.
function sparFixture({ band = '', lazy = false, failLoad = false, busy = false } = {}) {
  const store = new Map(band ? [['da-age-band', band]] : []);
  const actions = [], notes = [], buttons = [];
  const c = {
    Promise, console, location: { pathname: '/newvoice', href: '/newvoice' },
    LSKEY: 'da-spar-bg', myUid: 'person', available: false, voiceDeclined: false,
    tournamentSeat: null, cooldownTimer: null, declineUntil: 0, suppressAvailableNoteOnce: false,
    ON_SPAR: false, MATCHING_PAUSED: false,
    localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
    document: { currentScript: null, createElement(tag) {
      const el = { style: {}, setAttribute() {}, addEventListener(name, fn) { this[name] = fn; } };
      if (tag === 'button') buttons.push(el);
      return el;
    }, head: { appendChild(script) { if (failLoad) script.onerror(); else { vm.runInContext(age, c); script.onload(); } } } },
    agBand: () => store.get('da-age-band') || '', paintPill() {},
    busyElsewhere: () => busy, inRound: () => busy, fmt: () => 'casual',
    daAskNotify: () => { actions.push('permission-denied'); return Promise.resolve(false); },
    goAvailable: () => actions.push('queue'), goOffline: () => actions.push('offline'),
    daBroadcastGoLive() {}, sparNote: msg => notes.push(msg), clearTimeout() {},
  };
  c.window = c;
  vm.createContext(c);
  if (!lazy) vm.runInContext(age, c);
  vm.runInContext(section('    function askBandThen(', '    // Programmatic hook'), c);
  vm.runInContext(section('    function makePill()', '    function placePill('), c);
  const button = c.makePill();
  return { c, store, actions, notes, click: () => button.click({ stopPropagation() {} }) };
}

for (const options of [{}, { lazy: true }, { band: 'adult' }, { band: 'minor' }]) {
  const f = sparFixture(options);
  assert.doesNotThrow(f.click, 'Spar live must not recurse on the retired age callback');
  assert.equal(f.c.available, true);
  assert.equal(f.actions.filter(a => a === 'queue').length, 1, 'one click reaches matchmaking once');
  assert.equal(f.store.get('da-spar-bg'), '1', 'blocked notifications do not block matchmaking');
  assert.equal(f.store.get('da-age-band') || '', options.band || '', 'no fabricated age is stored');
  assert.equal(f.c.location.href, '/newvoice', 'the AI session stays on its page');
  f.click();
  assert.equal(f.c.available, false);
  assert.equal(f.actions.at(-1), 'offline');
}
const paused = sparFixture();
paused.c.available = true; paused.c.voiceDeclined = true; paused.c.declineUntil = Infinity;
paused.click();
assert.equal(paused.c.voiceDeclined, false);
assert.equal(paused.c.declineUntil, 0);
assert.ok(paused.actions.includes('queue'), 'manual click resumes declined voice invitations');
const busy = sparFixture({ busy: true }); busy.click();
assert.ok(!busy.actions.includes('queue'), 'another human round remains protected');
const failed = sparFixture({ lazy: true, failLoad: true }); failed.click();
assert.equal(failed.c.available, false);
assert.ok(failed.notes.some(n => /could not|couldn't/i.test(n)), 'a failed prerequisite is visible');
console.log('Spar live: real age callback, lazy load, stored ages, pause/resume, blocked push and busy-round guard passed.');

function alertsFixture(permission = 'default', ua = 'Chrome/150 Safari/537.36') {
  const nodes = new Map(), store = new Map(), calls = [];
  let card;
  function element() {
    return { classList: { add() {}, remove() {} }, setAttribute(k,v) { this[k] = v; }, getAttribute(k) { return this[k]; },
      addEventListener(name, fn) { this[name] = fn; },
      querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); } };
  }
  const user = { uid: 'person', getIdToken: async () => 'fixture-token' };
  const c = {
    Promise, Date, Notification: { permission }, navigator: { userAgent: ua, serviceWorker: {}, standalone: true }, PushManager: {},
    document: { createElement: element, getElementById: () => card, body: { appendChild: el => { card = el; } } },
    localStorage: { getItem: k => store.get(k) || null, setItem: (k,v) => store.set(k,v) },
    daCurrentUser: () => user, daIsNative: () => false, daDevicePushReady: () => c.registered,
    injectStyles() {}, escHtml: text => text.replaceAll('&', '&amp;'),
    requestAnimationFrame: fn => fn(), setTimeout() {},
    daAskNotify: async () => { calls.push('register'); return c.registered; },
    fetch: async () => { calls.push('save-preference'); return { ok: true }; },
    registered: false,
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(section('  var DA_LIVE_ALERTS_KEY', '  // Device permission also serves DMs.'), c);
  // Keep the real readiness check: a permission alone never means registered.
  c._daPushRegistered = '';
  vm.runInContext(section('  function daSetLiveAlerts(', '  // Broadcast side:'), c);
  return { c, nodes, calls, store, mount: () => c.daMountIosOffer('enable', 'computer'),
    click: async () => { nodes.get('.da-ios-live-offer__primary').click(); for (let i=0; i<12; i++) await Promise.resolve(); } };
}
const denied = alertsFixture('denied'); denied.mount();
assert.equal(denied.nodes.get('.da-ios-live-offer__primary').textContent, 'Check permission');
assert.match(denied.nodes.get('.da-ios-live-offer__copy').innerHTML, /Site settings|Permissions/);
await denied.click();
assert.equal(denied.calls.length, 0, 'denied permission is not requested repeatedly');
denied.c.Notification.permission = 'granted';
await denied.click();
assert.equal(denied.store.get('da-live-alerts'), undefined, 'permission without registration never enables alerts');
assert.equal(denied.nodes.get('.da-ios-live-offer__primary').textContent, 'Try again', 'a registration error remains retryable');
denied.c.registered = true;
await denied.click();
assert.equal(denied.store.get('da-live-alerts'), '1');
assert.equal(denied.nodes.get('.da-ios-live-offer__title').textContent, 'Alerts are on for this device');
assert.equal(denied.calls.filter(c => c === 'save-preference').length, 1);

const newlyBlocked = alertsFixture(); newlyBlocked.mount();
newlyBlocked.c.daAskNotify = async () => { newlyBlocked.c.Notification.permission = 'denied'; return false; };
await newlyBlocked.click();
assert.equal(newlyBlocked.nodes.get('.da-ios-live-offer__primary').textContent, 'Check permission');
assert.match(newlyBlocked.nodes.get('.da-ios-live-offer__copy').innerHTML, /Live matching still works/);
for (const [ua, expected] of [['Version/26 Safari/605.1', /Safari Settings/], ['Firefox/140', /Firefox Settings/], ['iPhone Safari/605.1', /device Settings/]]) {
  const f = alertsFixture('denied', ua); f.mount();
  assert.match(f.nodes.get('.da-ios-live-offer__copy').innerHTML, expected);
}
const passive = alertsFixture('denied');
passive.c.DA_ON_ROUND_PAGE = false; passive.c.daVisibleModalUp = () => false;
passive.c.maybeOfferDeviceLiveAlerts({ uid: 'person' });
assert.equal(passive.nodes.size, 0, 'browser denial suppresses passive permission offers');
console.log('Notification recovery: blocked settings help, later grant, registration failure, truthful success and no passive re-prompt passed.');
