#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Guard for lib/tournament-round.mjs, the check that decides whether a
// live round rates automatically.
//
// This is a consent decision, so the failure that matters is not "a
// tournament round did not rate" (annoying, recoverable) but "a casual
// round rated and published a stranger's competitive record" (not
// recoverable, and not theirs to undo). Everything here is pointed at
// the second one.
// ─────────────────────────────────────────────────────────────

import {
  parseTournamentRoom, pairingMatches,
} from '../app/netlify/functions/lib/tournament-round.mjs';
import { tournamentRoomSetup } from '../app/netlify/functions/lib/tournament-motion-pool.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.error('  FAIL: ' + n); } };

// ── parsing ─────────────────────────────────────────────────────────
// Mirrors roomFor(): 'Debatable-' + tid.slice(0,12) + '-' + key + '-' + n
{
  const p = parseTournamentRoom('Debatable-abc123XYZ789-r3-2');
  ok(p !== null, 'a real prelim room parses');
  ok(p.tidPrefix === 'abc123XYZ789', 'the tournament prefix is extracted');
  ok(p.roundKey === 'r3', 'the round key is extracted');
  ok(p.index === 2, 'the pairing index is extracted');

  ok(parseTournamentRoom('Debatable-abc123XYZ789-e1-1').roundKey === 'e1', 'elim rounds parse too');
  // Drop-in pairings (tournament-dropin.mjs) key their rounds 'd<seq>'.
  // This arm was missing until 2026-08-18, so every drop-in round failed
  // the parse, fell back to casual consent, and never auto-recorded a
  // result. The assertion pins the arm so it cannot silently regress
  // before an event that runs entirely on drop-in rounds.
  ok(parseTournamentRoom('Debatable-abc123XYZ789-d7-1').roundKey === 'd7', 'drop-in rounds parse too');

  // Everything that is NOT a tournament room must parse to null, because
  // a null here is what keeps a casual round on the checkbox path.
  const notRooms = [
    'spar-abc123', 'Debatable', 'Debatable--r1-1', 'Debatable-abc-x1-1',
    'Debatable-abc-r1', 'Debatable-abc-r1-', 'debatable-abc123-r1-1',
    'Debatable-abc123-r1-1-extra', 'Debatable-abc/123-r1-1',
    'Debatable-averyverylongtournamentid-r1-1',
    '', null, undefined, 0, {}, [],
  ];
  for (const r of notRooms) {
    ok(parseTournamentRoom(r) === null, 'refuses a non-tournament room: ' + JSON.stringify(r));
  }

  // A parse is NOT a verification. Stated as a test so nobody later
  // "optimizes" the read away and trusts the string.
  ok(parseTournamentRoom('Debatable-000000000000-r1-1') !== null,
    'a well-formed but fictional room still parses, which is why the reads exist');
}

// ── membership ──────────────────────────────────────────────────────
{
  const pairing = { govEntry: 'g1', oppEntry: 'o1', room: 'x' };

  ok(pairingMatches(pairing, ['alice'], ['bob'], 'alice', 'bob'), 'gov/opp order matches');
  ok(pairingMatches(pairing, ['alice'], ['bob'], 'bob', 'alice'), 'swapped sides still match the same pairing');
  ok(pairingMatches(pairing, ['alice', 'ann'], ['bob', 'ben'], 'ann', 'ben'), '2v2 partners count as members');

  // The attacks this exists to stop.
  ok(!pairingMatches(pairing, ['alice'], ['bob'], 'alice', 'mallory'),
    'a stranger paired against a real entrant is refused');
  ok(!pairingMatches(pairing, ['alice'], ['bob'], 'mallory', 'trudy'),
    'two strangers claiming a real room are refused');
  ok(!pairingMatches(pairing, ['alice'], ['bob'], 'alice', 'alice'),
    'the same person on both sides is refused');
  ok(!pairingMatches(pairing, ['alice', 'bob'], ['carol'], 'alice', 'bob'),
    'two members of the SAME entry are not a pairing');

  // Degenerate inputs fail closed.
  ok(!pairingMatches(null, ['a'], ['b'], 'a', 'b'), 'a missing pairing is refused');
  ok(!pairingMatches(pairing, [], ['bob'], 'alice', 'bob'), 'an empty gov entry is refused');
  ok(!pairingMatches(pairing, ['alice'], [], 'alice', 'bob'), 'an empty opp entry is refused');
  ok(!pairingMatches(pairing, undefined, undefined, 'alice', 'bob'), 'missing member lists are refused');
  ok(!pairingMatches(pairing, ['alice'], ['bob'], '', 'bob'), 'an empty uid is refused');
  ok(!pairingMatches(pairing, ['alice'], ['bob'], 'alice', null), 'a null uid is refused');
  ok(!pairingMatches(pairing, [null, 'alice'], [undefined, 'bob'], 'alice', 'bob') === false,
    'null entries are filtered without breaking a valid match');
}

