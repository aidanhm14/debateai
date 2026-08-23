// Guards on the LIVE clash map's quote gate.
//
// The clash map renders under a ballot on a judged surface, so the one
// output it must never produce is a row saying "they said X" about a
// thing nobody said. The gate is what prevents that, and a gate nobody
// tests is a gate nobody has. Runs in the pre-commit hook.
import assert from 'node:assert';
import {
  parseClashMapForBenches, benchHaystacks, liveClashMapPrompt, CLASH_LABELS,
} from '../app/netlify/functions/lib/clash-map.mjs';

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const eq = (a, b, m) => { n++; assert.strictEqual(a, b, m); };

const bench = {
  prop: 'Banning single use plastics outright is the only measure that actually reduces ocean waste at scale, because voluntary schemes have failed for thirty years running.',
  opp: 'A ban punishes the poorest households first, since cheap packaging is what keeps basic food affordable for people on the lowest incomes.',
};
const wrap = (rows) => JSON.stringify({ clashes: rows });
const PROP_Q = 'voluntary schemes have failed for thirty years running';
const OPP_Q = 'cheap packaging is what keeps basic food affordable for people on the lowest incomes';

// ── the row that should survive ───────────────────────────────────
{
  const r = parseClashMapForBenches(wrap([{
    claim: 'Voluntary schemes failed', by: 'prop', claimQuote: PROP_Q,
    label: 'rebutted', responseQuote: OPP_Q, note: 'Answered on cost, not efficacy.',
  }]), bench);
  ok(r && r.clashes.length === 1, 'a row with two verbatim quotes survives');
  eq(r.clashes[0].label, 'rebutted', 'label preserved');
  eq(r.rejected, 0, 'nothing rejected');
}

// ── hallucination, in every direction ─────────────────────────────
// These are the assertions that matter. Each one is a row the model
// could plausibly emit and that would be a false public statement.
eq(parseClashMapForBenches(wrap([{
  claim: 'x', by: 'prop', claimQuote: 'plastic bans have already worked brilliantly in ninety countries',
  label: 'dropped', responseQuote: '',
}]), bench), null, 'a FABRICATED claim quote is dropped');

eq(parseClashMapForBenches(wrap([{
  claim: 'x', by: 'prop', claimQuote: PROP_Q, label: 'rebutted',
  responseQuote: 'the opposition conceded this point entirely in their second speech',
}]), bench), null, 'a FABRICATED response quote is dropped');

eq(parseClashMapForBenches(wrap([{
  claim: 'x', by: 'prop', claimQuote: 'A ban punishes the poorest households first',
  label: 'dropped', responseQuote: '',
}]), bench), null, 'a real quote credited to the WRONG side is dropped');

eq(parseClashMapForBenches(wrap([{
  claim: 'x', by: 'prop', claimQuote: 'plastics', label: 'dropped', responseQuote: '',
}]), bench), null, 'a quote too short to be evidence is dropped');

eq(parseClashMapForBenches(wrap([{
  claim: 'x', by: 'prop', claimQuote: PROP_Q, label: 'destroyed', responseQuote: '',
}]), bench), null, 'a label outside the vocabulary is dropped');

// ── individual gating: one bad row must not take the good ones ────
{
  const r = parseClashMapForBenches(wrap([
    { claim: 'Fake', by: 'prop', claimQuote: 'this sentence was never spoken by anyone', label: 'dropped', responseQuote: '' },
    { claim: 'Cost', by: 'opp', claimQuote: 'A ban punishes the poorest households first, since cheap packaging', label: 'dropped', responseQuote: '' },
  ]), bench);
  ok(r && r.clashes.length === 1, 'the good row survives its bad neighbour');
  eq(r.rejected, 1, 'the drop is COUNTED, so a gutted map is visible as one');
}
{
  // The row above fails at the QUOTE check. A row that fails the FIELD
  // check takes a different branch, and an earlier version of this guard
  // never exercised it: a mutation that aborted the whole map on one
  // malformed row passed the suite. One bad row from the model must
  // never be able to delete the artifact.
  const r = parseClashMapForBenches(wrap([
    { by: 'prop' },
    { claim: 'Cost', by: 'opp', claimQuote: 'A ban punishes the poorest households first, since cheap packaging', label: 'dropped', responseQuote: '' },
  ]), bench);
  ok(r && r.clashes.length === 1, 'a row missing required FIELDS does not kill the map');
  eq(r.rejected, 1, 'the malformed row is counted as rejected');
}
{
  // Same, with the malformed row second, so ordering cannot hide it.
  const r = parseClashMapForBenches(wrap([
    { claim: 'Cost', by: 'opp', claimQuote: 'A ban punishes the poorest households first, since cheap packaging', label: 'dropped', responseQuote: '' },
    { label: 'nonsense' },
  ]), bench);
  ok(r && r.clashes.length === 1, 'a trailing malformed row does not kill the map');
}

