// Unit test for lib/tournament-live.mjs — continuous pairing and the
// points ledger for a drop-in tournament.
// Run: node scripts/test-tournament-live.mjs
//
// The points rule decides a cash placement, so a change that breaks an
// assertion here changes the terms of a contest, not just a sort order.
import {
  roundPoints, ledgerFor, liveStandings, roomScoreFor,
  pairNext, pairAll,
  WIN_POINTS, SPEAKS_BASE, MIN_ROUNDS, REMATCH_AFTER_MS,
} from '../app/netlify/functions/lib/tournament-live.mjs';

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };

// ── points ──
t('a win pays the bonus',        roundPoints({ won: true,  speaks: 23 }) === WIN_POINTS);
t('a baseline round pays 0',     roundPoints({ won: false, speaks: 23 }) === 0);
t('quality is above the floor',  roundPoints({ won: false, speaks: 28 }) === 5);
t('win plus quality adds',       roundPoints({ won: true,  speaks: 28 }) === WIN_POINTS + 5);
t('perfect round caps at 10',    roundPoints({ won: true,  speaks: 30 }) === 10);
t('speaks clamp at the top',     roundPoints({ won: false, speaks: 99 }) === 7);
t('speaks clamp at the bottom',  roundPoints({ won: false, speaks: 2 })  === 0);
// A ballot that produced no scorecard must not erase a round two people
// actually debated.
t('missing speaks still pays the win', roundPoints({ won: true }) === WIN_POINTS);
t('missing speaks on a loss is 0',     roundPoints({ won: false }) === 0);

// THE POINT OF THE WHOLE MODEL: a much better speaker who lost can
// finish above someone who scraped a win. If this ever fails, the board
// has quietly become a win count again.
t('a strong loss beats a weak win',
  roundPoints({ won: false, speaks: 29 }) > roundPoints({ won: true, speaks: 24 }));

// ── ledger ──
const rounds = [
  { won: true,  speaks: 28 },   // 3 + 5 = 8
  { won: false, speaks: 27 },   // 0 + 4 = 4
  { won: true,  speaks: 26 },   // 3 + 3 = 6
];
const led = ledgerFor(rounds);
t('points total',      led.points === 18);
t('played counted',    led.played === 3);
t('wins counted',      led.wins === 2);
t('losses counted',    led.losses === 1);
t('average reported',  led.avgPoints === 6);
t('avg speaks',        led.avgSpeaks === 27);
t('empty ledger is zero', ledgerFor([]).points === 0);
t('empty ledger is not rankable', ledgerFor([]).rankable === false);

// ── the round floor ──
t('floor is three rounds', MIN_ROUNDS === 3);
t('two rounds is provisional', ledgerFor(rounds.slice(0, 2)).rankable === false);
t('three rounds is rankable',  ledgerFor(rounds).rankable === true);

// A hot two-round start must not sit above someone who played all day.
const board = liveStandings([
  { entryId: 'hot',   rounds: [{ won: true, speaks: 30 }, { won: true, speaks: 30 }] },     // 20, provisional
  { entryId: 'grind', rounds: Array.from({ length: 5 }, () => ({ won: false, speaks: 25 })) }, // 10, rankable
]);
t('provisional sorts below rankable', board[0].entryId === 'grind');
t('provisional is still shown',       board.length === 2);
t('provisional is flagged',           board[1].rankable === false);

const tied = liveStandings([
  { entryId: 'b', rounds: [{ won: true, speaks: 24 }, { won: true, speaks: 24 }, { won: true, speaks: 24 }] },
  { entryId: 'a', rounds: [{ won: true, speaks: 24 }, { won: true, speaks: 24 }, { won: true, speaks: 24 }] },
]);
t('ties are stable by entryId', tied[0].entryId === 'a');

// ── the room score stays out of the standings ──
// The judge rubric fences its persuasion axis against charm, fluency and
// accent. A cash ladder carrying an entertainment score would walk
// through that fence, so this separation is a promise, not a detail.
t('room score averages',   roomScoreFor([{ room: 8 }, { room: 6 }]).room === 7);
t('room score counts',     roomScoreFor([{ room: 8 }, { room: 6 }]).rated === 2);
t('unrated rounds ignored', roomScoreFor([{ room: 8 }, {}]).rated === 1);
t('no room scores is zero', roomScoreFor([]).room === 0);
t('room never enters points',
  roundPoints({ won: false, speaks: 23, room: 10 }) === 0);
