#!/usr/bin/env node
// test-round-draft.mjs — guards the ROOM-side motion negotiation.
//
// The draft moved out of the queue docs and into the round (round-draft.mjs)
// so that the entry surface stops deciding whether a pair gets a say in the
// motion. Blind strikes were retired on 2026-09-02, so this file is no
// longer about a leak: every beat now has exactly one actor and everything
// on the draft is already public to the room. What it IS about is the three
// properties the room depends on and the pure module alone cannot state:
//
//   1. THE ROUND DOC NEVER OPENS ON AN UNFINISHED DRAFT. finalPatch is the
//      only thing that rewrites the motion and the seats, and it must
//      refuse anything the negotiation has not settled.
//   2. THE FIRST TWO BEATS ARE NOT EXPIRABLE BY THE PEER. Before the answer
//      exactly one person has moved; resolving for the other is how a room
//      opens onto an empty chair (the 411-round finding).
//   3. A STALE DRAFT STILL FINISHES. A room stuck forever on a dead beat is
//      worse than a resolution nobody watched, and the endpoint's stale
//      path has to reach 'done' inside its bounded loop.
//
// The endpoint itself needs Firestore, so this exercises the pure layer the
// endpoint delegates every decision to, in the shapes the endpoint uses.
import {
  createDraft, draftSeed, advance, actorFor, eitherMayExpire,
  applyOffer, applyResponse, applyMotionPick, applySidePick,
  autoResolve, draftResult, publicDraft, offerablePool, contenders,
  secondsFor, PHASES,
} from '../app/netlify/functions/lib/motion-draft.mjs';

let fail = 0, n = 0;
const ok = (cond, label) => { n++; if (!cond) { fail++; console.error('FAIL  ' + label); } };
const eq = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b),
  label + '  (' + JSON.stringify(a) + ' !== ' + JSON.stringify(b) + ')');

const A = 'uidAlpha', B = 'uidBravo';
const seed = draftSeed(A, B, 'SparMatch-a-b-1');
const fresh = () => advance(createDraft(seed, 'quick', A, B));
const O = fresh().offerUid, R = fresh().respondUid;
const go = (d, f) => { const r = f(d); ok(r.ok, 'setup move refused: ' + (r.reason || '')); return advance(r.draft); };
const offered = () => go(fresh(), (x) => applyOffer(x, O, { poolId: offerablePool(x)[0].id }));

// ── 1. finalPatch's precondition: draftResult ───────────────────────
// round-draft.mjs writes the motion and both seats ONLY when this returns
// something. Every unfinished shape must come back null, or a room opens
// with no motion, or with two people on the same bench.
{
  eq(draftResult(fresh(), A, B), null, 'nothing settled: no round');
  eq(draftResult(offered(), A, B), null, 'offer up but unanswered: no round');
  const taken = go(offered(), (x) => applyResponse(x, R, 'take'));
  eq(draftResult(taken, A, B), null, 'motion settled, side not: no round');
  const countered = go(offered(), (x) => applyResponse(x, R, 'counter'));
  eq(draftResult(countered, A, B), null, 'counter owed: no round');
  const done = go(taken, (x) => applySidePick(x, R, 'pro'));
  const res = draftResult(done, A, B);
  ok(!!res, 'a settled draft opens a round');
  ok(res.proUid !== res.conUid, 'the two seats are two different people');
  ok([A, B].includes(res.proUid) && [A, B].includes(res.conUid), 'the seats are the real debaters');
  ok(res.motion && res.motion.length > 8, 'the round carries real motion text');
  // Forged shapes the endpoint could be handed by a corrupted document.
  eq(draftResult(Object.assign({}, done, { motionId: 'ghost' }), A, B), null,
     'a motion that is not on the table cannot seat anyone');
  eq(draftResult(Object.assign({}, done, { side: null }), A, B), null,
     'a done draft with no side cannot seat anyone');
  eq(draftResult(Object.assign({}, done, { sideUid: null }), A, B), null,
     'a done draft with no side holder cannot seat anyone');
  eq(draftResult(Object.assign({}, done, { phase: 'side' }), A, B), null,
     'an unfinished phase cannot seat anyone whatever else is set');
}

