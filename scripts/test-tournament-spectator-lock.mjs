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
const director = read('app/director.html');
const directorApi = read('app/netlify/functions/director.mjs');
const spotlightApi = read('app/netlify/functions/director-spotlight.mjs');
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
  director.includes("apiKey: ['AIzaSyDDx','TYlyWLOJnFP99','e7XsLPb3FwIEijNNM'].join('')") &&
  !director.includes('AIzaSyBmMOsQOTPYFBRVBHRHFVKPOxdNCVQvVXA'),
  'director wall must use the active Firebase key so the admin sign-in gate works',
);

assert.ok(
  directorApi.includes("const liveMode = askedKey === 'live'") &&
  directorApi.includes("String((doc.data() || {}).inPairing || '')") &&
  directorApi.includes('_roundKey: roundDoc.id'),
  'director live mode must index every pairing that still owns an active tournament seat',
);
assert.ok(
  spotlightApi.indexOf('await requireAdmin(request)') < spotlightApi.indexOf('tournament.ref.update({') &&
  spotlightApi.includes("activeIds.has(String(p.pairingId || ''))") &&
  spotlightApi.includes('spotlightRoom: FieldValue.delete()'),
  'spotlight writes must be admin-only, active-room-only, and reversible',
);
assert.ok(
  !spotlightApi.includes('recordingPublishAllowed') &&
  !spotlightApi.includes('site_stream') &&
  !spotlightApi.includes('broadcastAllowed'),
  'spotlight must not grant recording or main-broadcast permission',
);
assert.ok(
  tournamentApi.includes("spotlightRoom: String(d.spotlightRoom || '')") &&
  !tournamentApi.includes('spotlightBy'),
  'public tournament payload must expose the room choice without exposing the admin identity',
);
assert.ok(
  director.includes("post('/api/director/spotlight'") &&
  director.includes('data-spotlight-room=') &&
  open.includes("(r.spotlight ? ' is-spotlight' : '')") &&
  open.includes('.tv-body{padding:12px 13px 13px;color:#f4f4f5}') &&
  open.includes('The director spotlight is first.') &&
  tournament.includes('pairing.is-spotlight') &&
  tournament.includes('pill-spotlight'),
  'director, Open, and generic tournament surfaces must render the spotlight contract',
);

assert.ok(
  dropin.includes("return errorResponse('Public tournament pairing is paused. Watch the admin stream.', 409, request);") &&
  dropin.indexOf('if (!PUBLIC_PAIRING_ENABLED)') < dropin.indexOf('const token = extractBearerToken(request)') &&
  dropin.indexOf('if (!PUBLIC_PAIRING_ENABLED)') < dropin.indexOf('const db = getDb()') &&
  dropin.indexOf('if (!PUBLIC_PAIRING_ENABLED)') < dropin.indexOf('attemptPairing(db, t, now, tuning)'),
  'closed launch gate must return before auth, Firestore, or pairing work',
);

console.log('PASS tournament spectator lock');
