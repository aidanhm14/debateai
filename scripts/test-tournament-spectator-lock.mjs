#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const notifications = read('app/js/notifications.js');
const presence = read('app/js/round-presence.js');
const open = read('app/open.html');
const tournament = read('app/tournament.html');
const tournaments = read('app/tournaments.html');
const watch = read('app/watch.html');
const tournamentApi = read('app/netlify/functions/tournament.mjs');
const dropin = read('app/netlify/functions/tournament-dropin.mjs');

const routeGuard = "var MATCHING_PAUSED = /^\\/(?:open|tournament|tournaments|watch)(?:\\.html)?(?:\\/|$)/.test(location.pathname);";
assert.ok(
  notifications.includes(routeGuard),
  'background Spar must pause on tournament and watch routes',
);
const pausedRoute = /^\/(?:open|tournament|tournaments|watch)(?:\.html)?(?:\/|$)/;
for (const path of ['/open', '/open.html', '/tournament', '/tournaments', '/watch', '/watch/']) {
  assert.ok(pausedRoute.test(path), 'expected paused route: ' + path);
}
for (const path of ['/practice', '/spar', '/watchparty', '/tournament-rules']) {
  assert.equal(pausedRoute.test(path), false, 'unexpected paused route: ' + path);
}
assert.match(notifications, /var ON_ROUND = \/\\\/\(live-round\|/, 'spectator rounds must retain the live-round exclusion');
assert.ok(
  presence.includes('var SPECTATOR_RE = /^\\/(?:open|tournament|tournaments|watch)') &&
  presence.includes("if (ROUND_RE.test(p) || SPECTATOR_RE.test(p)) return 'round';"),
  'spectator mode must pause matchmaking in other tabs',
);
for (const [name, source] of [['open', open], ['tournament', tournament], ['tournaments', tournaments], ['watch', watch]]) {
  assert.ok(source.includes('<script defer src="/js/round-presence.js"></script>'), name + ' must publish spectator presence');
}
for (const guard of [
  '!ON_ROUND && !ON_SPAR && !MATCHING_PAUSED',
  '!busyElsewhere() && !MATCHING_PAUSED',
  '(inRound() || MATCHING_PAUSED)',
]) {
  assert.ok(notifications.includes(guard), 'missing background Spar guard: ' + guard);
}

assert.ok(
  tournamentApi.includes("process.env.TOURNAMENT_PUBLIC_PAIRING_ENABLED === '1'") &&
  tournamentApi.includes('publicPairingEnabled: PUBLIC_PAIRING_ENABLED && d.dropIn !== false'),
  'public tournament payload must expose the server launch gate',
);
assert.ok(
  dropin.includes("process.env.TOURNAMENT_PUBLIC_PAIRING_ENABLED === '1'") &&
  dropin.indexOf('if (!PUBLIC_PAIRING_ENABLED)') < dropin.indexOf('const token = extractBearerToken(request)'),
  'drop-in endpoint must fail closed before auth, Firestore, or pairing work',
);
assert.ok(open.includes('if (!t.publicPairingEnabled)'), 'Open page must render spectator mode');
assert.ok(
  open.includes('Stay here for the main broadcast.') &&
  open.includes("fetch('/api/stream-status'") &&
  open.includes('id="mainBroadcastFrame"'),
  'Open page must direct the public to the embedded admin stream',
);
assert.ok(open.includes('!t.publicPairingEnabled || t.dropIn === false'), 'Open queue must honor the launch gate');
assert.ok(tournament.includes('!t.publicPairingEnabled || t.dropIn === false'), 'generic tournament queue must honor the launch gate');

assert.ok(
  dropin.includes("return errorResponse('Public tournament pairing is paused. Watch the admin stream.', 409, request);") &&
  dropin.indexOf('if (!PUBLIC_PAIRING_ENABLED)') < dropin.indexOf('const token = extractBearerToken(request)') &&
  dropin.indexOf('if (!PUBLIC_PAIRING_ENABLED)') < dropin.indexOf('const db = getDb()') &&
  dropin.indexOf('if (!PUBLIC_PAIRING_ENABLED)') < dropin.indexOf('attemptPairing(db, t, now, tuning)'),
  'closed launch gate must return before auth, Firestore, or pairing work',
);

console.log('PASS tournament spectator lock');
