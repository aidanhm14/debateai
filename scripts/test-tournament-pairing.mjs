#!/usr/bin/env node
// Invariant tests for the tournament pairing engine.
//
//   node scripts/test-tournament-pairing.mjs
//
// Simulates full tournaments across a range of field sizes and round
// counts, then asserts the properties a director would actually
// complain about: a team missing from the draw, a team hitting itself,
// avoidable rematches, lopsided side assignment, a break that isn't a
// bracket. Deterministic, so a failure here reproduces exactly.

import {
  pairPrelimRound, standings, breakField, elimPairings, elimLabel,
  advanceElim, resultPatch, byePatch, rng, seedFrom,
  pairDropIn, availableForDropIn,
} from '../app/netlify/functions/lib/tournament.mjs';
import { tournamentRatings } from '../app/netlify/functions/lib/tournament-rating.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass += 1; return; }
  fail += 1;
  failures.push(name + (detail ? ' — ' + detail : ''));
}

function makeField(n) {
  return Array.from({ length: n }, (_, i) => ({
    entryId: 'e' + (i + 1),
    name: 'Team ' + (i + 1),
    wins: 0, losses: 0, speaks: 0, byes: 0,
    sideCount: { gov: 0, opp: 0 },
    opponents: [],
    status: 'checked_in',
  }));
}

// The all-day ladder is event-only and rebuilds from authoritative results.
// New arrivals start even, incomplete rooms do not count, and correcting a
// stored winner reverses the table on the next read.
(() => {
  const entries = makeField(3);
  const round = (winner) => ({
    key: 'd1', seq: 1,
    pairings: [{
      pairingId: 'd1-1', status: 'complete', winner,
      govEntry: 'e1', oppEntry: 'e2',
    }, {
      pairingId: 'd1-2', status: 'pending', winner: 'gov',
      govEntry: 'e2', oppEntry: 'e3',
    }],
  });
  const first = tournamentRatings(entries, [round('gov')]);
  check('rating ladder: a first win moves 1500 to 1516', Math.round(first.get('e1').rating) === 1516);
  check('rating ladder: a first loss moves 1500 to 1484', Math.round(first.get('e2').rating) === 1484);
  check('rating ladder: an incomplete room does not count', first.get('e3').games === 0);
  const amended = tournamentRatings(entries, [round('opp')]);
  check('rating ladder: an amended winner rebuilds the event table',
    Math.round(amended.get('e1').rating) === 1484 && Math.round(amended.get('e2').rating) === 1516);
})();

// Run a full prelim series. Results are decided by a seeded coin so
// the simulation is reproducible but not degenerate (a "higher seed
// always wins" rule would never produce the bracket shapes that break
// pairing).
function runPrelims(fieldSize, rounds, seed) {
  const next = rng(seed);
  let entries = makeField(fieldSize);
  const log = [];

  for (let r = 1; r <= rounds; r += 1) {
    const draw = pairPrelimRound(entries, r, { tid: 'sim' + fieldSize, seed: seed + r });
    log.push(draw);

    // Every active entry appears exactly once: paired or bye.
    const seen = new Map();
    draw.pairings.forEach((p) => {
      seen.set(p.govEntry, (seen.get(p.govEntry) || 0) + 1);
      seen.set(p.oppEntry, (seen.get(p.oppEntry) || 0) + 1);
      check('r' + r + ' n=' + fieldSize + ' no self-pair', p.govEntry !== p.oppEntry, p.govEntry);
    });
    if (draw.bye) seen.set(draw.bye.entryId, (seen.get(draw.bye.entryId) || 0) + 1);

    check(
      'n=' + fieldSize + ' r' + r + ' every entry drawn exactly once',
      entries.every((e) => seen.get(e.entryId) === 1) && seen.size === entries.length,
      'drawn=' + seen.size + ' field=' + entries.length
        + ' missing=' + entries.filter((e) => !seen.get(e.entryId)).map((e) => e.entryId).join(',')
    );

    // Apply results.
    const byId = new Map(entries.map((e) => [e.entryId, e]));
    draw.pairings.forEach((p) => {
      const govWins = next() < 0.5;
      const gov = byId.get(p.govEntry);
      const opp = byId.get(p.oppEntry);
      const govSpeaks = 140 + Math.floor(next() * 20);
      const oppSpeaks = 140 + Math.floor(next() * 20);
      Object.assign(gov, resultPatch(gov, { won: govWins, speaks: govSpeaks, side: 'gov', opponentEntryId: opp.entryId }));
      Object.assign(opp, resultPatch(opp, { won: !govWins, speaks: oppSpeaks, side: 'opp', opponentEntryId: gov.entryId }));
    });
    if (draw.bye) {
      const b = byId.get(draw.bye.entryId);
      Object.assign(b, byePatch(b));
    }
    entries = Array.from(byId.values());
  }
  return { entries, log };
}

