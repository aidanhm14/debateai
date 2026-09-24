import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const presence = read('app/js/round-presence.js');
const notifications = read('app/js/notifications.js');
const page = read('app/live-round.html');
const key = 'da-round-presence';

function fixture(path, spectator = false) {
  const store = new Map(), events = [];
  const c = {
    location: { pathname: path }, Date, Math, Event,
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) },
    setInterval() {}, document: { addEventListener() {} },
    window: { daIsRoundSpectator: () => spectator, addEventListener() {}, dispatchEvent: e => events.push(e.type) },
  };
  vm.createContext(c); vm.runInContext(presence, c);
  return { c, store, events, role: value => { spectator = value; c.window.DARoundPresence.refresh(); } };
}

for (const route of ['/watch', '/watch.html', '/watch/', '/live-round.html']) {
  const f = fixture(route, true);
  assert.equal(f.c.window.DARoundPresence.kind(), '', 'watching does not mark the person as debating: ' + route);
}
for (const route of ['/live-round', '/exhibition', '/casual-room', '/room-judge', '/open', '/tournament', '/tournaments']) {
  assert.equal(fixture(route).c.window.DARoundPresence.kind(), 'round', route + ' remains busy');
}
const f = fixture('/live-round');
f.role(true);
assert.equal(f.c.window.DARoundPresence.kind(), '', 'room-only links release the temporary participant marker');
assert.deepEqual(f.events, ['debatable:round-role']);
f.role(false);
assert.equal(f.c.window.DARoundPresence.kind(), 'round', 'a spectator taking a seat becomes busy immediately');
f.store.set(key, JSON.stringify({ kind: 'round', tab: 'other', at: Date.now() }));
f.role(true);
assert.equal(f.c.window.DARoundPresence.kind(), 'round', 'watching cannot clear a participant marker owned by another tab');

// Exercise the real role resolver, including the explicit spectator URL
// case where the same account is also seated in the round.
const role = page.slice(page.indexOf('  window.daIsRoundSpectator ='), page.indexOf('\n  };', page.indexOf('  window.daIsRoundSpectator =')) + 5);
const r = { window: {}, prefill: { stage: false }, isSpectator: () => true, mySide: () => null };
vm.runInNewContext(role, r);
assert.equal(r.window.daIsRoundSpectator(), true);
r.mySide = () => 'pro';
assert.equal(r.window.daIsRoundSpectator(), false);
r.mySide = () => null; r.prefill.stage = true;
assert.equal(r.window.daIsRoundSpectator(), false, 'stage renderers cannot match');

const gates = notifications.slice(notifications.indexOf('    var ON_VOICE_AI ='), notifications.indexOf('\n    var available =', notifications.indexOf('    var ON_VOICE_AI =')));
for (const [path, spectator, busy, seat, expected] of [
  ['/live-round', true, '', null, false], ['/watch', false, '', null, false],
  ['/live-round', false, '', null, true], ['/live-round', true, 'round', null, true],
  ['/live-round', true, 'spar', null, true], ['/watch', false, '', { room:'reserved' }, true],
]) {
  const c = { location: { pathname:path }, window: { daIsRoundSpectator: () => spectator }, daPresenceKind: () => busy, tournamentSeat: seat };
  vm.runInNewContext(gates, c);
  assert.equal(c.busyElsewhere(), expected, JSON.stringify({path,spectator,busy,seat}));
}
assert.match(notifications, /!available && !watching\(\) && !voiceDeclined/, 'new spectators must opt in');
assert.match(page, /DARoundPresence\.refresh\(\)/, 'resolved roles refresh cross-tab presence');
for (const source of [page, read('app/watch.html')]) assert.match(source, /class="spectator-match-slot" data-da-pill-slot="end" hidden/);
console.log('Spectator matching: roles, stage exclusion, cross-tab ownership, tournament seats and opt-in passed.');
