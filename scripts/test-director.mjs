// The director wall's state machine: the one word a director reads per
// room, and the two states that send them looking for a person.
//
// Self-contained (no Firebase), because it guards a surface that is only
// ever used on a live event day, which is the worst possible moment to
// find out a state never fires.
//
// EVERY CASE CARRIES lastSeenAt. A room with people in it heartbeats
// every 30 seconds, and the first version of this file omitted the
// field: without it the stall cases passed even when the stall was
// timed off the heartbeat, which is the exact defect that shipped here
// first and could never have fired in production. A test that does not
// carry the field that made the code wrong is testing nothing.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '../app/netlify/functions/director.mjs'), 'utf8');
const start = src.indexOf('const SEAT_FRESH_MS');
const end = src.indexOf('export default');
if (start < 0 || end < 0) { console.error('[director] could not lift the pure block'); process.exit(1); }
const tmp = path.join(here, '.director-pure.mjs');
fs.writeFileSync(tmp, src.slice(start, end).replace(/^export /gm, '') + '\nexport { roomState, presentUids, ms };');
const { roomState } = await import('file://' + tmp);
fs.unlinkSync(tmp);

const NOW = Date.now();
const t = (v) => ({ toMillis: () => v });
const both = { a: t(NOW), b: t(NOW) };
const beat = t(NOW - 2000);

const CASES = [
  // The tournament's own record outranks anything a participant's
  // browser wrote about the room.
  ['a reported result outranks the room', { status: 'complete' }, { seatSeen: both }, 'complete'],
  ['no room document yet', { status: 'pending' }, null, 'unopened'],

  // Presence. These two are why the wall exists.
  ['heartbeats gone stale', { status: 'pending' }, { seatSeen: { a: t(NOW - 500000) } }, 'empty'],
  ['one person waiting alone', { status: 'pending' }, { seatSeen: { a: t(NOW) } }, 'one-seat'],
  ['walked out since their last beat', { status: 'pending' },
    { seatSeen: both, seatLeft: { b: t(NOW + 1) } }, 'one-seat'],
  ['a stale departure mark is ignored', { status: 'pending' },
    { seatSeen: both, seatLeft: { b: t(NOW - 60000) } }, 'between'],

  // Running states, in urgency order.
  ['a speech is running', { status: 'pending' },
    { seatSeen: both, lastSeenAt: beat, currentTimer: { state: 'running', updatedAtMs: NOW } }, 'speaking'],
  ['the judge is writing', { status: 'pending' }, { seatSeen: both, lastSeenAt: beat, status: 'ballot' }, 'judging'],
  ['a ballot present without the status', { status: 'pending' },
    { seatSeen: both, lastSeenAt: beat, ballot: { winner: 'gov' } }, 'judging'],

  // The stall window.
  ['a minute in, nobody speaking yet, is fine', { status: 'pending' },
    { seatSeen: both, lastSeenAt: beat, createdAt: t(NOW - 60000) }, 'between'],
  ['five minutes in with no speech is a stall', { status: 'pending' },
    { seatSeen: both, lastSeenAt: beat, createdAt: t(NOW - 5 * 60000) }, 'stalled'],
  ['an old room that HAS run a speech is not stalled', { status: 'pending' },
    { seatSeen: both, lastSeenAt: beat, createdAt: t(NOW - 9 * 60000), speechIdx: 2 }, 'between'],
  ['a paused clock still counts as started', { status: 'pending' },
    { seatSeen: both, lastSeenAt: beat, createdAt: t(NOW - 9 * 60000),
      currentTimer: { state: 'paused', updatedAtMs: NOW - 30000 } }, 'between'],
];

let failed = 0;
for (const [label, pairing, live, want] of CASES) {
  const got = roomState(pairing, live);
  if (got !== want) { failed++; console.error('  FAIL  ' + label + ' → ' + got + ' (wanted ' + want + ')'); }
}
if (failed) { console.error('\n[director] ' + failed + ' of ' + CASES.length + ' failed'); process.exit(1); }
console.log('[director] ' + CASES.length + ' state cases pass');
