#!/usr/bin/env node
// test-motion-draft.mjs — guards on the pre-round motion negotiation.
//
// Runs in the pre-commit hook. This module decides what two real people
// argue and which bench each of them takes, so every failure here is a
// round that opens wrong in front of an opponent rather than a stack trace
// somebody sees.
//
// The load-bearing ones, in order of what they would cost:
//   - THE SIDE INVARIANT: on every reachable path, the debater who settles
//     the motion is NOT the debater who settles the side. Break it and the
//     coin flip decides the round instead of the debate.
//   - a client cannot make the other debater's move
//   - one send-back per round, and the vetoed motion cannot be re-offered
//   - a timeout resolves the SAME way on both sides (two expired clocks
//     must never produce two different motions)
//   - a tournament's stamped pool cannot be written around
//   - every finished draft names two different uids on opposite benches
import assert from 'assert';
import {
  DRAFT_VERSION, POOL_SIZE, MOTION_MIN, MOTION_MAX, VETOES_PER_ROUND,
  PHASES, RESPONSES, secondsFor,
  draftSeed, buildPool, assignRoles, createDraft,
  advance, actorFor, eitherMayExpire, offerablePool, contenders, vetoesLeft,
  applyOffer, applyResponse, applyMotionPick, applySidePick,
  autoResolve, draftResult, publicDraft, motionTextOf,
} from '../app/netlify/functions/lib/motion-draft.mjs';
import { DRAFT_MOTIONS, draftPoolFor } from '../app/netlify/functions/lib/draft-motions.mjs';
import {
  THE_DEBATABLE_OPEN_MOTIONS, publicTournamentMotionDraft,
  tournamentRegistrationOpen,
} from '../app/netlify/functions/lib/tournament-motion-pool.mjs';

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const A = 'uid_alice';
const B = 'uid_bob';
const seed = draftSeed(A, B, 'SparMatch-alice-bob');
const fresh = (opts) => createDraft(seed, 'quick', A, B, opts || {});

// ── the suggestion pool ─────────────────────────────────────────────
Object.keys(DRAFT_MOTIONS).forEach((k) => {
  const pool = DRAFT_MOTIONS[k];
  ok(Array.isArray(pool) && pool.length >= POOL_SIZE + 2,
    'pool ' + k + ' has room to offer, send back and counter');
  eq(pool.length, new Set(pool).size, 'pool ' + k + ' has no duplicate motions');
  pool.forEach((m) => ok(typeof m === 'string' && m.trim().length >= MOTION_MIN,
    'pool ' + k + ' motion is real text'));
});
ok(draftPoolFor('nonsense-format').length > 0, 'an unknown format still gets a pool');

const suggested = ['Suggestion one is long enough.', 'Suggestion two is long enough.', 'Suggestion three is long enough.'];
const personalized = createDraft('suggested-seed', 'quick', A, B, { suggestions: suggested });
ok(personalized.pool.every((card) => suggested.includes(card.text)), 'private suggestions replace the broad deck');
eq(personalized.poolLocked, false, 'private suggestions do not lock hand-written counters');

{
  const p1 = buildPool(seed, 'quick');
  const p2 = buildPool(seed, 'quick');
  eq(p1, p2, 'the pool is seeded, so both clients derive the same cards');
  eq(p1.length, POOL_SIZE, 'the casual pool is POOL_SIZE cards');
  eq(p1.length, new Set(p1.map((m) => m.text)).size, 'no card appears twice');
  eq(p1.length, new Set(p1.map((m) => m.id)).size, 'no id appears twice');
  const other = buildPool(draftSeed(A, B, 'SparMatch-alice-bob-2'), 'quick');
  ok(other.some((m, i) => m.text !== p1[i].text), 'a rematch draws different cards');
}

