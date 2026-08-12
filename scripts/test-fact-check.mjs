// Unit test for lib/fact-check.mjs — the live fact checker that speaks to
// the audience during a round. Run: node scripts/test-fact-check.mjs
//
// Two promises are under test and both are public-facing. The quote gate:
// a card that says "they said X, and X is false" must not appear when
// nobody said X. And the bar: this surface only interrupts a round for a
// statement that is flatly wrong, so anything softer has to be dropped by
// the parser rather than trusted to the prompt.
import {
  factCheckPrompt, parseFactChecks, isNumericRestatement,
  verifyPrompt, applyVerification, MAX_FLAGS_PER_PASS,
} from '../app/netlify/functions/lib/fact-check.mjs';

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };

const SPEECH =
  'My opponent keeps saying this is settled. It is not. The federal minimum wage ' +
  'has been seven dollars and twenty five cents since two thousand and nine, and ' +
  'forty percent of American households cannot cover a four hundred dollar emergency. ' +
  'That is the world they are defending, and they have not answered it once.';

const d = { motion: 'THW raise the wage', format: 'BP', speaker: 'Priya', side: 'Opening Gov', text: SPEECH, checked: [] };
const json = (flags) => JSON.stringify({ flags });

const good = {
  quote: 'forty percent of American households cannot cover a four hundred dollar emergency',
  claim: 'Forty percent of US households cannot cover a $400 emergency',
  correction: 'The Federal Reserve puts it near one in three, not forty percent.',
  severity: 'distorted',
  confidence: 0.9,
};

// ── the quote gate ──────────────────────────────────────────────────
// The one failure this surface cannot absorb. Everything else costs
// coverage; an invented quote costs the audience's trust in the card.
t('a real quote survives', parseFactChecks(json([good]), d, { grounded: true }).length === 1);
t('an invented quote is dropped',
  parseFactChecks(json([{ ...good, quote: 'the unemployment rate tripled last year' }]), d, { grounded: true }).length === 0);
t('a stitched quote is dropped',
  parseFactChecks(json([{ ...good, quote: 'forty percent of American households have not answered it once' }]), d, { grounded: true }).length === 0);
// The mic drifts on punctuation and casing between what the speaker said
// and what the model retypes, so matching is on letters and digits only.
t('punctuation and casing drift still matches',
  parseFactChecks(json([{ ...good, quote: 'Forty percent of American households -- cannot cover a four hundred dollar emergency!' }]), d, { grounded: true }).length === 1);
t('a two-word "quote" cannot match half the speech',
  parseFactChecks(json([{ ...good, quote: 'It is not' }]), d, { grounded: true }).length === 0);

// ── the bar ─────────────────────────────────────────────────────────
t('only false and distorted are broadcast',
  parseFactChecks(json([{ ...good, severity: 'unsupported' }]), d, { grounded: true }).length === 0);
t('"false" is broadcast',
  parseFactChecks(json([{ ...good, severity: 'false' }]), d, { grounded: true }).length === 1);
t('a hedged flag is dropped',
  parseFactChecks(json([{ ...good, confidence: 0.6 }]), d, { grounded: true }).length === 0);
// No sources to show means a higher bar, because the card is asking the
// audience to take our word for it.
t('ungrounded needs more confidence',
  parseFactChecks(json([{ ...good, confidence: 0.85 }]), d, { grounded: false }).length === 0);
t('ungrounded at 0.9 passes',
  parseFactChecks(json([{ ...good, confidence: 0.92 }]), d, { grounded: false }).length === 1);
t('a flag with no correction is dropped',
  parseFactChecks(json([{ ...good, correction: '' }]), d, { grounded: true }).length === 0);

// ── the nit gate ────────────────────────────────────────────────────
// Written against a real over-fire: the checker wanted to card "wage theft
// in 84% of restaurants" and correct it to "violations in 83.8%", at 0.97
// confidence. Right figure, standing point, useless card.
t('same figure, different word, is not a card',
  isNumericRestatement('wage theft in 84% of the restaurants', 'The DOL found violations in 83.8% of restaurants.'));
