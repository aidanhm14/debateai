#!/usr/bin/env node
// test-motion-draft.mjs — guards on the pre-round motion draft.
//
// Runs in the pre-commit hook. The draft decides what two real people argue
// and which side each of them takes, so every failure here is a round that
// opens wrong in front of an opponent rather than a stack trace someone sees.
//
// The load-bearing ones, in order of what they would cost:
//   - a client cannot strike more than STRIKES_PER_SIDE (four strikes from
//     one side leaves one survivor of that side's choosing: the whole draft)
//   - a client cannot pick the other debater's power
//   - a timeout resolves the SAME way on both sides (two expired clocks must
//     not produce two different motions)
//   - survivors is never empty and never the whole slate
//   - both debaters end on different sides
import assert from 'assert';
import {
  SLATE_SIZE, STRIKES_PER_SIDE, DRAFT_VERSION,
  draftSeed, buildSlate, assignRoles, createDraft,
  sanitizeStrikes, autoStrikes, survivorsOf, bothStruck,
  advance, actorFor, applyMotionPick, applySidePick, autoResolve, draftResult,
  strikesPerSideFor, publicDraft,
} from '../app/netlify/functions/lib/motion-draft.mjs';
import { DRAFT_MOTIONS, draftPoolFor } from '../app/netlify/functions/lib/draft-motions.mjs';
import {
  THE_DEBATABLE_OPEN_MOTIONS, publicTournamentMotionDraft,
  tournamentRegistrationOpen, tournamentRoomSetup,
} from '../app/netlify/functions/lib/tournament-motion-pool.mjs';

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const A = 'uid_alice';
const B = 'uid_bob';
const seed = draftSeed(A, B, 'SparMatch-alice-bob');

// ── pools ───────────────────────────────────────────────────────────
Object.keys(DRAFT_MOTIONS).forEach((k) => {
  const pool = DRAFT_MOTIONS[k];
  ok(pool.length > SLATE_SIZE, 'pool ' + k + ' must hold more than a full slate, has ' + pool.length);
  eq(new Set(pool).size, pool.length, 'pool ' + k + ' has duplicate motions');
  pool.forEach((m) => {
    ok(typeof m === 'string' && m.trim().length > 18, 'pool ' + k + ' has a stub motion');
    ok(!/[—]/.test(m), 'em-dash in motion copy (' + k + '): ' + m);
  });
});

// ── tournament profile: three motions, one blind strike each ──────
eq(THE_DEBATABLE_OPEN_MOTIONS.length, 20, 'the published Open pool has exactly twenty motions');
eq(new Set(THE_DEBATABLE_OPEN_MOTIONS.map((m) => m.toLowerCase())).size, 20,
  'the published Open pool has no duplicate motions');
THE_DEBATABLE_OPEN_MOTIONS.forEach((m) => {
  ok(!/[—]/.test(m), 'the published pool has no em-dash: ' + m);
  ok(m.length >= 18, 'the published pool has no stub motion: ' + m);
});
const openMotionCopy = THE_DEBATABLE_OPEN_MOTIONS.join(' ');
ok(/\bTrump\b/.test(openMotionCopy), 'the published pool includes a Trump resolution');
ok(/\bIran\b/.test(openMotionCopy), 'the published pool includes an Iran resolution');
ok(/\bIsrael\b/.test(openMotionCopy), 'the published pool includes an Israel resolution');
ok(/\bfilibuster\b/i.test(openMotionCopy), 'the published pool includes a filibuster resolution');
ok(/\btax\b[^.]*\bAI\b|\bAI\b[^.]*\btax\b/i.test(openMotionCopy),
  'the published pool includes a resolution on taxing AI companies');
ok(THE_DEBATABLE_OPEN_MOTIONS.filter((m) => /prediction[- ]markets?/i.test(m)).length >= 3,
  'the published pool includes multiple prediction-market resolutions');
ok(THE_DEBATABLE_OPEN_MOTIONS.filter((m) =>
  /\b(elections?|candidates?|campaign|voting|congressional districts?)\b/i.test(m)).length >= 5,
  'the published pool includes a substantial election block');