// ── roles ───────────────────────────────────────────────────────────
{
  const r1 = assignRoles(seed, A, B);
  const r2 = assignRoles(seed, B, A);
  eq(r1, r2, 'the coin flip does not depend on who asks');
  ok(r1.offerUid !== r1.respondUid, 'the two roles are two different people');
  ok([A, B].includes(r1.offerUid) && [A, B].includes(r1.respondUid), 'roles are the real uids');
  const d = fresh();
  eq(d.v, DRAFT_VERSION, 'a new draft carries the version');
  eq(d.phase, 'offer', 'a draft opens on the offer beat');
  eq(d.table, [], 'nothing is on the table yet');
  eq(actorFor(d), d.offerUid, 'the offerer moves first');
  eq(vetoesLeft(d), VETOES_PER_ROUND, 'one send-back to spend');
}

// Helpers for walking the branches.
const O = fresh().offerUid;
const R = fresh().respondUid;
const step = (d, f) => { const r = f(d); ok(r.ok, 'move rejected: ' + (r.reason || '')); return advance(r.draft); };
const offerFirst = (d) => step(d, (x) => applyOffer(x, x.offerUid, { poolId: offerablePool(x)[0].id }));

// ── THE SIDE INVARIANT, on every branch ─────────────────────────────
// The debater who settled the motion must not be the one who settles the
// side. This is the whole fairness argument and it is asserted per branch
// rather than once, because each branch reaches it a different way.
function assertSideInvariant(d, label) {
  const motionEntry = d.table.find((m) => m.id === d.motionId);
  ok(!!motionEntry, label + ': the settled motion is on the table');
  // Who DECIDED the motion: the offerer on take/back (they chose what to
  // put up and it stood), the offerer again on a counter (they picked
  // between the two). The responder never decides the motion; the most
  // they do is refuse one or add one to the offerer's menu.
  eq(d.sideUid === d.offerUid ? 'offerer' : 'responder',
     d.response === 'counter' ? 'offerer' : 'responder',
     label + ': the side goes to whoever did not settle the motion');
  ok(d.sideUid === d.offerUid || d.sideUid === d.respondUid,
     label + ': the side holder is one of the two debaters');
}

// take
{
  let d = offerFirst(fresh());
  eq(d.phase, 'respond', 'take: an offer hands the beat to the responder');
  eq(actorFor(d), R, 'take: the responder answers');
  d = step(d, (x) => applyResponse(x, R, 'take'));
  eq(d.phase, 'side', 'take: taking it settles the motion');
  eq(d.sideUid, R, 'take: taking what is offered buys the side');
  assertSideInvariant(d, 'take');
  d = step(d, (x) => applySidePick(x, R, 'con'));
  eq(d.phase, 'done', 'take: the side call finishes the draft');
  const res = draftResult(d, A, B);
  eq(res.conUid, R, 'take: the side holder got the bench they asked for');
  eq(res.proUid, O, 'take: the other debater got the remainder');
}

// send back
{
  let d = offerFirst(fresh());
  const firstOffer = d.offerId;
  const firstText = motionTextOf(d, firstOffer);
  d = step(d, (x) => applyResponse(x, R, 'back'));
  eq(d.phase, 'offer', 'back: the offerer owes a replacement');
  eq(d.offerId, null, 'back: the vetoed motion is off the table');
  eq(vetoesLeft(d), 0, 'back: the one veto is spent');
  eq(d.sentBack.length, 1, 'back: the veto is recorded');
  ok(!offerablePool(d).some((m) => m.text === firstText),
     'back: the vetoed motion cannot be offered again');
  // A second veto is unreachable through the phase machine, and refused
  // outright if a caller ever hand-rolls its way back to the respond beat.
  const forced = Object.assign({}, d, { phase: 'respond', offerId: firstOffer });
  eq(applyResponse(forced, R, 'back').reason, 'no_veto_left', 'back: never two vetoes');
  d = offerFirst(d);
  eq(d.phase, 'side', 'back: the replacement stands, no second answer');
  eq(d.sideUid, R, 'back: refusing a motion is not choosing one, so the side stays');
  assertSideInvariant(d, 'back');
  d = step(d, (x) => applySidePick(x, R, 'pro'));
  eq(d.phase, 'done', 'back: finished');
  ok(draftResult(d, A, B).motion !== firstText, 'back: the round is not the vetoed motion');
}

