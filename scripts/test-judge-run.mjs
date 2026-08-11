// Tests for lib/judge-run.mjs, the shared panel runner.
// Run: node scripts/test-judge-run.mjs
//
// The panel maths lives in lib/judge-panel.mjs and has its own coverage.
// What is new here, and what could go wrong silently, is that ONE runner
// now serves two surfaces with different side keys (async prop/opp, live
// pro/con). A key mix-up would not throw. It would hand the round to the
// wrong debater, and the ballot would look completely normal.
//
// NOT COVERED, stated so nobody reads this file as more than it is:
// runPanel() itself needs provider keys and a live season, so its
// tally.winner -> aKey/bKey mapping is exercised only in production.
// Verified by mutation: inverting that mapping leaves this suite green.
// Covering it wants a fake-juror injection seam in judge-jurors.mjs,
// which is the next thing to build here, not something this file does.

import { makeBallotParser, parseDims } from '../app/netlify/functions/lib/judge-run.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.error('  FAIL: ' + n); } };

const asyncParse = makeBallotParser('prop', 'opp');
const liveParse = makeBallotParser('pro', 'con');
const j = (o) => JSON.stringify(o);

// ── the two surfaces read their own keys, and only their own ─────────
const liveBallot = liveParse(j({ winner: 'pro', proPoints: 28.4, conPoints: 27.1, rfd: 'x' }));
ok(liveBallot.winner === 'pro', 'live keeps a pro winner');
ok(liveBallot.proPoints === 28.4 && liveBallot.conPoints === 27.1, 'live reads pro/con points');
ok(!('propPoints' in liveBallot), 'live does not emit async keys');

const asyncBallot = asyncParse(j({ winner: 'opp', propPoints: 26, oppPoints: 29, rfd: 'x' }));
ok(asyncBallot.winner === 'opp', 'async keeps an opp winner');
ok(asyncBallot.propPoints === 26 && asyncBallot.oppPoints === 29, 'async reads prop/opp points');
ok(!('proPoints' in asyncBallot), 'async does not emit live keys');

// A live parser handed an async-shaped ballot must NOT silently invent a
// winner from foreign keys. Both point fields are absent, so both clamp
// to the 27 default and the a-side wins the tie. What matters is that it
// does not read propPoints as if it were proPoints.
const crossed = liveParse(j({ winner: 'prop', propPoints: 30, oppPoints: 25, rfd: 'x' }));
ok(crossed.proPoints === 27 && crossed.conPoints === 27, 'foreign point keys are NOT read across surfaces');
ok(crossed.winner === 'pro', 'unrecognised winner falls back to the points comparison, not the foreign string');

// ── winner fallback ──────────────────────────────────────────────────
ok(liveParse(j({ proPoints: 29, conPoints: 26, rfd: '' })).winner === 'pro', 'missing winner derives from points (a)');
ok(liveParse(j({ proPoints: 26, conPoints: 29, rfd: '' })).winner === 'con', 'missing winner derives from points (b)');
ok(liveParse(j({ winner: 'nonsense', proPoints: 26, conPoints: 29, rfd: '' })).winner === 'con', 'garbage winner derives from points');

// ── the speaker-point clamp, which feeds the ladder ──────────────────
ok(liveParse(j({ winner: 'pro', proPoints: 47, conPoints: 3, rfd: '' })).proPoints === 30, 'points clamp high to 30');
ok(liveParse(j({ winner: 'pro', proPoints: 47, conPoints: 3, rfd: '' })).conPoints === 25, 'points clamp low to 25');
ok(liveParse(j({ winner: 'pro', proPoints: 'abc', conPoints: null, rfd: '' })).proPoints === 27, 'non-numeric points default to 27');
ok(liveParse(j({ winner: 'pro', proPoints: 28.46, conPoints: 27, rfd: '' })).proPoints === 28.5, 'points round to one decimal');

// ── rfd + malformed input ────────────────────────────────────────────
ok(liveParse(j({ winner: 'pro', proPoints: 28, conPoints: 27, rfd: 'z'.repeat(3000) })).rfd.length === 1600, 'rfd truncates at 1600');
ok(liveParse('noise ' + j({ winner: 'pro', proPoints: 28, conPoints: 27, rfd: 'x' }) + ' trailer').winner === 'pro', 'JSON is extracted from surrounding prose');
let threw = false; try { liveParse('no json at all'); } catch (e) { threw = true; }
ok(threw, 'a response with no JSON throws rather than inventing a verdict');

// ── dimensions: all-or-nothing, per surface ──────────────────────────
const dims = { clarity: { pro: 8, con: 7 }, reasoning: { pro: 9, con: 6 }, responsiveness: { pro: 7, con: 7 }, weighing: { pro: 8, con: 5 } };
ok(parseDims(dims, 'pro', 'con') !== null, 'complete live scorecard survives');
ok(parseDims(dims, 'prop', 'opp') === null, 'a live scorecard read with async keys is DROPPED, not half-read');
const partial = { clarity: { pro: 8, con: 7 }, reasoning: { pro: 9, con: 6 }, responsiveness: { pro: 7, con: 7 } };
ok(parseDims(partial, 'pro', 'con') === null, 'a missing axis drops the whole scorecard');
ok(parseDims({ ...dims, weighing: { pro: 8 } }, 'pro', 'con') === null, 'a missing side on one axis drops the whole scorecard');
const clamped = parseDims({ ...dims, clarity: { pro: 99, con: -4 } }, 'pro', 'con');
ok(clamped.clarity.pro === 10 && clamped.clarity.con === 1, 'axis scores clamp to 1-10');
ok(parseDims(null, 'pro', 'con') === null && parseDims('nope', 'pro', 'con') === null, 'non-object dimensions drop cleanly');

// ── the axis list has to be able to GROW ─────────────────────────────
//
// Persuasion joined the rubric in the 2026-persuasion season, and adding
// it under the old strictly-all-or-nothing rule meant a four-axis ballot
// produced NO scorecard at all, where it used to produce four. That
// broke this file's own fixture and, with it, every commit in the repo,
// which is a cheap way to learn that the four originals are a FLOOR and
// anything after them is additive.
const withNew = { ...dims, persuasion: { pro: 6, con: 9 } };
const five = parseDims(withNew, 'pro', 'con');
ok(five !== null && Object.keys(five).length === 5, 'a newer ballot keeps every axis it scored');
ok(five.persuasion.con === 9, 'the added axis survives with its scores');
const four = parseDims(dims, 'pro', 'con');
ok(four !== null && Object.keys(four).length === 4,
  'a ballot judged before the new axis existed still renders its four');
ok(parseDims({ ...withNew, weighing: undefined }, 'pro', 'con') === null,
  'a REQUIRED axis missing still drops the whole card');

console.log(`\njudge-run: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