t('room never enters the ledger',
  ledgerFor([{ won: false, speaks: 23, room: 10 }]).points === 0);
t('ledger does not report a room score',
  ledgerFor([{ won: true, speaks: 30, room: 10 }]).room === undefined);

// ── continuous pairing ──
const NOW = 1_700_000_000_000;
const e = (id, o = {}) => ({
  entryId: id, waitingSince: NOW - 1000, points: 0, opponents: [],
  govCount: 0, oppCount: 0, ...o,
});

t('nobody pairs alone',      pairNext([e('a')], NOW) === null);
t('empty pool pairs nothing', pairNext([], NOW) === null);

const two = pairNext([e('a'), e('b')], NOW);
t('two entries pair', !!two);
t('both are seated',  [two.govEntry, two.oppEntry].sort().join() === 'a,b');
t('a fresh pair is not a rematch', two.rematch === false);

// The anchor is the LONGEST WAITING, never the strongest. A weak
// entrant sitting forever while stronger pairs form around them is how
// a drop-in day loses the person it most needed to keep.
const q = pairNext([
  e('strong', { points: 40, waitingSince: NOW - 1000 }),
  e('waiting', { points: 0,  waitingSince: NOW - 90000 }),
  e('mid',     { points: 20, waitingSince: NOW - 500 }),
], NOW);
t('longest waiting is always seated',
  q.govEntry === 'waiting' || q.oppEntry === 'waiting');

// Given the anchor, the partner IS chosen on merit.
const merit = pairNext([
  e('anchor', { points: 20, waitingSince: NOW - 90000 }),
  e('far',    { points: 0 }),
  e('near',   { points: 21 }),
], NOW);
t('partner is the closest on points',
  merit.govEntry === 'near' || merit.oppEntry === 'near');
t('points gap is reported', merit.pointsGap === 1);

// ── rematches ──
const met = [
  e('a', { opponents: ['b'], waitingSince: NOW - 1000 }),
  e('b', { opponents: ['a'] }),
];
t('a rematch is refused early', pairNext(met, NOW) === null);
const metLong = [
  e('a', { opponents: ['b'], waitingSince: NOW - REMATCH_AFTER_MS - 1 }),
  e('b', { opponents: ['a'] }),
];
t('a rematch is allowed after the wait', !!pairNext(metLong, NOW));
t('and it is recorded as one',           pairNext(metLong, NOW).rematch === true);
// One-sided history still counts: b having met a is the same fact.
t('history is read from both sides',
  pairNext([e('a', { waitingSince: NOW - 1000 }), e('b', { opponents: ['a'] })], NOW) === null);
t('a fresh third party beats a rematch',
  (() => {
    const p = pairNext([
      e('a', { opponents: ['b'], waitingSince: NOW - REMATCH_AFTER_MS - 1 }),
      e('b', { opponents: ['a'] }),
      e('c'),
    ], NOW);
    return p.govEntry === 'c' || p.oppEntry === 'c';
  })());

// ── sides ──
t('gov debt takes opp',
  pairNext([e('a', { govCount: 2 }), e('b', { govCount: 0 })], NOW).govEntry === 'b');
t('the other way round too',
  pairNext([e('a', { govCount: 0 }), e('b', { govCount: 3 })], NOW).govEntry === 'a');

// ── availability + draining ──
t('unavailable entries never pair',
  pairNext([e('a'), e('b', { available: false })], NOW) === null);

const drained = pairAll([e('a'), e('b'), e('c'), e('d')], NOW);
t('a full queue drains',       drained.pairs.length === 2);
t('and leaves nobody waiting', drained.unpaired.length === 0);
const odd = pairAll([e('a'), e('b'), e('c')], NOW);
t('an odd queue pairs what it can', odd.pairs.length === 1);
// A bye on a drop-in day would be points nobody debated for. There is
// always another arrival.
t('the odd one waits, never gets a bye', odd.unpaired.length === 1);
t('nobody is seated twice in one drain',
  (() => {
    const seen = new Set();
    for (const p of drained.pairs) { seen.add(p.govEntry); seen.add(p.oppEntry); }
    return seen.size === 4;
  })());

t('baseline is the ballot floor', SPEAKS_BASE === 23);

console.log(`tournament live: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