// counter
{
  let d = offerFirst(fresh());
  d = step(d, (x) => applyResponse(x, R, 'counter'));
  eq(d.phase, 'counter', 'counter: the responder owes a motion');
  eq(d.sideUid, O, 'counter: putting your own motion up costs the side immediately');
  eq(actorFor(d), R, 'counter: the responder is the one countering');
  d = step(d, (x) => applyOffer(x, R, { poolId: offerablePool(x)[0].id }));
  eq(d.phase, 'choose', 'counter: the offerer now picks between the two');
  eq(contenders(d).length, 2, 'counter: exactly two motions are in contention');
  eq(actorFor(d), O, 'counter: the offerer chooses');
  eq(applyMotionPick(d, R, contenders(d)[0].id).reason, 'not_your_call',
     'counter: the counterer cannot also pick the motion');
  d = step(d, (x) => applyMotionPick(x, O, contenders(x)[1].id));
  eq(d.phase, 'side', 'counter: the motion is settled');
  eq(d.sideUid, O, 'counter: the offerer holds both calls, which is what the counter bought');
  assertSideInvariant(d, 'counter');
  d = step(d, (x) => applySidePick(x, O, 'pro'));
  const res = draftResult(d, A, B);
  eq(res.proUid, O, 'counter: the chooser took the bench they picked');
  ok(res.conUid !== res.proUid, 'counter: two different people, two different benches');
}

// ── authority: nobody makes the other debater's move ────────────────
{
  const open = advance(fresh());
  eq(applyOffer(open, R, { poolId: open.pool[0].id }).reason, 'not_your_call',
     'the responder cannot offer on the offer beat');
  eq(applyResponse(open, R, 'take').reason, 'wrong_phase', 'nobody answers before an offer exists');
  const answered = offerFirst(fresh());
  eq(applyResponse(answered, O, 'take').reason, 'not_your_call', 'the offerer cannot answer for them');
  eq(applyOffer(answered, O, { poolId: answered.pool[1].id }).reason, 'wrong_phase',
     'the offerer cannot stack a second offer');
  eq(applyMotionPick(answered, O, answered.offerId).reason, 'wrong_phase',
     'no motion pick outside the choose beat');
  const sided = step(answered, (x) => applyResponse(x, R, 'take'));
  eq(applySidePick(sided, O, 'pro').reason, 'not_your_call', 'only the side holder picks the side');
  eq(applySidePick(sided, R, 'middle').reason, 'bad_side', 'a side is pro or con');
  eq(applyResponse(offerFirst(fresh()), R, 'shrug').reason, 'bad_choice', 'answers are the three');
  RESPONSES.forEach((c) => ok(applyResponse(offerFirst(fresh()), R, c).ok, 'answer ' + c + ' is legal'));
}

// ── written motions and the tournament pool ─────────────────────────
{
  const d = advance(fresh());
  ok(applyOffer(d, O, { text: 'This House would ban homework in primary schools' }).ok,
     'a debater may write their own motion');
  eq(applyOffer(d, O, { text: 'too short' }).reason, 'too_short', 'a fragment is not a motion');
  eq(applyOffer(d, O, { text: 'x'.repeat(MOTION_MAX + 1) }).reason, 'too_long', 'bounded');
  const dup = applyOffer(d, O, { poolId: d.pool[0].id }).draft;
  eq(applyOffer(advance(dup), O, { text: d.pool[0].text }).reason, 'wrong_phase',
     'the offer beat is over once a motion is up');

  const locked = createDraft(seed, 'quick', A, B, { pool: THE_DEBATABLE_OPEN_MOTIONS.slice() });
  ok(locked.poolLocked, 'a stamped pool locks the draft');
  eq(applyOffer(advance(locked), locked.offerUid, { text: 'This House would abolish school uniforms' }).reason,
     'pool_locked', 'a tournament runs its published motions and nothing else');
  const published = new Set(THE_DEBATABLE_OPEN_MOTIONS);
  locked.pool.forEach((m) => ok(published.has(m.text), 'every card came off the published list'));
  eq(applyOffer(advance(locked), locked.offerUid, { poolId: 'p999' }).reason, 'bad_motion',
     'a card that is not on the board cannot be offered');
}