// ── 2. whose clock is whose ─────────────────────────────────────────
// round-draft's expire action refuses when eitherMayExpire is false and the
// caller is not the actor. These are the two beats that must refuse.
{
  const first = fresh();
  eq(eitherMayExpire(first), false, 'the opening offer is the offerer clock alone');
  eq(actorFor(first), O, 'and the offerer is the one on it');
  const ans = offered();
  eq(eitherMayExpire(ans), false, 'the answer is the responder clock alone');
  eq(actorFor(ans), R, 'and the responder is the one on it');
  // Everything past the answer: both have moved, so a slow click must not
  // cost the round.
  const back = go(ans, (x) => applyResponse(x, R, 'back'));
  ok(eitherMayExpire(back), 'the replacement offer may be expired by either');
  const ctr = go(ans, (x) => applyResponse(x, R, 'counter'));
  ok(eitherMayExpire(ctr), 'the counter beat may be expired by either');
  const chose = go(ctr, (x) => applyOffer(x, R, { poolId: offerablePool(x)[0].id }));
  ok(eitherMayExpire(chose), 'the choose beat may be expired by either');
  const side = go(ans, (x) => applyResponse(x, R, 'take'));
  ok(eitherMayExpire(side), 'the side beat may be expired by either');
  // actorFor must name somebody on every live beat, or the endpoint's
  // authority check compares against undefined and lets anyone through.
  [first, ans, back, ctr, chose, side].forEach((d, i) => {
    ok(!!actorFor(d), 'beat ' + i + ' (' + d.phase + ') names an actor');
    ok([A, B].includes(actorFor(d)), 'beat ' + i + ' names a real debater');
  });
  eq(actorFor(go(side, (x) => applySidePick(x, R, 'pro'))), null, 'a finished draft has no actor');
}

// ── 3. the stale path finishes ──────────────────────────────────────
// round-draft runs autoResolve in a bounded loop on a stale draft. From any
// beat, that loop has to reach 'done', or the next caller inherits the same
// dead beat and the room never opens.
{
  const starts = [
    ['offer', fresh()],
    ['respond', offered()],
    ['counter', go(offered(), (x) => applyResponse(x, R, 'counter'))],
    ['choose', go(go(offered(), (x) => applyResponse(x, R, 'counter')),
                  (x) => applyOffer(x, R, { poolId: offerablePool(x)[0].id }))],
    ['side', go(offered(), (x) => applyResponse(x, R, 'take'))],
    ['back', go(offered(), (x) => applyResponse(x, R, 'back'))],
  ];
  starts.forEach(([label, start]) => {
    let d = start, steps = 0;
    for (let i = 0; i < 8 && d.phase !== 'done'; i++) { d = advance(autoResolve(d)); steps++; }
    eq(d.phase, 'done', 'stale from ' + label + ' reaches done');
    ok(steps <= 8, 'stale from ' + label + ' finishes inside the endpoint loop bound');
    ok(!!draftResult(d, A, B), 'stale from ' + label + ' still opens a real round');
  });
}

// ── the projection the round doc carries ────────────────────────────
// The board renders from this and nothing else, so a missing field is a
// beat somebody cannot answer.
{
  const beats = [fresh(), offered(),
    go(offered(), (x) => applyResponse(x, R, 'counter')),
    go(offered(), (x) => applyResponse(x, R, 'take'))];
  beats.forEach((d) => {
    const pub = publicDraft(d, 999);
    ok(PHASES.includes(pub.phase), pub.phase + ': published phase is real');
    ok(Array.isArray(pub.pool) && pub.pool.length >= 2, pub.phase + ': the suggestions travel');
    ok(Array.isArray(pub.table), pub.phase + ': the table travels');
    ok(typeof pub.vetoesLeft === 'number', pub.phase + ': the send-back count travels');
    ok(pub.offerUid && pub.respondUid, pub.phase + ': both roles travel');
    eq(pub.phaseAt, 999, pub.phase + ': the shot clock travels');
    // The board computes its own offerable set from pool + table, so those
    // two together have to be enough to reproduce it.
    const taken = new Set(pub.table.map((m) => String(m.text).toLowerCase()));
    const clientSide = pub.pool.filter((m) => !taken.has(String(m.text).toLowerCase()));
    eq(clientSide.map((m) => m.id), offerablePool(d).map((m) => m.id),
       pub.phase + ': the board derives the same offerable set as the server');
  });
  // Contenders on the choose beat have to be reconstructible too, or the
  // debater picking between two motions sees fewer than two.
  const chooseBeat = go(go(offered(), (x) => applyResponse(x, R, 'counter')),
                        (x) => applyOffer(x, R, { poolId: offerablePool(x)[0].id }));
  const pub = publicDraft(chooseBeat, 1);
  eq([pub.offerId, pub.counterId].filter(Boolean).length, 2, 'both contenders are on the doc');
  eq(contenders(chooseBeat).length, 2, 'and the server agrees there are two');
}

// ── the clocks the client mirrors ───────────────────────────────────
// live-round.html and spar.html both hardcode these; a drift means a client
// asks the server to expire a beat the server thinks is still live.
{
  eq(secondsFor('offer'), 16, 'offer clock matches the client constant');
  eq(secondsFor('respond'), 14, 'respond clock matches the client constant');
  eq(secondsFor('counter'), 14, 'counter clock matches the client constant');
  eq(secondsFor('choose'), 10, 'choose clock matches the client constant');
  eq(secondsFor('side'), 9, 'side clock matches the client constant');
}

if (fail) { console.error('\nround-draft guard: ' + fail + ' FAILED of ' + n); process.exit(1); }
console.log('round-draft guard: ' + n + ' assertions passed');
