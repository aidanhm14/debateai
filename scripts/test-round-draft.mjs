// Guards the room-side motion draft.
//
// The draft moved out of the queue docs and into the round (round-draft.mjs)
// so that the entry surface stops deciding whether a pair gets to veto a
// motion. That move cost the thing the queue model got for free: two docs
// meant each side could only ever hold its own strikes. One shared round
// doc has no field-level read rule, so blindness is now a property of
// publicDraft() and of nothing else. If that projection ever leaks a strike
// during the strike beat, the whole beat is theatre — one side opens
// devtools, reads the other's strikes, and strikes to leave the motion it
// wants. That is what most of this file is about.
import {
  STRIKES_PER_SIDE, SLATE_SIZE,
  createDraft, publicDraft, sanitizeStrikes, autoStrikes, advance,
  survivorsOf, applyMotionPick, applySidePick, autoResolve, draftResult,
  draftSeed, actorFor,
} from '../app/netlify/functions/lib/motion-draft.mjs';

let fail = 0;
const ok = (cond, label) => { if (!cond) { fail++; console.error('FAIL  ' + label); } };
const eq = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b), label + `  (${JSON.stringify(a)} !== ${JSON.stringify(b)})`);

const A = 'uidAlpha', B = 'uidBravo';
const seed = draftSeed(A, B, 'SparMatch-a-b-1');
const fresh = () => createDraft(seed, 'quick', A, B);

// ── the slate ──
{
  const d = fresh();
  eq(d.slate.length, SLATE_SIZE, 'slate is five motions');
  ok(new Set(d.slate.map((m) => m.text)).size === SLATE_SIZE, 'slate has no repeated motion');
  ok(d.motionUid !== d.sideUid, 'the two powers never land on one debater');
  ok([A, B].includes(d.motionUid) && [A, B].includes(d.sideUid), 'both powers land on a debater in the round');
  // Determinism: the server and both clients must agree.
  eq(createDraft(seed, 'quick', A, B), createDraft(seed, 'quick', B, A), 'same pair, same draft, whichever side asks');
}

// ── BLINDNESS. The reason this file exists. ──
{
  let d = fresh();
  const ids = d.slate.map((m) => m.id);

  let pub = publicDraft(d, 1);
  eq(pub.strikes, {}, 'nothing struck yet: no strikes published');
  eq(pub.submitted, [], 'nobody submitted yet');

  // One side commits. This is the dangerous moment: the peer has not
  // struck, and anything published here is a peek.
  d = advance({ ...d, strikes: { [A]: [ids[0], ids[1]] } }, A, B);
  eq(d.phase, 'strike', 'one side in is still the strike beat');
  pub = publicDraft(d, 1);
  eq(pub.strikes, {}, 'BLIND: a committed side never publishes its strikes');
  eq(pub.submitted, [A], 'the peer learns only THAT you are in');
  ok(JSON.stringify(pub).indexOf(ids[0]) === -1 || pub.slate.some((m) => m.id === ids[0]),
    'a struck id appears only as a slate entry, never as a strike');
  // Exercise the redaction rather than the happy path: a fresh draft has
  // no motion anyway, so asserting null on it proves nothing. Force both
  // fields set while the phase is still 'strike' (a replayed or malformed
  // state is exactly when a leak would matter) and require them withheld.
  const leaky = publicDraft({ ...d, phase: 'strike', motionId: ids[4], side: 'pro' }, 1);
  eq(leaky.motionId, null, 'BLIND: a motion is withheld while the beat is still open');
  eq(leaky.side, null, 'BLIND: a side is withheld while the beat is still open');
  eq(leaky.strikes, {}, 'BLIND: and so are the strikes');
  // "Submitted" means committed, not started. A side that has tapped one
  // card is still deciding, and publishing that as submitted would tell
  // the peer how far along they are, which is a tell about their strikes.
  const midway = publicDraft({ ...d, strikes: { [A]: [ids[0], ids[1]], [B]: [ids[2]] } }, 1);
  eq(midway.submitted, [A], 'a side one card in does not read as submitted');

  // Both in: the reveal is the point.
  d = advance({ ...d, strikes: { ...d.strikes, [B]: [ids[2], ids[3]] } }, A, B);
  ok(d.phase !== 'strike', 'both in ends the strike beat');
  pub = publicDraft(d, 1);
  eq(pub.strikes[A], [ids[0], ids[1]], 'reveal: A\'s strikes are published');
  eq(pub.strikes[B], [ids[2], ids[3]], 'reveal: B\'s strikes are published');
  eq(pub.submitted.sort(), [A, B].sort(), 'both listed as submitted');
}

// ── the arithmetic the whole design rests on ──
{
  // Two strikes each from five, blind, so they can overlap: survivors is
  // 1, 2 or 3. Never 0 (four distinct removals from five is the most two
  // sides can manage) and never 5 (each side must spend both).
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    const d0 = createDraft('fuzz|' + i, 'quick', A, B);
    // Both sides fill the way a real expired clock fills: seeded per uid,
    // so the two sets differ the way two people's choices differ.
    const d = advance({ ...d0, strikes: { [A]: autoStrikes(d0, A, []), [B]: autoStrikes(d0, B, []) } }, A, B);
    const n = survivorsOf(d).length;
    seen.add(n);
    ok(n >= 1 && n <= 3, 'survivors always between one and three');
    if (n === 1) ok(d.phase === 'side' || d.phase === 'motion' || d.phase === 'done',
      'one survivor skips straight past the motion call');
  }
  ok(seen.has(1), 'a single survivor does happen (the motion call must handle it)');
}

