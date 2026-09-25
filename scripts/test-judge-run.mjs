// Tests for lib/judge-run.mjs, the shared panel runner.
// Run: node scripts/test-judge-run.mjs
//
// The panel maths lives in lib/judge-panel.mjs and has its own coverage.
// What is new here, and what could go wrong silently, is that ONE runner
// now serves two surfaces with different side keys (async prop/opp, live
// pro/con). A key mix-up would not throw. It would hand the round to the
// wrong debater, and the ballot would look completely normal.
//
// Provider dispatch is faked below; this covers parsing and panel
// orchestration without making paid calls or judging model reasoning.

import assert from 'node:assert/strict';
import { makeBallotParser, parseDims, runPanel } from '../app/netlify/functions/lib/judge-run.mjs';
import { normalizeVote, MAX_RFD_CHARS } from '../app/netlify/functions/lib/judge-panel.mjs';

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

for (const input of [
  { winner: 'prop', propPoints: 90, oppPoints: 45 },
  { proPoints: 79, conPoints: 66 },
  { winner: null, proPoints: 66, conPoints: 79 },
  { winner: 'nonsense', proPoints: 66, conPoints: 79 },
  { proPoints: 55, conPoints: 55 },
]) assert.throws(() => liveParse(j(input)), /invalid ballot winner/);
assert.throws(() => asyncParse(j({ winner: 'pro', propPoints: 30, oppPoints: 25 })), /invalid ballot winner/);
ok(liveParse(j({ winner: 'con', proPoints: 80, conPoints: 60 })).winner === 'con', 'a declared vote is never overruled by points');

// ── the speaker-point clamp, which feeds the ladder ──────────────────
ok(liveParse(j({ winner: 'pro', proPoints: 147, conPoints: -3, rfd: '' })).proPoints === 100, '100-scale points clamp high');
ok(liveParse(j({ winner: 'pro', proPoints: 147, conPoints: -3, rfd: '' })).conPoints === 1, '100-scale points clamp low');
ok(liveParse(j({ winner: 'pro', proPoints: 'abc', conPoints: null, rfd: '' })).proPoints === 55, '100-scale non-numeric points default to 55');
ok(liveParse(j({ winner: 'pro', proPoints: 78.46, conPoints: 67, rfd: '' })).proPoints === 78.5, '100-scale points round to one decimal');
ok(asyncParse(j({ winner: 'prop', propPoints: 47, oppPoints: 3, rfd: '' })).propPoints === 30, 'legacy points still clamp high to 30');
ok(asyncParse(j({ winner: 'prop', propPoints: 47, oppPoints: 3, rfd: '' })).oppPoints === 25, 'legacy points still clamp low to 25');

// ── rfd + malformed input ────────────────────────────────────────────
const longRfd = 'A real comparative explanation. '.repeat(100) + 'FINAL ADVICE';
const longBallot = liveParse(j({ winner: 'pro', proPoints: 65, conPoints: 55, rfd: longRfd }));
ok(longBallot.rfd === longRfd, 'the full reasoning and final advice survive parsing');
ok(normalizeVote({ id: 'j1' }, longBallot, 'pro', 'con').rfd === longRfd, 'the full reasoning survives panel normalization');
ok(liveParse(j({ winner: 'pro', rfd: 'z'.repeat(MAX_RFD_CHARS + 1) })).rfd.length === MAX_RFD_CHARS, 'unbounded RFDs retain a shared storage ceiling');
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

// ── runtime provider failure and the Claude safety net ──────────────
// Provider keys can all be configured while the calls themselves time
// out or return an error. Fakes exercise that orchestration without
// spending a real provider call in the pre-commit hook.
const season = {
  panel: {
    size: 3, quorum: 2,
    jurors: [
      { id: 'j1', provider: 'anthropic', model: 'claude-pinned' },
      { id: 'j2', provider: 'openai', model: 'gpt-pinned' },
      { id: 'j3', provider: 'google', model: 'gemini-pinned' },
    ],
  },
};
const result = (id, provider, model, winner) => ({
  jurorId: id, provider, model, ok: true, promptHash: 'same',
  ballot: { winner, proPoints: winner === 'pro' ? 82 : 73, conPoints: winner === 'con' ? 82 : 73, rfd: 'r' },
});
const failed = (id, provider, model) => ({ jurorId: id, provider, model, ok: false, error: 'provider down' });
const allAvailable = () => true;