// ── timeouts: seeded, never random ──────────────────────────────────
{
  // Two clients expiring the same beat must land on the same answer, or a
  // draft resolved by two dead clocks opens two different rounds.
  const walk = (d) => { let x = d; for (let i = 0; i < 8 && x.phase !== 'done'; i++) x = advance(autoResolve(x)); return x; };
  const r1 = walk(advance(fresh()));
  const r2 = walk(advance(fresh()));
  eq(r1.motionId, r2.motionId, 'a fully expired draft picks one motion, not two');
  eq(r1.side, r2.side, 'a fully expired draft picks one side, not two');
  // Pinned to LITERALS, not to a second call. Comparing two calls passes
  // half the time against a coin flip, which is a flaky test rather than a
  // guard; a literal is the only form that catches a Math.random(), a
  // clock, or a counter. If a deliberate change to the seeding moves these,
  // re-derive them once and say so in the commit.
  eq(r1.side, 'con', 'the seeded side for this fixture is stable across runs');
  // A literal alone only catches a coin flip half the time, which is a
  // flaky guard rather than a guard. Sample the side beat repeatedly: a
  // Math.random() would have to land the same way twelve times to survive.
  {
    const sideBeat = step(offerFirst(fresh()), (x) => applyResponse(x, R, 'take'));
    const seen = new Set();
    for (let i = 0; i < 12; i++) seen.add(autoResolve(sideBeat).side);
    eq(seen.size, 1, 'the timeout side is derived, never rolled');
  }
  eq(r1.table.find((m) => m.id === r1.motionId).text, 'Geoengineering is inevitable.',
     'the seeded motion for this fixture is stable across runs');
  eq(r1.phase, 'done', 'an expired draft still finishes');
  ok(r1.autoOffer && r1.autoResponse && r1.autoSide, 'the board can say a clock made each call');
  eq(r1.response, 'take', 'a dead clock takes what is on the table: neutral, not a veto');
  eq(r1.sideUid, r1.respondUid, 'silence is neither rewarded nor punished');
  assertSideInvariant(r1, 'all-auto');
  const res = draftResult(r1, A, B);
  ok(res && res.proUid !== res.conUid, 'an all-timeout draft still opens a real round');

  // The counter branch's timeouts too.
  let c = step(offerFirst(fresh()), (x) => applyResponse(x, R, 'counter'));
  const c1 = advance(autoResolve(c)), c2 = advance(autoResolve(c));
  eq(c1.counterId, c2.counterId, 'an expired counter names the same motion twice');
  const ch1 = advance(autoResolve(c1)), ch2 = advance(autoResolve(c2));
  eq(ch1.motionId, ch2.motionId, 'an expired choose lands on the same motion');
}

// ── who may expire which beat ───────────────────────────────────────
// Before the answer exactly ONE person has moved, so letting the other
// resolve the beat is how a room opens onto an empty chair.
{
  eq(eitherMayExpire(advance(fresh())), false, 'the first offer is the offerer clock alone');
  eq(eitherMayExpire(offerFirst(fresh())), false, 'the answer is the responder clock alone');
  const back = step(offerFirst(fresh()), (x) => applyResponse(x, R, 'back'));
  eq(eitherMayExpire(back), true, 'past the answer both have proven they are here');
  const ctr = step(offerFirst(fresh()), (x) => applyResponse(x, R, 'counter'));
  eq(eitherMayExpire(ctr), true, 'the counter beat may be expired by either');
  const side = step(offerFirst(fresh()), (x) => applyResponse(x, R, 'take'));
  eq(eitherMayExpire(side), true, 'a slow side click never costs the round');
}

// ── publication ─────────────────────────────────────────────────────
// Nothing here is secret any more — every beat has one actor and moves in
// public — so this asserts the projection is COMPLETE enough to render a
// board, which is the failure that replaced the old leak risk.
{
  const d = step(offerFirst(fresh()), (x) => applyResponse(x, R, 'counter'));
  const pub = publicDraft(d, 1234);
  ['phase', 'pool', 'table', 'offerUid', 'respondUid', 'offerId', 'counterId',
   'vetoesLeft', 'response', 'motionId', 'sideUid', 'side', 'poolLocked'].forEach((k) => {
    ok(Object.prototype.hasOwnProperty.call(pub, k), 'publicDraft carries ' + k);
  });
  eq(pub.phaseAt, 1234, 'publicDraft carries the phase clock');
  eq(pub.vetoesLeft, vetoesLeft(d), 'the board can tell whether a send-back is left');
  ok(PHASES.includes(pub.phase), 'the published phase is a real phase');
}

