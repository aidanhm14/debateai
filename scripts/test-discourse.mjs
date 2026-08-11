// Guards on the live-discourse block (lib/discourse-match.mjs).
// Runs in the pre-commit hook. Pure module, no network, no Firestore.
//
// Three of these are load-bearing rather than nice-to-have:
//   1. The judge must never see the block. A ballot informed by what X
//      thinks about the motion violates the judge charter.
//   2. The "not evidence" guardrail must survive. Without it the model
//      treats popular phrasing as true claims and starts citing posts.
//   3. A weak topical match must produce NOTHING. An unrelated fault
//      line does not get ignored by a model, it gets used.

import {
  DISCOURSE_FEATURES, MIN_SCORE, tokens, scoreMatch, bestMatch,
  renderBlock, buildDiscourseBlock,
} from '../app/netlify/functions/lib/discourse-match.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL:', label); }
};

const AI_LINE = {
  headline: 'Whether open-weight AI models should face the same pre-release government review as closed models',
  summary: 'A draft framework exempts open weights while capturing closed frontier models.',
  sideA: { label: 'Capability not format', phrasing: ['a dangerous model is dangerous however you ship it'] },
  sideB: { label: 'Open weights exemption', phrasing: ['licensing crushes small developers'] },
  vocabulary: ['open-weight', 'pre-release review', 'frontier labs', 'jailbreak', 'licensing'],
  actors: ['Anthropic', 'Meta', 'NTIA'],
};

const HOUSING_LINE = {
  headline: 'Whether upzoning actually lowers rents in supply constrained cities',
  summary: 'New construction data is being read both ways.',
  sideA: { label: 'Supply', phrasing: ['build more housing'] },
  sideB: { label: 'Tenant protection', phrasing: ['upzoning is a giveaway to developers'] },
  vocabulary: ['upzoning', 'filtering', 'rent stabilization'],
  actors: ['Minneapolis', 'Auckland'],
};

const LINES = [AI_LINE, HOUSING_LINE];

// ── 1. The judge is excluded, permanently ────────────────────────────
for (const judgeFeature of ['judge', 'judging', 'ballot', 'rfd', 'adjudicate']) {
  ok(!DISCOURSE_FEATURES.has(judgeFeature), `judging feature "${judgeFeature}" must not be allowed`);
  ok(
    buildDiscourseBlock({
      motion: 'THW require open-weight AI models to pass pre-release review.',
      feature: judgeFeature,
      faultLines: LINES,
    }) === '',
    `buildDiscourseBlock must return '' for judging feature "${judgeFeature}"`
  );
}
ok(DISCOURSE_FEATURES.has('case'), 'case generation should be allowed');
ok(DISCOURSE_FEATURES.has('rebuttal'), 'rebuttal should be allowed');

// ── 2. Matching actually fires on a real motion ──────────────────────
const realMotion = 'THW require open-weight AI models to undergo the same pre-release review as closed models.';
const block = buildDiscourseBlock({ motion: realMotion, feature: 'case', faultLines: LINES });
ok(block !== '', 'a clearly on-topic motion must produce a block');
ok(block.includes('LIVE DISCOURSE'), 'block carries its header');
ok(block.includes(AI_LINE.headline), 'block carries the matched headline');
ok(bestMatch(realMotion, LINES) === AI_LINE, 'best match is the AI line, not housing');

// Matching on vocabulary/actors alone, without headline words.
const obliqueMotion = 'THBT the NTIA should treat jailbreak resistance as a licensing condition.';
ok(bestMatch(obliqueMotion, LINES) === AI_LINE, 'vocabulary and actor overlap alone should match');

// ── 3. A weak match produces NOTHING ─────────────────────────────────
const unrelated = 'THW abolish the monarchy.';
ok(bestMatch(unrelated, LINES) === null, 'an unrelated motion must not match');
ok(
  buildDiscourseBlock({ motion: unrelated, feature: 'case', faultLines: LINES }) === '',
  'an unrelated motion must produce no block'
);

// Motion boilerplate alone must never clear the bar. Every fault line
// headline starts "Whether ...", and if "would"/"house"/"should" scored,
// every motion would match every fault line.
const boilerplateOnly = 'This house believes that.';
ok(bestMatch(boilerplateOnly, LINES) === null, 'motion boilerplate alone must not match');

// The fixture must CONTAIN the boilerplate words, or this proves nothing:
// scoring "would" against a headline that never says "would" passes even
// with the stoplist deleted. Real headlines say "should" constantly.
const BOILERPLATE_TRAP = {
  headline: 'Whether this house should believe that the government would resolve it',
  vocabulary: ['house', 'would', 'should'],
  actors: ['That House'],
};
ok(scoreMatch(tokens('This house would. THBT resolved that.'), BOILERPLATE_TRAP) === 0,
   'stopwords must contribute exactly zero even when the headline contains them');
ok(bestMatch('This house would believe that.', [BOILERPLATE_TRAP]) === null,
   'a pure-boilerplate motion must not match a boilerplate-heavy headline');

// ── 4. Empty and malformed inputs degrade to '' ──────────────────────
ok(buildDiscourseBlock({ motion: realMotion, feature: 'case', faultLines: [] }) === '', 'no fault lines -> no block');
ok(buildDiscourseBlock({ motion: '', feature: 'case', faultLines: LINES }) === '', 'no motion -> no block');
ok(buildDiscourseBlock({ motion: realMotion, feature: '', faultLines: LINES }) === '', 'no feature -> no block');
ok(buildDiscourseBlock({}) === '', 'empty args -> no block');
ok(bestMatch(realMotion, [{ vocabulary: ['x'] }]) === null, 'a headline-less fault line is skipped');
ok(renderBlock(null) === '', 'renderBlock(null) -> empty');
ok(renderBlock({ headline: '' }) === '', 'renderBlock with no headline -> empty');

// ── 5. The guardrail text survives ───────────────────────────────────
// Each of these is a specific failure that happens when the line is gone.
ok(block.includes('NOT evidence'), 'guardrail: block must say this is not evidence');
ok(block.includes('not a warrant'), 'guardrail: block must deny platform popularity as warrant');
ok(block.includes('Never say "people on X are saying"'), 'guardrail: block must forbid citing the platform');
ok(block.includes('outrank everything here'), 'guardrail: format and voice rules must be stated to win');
ok(block.includes('strongest version of the opposing phrasing'), 'block must direct engagement with the best opposing case');

// ── 6. Threshold is where we think it is ─────────────────────────────
ok(MIN_SCORE >= 5, 'MIN_SCORE must stay at 5 or above; lowering it lets noise through');
// One lone vocabulary hit (worth 2) must not be enough on its own.
const oneHit = { headline: 'Whether zzz', vocabulary: ['upzoning'], actors: [] };
ok(scoreMatch(tokens('THW permit upzoning.'), oneHit) < MIN_SCORE, 'a single vocabulary hit must not clear the bar');

console.log(`\ndiscourse: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
