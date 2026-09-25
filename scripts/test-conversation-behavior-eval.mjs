import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCases, casePrompt, inspectRaw, evaluateCase, summarize, AXES } from './eval/lib/conversation-behavior.mjs';
import { makeBallotParser } from '../app/netlify/functions/lib/judge-run.mjs';
import { buildNoWinnerBallot } from '../app/netlify/functions/live-judge.mjs';

const packet = JSON.parse(readFileSync(new URL('./eval/conversation-behavior-cases.json', import.meta.url), 'utf8'));
const cases = validateCases(packet);
assert.equal(cases.length, 14);
assert.throws(() => validateCases({ cases: [...cases, cases[0]] }), /duplicate/);
assert.throws(() => validateCases({ cases: [{ ...cases[0], paired_with: 'missing' }] }), /paired/);
assert.throws(() => casePrompt(cases[0], 'bp'), /Unsupported/);
const c = { ...cases[0], expected_behavior: { must: ['EXPECTATION_SECRET'], must_not: ['WINNER_HINT'] } };
for (const format of ['quick', 'open']) {
  const p = casePrompt(c, format);
  assert.ok(!p.system.includes('EXPECTATION_SECRET') && !p.user.includes('WINNER_HINT'));
  assert.ok(p.system.includes(format === 'open' ? 'LIVE CONVERSATION JUDGING METHOD' : 'CASUAL 1V1 JUDGING METHOD'));
  for (const turn of c.transcript) assert.ok(p.user.includes(turn.text));
  assert.ok(p.user.indexOf('[T1]') < p.user.indexOf('[T2]'));
}
const moderatorPrompt = casePrompt(cases.find(c => c.id === 'clarification-only-record'), 'open');
assert.ok(moderatorPrompt.user.includes('[T5] Moderator:'));

const source = {
  winner: 'pro', proPoints: 63, conPoints: 54,
  decidingIssue: 'Access after work', rfd: 'Supported explanation. '.repeat(100) + 'FINAL QUALIFICATION',
  dimensions: Object.fromEntries(AXES.map(axis => [axis, { pro: 6, con: 5 }])),
};
const parse = makeBallotParser('pro', 'con', 100);
const raw = JSON.stringify(source);
const observation = inspectRaw(raw, parse(raw));
assert.equal(observation.reasoningTruncated, false);
assert.ok(observation.sourceRfd.endsWith('FINAL QUALIFICATION'));
assert.equal(observation.dimensionsComplete, true);
const noWinner = JSON.stringify({ ...source, winner: null });
assert.throws(() => parse(noWinner), /invalid ballot winner/);
assert.equal(inspectRaw(noWinner, null).sourceWinnerValid, false);
assert.equal(inspectRaw(raw, { ...parse(raw), rfd: source.rfd.slice(0, 1600) }).reasoningTruncated, true);
assert.equal(inspectRaw('not json', null).sourceJsonValid, false);

const season = { panel: { quorum: 2, minimumVotes: 2, jurors: [
  { id: 'j1', provider: 'anthropic', model: 'fake' },
  { id: 'j2', provider: 'xai', model: 'fake' },
  { id: 'j3', provider: 'google', model: 'fake' },
] } };
let calls = 0;
const dispatch = async (juror, system, user, budget, parse) => {
  calls++;
  assert.ok(!system.includes('EXPECTATION_SECRET'));
  if (juror.id === 'j3') return { ...juror, jurorId: juror.id, ok: false, error: 'synthetic timeout' };
  return { ...juror, jurorId: juror.id, ok: true, ballot: parse(raw) };
};
const row = await evaluateCase(c, 'open', season, { dispatch, available: () => true });
assert.equal(calls, 3);
assert.equal(row.complete, false);
assert.equal(row.jurors.length, 3);
assert.equal(row.jurors[0].raw, raw);
assert.equal(row.jurors[2].raw, null);
assert.ok(row.review.every(r => r.status === 'unreviewed'));
const summary = summarize([row]);
assert.equal(summary.providerFailures, 1);
assert.equal(summary.behaviorAccuracy, null);
assert.equal(summary.shortenedExplanations, 0);
const noVoteDispatch = async (juror, system, user, budget, parse) => {
  const text = JSON.stringify({ ...source, winner: juror.id === 'j1' ? 'pro' : juror.id === 'j2' ? 'con' : null });
  try { return { ...juror, jurorId: juror.id, ok: true, ballot: parse(text) }; }
  catch (error) { return { ...juror, jurorId: juror.id, ok: false, error: error.message }; }
};
const invalid = await evaluateCase(c, 'open', season, { dispatch: noVoteDispatch, available: () => true });
assert.equal(invalid.ballot.winner, null);
assert.equal(invalid.panel.votesCast, 2);
assert.equal(invalid.complete, false);
assert.equal(summarize([invalid]).invalidSourceWinners, 1);
assert.equal(invalid.jurors.find(j => j.jurorId === 'j3').observation.sourceWinner, null);
const split = buildNoWinnerBallot({ panel: invalid.panel, ballot: invalid.ballot, jurorResults: invalid.jurors });
assert.ok(split.judgeReasons.every(j => j.rfd === source.rfd));
console.log('Behavior eval: production prompt routing, no answer leakage, raw evidence, parser masking and incomplete panels verified.');
process.exit(0);