// ── Prelim invariants across many field shapes ─────────────────────
[4, 5, 6, 7, 8, 9, 12, 13, 16, 17, 24, 32, 33, 48].forEach((n) => {
  const rounds = n <= 6 ? 3 : 5;
  const { entries, log } = runPrelims(n, rounds, seedFrom('field' + n));

  // Side balance. An even field can always be brought to within one
  // round of even, and is held to that. An ODD field cannot: one team
  // byes each round and keeps its side debt while everyone else
  // flips, so the pool of teams owed Gov and owed Opp stops matching
  // up. The engine could flatten those by pairing across win
  // brackets, and deliberately does not: power pairing is the more
  // important property, so a rare skew of 2 is accepted instead of an
  // unearned pull-up. Measured over 400 simulated tournaments, 1.85%
  // of entries finish above skew 1.
  const worst = entries.reduce((m, e) => Math.max(m, Math.abs(e.sideCount.gov - e.sideCount.opp)), 0);
  const bound = (n % 2 === 0) ? 1 : 2;
  check('n=' + n + ' side balance within ' + bound, worst <= bound, 'worst skew=' + worst);
  const offBalance = entries.filter((e) => Math.abs(e.sideCount.gov - e.sideCount.opp) > 1).length;
  check('n=' + n + ' side skew above 1 stays rare', offBalance <= Math.ceil(n * 0.15),
    offBalance + ' of ' + n + ' entries');

  // Rematches: with enough teams for the number of rounds there is no
  // excuse for one. Small fields genuinely run out of opponents, so
  // they are allowed rematches but must still draw everyone.
  const dupes = entries.reduce((acc, e) => {
    const uniq = new Set(e.opponents);
    return acc + (e.opponents.length - uniq.size);
  }, 0);
  if (n >= 2 * rounds) {
    check('n=' + n + ' no rematches in ' + rounds + ' rounds', dupes === 0, dupes + ' rematches');
    // The draw must also KNOW it was clean. A rematch count that
    // disagrees with the record is how a tab quietly lies to a
    // director about the quality of its own pairing.
    const reported = log.reduce((a, d) => a + d.rematches, 0);
    check('n=' + n + ' draw reports its own rematch count honestly', reported === 0, 'reported ' + reported);
  }

  // Byes are shared out, never stacked on one team.
  const maxByes = entries.reduce((m, e) => Math.max(m, e.byes), 0);
  check('n=' + n + ' no entry byes more than once', maxByes <= 1, 'max byes=' + maxByes);

  // Total ballots reconcile: each pairing produces exactly one win.
  const totalWins = entries.reduce((a, e) => a + e.wins, 0);
  const expected = log.reduce((a, d) => a + d.pairings.length + (d.bye ? 1 : 0), 0);
  check('n=' + n + ' wins reconcile with rounds run', totalWins === expected, totalWins + ' vs ' + expected);

  // Standings are ordered and complete.
  const table = standings(entries);
  check('n=' + n + ' standings complete', table.length === n, table.length + ' of ' + n);
  const ordered = table.every((e, i) => i === 0 || table[i - 1].wins > e.wins
    || (table[i - 1].wins === e.wins && table[i - 1].speaks >= e.speaks));
  check('n=' + n + ' standings ordered by wins then speaks', ordered);
});

