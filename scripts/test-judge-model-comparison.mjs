import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateJurors, evaluateJuror } from './eval/lib/model-comparison.mjs';
import { casePrompt, AXES } from './eval/lib/conversation-behavior.mjs';
import { promptHash } from '../app/netlify/functions/lib/judge-jurors.mjs';

const c = JSON.parse(readFileSync(new URL('./eval/conversation-behavior-cases.json', import.meta.url))).cases[0];
const j = { id: 'candidate', provider: 'openai', model: 'test-only', effort: 'low' };
assert.throws(() => validateJurors([j, j]), /duplicate/);
assert.throws(() => validateJurors([{ ...j, provider: 'invalid' }]), /Invalid/);
assert.throws(() => validateJurors([{ ...j, effort: 'invented' }]), /effort/);
const source = { winner: 'pro', proPoints: 60, conPoints: 50, rfd: 'A complete explanation. '.repeat(100), dimensions: Object.fromEntries(AXES.map(a => [a, { pro: 6, con: 5 }])) };
let calls = 0;
const prompt = casePrompt(c, 'open');
const run = async (text) => evaluateJuror({ ...c, expected_behavior: { must: ['SECRET_LABEL'], must_not: ['SECRET_WINNER'] } }, 'open', j, {
  dispatch: async (juror, system, user, maxTokens, parse, timeout) => {
    calls++;
    assert.equal(system, prompt.system);
    assert.equal(user, prompt.user);
    assert.equal(maxTokens, 8000);
    assert.equal(timeout, 90000);
    const base = { jurorId: juror.id, model: juror.model, promptHash: promptHash(system, user) };
    try { return { ...base, ok: true, ballot: parse(text) }; }
    catch (error) { return { ...base, ok: false, error: error.message }; }
  },
});
const valid = await run(JSON.stringify(source));
assert.equal(valid.raw, JSON.stringify(source));
assert.equal(valid.ballot.rfd, source.rfd);
assert.equal(valid.observation.reasoningTruncated, false);
assert.ok(valid.review.every(r => r.status === 'unreviewed'));
const invalid = await run(JSON.stringify({ ...source, winner: null }));
assert.equal(invalid.ok, false);
assert.equal(invalid.observation.sourceWinnerValid, false);
assert.ok(invalid.raw.includes('"winner":null'));
assert.equal(calls, 2, 'No retries, panel calls or fallback votes');
console.log('Model comparison: identical production prompts, raw invalid ballots, no answer leakage or fallback verified.');
process.exit(0);