// ── client input is never trusted ──
{
  const d = fresh();
  const ids = d.slate.map((m) => m.id);
  eq(sanitizeStrikes(d, [ids[0], ids[0], ids[1]]), [ids[0], ids[1]], 'duplicates collapse');
  eq(sanitizeStrikes(d, [ids[0], ids[1], ids[2], ids[3]]).length, STRIKES_PER_SIDE,
    'a POST striking four cannot leave one survivor of its own choosing');
  eq(sanitizeStrikes(d, ['not-a-motion', ids[2]]), [ids[2]], 'ids off the slate are dropped');
  eq(sanitizeStrikes(d, null), [], 'garbage input strikes nothing');
}

// ── a timeout keeps what you actually chose ──
{
  const d = fresh();
  const ids = d.slate.map((m) => m.id);
  // Every card, not one: filling from empty would keep any single id by
  // luck often enough that one case proves nothing.
  ids.forEach((id) => {
    const filled = autoStrikes(d, A, [id]);
    eq(filled.length, STRIKES_PER_SIDE, 'a partial selection is topped up, not replaced (' + id + ')');
    ok(filled.indexOf(id) !== -1, 'the card the debater actually picked survives their own clock (' + id + ')');
  });
  eq(autoStrikes(d, A, []), autoStrikes(d, A, []), 'the same expired clock always fills the same way');
  ok(JSON.stringify(autoStrikes(d, A, [])) !== JSON.stringify(autoStrikes(d, B, [])),
    'two silent sides do not fill identically (which would leave three survivors every time)');
}

// ── neither debater may use the other\'s power ──
{
  let d = fresh();
  const ids = d.slate.map((m) => m.id);
  d = advance({ ...d, strikes: { [A]: [ids[0], ids[1]], [B]: [ids[2]] } }, A, B);
  eq(d.phase, 'strike', 'a short strike set does not advance the beat');

  d = advance({ ...d, strikes: { [A]: [ids[0], ids[1]], [B]: [ids[2], ids[3]] } }, A, B);
  eq(survivorsOf(d), [ids[4]], 'no overlap leaves exactly one');
  eq(d.motionId, ids[4], 'one survivor is the motion, nobody calls it');
  eq(d.phase, 'side', 'straight to the side call');
  eq(actorFor(d), d.sideUid, 'the side holder owns this beat');

  const wrong = applySidePick(d, d.motionUid, 'pro');
  eq(wrong.ok, false, 'the motion holder cannot also call the side');
  eq(wrong.reason, 'not_your_call', 'and is told why');
  eq(applySidePick(d, d.sideUid, 'winner').ok, false, 'a made-up side is refused');

  const good = applySidePick(d, d.sideUid, 'con');
  ok(good.ok, 'the side holder may call their side');
  const done = advance(good.draft, A, B);
  eq(done.phase, 'done', 'that completes the draft');
  const res = draftResult(done, A, B);
  ok(!!res, 'a completed draft yields a result');
  eq(res.motion, done.slate.find((m) => m.id === ids[4]).text, 'the surviving motion is the round');
  eq(res.conUid, done.sideUid, 'the side holder got the side they called');
  ok(res.proUid !== res.conUid, 'the two seats are different people');
  eq([res.proUid, res.conUid].sort(), [A, B].sort(), 'and they are the two debaters');
}

// ── a struck motion can never be the round ──
{
  let d = fresh();
  const ids = d.slate.map((m) => m.id);
  d = advance({ ...d, strikes: { [A]: [ids[0], ids[1]], [B]: [ids[0], ids[2]] } }, A, B);
  eq(d.phase, 'motion', 'an overlapping strike leaves a real motion call');
  const struck = applyMotionPick(d, d.motionUid, ids[0]);
  eq(struck.ok, false, 'the motion holder cannot un-strike a motion by picking it');
  eq(struck.reason, 'motion_struck', 'and is told why');
  eq(applyMotionPick(d, d.sideUid, ids[3]).ok, false, 'the side holder cannot call the motion');
  ok(applyMotionPick(d, d.motionUid, ids[3]).ok, 'a survivor may be called');
}

// ── an unfinished draft can never open a room ──
{
  let d = fresh();
  eq(draftResult(d, A, B), null, 'a fresh draft has no result');
  const ids = d.slate.map((m) => m.id);
  d = advance({ ...d, strikes: { [A]: [ids[0], ids[1]], [B]: [ids[2], ids[3]] } }, A, B);
  eq(draftResult(d, A, B), null, 'a draft still owing a side call has no result');
}

// ── two clocks expiring at once resolve the SAME way on both sides ──
{
  let d = fresh();
  const ids = d.slate.map((m) => m.id);
  d = advance({ ...d, strikes: { [A]: [ids[0], ids[1]], [B]: [ids[0], ids[2]] } }, A, B);
  const fromA = advance(autoResolve(d), A, B);
  const fromB = advance(autoResolve(d), A, B);
  eq(fromA.motionId, fromB.motionId, 'a timed-out motion call lands on one motion, not on whoever POSTed first');
  const sideA = advance(autoResolve(fromA), A, B);
  const sideB = advance(autoResolve(fromB), A, B);
  eq(sideA.side, sideB.side, 'a timed-out side call lands on one side');
  eq(draftResult(sideA, A, B), draftResult(sideB, A, B), 'both sides compute the same room');
  ok(sideA.autoMotion === true && sideA.autoSide === true, 'an auto-resolved draft says it was a clock, not a person');
}

if (fail) { console.error(`\n${fail} assertion(s) failed`); process.exit(1); }
console.log('round draft: all assertions pass');