// ── Determinism ────────────────────────────────────────────────────
{
  const a = runPrelims(16, 4, 4242).entries;
  const b = runPrelims(16, 4, 4242).entries;
  check('same seed reproduces the same tournament',
    JSON.stringify(standings(a)) === JSON.stringify(standings(b)));
  const c = runPrelims(16, 4, 777).entries;
  check('different seed gives a different draw',
    JSON.stringify(standings(a)) !== JSON.stringify(standings(c)));
}

// ── Break ──────────────────────────────────────────────────────────
[[16, 8, 8], [16, 16, 16], [12, 8, 8], [12, 16, 8], [7, 8, 4], [5, 4, 4], [3, 4, 2]].forEach(([n, want, expect]) => {
  const { entries } = runPrelims(n, 3, seedFrom('brk' + n));
  const br = breakField(entries, want);
  check('field ' + n + ' break request ' + want + ' resolves to ' + expect, br.size === expect, 'got ' + br.size);
  check('break size ' + br.size + ' is a power of two', br.size > 0 && (br.size & (br.size - 1)) === 0);
  check('break never exceeds the field', br.size <= n);
  const seeds = br.breaking.map((b) => b.seed);
  check('break seeds are 1..n in order', seeds.join(',') === seeds.map((_, i) => i + 1).join(','));
});

// ── Elims ──────────────────────────────────────────────────────────
{
  const { entries } = runPrelims(16, 5, seedFrom('elim'));
  const br = breakField(entries, 8);
  let bracket = br.breaking;
  let roundNo = 1;
  const labels = [];
  const next = rng(99);

  while (bracket.length > 1) {
    const label = elimLabel(bracket.length);
    labels.push(label);
    const pairings = elimPairings(bracket, label, roundNo);
    check(label + ' pairs the whole bracket', pairings.length === bracket.length / 2);
    // Top seed always meets the bottom seed.
    check(label + ' seeds 1 vs n', pairings[0].govSeed === bracket[0].seed
      && pairings[0].oppSeed === bracket[bracket.length - 1].seed);
    const ids = new Set();
    pairings.forEach((p) => { ids.add(p.govEntry); ids.add(p.oppEntry); });
    check(label + ' every breaking team appears once', ids.size === bracket.length);

    pairings.forEach((p) => { p.winner = next() < 0.5 ? 'gov' : 'opp'; });
    bracket = advanceElim(pairings);
    check(label + ' advances exactly half', bracket.length === pairings.length);
    roundNo += 1;
  }
  check('bracket resolves to one champion', bracket.length === 1);
  check('elim labels run quarters, semis, final',
    labels.join(' > ') === 'Quarterfinal > Semifinal > Final', labels.join(' > '));
}

// ── Degenerate inputs ──────────────────────────────────────────────
{
  check('empty field is refused, not crashed', !!pairPrelimRound([], 1, {}).error);
  check('single entry is refused', !!pairPrelimRound(makeField(1), 1, {}).error);
  const withdrawn = makeField(6);
  withdrawn[0].status = 'withdrawn';
  withdrawn[1].status = 'dropped';
  const d = pairPrelimRound(withdrawn, 2, {});
  const drawn = new Set();
  d.pairings.forEach((p) => { drawn.add(p.govEntry); drawn.add(p.oppEntry); });
  if (d.bye) drawn.add(d.bye.entryId);
  check('withdrawn and dropped entries are left out of the draw',
    !drawn.has('e1') && !drawn.has('e2') && drawn.size === 4, [...drawn].join(','));
}