// ── an unfinished draft never opens a round ─────────────────────────
{
  eq(draftResult(advance(fresh()), A, B), null, 'no result before an offer');
  eq(draftResult(offerFirst(fresh()), A, B), null, 'no result before an answer');
  const noSide = step(offerFirst(fresh()), (x) => applyResponse(x, R, 'take'));
  eq(draftResult(noSide, A, B), null, 'no result before a side');
  // A draft claiming to be done with nothing settled must still refuse.
  eq(draftResult(Object.assign({}, noSide, { phase: 'done' }), A, B), null,
     'a forged done phase cannot open a round with no side');
  eq(draftResult(Object.assign({}, noSide, { phase: 'done', side: 'pro', motionId: 'nope' }), A, B), null,
     'a motion that is not on the table cannot open a round');
}

// ── clocks ──────────────────────────────────────────────────────────
PHASES.filter((p) => p !== 'done').forEach((p) => {
  ok(secondsFor(p) >= 8 && secondsFor(p) <= 30, p + ' has a humane shot clock');
});

// ── fuzz: every reachable path opens a legal round ──────────────────
{
  let walked = 0;
  for (let i = 0; i < 400; i++) {
    const s = draftSeed('u' + i, 'v' + (i * 7), 'room' + i);
    let d = advance(createDraft(s, 'quick', 'u' + i, 'v' + (i * 7)));
    const guard = 12;
    for (let k = 0; k < guard && d.phase !== 'done'; k++) {
      const actor = actorFor(d);
      const pick = (i + k) % 3;
      let r = { ok: false };
      if (d.phase === 'offer' || d.phase === 'counter') {
        const opts = offerablePool(d);
        r = applyOffer(d, actor, { poolId: opts[pick % opts.length].id });
      } else if (d.phase === 'respond') {
        r = applyResponse(d, actor, RESPONSES[pick]);
      } else if (d.phase === 'choose') {
        const c = contenders(d);
        r = applyMotionPick(d, actor, c[pick % c.length].id);
      } else if (d.phase === 'side') {
        r = applySidePick(d, actor, pick % 2 ? 'pro' : 'con');
      }
      ok(r.ok, 'fuzz ' + i + ': the actor\'s own move was refused (' + (r.reason || '') + ')');
      d = advance(r.draft);
    }
    eq(d.phase, 'done', 'fuzz ' + i + ': every path terminates');
    assertSideInvariant(d, 'fuzz ' + i);
    const res = draftResult(d, 'u' + i, 'v' + (i * 7));
    ok(res && res.motion && res.proUid !== res.conUid,
       'fuzz ' + i + ': a real motion and two different benches');
    ok(d.sentBack.length <= VETOES_PER_ROUND, 'fuzz ' + i + ': never more than one send-back');
    walked++;
  }
  ok(walked === 400, 'the fuzz actually ran');
}

// ── the tournament surface still describes what runs ────────────────
{
  const t = { slug: 'the-debatable-open', status: 'running' };
  const pub = publicTournamentMotionDraft(t);
  ok(pub && pub.motions.length === THE_DEBATABLE_OPEN_MOTIONS.length, 'the published pool is published whole');
  ok(pub.poolSize >= 2 && pub.poolSize <= pub.motions.length, 'each room draws a readable few');
  eq(pub.vetoes, VETOES_PER_ROUND, 'the page and the engine agree on the send-back count');
  ok(!('strikesPerSide' in pub) && !('slateSize' in pub) && !('blind' in pub),
     'the retired strike shape is gone from the public payload');
  ok(tournamentRegistrationOpen(t), 'entries stay open through prelims');
}

console.log('motion-draft guard: ' + n + ' assertions passed');