// ── real-transcript tolerance ─────────────────────────────────────
// ASR punctuation and casing drift between what the model retypes and
// what the transcript holds; matching on those would reject real rows.
{
  const r = parseClashMapForBenches(wrap([{
    claim: 'x', by: 'prop', claimQuote: 'Voluntary schemes, have FAILED -- for thirty years running!',
    label: 'dropped', responseQuote: '',
  }]), bench);
  ok(r && r.clashes.length === 1, 'punctuation and casing drift still verifies');
}

// ── dropped is the one label with nothing to quote ────────────────
{
  const r = parseClashMapForBenches(wrap([{
    claim: 'Cost', by: 'opp', claimQuote: 'A ban punishes the poorest households first, since cheap packaging',
    label: 'dropped', responseQuote: '',
  }]), bench);
  ok(r && r.clashes.length === 1, 'a dropped row needs no response quote');
}

// ── malformed input never throws ──────────────────────────────────
eq(parseClashMapForBenches('the model refused to answer', bench), null, 'non-JSON returns null');
eq(parseClashMapForBenches('{"clashes":[]}', bench), null, 'an empty map returns null');
eq(parseClashMapForBenches('', bench), null, 'empty string returns null');
eq(parseClashMapForBenches('{"clashes":[{}]}', bench), null, 'an empty row returns null');
eq(parseClashMapForBenches(wrap([{ claim: 'x', by: 'prop', claimQuote: PROP_Q, label: 'dropped' }]), { }),
  null, 'no transcript to verify against means no rows');

// ── bounds ────────────────────────────────────────────────────────
{
  const many = Array.from({ length: 30 }, (_, i) => ({
    claim: 'claim number ' + i, by: 'prop', claimQuote: PROP_Q, label: 'dropped', responseQuote: '',
  }));
  const r = parseClashMapForBenches(wrap(many), bench);
  ok(r && r.clashes.length <= 8, 'never more than 8 rows');
  eq(r.clashes.length, 1, 'identical claim quotes dedupe to one');
}

// ── the prompt states the rules it is judged by ───────────────────
{
  const { system, user } = liveClashMapPrompt({
    motion: 'THW ban single use plastics', formatName: 'General',
    propName: 'Nia', oppName: 'Aidan', propLabel: 'Pro', oppLabel: 'Con',
    speeches: [{ code: 'P1', speakerName: 'Nia', sideLabel: 'Pro', text: 'hello' }],
  });
  ok(/never say who won/i.test(system), 'the prompt forbids naming a winner');
  ok(/never score/i.test(system), 'the prompt forbids scoring');
  ok(/VERBATIM/.test(system), 'the prompt demands verbatim quotes');
  ok(/discarded/i.test(system), 'the prompt warns that unverified quotes are discarded');
  ok(user.includes('THW ban single use plastics'), 'the motion reaches the model');
  ok(user.includes('[P1'), 'speeches are labelled in order');
}

// ── haystacks are built from the text, not trusted from a caller ──
{
  const h = benchHaystacks({ prop: 'Hello, WORLD!', opp: null });
  eq(h.prop, 'hello world', 'normalized for matching');
  eq(h.opp, '', 'a missing bench is empty, never undefined');
}

eq(CLASH_LABELS.size, 4, 'four labels, and adding one needs a deliberate edit');

console.log(`[clash-live-guard] ${n} assertions passed`);