// ── the URL param is not a consent signal ───────────────────────────
//
// /tournaments builds its links with source=tournament in the query
// string. Reading that would let anyone publish their opponent's record.
// Asserted against the source text so the shortcut cannot creep back.
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    join(here, '..', 'app', 'netlify', 'functions', 'lib', 'tournament-round.mjs'), 'utf8');

  // Mentioned in the comment explaining why it is not trusted, never read.
  ok(!/searchParams|req\.query|body\.source|d\.source/.test(src),
    'the module never reads a client-supplied source field');
  ok(/govEntry/.test(src) && /members/.test(src),
    'verification goes through the tournament entries, not the room string alone');
}

// ── video admission is roster-backed, not a client role claim ──────────────
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const roomSrc = readFileSync(
    join(here, '..', 'app', 'netlify', 'functions', 'create-daily-room.mjs'), 'utf8');
  const dropinSrc = readFileSync(
    join(here, '..', 'app', 'netlify', 'functions', 'tournament-dropin.mjs'), 'utf8');
  const adminSrc = readFileSync(
    join(here, '..', 'app', 'netlify', 'functions', 'tournament-admin.mjs'), 'utf8');
  const clientSrc = readFileSync(
    join(here, '..', 'app', 'live-round.html'), 'utf8');
  const recordingSrc = readFileSync(
    join(here, '..', 'app', 'netlify', 'functions', 'round-recording.mjs'), 'utf8');
  const recordingAdminSrc = readFileSync(
    join(here, '..', 'app', 'netlify', 'functions', 'recordings-admin.mjs'), 'utf8');

  ok(/collection\('room_admissions'\)/.test(roomSrc),
    'room creation reads the server-written admission record');
  ok(/allowed\.indexOf\(String\(who\.uid\)\)/.test(roomSrc),
    'participant admission requires the verified uid on the room roster');
  ok(/privacy:\s*admission\.tournament\s*\?\s*'private'\s*:\s*'public'/.test(roomSrc),
    'tournament Daily rooms are private while casual rooms remain public');
  ok(/admission\.tournament\s*&&\s*!token/.test(roomSrc),
    'a tournament room never falls back to a tokenless join');
  ok(/room_admissions/.test(dropinSrc) && /room_admissions/.test(adminSrc),
    'drop-in and synchronous tournament pairing both stamp room admission');
  ok(/Authorization[^\n]+Bearer/.test(clientSrc),
    'the live-room client sends its verified identity when requesting a participant token');
  ok(/recordingRequired:\s*admission\.tournament/.test(roomSrc),
    'the secure admission response always marks tournament recording required');
  ok(/tournamentRequired[\s\S]{0,400}action === 'consent' && body\.consent !== true/.test(recordingSrc),
    'the recording endpoint rejects a tournament decline');
  ok(/state\.recordingRequired !== false[\s\S]{0,700}recordingStatus !== 'recording'/.test(clientSrc),
    'Speech 1 is gated on a live tournament recording, not only a modal');
  ok(/required \? 'Leave tournament room' : 'No, do not record'/.test(clientSrc),
    'the tournament notice offers exit instead of a recording-decline action');
  ok(/recording\.isStream !== true && recording\.recordingConsentComplete !== true/.test(recordingAdminSrc),
    'private tournament footage cannot be manually published without public-use clearance');
}

// ── tournament recording cannot be disabled ───────────────────────────────
{
  const entries = new Map([
    ['gov', { members: ['alice'], memberNames: ['Alice'] }],
    ['opp', { members: ['bob'], memberNames: ['Bob'] }],
  ]);
  const pairing = {
    pairingId: 'r1-1', room: 'Debatable-abc123XYZ789-r1-1',
    govEntry: 'gov', oppEntry: 'opp',
  };
  const prelim = tournamentRoomSetup('abc123XYZ789', { recordingRequired: false }, pairing, entries, 'seed');
  ok(prelim.admission.recordingRequired === true,
    'even a stale event flag cannot disable tournament recording');
  ok(prelim.admission.broadcastAllowed === false,
    'mandatory preliminary capture remains private by default');

  const elim = tournamentRoomSetup('abc123XYZ789', {}, { ...pairing, pairingId: 'e1-1' }, entries, 'seed');
  ok(elim.admission.recordingRequired === true,
    'elimination recording is mandatory too');
  ok(elim.admission.broadcastAllowed === true,
    'elimination broadcast follows the published tournament rule');
}

console.log(`\ntournament-round: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
