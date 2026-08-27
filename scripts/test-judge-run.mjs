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
const liveParse = makeBallotParser('pro', 'con', 100);
const j = (o) => JSON.stringify(o);

// ── the two surfaces read their own keys, and only their own ─────────
const liveBallot = liveParse(j({ winner: 'pro', proPoints: 84.4, conPoints: 71.1, rfd: 'x' }));
ok(liveBallot.winner === 'pro', 'live keeps a pro winner');
ok(liveBallot.proPoints === 84.4 && liveBallot.conPoints === 71.1, 'live reads pro/con points');
ok(!('propPoints' in liveBallot), 'live does not emit async keys');

const asyncBallot = asyncParse(j({ winner: 'opp', propPoints: 26, oppPoints: 29, rfd: 'x' }));
ok(asyncBallot.winner === 'opp', 'async keeps an opp winner');
ok(asyncBallot.propPoints === 26 && asyncBallot.oppPoints === 29, 'async reads prop/opp points');
ok(!('proPoints' in asyncBallot), 'async does not emit live keys');

// A live parser handed an async-shaped ballot must NOT silently invent a
// winner from foreign keys. Both point fields are absent, so both use
// the 55 default and the a-side wins the tie. What matters is that it
// does not read propPoints as if it were proPoints.
const crossed = liveParse(j({ winner: 'prop', propPoints: 90, oppPoints: 45, rfd: 'x' }));
ok(crossed.proPoints === 55 && crossed.conPoints === 55, 'foreign point keys are NOT read across surfaces');
ok(crossed.winner === 'pro', 'unrecognised winner falls back to the points comparison, not the foreign string');

// ── winner fallback ──────────────────────────────────────────────────
ok(liveParse(j({ proPoints: 79, conPoints: 66, rfd: '' })).winner === 'pro', 'missing winner derives from points (a)');
ok(liveParse(j({ proPoints: 66, conPoints: 79, rfd: '' })).winner === 'con', 'missing winner derives from points (b)');
ok(liveParse(j({ winner: 'nonsense', proPoints: 66, conPoints: 79, rfd: '' })).winner === 'con', 'garbage winner derives from points');

// ── the speaker-point clamp, which feeds the ladder ──────────────────
ok(liveParse(j({ winner: 'pro', proPoints: 147, conPoints: -3, rfd: '' })).proPoints === 100, '100-scale points clamp high');
ok(liveParse(j({ winner: 'pro', proPoints: 147, conPoints: -3, rfd: '' })).conPoints === 1, '100-scale points clamp low');
ok(liveParse(j({ winner: 'pro', proPoints: 'abc', conPoints: null, rfd: '' })).proPoints === 55, '100-scale non-numeric points default to 55');
ok(liveParse(j({ winner: 'pro', proPoints: 78.46, conPoints: 67, rfd: '' })).proPoints === 78.5, '100-scale points round to one decimal');
ok(asyncParse(j({ winner: 'prop', propPoints: 47, oppPoints: 3, rfd: '' })).propPoints === 30, 'legacy points still clamp high to 30');
ok(asyncParse(j({ winner: 'prop', propPoints: 47, oppPoints: 3, rfd: '' })).oppPoints === 25, 'legacy points still clamp low to 25');

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
const withNew = { ...dims, strategy: { pro: 7, con: 5 }, persuasion: { pro: 6, con: 9 } };
const six = parseDims(withNew, 'pro', 'con');
ok(six !== null && Object.keys(six).length === 6, 'a newer ballot keeps every axis it scored');
ok(six.strategy.pro === 7 && six.persuasion.con === 9, 'the added axes survive with their scores');
const four = parseDims(dims, 'pro', 'con');
ok(four !== null && Object.keys(four).length === 4,
  'a ballot judged before the new axis existed still renders its four');
ok(parseDims({ ...withNew, weighing: undefined }, 'pro', 'con') === null,
  'a REQUIRED axis missing still drops the whole card');

console.log(`\njudge-run: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