const openEvent = { slug: 'the-debatable-open', status: 'registration', format: 'blitz' };
const openConfig = publicTournamentMotionDraft(openEvent);
eq(openConfig.slateSize, 3, 'the Open offers three motions per room');
eq(openConfig.strikesPerSide, 1, 'the Open gives each side one strike');
eq(openConfig.motions, THE_DEBATABLE_OPEN_MOTIONS, 'the public announcement and room draw share one pool');
ok(tournamentRegistrationOpen(openEvent), 'registration is open before the event starts');
ok(!tournamentRegistrationOpen({ ...openEvent, status: 'running' }), 'starting the event locks the roster');

const td0 = createDraft(seed + '|open', 'blitz', A, B, {
  pool: openConfig.motions,
  slateSize: openConfig.slateSize,
  strikesPerSide: openConfig.strikesPerSide,
});
eq(td0.slate.length, 3, 'tournament draft draws three motions');
eq(strikesPerSideFor(td0), 1, 'tournament draft carries its one-strike allowance');
eq(sanitizeStrikes(td0, ['m1', 'm2']), ['m1'], 'a tournament client cannot spend two strikes');
eq(publicDraft(td0, 1).strikesPerSide, 1, 'the room receives the tournament strike count');
let td = advance({ ...td0, strikes: { [A]: ['m1'], [B]: ['m2'] } }, A, B);
eq(survivorsOf(td), ['m3'], 'different tournament strikes leave one motion');
eq(td.phase, 'side', 'one tournament survivor skips the motion call');
td = advance({ ...td0, strikes: { [A]: ['m1'], [B]: ['m1'] } }, A, B);
eq(survivorsOf(td), ['m2', 'm3'], 'overlapping tournament strikes leave two survivors');
eq(td.phase, 'motion', 'overlapping tournament strikes open the fair motion call');

const roomSetup = tournamentRoomSetup(
  'tid123', openEvent,
  { room: 'Debatable-tid123-r1-1', pairingId: 'r1-1', govEntry: 'g', oppEntry: 'o' },
  new Map([
    ['g', { entryId: 'g', members: [A], memberNames: ['Alice'] }],
    ['o', { entryId: 'o', members: [B], memberNames: ['Bob'] }],
  ]),
  'room-seed',
);
eq(roomSetup.admission.uids.sort(), [A, B].sort(), 'room admission contains only the paired roster');
eq(roomSetup.admission.spectatorAccess, 'public', 'the tournament remains public to watch');
eq(roomSetup.draft.draftConfig.slateSize, 3, 'the pairing stamps the three-motion room config');
eq(roomSetup.draft.draftConfig.strikesPerSide, 1, 'the pairing stamps the one-strike room config');
ok(draftPoolFor('casual') === DRAFT_MOTIONS.quick, 'unknown format falls back to the quick pool');
ok(draftPoolFor('') === DRAFT_MOTIONS.quick, 'empty format falls back to the quick pool');

// ── slate ───────────────────────────────────────────────────────────
const slate = buildSlate(seed, 'apda');
eq(slate.length, SLATE_SIZE, 'slate size');
eq(new Set(slate.map((m) => m.text)).size, SLATE_SIZE, 'slate repeats a motion');
eq(slate.map((m) => m.id), ['m1', 'm2', 'm3', 'm4', 'm5'], 'slate ids are positional');
eq(buildSlate(seed, 'apda').map((m) => m.text), slate.map((m) => m.text), 'slate is deterministic');
ok(buildSlate(draftSeed(A, B, 'other-room'), 'apda').map((m) => m.text).join() !== slate.map((m) => m.text).join(),
  'a second room between the same two people draws a different slate');
// Seed is order-independent: whichever side asks, the same five motions.
eq(draftSeed(A, B, 'r'), draftSeed(B, A, 'r'), 'seed must not depend on who is asking');