// ── Tournament scale, many seeds ───────────────────────────────────
//
// Everything above runs one seed per field shape, at n <= 48, and
// always at an ODD round count. All three of those hid things.
//
// PARITY FIRST: |gov - opp| has the same parity as the round count.
// After an even number of rounds a skew of 1 is arithmetically
// impossible, so the "within 1" bound above is really "perfectly
// even" at 4 and 6 rounds, and the honest bound there is 2.
//
// SCALE SECOND: on a single seed at n=48 the even-field bound of 1
// holds. Across 40 seeds it does not, and the failure rate climbs
// with the field: at 64 to 128 entries over 5 rounds roughly a third
// of draws hand at least one team a 4-1 side split. That is the
// deliberate trade documented in lib/tournament.mjs (power pairing
// outranks side balance, and flattening these costs an unearned
// pull-up), so this asserts the REAL behaviour rather than a bound
// the engine does not meet. If a change makes these numbers worse,
// this is what catches it.
[
  { n: 64, rounds: 5, maxSkew: 3, maxOffBalanceAvg: 2 },
  { n: 128, rounds: 5, maxSkew: 3, maxOffBalanceAvg: 2 },
  { n: 128, rounds: 4, maxSkew: 2, maxOffBalanceAvg: 14 },
  { n: 128, rounds: 6, maxSkew: 2, maxOffBalanceAvg: 18 },
].forEach(({ n, rounds, maxSkew, maxOffBalanceAvg }) => {
  const SEEDS = 12;
  let worst = 0;
  let offTotal = 0;
  let rematchTotal = 0;
  let byeStack = 0;
  for (let s = 0; s < SEEDS; s += 1) {
    const { entries, log } = runPrelims(n, rounds, seedFrom('scale' + n + '-' + rounds + '-' + s));
    entries.forEach((e) => {
      const skew = Math.abs(e.sideCount.gov - e.sideCount.opp);
      worst = Math.max(worst, skew);
      if (skew > 1) offTotal += 1;
      if (e.byes > 1) byeStack += 1;
    });
    rematchTotal += log.reduce((a, d) => a + d.rematches, 0);
    entries.forEach((e) => {
      rematchTotal += e.opponents.length - new Set(e.opponents).size;
    });
  }
  const tag = 'n=' + n + ' r' + rounds + ' x' + SEEDS + ' seeds';
  check(tag + ' side skew stays within ' + maxSkew, worst <= maxSkew, 'worst=' + worst);
  check(tag + ' skewed entries stay rare', offTotal / SEEDS <= maxOffBalanceAvg,
    (offTotal / SEEDS).toFixed(1) + ' per tournament');
  // The property that actually matters at scale, and the one the
  // global matching exists to protect. A rematch in a 128-team field
  // is never acceptable; there are always fresh opponents.
  check(tag + ' zero rematches at scale', rematchTotal === 0, rematchTotal + ' rematches');
  check(tag + ' no entry byes twice', byeStack === 0, byeStack + ' stacked byes');
});