t('a real numeric error is still a card',
  !isNumericRestatement('unemployment hit 40 percent', 'It peaked near 12 percent.'));
// Years are the case a percentage tolerance gets exactly wrong: 2019 and
// 2022 are 0.1% apart as numbers and three years apart as a claim.
t('a wrong year is not a restatement',
  !isNumericRestatement('the court struck it down in 2019', 'The 2019 ruling upheld it; it was narrowed in 2022.'));
t('the same year is a restatement',
  isNumericRestatement('the court ruled in 2019', 'The ruling was handed down in 2019.'));
t('no numbers means the gate abstains',
  !isNumericRestatement('the court struck that law down', 'The court upheld it.'));
// The quote side is a transcript of someone SPEAKING a figure, so a
// digits-only gate would abstain on exactly the flags it exists to stop.
// This pair is the real over-fire, in the form it actually arrived in.
t('a spoken figure counts as a figure',
  isNumericRestatement('wage theft in eighty four percent of the restaurants it investigated',
                       'The Department of Labor found violations in about 84-85% of them.'));
t('a stray date in the correction does not smuggle the nit back through',
  isNumericRestatement('wage theft in eighty four percent of the restaurants it investigated',
                       'DOL found violations in nearly 85% of its 2021 restaurant investigations.'));
t('but a date the speaker themselves gave is still compared',
  !isNumericRestatement('the court struck it down in 2019', 'The 2019 ruling upheld it; it narrowed in 2022.'));
t('a spoken figure that is genuinely wrong survives',
  !isNumericRestatement('unemployment hit forty percent', 'It peaked near twelve percent.'));
t('a spoken year is not merged into a bogus total',
  !isNumericRestatement('struck it down in twenty nineteen', 'The 2019 ruling upheld it; it narrowed in 2022.'));
// The gate reads digits, so the fixture has to carry them the way a
// transcript of a debater reading off a card would.
const dNum = { ...d, text: 'They told you the Department of Labor found wage theft in 84% of the restaurants it investigated, and that number is doing all the work in their case.' };
const nit = { ...good, quote: 'wage theft in 84% of the restaurants it investigated',
  correction: 'The Department of Labor found violations in 83.8% of those restaurants.' };
t('a restating "distorted" flag is dropped', parseFactChecks(json([nit]), dNum, { grounded: true }).length === 0);
t('a restating "false" flag still runs, since the opposite is not a rounding argument',
  parseFactChecks(json([{ ...nit, severity: 'false' }]), dNum, { grounded: true }).length === 1);
t('a real numeric correction on the same quote survives',
  parseFactChecks(json([{ ...nit, correction: 'The Department of Labor found violations in 12% of them.' }]), dNum, { grounded: true }).length === 1);

// ── shape ───────────────────────────────────────────────────────────
t('empty flags is a clean speech, not an error', parseFactChecks(json([]), d, { grounded: true }).length === 0);
t('prose around the JSON still parses',
  parseFactChecks('Sure. ' + json([good]) + ' Hope that helps.', d, { grounded: true }).length === 1);
t('garbage returns nothing', parseFactChecks('no json here', d, { grounded: true }).length === 0);
t('unparseable JSON returns nothing', parseFactChecks('{"flags": [', d, { grounded: true }).length === 0);
t('at most two cards per pass',
  parseFactChecks(json([good, { ...good, quote: 'has been seven dollars and twenty five cents since two thousand and nine', claim: 'b' },
    { ...good, quote: 'That is the world they are defending', claim: 'c' }]), d, { grounded: true }).length === MAX_FLAGS_PER_PASS);
t('the same quote is not carded twice',
  parseFactChecks(json([good, { ...good, claim: 'restated differently' }]), d, { grounded: true }).length === 1);
t('a claim already on screen is not repeated',
  parseFactChecks(json([good]), { ...d, checked: [good.claim] }, { grounded: true }).length === 0);