// Every format draws a full clean slate.
Object.keys(DRAFT_MOTIONS).forEach((k) => {
  const s = buildSlate(draftSeed(A, B, 'fmt-' + k), k);
  eq(s.length, SLATE_SIZE, 'slate size for ' + k);
  eq(new Set(s.map((m) => m.text)).size, SLATE_SIZE, 'duplicate motion in ' + k + ' slate');
});

// ── roles ───────────────────────────────────────────────────────────
const roles = assignRoles(seed, A, B);
ok(roles.motionUid !== roles.sideUid, 'one debater cannot hold both powers');
eq([roles.motionUid, roles.sideUid].sort(), [A, B].sort(), 'roles cover exactly the two debaters');
eq(assignRoles(seed, B, A), roles, 'roles do not depend on argument order');
let heads = 0;
for (let i = 0; i < 400; i++) if (assignRoles(draftSeed(A, B, 'r' + i), A, B).motionUid === A) heads++;
ok(heads > 140 && heads < 260, 'coin flip is skewed: ' + heads + '/400');

// ── strike sanitisation (the injection surface) ─────────────────────
const d0 = createDraft(seed, 'apda', A, B);
eq(d0.v, DRAFT_VERSION, 'draft carries its version');
eq(d0.phase, 'strike', 'a fresh draft opens on strikes');
eq(sanitizeStrikes(d0, ['m1', 'm2', 'm3', 'm4']).length, STRIKES_PER_SIDE, 'strike count is capped');
eq(sanitizeStrikes(d0, ['m1', 'm1']), ['m1'], 'duplicate strikes collapse');
eq(sanitizeStrikes(d0, ['m9', 'nope', 'm2']), ['m2'], 'off-slate ids are dropped');
eq(sanitizeStrikes(d0, null), [], 'a non-array body is not a strike');
eq(sanitizeStrikes(d0, ['__proto__', 'm3']), ['m3'], 'prototype keys are not slate ids');

// ── auto strikes ────────────────────────────────────────────────────
const autoA = autoStrikes(d0, A, []);
eq(autoA.length, STRIKES_PER_SIDE, 'auto fills a full set');
eq(autoStrikes(d0, A, []), autoA, 'auto strikes are deterministic');
eq(autoStrikes(d0, A, ['m3']).slice(0, 1), ['m3'], 'auto keeps what the human already struck');
eq(autoStrikes(d0, A, ['m1', 'm2']), ['m1', 'm2'], 'auto never overrides a complete set');
ok(autoStrikes(d0, B, []).join() !== autoA.join(), 'both sides auto-striking must not strike identically');

// ── phase machine ───────────────────────────────────────────────────
let d = advance(Object.assign({}, d0, { strikes: { [A]: ['m1', 'm2'] } }), A, B);
eq(d.phase, 'strike', 'one side striking does not advance the draft');
eq(actorFor(d), null, 'nobody holds a pick clock during strikes');
ok(!bothStruck(d, A, B), 'bothStruck is false with one side in');

// No overlap: exactly one survivor, motion beat is skipped.
d = advance(Object.assign({}, d0, { strikes: { [A]: ['m1', 'm2'], [B]: ['m3', 'm4'] } }), A, B);
eq(survivorsOf(d), ['m5'], 'no-overlap strikes leave one motion');
eq(d.motionId, 'm5', 'a single survivor locks itself');
eq(d.phase, 'side', 'a single survivor skips the motion pick');
eq(actorFor(d), d.sideUid, 'the side holder owns the clock on the side beat');

// Full overlap: three survivors, motion holder picks.
d = advance(Object.assign({}, d0, { strikes: { [A]: ['m1', 'm2'], [B]: ['m1', 'm2'] } }), A, B);
eq(survivorsOf(d), ['m3', 'm4', 'm5'], 'identical strikes leave three motions');
eq(d.phase, 'motion', 'multiple survivors open the motion pick');
eq(actorFor(d), d.motionUid, 'the motion holder owns the clock on the motion beat');