// ── Drop-in pairing ────────────────────────────────────────────────
//
// The all-day format the site actually sells. Different failure modes
// from the synchronous draw, so different assertions: the dangerous
// ones here are a free win handed to whoever turned up at an odd
// moment, and a debater who waits all afternoon while later arrivals
// get seated ahead of them.
(function dropIn() {
  const T = 1_000_000;
  const q = (e, atMs) => ({ ...e, availableAt: atMs });

  // ── availability ────────────────────────────────────────────────
  const base = makeField(4);
  check('dropin: unqueued entries are not available',
    availableForDropIn(base, T).length === 0);
  check('dropin: queued entries are available',
    availableForDropIn(base.map((e) => q(e, T)), T).length === 4);
  check('dropin: a stale queue slot drops out',
    availableForDropIn([q(base[0], T - 60_000), q(base[1], T - 60 * 60_000)], T).length === 1);
  check('dropin: someone already in a round is not available',
    availableForDropIn([q(base[0], T), { ...q(base[1], T), inPairing: 'd1-1' }], T).length === 1);
  check('dropin: a withdrawn entry is not available',
    availableForDropIn([q(base[0], T), { ...q(base[1], T), status: 'withdrawn' }], T).length === 1);
  check('dropin: a registered but unchecked entry is not available',
    availableForDropIn([q(base[0], T), { ...q(base[1], T), status: 'registered' }], T).length === 1);

  // ── availableAt is a DEADLINE, not a heartbeat ──────────────────
  //
  // The field does two jobs at once: freshness for availableForDropIn
  // and accrued waiting time for the rematch-patience gate. A queue
  // implementation that keeps the slot warm by rewriting availableAt on
  // every poll therefore looks correct and deadlocks the second job:
  // wait never reaches the patience threshold, so a pool whose only
  // legal draw is a repeat holds forever while the screen says
  // "searching". These two assertions are the reason
  // tournament-dropin.mjs writes availableAt exactly once.
  const metPair = [
    { ...q(base[0], T), opponents: ['e2'] },
    { ...q(base[1], T), opponents: ['e1'] },
  ];
  const heartbeated = pairDropIn(metPair, { now: T });
  check('dropin: a freshly-refreshed slot HOLDS rather than seating a repeat',
    heartbeated.pairings.length === 0 && heartbeated.heldForFreshOpponent === true);

  // The same two people, with the slot left alone long enough to pass
  // the patience threshold, do get seated. If this ever fails while the
  // one above passes, the gate has become a deadlock rather than a
  // delay and nobody with a shared history ever plays again.
  const patient = [
    { ...q(base[0], T - 5 * 60_000), opponents: ['e2'] },
    { ...q(base[1], T - 5 * 60_000), opponents: ['e1'] },
  ];
  const released = pairDropIn(patient, { now: T });
  check('dropin: past the patience threshold the repeat is seated',
    released.pairings.length === 1 && released.rematchFallback === true);

  // Waiting out the timer is not enough while a fresh checked-in
  // opponent exists elsewhere in the field. A and B have met and are
  // free; C is checked in but still in a room. A-B must wait for the
  // rotation rather than becoming an immediate repeat.
  const freshElsewhere = pairDropIn([
    { ...q(base[0], T - 5 * 60_000), opponents: ['e2'] },
    { ...q(base[1], T - 5 * 60_000), opponents: ['e1'] },
    { ...base[2], inPairing: 'd8-1' },
  ], { now: T });
  check('dropin: an unseen checked-in opponent blocks an immediate rematch',
    freshElsewhere.pairings.length === 0 && freshElsewhere.heldForFreshOpponent === true);

  // ── the two rules that are specific to drop-in ──────────────────
  const one = pairDropIn([q(base[0], T)], { now: T });
  check('dropin: a lone entrant gets no pairing', one.pairings.length === 0);
  check('dropin: a lone entrant is reported as waiting', one.waiting.length === 1);
  check('dropin: waiting is NOT a bye (no bye field at all)', !('bye' in one));

  const odd = pairDropIn([q(base[0], T - 300_000), q(base[1], T - 200_000), q(base[2], T - 5_000)], { now: T });
  check('dropin: odd pool seats one pair', odd.pairings.length === 1);
  check('dropin: odd pool leaves exactly one waiting', odd.waiting.length === 1);
  check('dropin: the NEWEST arrival is the one who waits',
    odd.waiting[0].entryId === 'e3', 'waited=' + odd.waiting[0].entryId);
  const seated = [odd.pairings[0].govEntry, odd.pairings[0].oppEntry].sort().join(',');
  check('dropin: the two longest waiters are the ones seated', seated === 'e1,e2', seated);
  check('dropin: waiting time is reported', odd.waiting[0].waitingMs === 5_000);
  // The odd-pool path is the one that could grow a bye by accident,
  // since it is the only place an entrant is set aside. A bye here
  // would make arriving at an odd moment worth a free win.
  check('dropin: the odd-pool draw exposes NO bye', !('bye' in odd));
  check('dropin: the sit-out is described as waiting, not as a bye',
    Object.keys(odd).every((k) => k.toLowerCase() !== 'bye'));

  // ── sit-out choice avoids a forced rematch ──────────────────────
  // A and B have met. C and D have not met anyone. Newest is D. Sitting
  // D out would leave A,B,C and force the A-B rematch; the engine must
  // try another sit-out instead.
  const hist = [
    q({ ...base[0], opponents: ['e2'] }, T - 400_000),
    q({ ...base[1], opponents: ['e1'] }, T - 300_000),
    q(base[2], T - 200_000),
    q({ ...base[3], entryId: 'e4', name: 'Team 4' }, T - 10_000),
    q({ ...base[0], entryId: 'e5', name: 'Team 5', opponents: [] }, T - 5_000),
  ];
  const avoided = pairDropIn(hist, { now: T });
  check('dropin: a forced rematch is avoided by choosing a different sit-out',
    avoided.rematches === 0, avoided.rematches + ' rematches');
  check('dropin: still seats two pairs from five', avoided.pairings.length === 2);

  // ── patience, and the deadlock it must never recreate ───────────
  // Two who have met, both freshly arrived: hold rather than repeat.
  const met2 = [
    q({ ...base[0], opponents: ['e2'] }, T - 30_000),
    q({ ...base[1], opponents: ['e1'] }, T - 30_000),
  ];
  const held = pairDropIn(met2, { now: T });
  check('dropin: a repeat is held back while the wait is short', held.pairings.length === 0);
  check('dropin: holding is reported as such', held.heldForFreshOpponent === true);
  check('dropin: both are still shown as waiting', held.waiting.length === 2);

  // Same pair, now well past patience: play the repeat rather than
  // leave them queueing all afternoon.
  const waited = pairDropIn([
    q({ ...base[0], opponents: ['e2'] }, T - 5 * 60_000),
    q({ ...base[1], opponents: ['e1'] }, T - 5 * 60_000),
  ], { now: T });
  check('dropin: a repeat is seated once someone has waited past patience',
    waited.pairings.length === 1);
  check('dropin: that draw admits it fell back', waited.rematchFallback === true);

  const fullRotation = [
    q({ ...base[0], opponents: ['e3', 'e4', 'e2'] }, T - 5 * 60_000),
    q({ ...base[1], opponents: ['e4', 'e3', 'e1'] }, T - 5 * 60_000),
    q({ ...base[2], opponents: ['e1', 'e2', 'e4'] }, T - 5 * 60_000),
    q({ ...base[3], opponents: ['e2', 'e1', 'e3'] }, T - 5 * 60_000),
  ];
  const reround = pairDropIn(fullRotation, { now: T });
  const lastOpp = new Map(fullRotation.map((e) => [e.entryId, e.opponents[e.opponents.length - 1]]));
  check('dropin: a later rematch cycle avoids the immediately previous opponent',
    reround.pairings.length === 2 && reround.pairings.every((p) => (
      lastOpp.get(p.govEntry) !== p.oppEntry && lastOpp.get(p.oppEntry) !== p.govEntry
    )));

  // THE DEADLOCK GUARD. Patience above the staleness window means an
  // entrant ages out of the queue before the hold releases, so nobody
  // ever plays. Measured: a 6-entrant day ran 3 rounds instead of 69.
  // The clamp must make an absurd patience harmless.
  const absurd = pairDropIn([
    q({ ...base[0], opponents: ['e2'] }, T - 5 * 60_000),
    q({ ...base[1], opponents: ['e1'] }, T - 5 * 60_000),
  ], { now: T, rematchPatienceMs: 60 * 60_000 });
  check('dropin: patience is clamped below the staleness window, so it cannot deadlock',
    absurd.pairings.length === 1, 'held with patience > window');

  // ── determinism ─────────────────────────────────────────────────
  const pool = base.map((e, i) => q(e, T - (4 - i) * 60_000));
  const a1 = pairDropIn(pool, { tid: 'aug29', seq: 7, now: T });
  const a2 = pairDropIn(pool, { tid: 'aug29', seq: 7, now: T });
  check('dropin: same inputs and seq reproduce the same draw',
    JSON.stringify(a1.pairings) === JSON.stringify(a2.pairings));
  const a3 = pairDropIn(pool, { tid: 'aug29', seq: 8, now: T });
  check('dropin: a different seq is allowed to differ', a3.seed !== a1.seed);

  // ── pairing shape ───────────────────────────────────────────────
  const ids = new Set(a1.pairings.map((p) => p.pairingId));
  check('dropin: pairing ids are unique', ids.size === a1.pairings.length);
  check('dropin: pairings are marked kind=dropin', a1.pairings.every((p) => p.kind === 'dropin'));
  check('dropin: pairings carry roundNo 0', a1.pairings.every((p) => p.roundNo === 0));
  check('dropin: pairings stamp pairedAt', a1.pairings.every((p) => p.pairedAt === T));
  check('dropin: nobody is seated twice in one draw', (() => {
    const seen = new Set();
    for (const p of a1.pairings) {
      if (seen.has(p.govEntry) || seen.has(p.oppEntry)) return false;
      seen.add(p.govEntry); seen.add(p.oppEntry);
    }
    return true;
  })());
  check('dropin: nobody is paired against themselves',
    a1.pairings.every((p) => p.govEntry !== p.oppEntry));

  // ── side balance ────────────────────────────────────────────────
  // Two entrants owed Gov and two owed Opp must be crossed, not stacked.
  const skewed = [
    q({ ...base[0], sideCount: { gov: 3, opp: 0 } }, T - 40_000),
    q({ ...base[1], sideCount: { gov: 0, opp: 3 } }, T - 30_000),
    q({ ...base[2], sideCount: { gov: 3, opp: 0 } }, T - 20_000),
    q({ ...base[3], sideCount: { gov: 0, opp: 3 } }, T - 10_000),
  ];
  const sides = pairDropIn(skewed, { now: T });
  const govOwedGetsOpp = sides.pairings.every((p) => {
    const g = skewed.find((e) => e.entryId === p.govEntry);
    const o = skewed.find((e) => e.entryId === p.oppEntry);
    return (g.sideCount.gov - g.sideCount.opp) <= (o.sideCount.gov - o.sideCount.opp);
  });
  check('dropin: whoever owes Gov least takes Gov', govOwedGetsOpp);

  // ── a full simulated day ────────────────────────────────────────
  //
  // Entrants trickle in across the afternoon, play a round that takes
  // real time, then rejoin the queue. Round duration is the parameter
  // that matters most and the first version of this test left it out:
  // with instant rounds a 14-entrant field played 350 rounds in an
  // hour, everyone exhausted all 13 possible opponents, and rematches
  // became arithmetic rather than a defect.
  //
  // WHICH IS ALSO THE REAL FINDING, and it is about Aug 29 rather than
  // about this code: in an all-day format with a small field, people
  // WILL replay each other. A 14-entrant day at ~25 minutes a round is
  // roughly 10 rounds each against 13 possible opponents, so it stays
  // clean; a 6-entrant day would not. The engine cannot invent fresh
  // opponents, so the assertion below is the honest one: a rematch is
  // only ever seated when the pool admitted NO rematch-free draw, and
  // the draw says so on the record when that happens.
  function simulateDay(fieldSize, roundMs, label) {
    const next = rng(seedFrom('aug29-' + fieldSize));
    const field = makeField(fieldSize).map((e) => ({ ...e, availableAt: 0, inPairing: '', busyUntil: 0 }));
    let now = T;
    let seq = 0;
    let seated = 0;
    let rematches = 0;
    let unflaggedRematches = 0;
    let selfPair = 0;
    let doubleSeat = 0;
    let maxWait = 0;
    const winsBefore = field.reduce((s, e) => s + e.wins, 0);

    field.forEach((e, i) => { e.arrivesAt = T + i * 4 * 60_000; });

    const TICK = 2 * 60_000;
    for (let tick = 0; tick < 300; tick += 1) {   // 10 hours
      now += TICK;

      // Finish anyone whose round is over, then requeue them.
      field.forEach((e) => {
        if (e.inPairing && now >= e.busyUntil) { e.inPairing = ''; e.availableAt = now; }
      });
      // New arrivals and idle entrants join the queue.
      field.forEach((e) => {
        if (now >= e.arrivesAt && !e.inPairing && !e.availableAt) e.availableAt = now;
      });
      // A visible waiting page polls without moving availableAt, so
      // presence stays live while accrued queue time remains honest.
      field.forEach((e) => {
        if (!e.inPairing && e.availableAt) e.lastPollAt = now;
      });

      const draw = pairDropIn(field, { tid: 'aug29', seq: seq += 1, now });
      const seatedNow = new Set();
      draw.pairings.forEach((p) => {
        if (p.govEntry === p.oppEntry) selfPair += 1;
        if (seatedNow.has(p.govEntry) || seatedNow.has(p.oppEntry)) doubleSeat += 1;
        seatedNow.add(p.govEntry); seatedNow.add(p.oppEntry);

        const g = field.find((e) => e.entryId === p.govEntry);
        const o = field.find((e) => e.entryId === p.oppEntry);
        if (g.opponents.includes(o.entryId)) {
          rematches += 1;
          // The guarantee: the engine only seats a rematch when no
          // rematch-free matching existed over that pool, and it flags
          // the draw when it does. An unflagged rematch is a real bug.
          if (!draw.rematchFallback) unflaggedRematches += 1;
        }

        g.inPairing = p.pairingId; o.inPairing = p.pairingId;
        g.availableAt = 0; o.availableAt = 0;
        g.busyUntil = now + roundMs; o.busyUntil = now + roundMs;
        seated += 1;

        const govWon = next() < 0.5;
        const gp = resultPatch(g, { won: govWon, speaks: 27, side: 'gov', opponentEntryId: o.entryId });
        const op = resultPatch(o, { won: !govWon, speaks: 27, side: 'opp', opponentEntryId: g.entryId });
        Object.assign(g, gp, { inPairing: p.pairingId, availableAt: 0, busyUntil: now + roundMs });
        Object.assign(o, op, { inPairing: p.pairingId, availableAt: 0, busyUntil: now + roundMs });
      });
      draw.waiting.forEach((w) => { maxWait = Math.max(maxWait, w.waitingMs); });
    }

    const winsAfter = field.reduce((s, e) => s + e.wins, 0);
    const byes = field.reduce((s, e) => s + Number(e.byes || 0), 0);
    const tag = 'dropin day (' + label + ')';

    check(tag + ': rounds actually got seated', seated > fieldSize, 'seated=' + seated);
    check(tag + ': nobody paired against themselves', selfPair === 0);
    check(tag + ': nobody seated twice in one draw', doubleSeat === 0);
    check(tag + ': NO byes were ever awarded', byes === 0, byes + ' byes');
    check(tag + ': every win came from a played round',
      winsAfter - winsBefore === seated, (winsAfter - winsBefore) + ' wins for ' + seated + ' rounds');
    check(tag + ': no rematch was seated while a clean draw existed',
      unflaggedRematches === 0, unflaggedRematches + ' unflagged of ' + rematches);
    // Under a strict fresh-opponent rotation, one person may need to
    // wait for the next unseen opponent to finish. Two round lengths is
    // the ceiling; beyond that the partial matcher is starving them.
    check(tag + ': nobody waits beyond two round lengths for a fresh opponent',
      maxWait <= Math.max(30 * 60_000, 2 * roundMs),
      'maxWait=' + Math.round(maxWait / 60_000) + 'min');
    const spread = field.map((e) => Math.abs(e.sideCount.gov - e.sideCount.opp));
    check(tag + ': nobody ends more than 2 sides skewed',
      Math.max(...spread) <= 2, 'max skew ' + Math.max(...spread));
    check(tag + ': everyone played', field.every((e) => e.wins + (e.losses || 0) > 0));
    return { seated, rematches, maxWait };
  }

  const day14 = simulateDay(14, 25 * 60_000, '14 entrants, 25min rounds');
  const day6 = simulateDay(6, 25 * 60_000, '6 entrants, 25min rounds');
  const day40 = simulateDay(40, 25 * 60_000, '40 entrants, 25min rounds');

  // The board must still break, which is the whole point of playing.
  const brField = makeField(16).map((e, i) => ({ ...e, wins: 16 - i, speaks: 27 + (16 - i) / 10 }));
  check('dropin: a drop-in board still breaks to a real bracket',
    breakField(brField, 8).breaking.length === 8);

  // Reported, not asserted. This is a planning number for Aug 29, not a
  // pass/fail: it says how much repeat-play a given turnout produces.
  console.log('  [drop-in day model] 6 entrants: ' + day6.seated + ' rounds, ' + day6.rematches + ' repeats'
    + ' | 14: ' + day14.seated + ' rounds, ' + day14.rematches + ' repeats'
    + ' | 40: ' + day40.seated + ' rounds, ' + day40.rematches + ' repeats');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