{
  let fallbackCalls = 0;
  const judged = await runPanel(season, 'system', 'user', {
    aKey: 'pro', bKey: 'con', scoreScale: 100, singleModel: 'claude-backup',
    jurorAvailable: allAvailable,
    callPanel: async () => [
      result('j1', 'anthropic', 'claude-pinned', 'pro'),
      failed('j2', 'openai', 'gpt-pinned'),
      failed('j3', 'google', 'gemini-pinned'),
    ],
    callJuror: async () => { fallbackCalls++; return result('single', 'anthropic', 'claude-backup', 'con'); },
  });
  ok(judged.ballot.winner === 'pro' && judged.panel.resolution === 'single',
    'one surviving Claude vote becomes the disclosed single-judge result');
  ok(judged.panel.degraded === true && judged.panel.fallbackReason === 'runtime_quorum_failed',
    'runtime fallback is stamped degraded with its cause');
  ok(fallbackCalls === 0, 'a usable Claude panel vote is reused instead of billed twice');
}

{
  let fallbackCalls = 0;
  const judged = await runPanel(season, 'system', 'user', {
    aKey: 'pro', bKey: 'con', scoreScale: 100, singleModel: 'claude-backup',
    jurorAvailable: allAvailable,
    callPanel: async () => [
      failed('j1', 'anthropic', 'claude-pinned'),
      failed('j2', 'openai', 'gpt-pinned'),
      failed('j3', 'google', 'gemini-pinned'),
    ],
    callJuror: async () => { fallbackCalls++; return result('single', 'anthropic', 'claude-backup', 'con'); },
  });
  ok(judged.ballot.winner === 'con' && judged.panel.originalVotesCast === 0,
    'an all-provider outage gets one explicit Claude backup ballot');
  ok(judged.jurorResults.length === 4 && fallbackCalls === 1,
    'the audit input keeps three failures plus the backup call');
}

{
  let fallbackCalls = 0;
  const judged = await runPanel(season, 'system', 'user', {
    aKey: 'pro', bKey: 'con', scoreScale: 100, singleModel: 'claude-backup',
    allowRuntimeFallbackCall: false,
    jurorAvailable: allAvailable,
    callPanel: async () => [
      failed('j1', 'anthropic', 'claude-pinned'),
      failed('j2', 'openai', 'gpt-pinned'),
      failed('j3', 'google', 'gemini-pinned'),
    ],
    callJuror: async () => { fallbackCalls++; return result('single', 'anthropic', 'claude-backup', 'con'); },
  });
  ok(judged.ballot.winner === null && judged.panel.resolution === 'incomplete',
    'a synchronous live outage returns incomplete instead of overrunning its request window');
  ok(fallbackCalls === 0 && judged.jurorResults.length === 3,
    'live judging never starts a second provider window after the panel');
}

{
  let fallbackCalls = 0;
  const judged = await runPanel(season, 'system', 'user', {
    aKey: 'pro', bKey: 'con', scoreScale: 100, singleModel: 'claude-backup',
    jurorAvailable: allAvailable,
    callPanel: async () => [
      result('j1', 'anthropic', 'claude-pinned', 'pro'),
      result('j2', 'openai', 'gpt-pinned', 'con'),
      failed('j3', 'google', 'gemini-pinned'),
    ],
    callJuror: async () => { fallbackCalls++; return result('single', 'anthropic', 'claude-backup', 'pro'); },
  });
  ok(judged.ballot.winner === null && judged.panel.resolution === 'unresolved',
    'a returned 1-1 panel split stays unresolved');
  ok(fallbackCalls === 0, 'Claude is never used to break a panel tie');
}

{
  const strictSeason = {
    panel: { ...season.panel, minimumVotes: 3 },
  };
  const judged = await runPanel(strictSeason, 'system', 'user', {
    aKey: 'pro', bKey: 'con', scoreScale: 100, singleModel: 'claude-backup',
    jurorAvailable: allAvailable,
    callPanel: async () => [
      result('j1', 'anthropic', 'claude-pinned', 'pro'),
      result('j2', 'openai', 'gpt-pinned', 'pro'),
      failed('j3', 'google', 'gemini-pinned'),
    ],
    callJuror: async () => result('single', 'anthropic', 'claude-backup', 'pro'),
  });
  ok(judged.ballot.winner === null && judged.panel.resolution === 'incomplete',
    'two matching votes cannot present themselves as the three-judge council');
  ok(judged.panel.minimumVotes === 3 && judged.panel.votesCast === 2,
    'a short council reports the three-seat requirement and its actual vote count');
}

console.log(`\njudge-run: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