// Sources ride the grounded path only. An ungrounded flag carrying links
// would tell the audience it was checked against something it was not.
const sourced = parseFactChecks(json([good]), d, { grounded: true, sources: [{ title: 'Fed', url: 'https://example.org' }] });
t('grounded flags carry their sources', sourced[0].sources.length === 1 && sourced[0].grounded === true);
const unsourced = parseFactChecks(json([{ ...good, confidence: 0.95 }]), d, { grounded: false, sources: [{ title: 'Fed', url: 'https://example.org' }] });
t('ungrounded flags carry none', unsourced[0].sources.length === 0 && unsourced[0].grounded === false);

// ── the second opinion ──────────────────────────────────────────────
// Written against a real failure: run against a deliberately ACCURATE
// speech, the first pass returned two cards at 0.93 and 0.98 confidence,
// one of which moved a correct 1991 date to 1997 and called the speaker
// false. Nothing reaches an audience on one pass.
const two = [{ quote: 'a', correction: 'b' }, { quote: 'c', correction: 'd' }];
t('only what the verifier upholds survives',
  applyVerification('{"verdicts":[{"i":0,"publish":true},{"i":1,"publish":false}]}', two).length === 1);
t('the survivor is the right one',
  applyVerification('{"verdicts":[{"i":0,"publish":false},{"i":1,"publish":true}]}', two)[0].quote === 'c');
t('a missing verdict is a refusal', applyVerification('{"verdicts":[{"i":0,"publish":true}]}', two).length === 1);
t('an unparseable second opinion publishes nothing', applyVerification('who knows', two).length === 0);
t('malformed JSON publishes nothing', applyVerification('{"verdicts":', two).length === 0);
t('a verdict list of the wrong shape publishes nothing', applyVerification('{"ok":true}', two).length === 0);
t('"publish" must be exactly true, not truthy',
  applyVerification('{"verdicts":[{"i":0,"publish":"yes"},{"i":1,"publish":1}]}', two).length === 0);
const vp = verifyPrompt({ motion: 'THW x' }, two);
t('the verifier is told to refute', /REFUTE/.test(vp.system));
t('the verifier defaults to refusing', /DEFAULT TO REFUSING/.test(vp.system));
t('the verifier knows it rules on the card, not the speaker', /ruling on the CARD/.test(vp.system));
t('an existence denial is upholdable', /DOES NOT EXIST/.test(vp.system));
t('an unverifiable replacement figure kills the card', /cannot confirm the replacement|replacement figure you cannot confirm/.test(vp.system));
t('the candidates reach the verifier', vp.user.includes('SPEAKER SAID') && vp.user.includes('b'));

// ── the prompt ──────────────────────────────────────────────────────
// These strings are the difference between a checker and a heckler. If
// one goes missing the surface starts flagging predictions and framing,
// which is the product arguing with its own users.
const grounded = factCheckPrompt(d, true);
const blind = factCheckPrompt(d, false);
t('never judges', /NOT a judge/.test(grounded.system) && /never say who is winning/.test(grounded.system));
t('predictions are out of scope', /predictions/.test(grounded.system));
t('value claims are out of scope', /value claims/.test(grounded.system));
t('rounding is out of scope', /rhetorical rounding|approximate/.test(grounded.system));
t('a garbled mic is not a lie', /transcription error|misheard/.test(grounded.system));
t('vocabulary is not a fact', /terminology|Correcting vocabulary/.test(grounded.system));
t('the would-they-conclude-differently test is stated', /DIFFERENT conclusion/.test(grounded.system));
t('silence is the normal answer', /Returning nothing is the normal answer/.test(grounded.system));
t('the quote rule is stated as non-negotiable', /non-negotiable/.test(grounded.system));
t('the grounded checker is told it can search', /You can search/.test(grounded.system));
t('the blind checker is told it cannot', /You cannot search/.test(blind.system));
t('the speech reaches the model', grounded.user.includes(SPEECH));
t('what is already on screen is passed back',
  factCheckPrompt({ ...d, checked: ['a prior claim'] }, true).user.includes('a prior claim'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