// ── picks: authority ────────────────────────────────────────────────
const other = d.motionUid === A ? B : A;
eq(applyMotionPick(d, other, 'm3').reason, 'not_your_call', 'the side holder cannot call the motion');
eq(applyMotionPick(d, d.motionUid, 'm1').reason, 'motion_struck', 'a struck motion cannot be picked');
eq(applyMotionPick(d, d.motionUid, 'm9').reason, 'motion_struck', 'an off-slate motion cannot be picked');
eq(applySidePick(d, d.sideUid, 'pro').reason, 'wrong_phase', 'sides cannot be picked before the motion is set');

const picked = applyMotionPick(d, d.motionUid, 'm4');
ok(picked.ok, 'the motion holder can pick a survivor');
d = advance(picked.draft, A, B);
eq(d.phase, 'side', 'picking the motion opens the side beat');
eq(applySidePick(d, d.motionUid, 'pro').reason, 'not_your_call', 'the motion holder cannot call the side');
eq(applySidePick(d, d.sideUid, 'middle').reason, 'bad_side', 'only pro or con');
ok(applyMotionPick(d, d.motionUid, 'm5').reason === 'wrong_phase', 'the motion cannot be re-picked later');

// ── result ──────────────────────────────────────────────────────────
ok(draftResult(d, A, B) === null, 'an unfinished draft yields no result');
const sideHolder = d.sideUid;
d = advance(applySidePick(d, sideHolder, 'pro').draft, A, B);
eq(d.phase, 'done', 'a picked side finishes the draft');
const res = draftResult(d, A, B);
eq(res.proUid, sideHolder, 'the side holder gets the side they took');
eq(res.conUid, sideHolder === A ? B : A, 'the other debater gets the remainder');
eq(res.motion, d0.slate.find((m) => m.id === 'm4').text, 'the result carries the picked motion text');

// And the same draft with the other side taken.
let d2 = advance(applySidePick(advance(applyMotionPick(
  advance(Object.assign({}, d0, { strikes: { [A]: ['m1', 'm2'], [B]: ['m1', 'm2'] } }), A, B),
  d0.motionUid, 'm3').draft, A, B), d0.sideUid, 'con').draft, A, B);
eq(draftResult(d2, A, B).conUid, d0.sideUid, 'taking con puts the side holder on con');

// ── timeout resolution ──────────────────────────────────────────────
let stuck = advance(Object.assign({}, d0, { strikes: { [A]: ['m1', 'm2'], [B]: ['m1', 'm2'] } }), A, B);
const r1 = advance(autoResolve(stuck), A, B);
const r2 = advance(autoResolve(stuck), A, B);
eq(r1.motionId, r2.motionId, 'two expired clocks must resolve the motion identically');
eq(r1.motionId, 'm3', 'the motion timeout falls back to the first surviving motion');
ok(r1.autoMotion === true, 'an auto-resolved motion is stamped as auto');
const s1 = autoResolve(r1);
ok(s1.autoSide === true, 'an auto-resolved side is stamped as auto');
// Repeated, not paired: comparing two calls lets a Math.random() side pass
// half the time, which is a flaky test rather than a guard. Both clients and
// the server run this independently, so it has to be identical every time.
for (let i = 0; i < 200; i++) {
  eq(autoResolve(r1).side, s1.side, 'the side timeout is not deterministic (run ' + i + ')');
}
// ...and not deterministic by being hardcoded: a different draft can differ.
let sideSpread = new Set();
for (let i = 0; i < 200; i++) {
  const alt = advance(Object.assign({}, createDraft(draftSeed(A, B, 'side' + i), 'apda', A, B), {
    strikes: { [A]: ['m1', 'm2'], [B]: ['m1', 'm2'] },
  }), A, B);
  sideSpread.add(autoResolve(advance(autoResolve(alt), A, B)).side);
}
eq(sideSpread.size, 2, 'the side timeout always lands on the same side');
const s2 = autoResolve(r2);
const fullyAuto = draftResult(advance(s1, A, B), A, B);
ok(fullyAuto && fullyAuto.proUid !== fullyAuto.conUid, 'a fully timed-out draft still opens a valid round');

