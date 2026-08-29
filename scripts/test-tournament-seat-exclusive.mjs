import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const admin = read('app/netlify/functions/tournament-admin.mjs');
const dropin = read('app/netlify/functions/tournament-dropin.mjs');
const ledger = read('app/netlify/functions/lib/tournament-ledger.mjs');
const spar = read('app/netlify/functions/spar-pair.mjs');
const notice = read('app/js/notifications.js');
const rules = read('app/firestore.rules');
const page = read('app/tournament.html');
const open = read('app/open.html');
const api = read('app/netlify/functions/tournament.mjs');

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { passed += 1; return; }
  failed += 1;
  console.error('FAIL:', label);
}

check('fixed draws create user-level tournament reservations',
  admin.includes("collection('active_tournament_seats').doc(uid)"));
check('fixed draws atomically remove general Spar queue docs',
  admin.includes("tx.delete(db.collection('matchmaking_queue').doc(uid))"));
check('redraws release only reservations owned by the discarded pairing',
  /old\.tid === tid[\s\S]{0,180}releasedUsers\.get\(uid\)[\s\S]{0,180}tx\.delete\(snap\.ref\)/.test(admin));
check('the host can idempotently repair seats for a live round',
  admin.includes("action === 'sync-seating'") && page.includes("action: 'sync-seating'"));
check('new draws treat released rooms as opponent history before results land',
  admin.includes('const drawnRounds = await')
    && admin.includes('pairedBefore.get(p.govEntry).add(p.oppEntry)')
    && admin.includes('const drawEntries = entries.map'));
check('the host can replace a result-free live draw after a bad repeat',
  page.includes("act('Redraw round '") && page.includes("force: true, reseed: true"));
check('the host can open continuous live pairing without locking registration',
  page.includes("act('Open live pairing'")
    && page.includes("action: 'update', tid: t.tid, dropIn: true")
    && admin.includes("if (body.dropIn != null) patch.dropIn"));
check('the host can release unresolved fixed rooms into the live queue',
  admin.includes("action === 'release-fixed-seating'")
    && admin.includes("await applySeating(db, tid, t.data, [], pairings, entries)")
    && page.includes("act('Move waiting rooms to live queue'"));
check('releasing fixed rooms never erases a completed result',
  /release-fixed-seating[\s\S]{0,900}p\.status === 'complete'\) continue/.test(admin));
check('old fixed-room cards stop acting like the person is still assigned',
  open.includes('mine.inPairing === pair.pairingId')
    && open.includes('mine.inPairing === p.pairingId')
    && page.includes('mine.inPairing === p.pairingId')
    && api.includes("inPairing: String(e.inPairing || '')"));

check('drop-in draws create the same user-level reservation',
  dropin.includes("collection('active_tournament_seats').doc(uid)"));
check('drop-in draws atomically remove general Spar queue docs',
  dropin.includes("tx.delete(db.collection('matchmaking_queue').doc(uid))"));
check('drop-in API requires the caller to be checked in',
  dropin.includes("status || 'registered') !== 'checked_in'")
    && dropin.includes('Check in before joining the tournament queue.'));
check('drop-in page hides live pairing until the person checks in',
  page.includes("mine.status === 'checked_in'")
    && open.includes("mine.status === 'checked_in'"));
check('drop-in engine excludes registered but unchecked entries',
  /availableForDropIn[\s\S]{0,500}status \|\| ''\) === 'checked_in'/.test(read('app/netlify/functions/lib/tournament.mjs')));
check('automatic tournament results release the reservation',
  ledger.includes("collection('active_tournament_seats').doc(uid)")
    && /seat\.tid === tid[\s\S]{0,160}tx\.delete\(seatSnap\.ref\)/.test(ledger));
check('manual tournament results release the reservation',
  /const releaseSeats = \(\) =>[\s\S]{0,500}tx\.delete\(seatSnap\.ref\)/.test(admin));

check('general matching reads both reservations inside its transaction',
  spar.includes('tx.get(myTournamentSeatRef)') && spar.includes('tx.get(peerTournamentSeatRef)'));
check('general matching refuses the assigned person',
  spar.includes("reason: 'tournament_seat_active'"));
check('general matching removes an assigned peer from the pool',
  /peerSeatSnap\.exists[\s\S]{0,220}tx\.delete\(peerRef\)/.test(spar));

check('the sitewide pill listens to the signed-in person\'s reservation',
  notice.includes("collection('active_tournament_seats').doc(user.uid)"));
check('the pill names the exclusive state instead of general availability',
  notice.includes("lab.textContent = 'Tournament match'"));
check('the reservation pauses every general requeue path',
  notice.includes('inRound() || inSpar() || !!tournamentSeat'));
check('only the reservation owner may read it',
  /match \/active_tournament_seats\/\{seatUid\}[\s\S]{0,220}allow get:[\s\S]{0,120}seatUid == request\.auth\.uid/.test(rules));
check('clients cannot write tournament reservations',
  /match \/active_tournament_seats\/\{seatUid\}[\s\S]{0,320}allow list, create, update, delete: if false/.test(rules));

console.log(`tournament-seat-exclusive: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