// ── corrupted state ─────────────────────────────────────────────────
// Unreachable through the public API (applyMotionPick refuses a struck
// motion), so the fuzz never exercises it. It exists for a doc written by an
// older draft version or a half-applied write, and the cost of it being wrong
// is a round run on a motion both debaters struck. Tested directly.
const corrupt = advance(Object.assign({}, d0, {
  strikes: { [A]: ['m1', 'm2'], [B]: ['m1', 'm2'] },
  motionId: 'm1',
}), A, B);
eq(corrupt.motionId, null, 'a struck motionId must not survive advance()');
eq(corrupt.phase, 'motion', 'a cleared motion sends the draft back to the pick');
ok(draftResult(corrupt, A, B) === null, 'a corrupted draft yields no round');
// An off-slate motionId is the same class of problem.
const alien = advance(Object.assign({}, d0, {
  strikes: { [A]: ['m1', 'm2'], [B]: ['m3', 'm4'] },
  motionId: 'm99',
}), A, B);
eq(alien.motionId, 'm5', 'an off-slate motionId is replaced by the real survivor');

// ── fuzz: every reachable draft resolves to a legal round ───────────
function rng(s) { let a = s >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const formats = Object.keys(DRAFT_MOTIONS);
let sawOne = 0, sawTwo = 0, sawThree = 0;
for (let i = 0; i < 4000; i++) {
  const rand = rng(i * 2654435761);
  const fmt = formats[Math.floor(rand() * formats.length)];
  const sd = draftSeed('u' + (i % 37), 'v' + (i % 53), 'room' + i);
  const ua = 'u' + (i % 37), ub = 'v' + (i % 53);
  let dr = createDraft(sd, fmt, ua, ub);
  const ids = dr.slate.map((m) => m.id);
  const pickTwo = () => { const c = ids.slice(); const o = []; for (let k = 0; k < 2; k++) o.push(c.splice(Math.floor(rand() * c.length), 1)[0]); return o; };
  dr.strikes[ua] = pickTwo();
  dr.strikes[ub] = pickTwo();
  dr = advance(dr, ua, ub);
  const surv = survivorsOf(dr);
  ok(surv.length >= 1 && surv.length <= 3, 'survivors out of range: ' + surv.length);
  if (surv.length === 1) sawOne++; else if (surv.length === 2) sawTwo++; else sawThree++;
  if (dr.phase === 'motion') {
    const choice = surv[Math.floor(rand() * surv.length)];
    dr = advance(rand() < 0.5 ? applyMotionPick(dr, dr.motionUid, choice).draft : autoResolve(dr), ua, ub);
  }
  ok(dr.phase === 'side', 'draft did not reach the side beat: ' + dr.phase);
  dr = advance(rand() < 0.5 ? applySidePick(dr, dr.sideUid, rand() < 0.5 ? 'pro' : 'con').draft : autoResolve(dr), ua, ub);
  const r = draftResult(dr, ua, ub);
  ok(!!r, 'draft failed to resolve');
  ok(r.proUid !== r.conUid, 'both debaters landed on the same side');
  eq([r.proUid, r.conUid].sort(), [ua, ub].sort(), 'result named someone who was not in the round');
  ok(typeof r.motion === 'string' && r.motion.length > 18, 'result motion is a stub');
  ok(dr.strikes[ua].indexOf(dr.motionId) === -1 && dr.strikes[ub].indexOf(dr.motionId) === -1,
    'a struck motion survived to the round');
}
// The whole reason the motion beat exists: overlap is common, not rare.
ok(sawTwo + sawThree > 0, 'fuzz never produced an overlap');
ok(sawOne > 0, 'fuzz never produced a clean split');
console.log('  survivor spread over 4000 drafts: 1 -> ' + sawOne + ', 2 -> ' + sawTwo + ', 3 -> ' + sawThree);

console.log('motion-draft: ' + n + ' assertions passed');
