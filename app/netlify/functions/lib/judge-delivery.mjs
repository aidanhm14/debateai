// ────────────────────────────────────────────────────────────────────────
// JUDGE DELIVERY — how the ballot is SAID and how LONG it runs.
//
// Two controls, added 2026-08-23 after a user reported the judge read as
// too mean. Neither one touches adjudication. lib/adjudication.mjs is the
// method: what the tests are, how the weighing is ordered, what earns a
// speaker point. This module is the register and the word count, which is
// the one thing the core deliberately leaves to the surfaces.
//
// THE WALL, and it is the entire reason this file is separate from the
// core rather than a few extra lines inside it:
//
//   MANNER CHANGES WORDING. IT NEVER CHANGES THE CALL, THE POINTS, OR
//   WHICH FLAWS GET NAMED.
//
// A kind ballot and a brutal ballot must reach the same winner, the same
// numbers, and the same list of things that went wrong. They differ in
// how a person is spoken to while being told. The moment "kind" starts
// rounding a 62 up to a 70, or quietly dropping the third criticism, the
// control has become a thumb on the scale that the debater on the other
// side never agreed to, and speaker points stop being comparable across
// the leaderboard because two ballots on the same scale would mean
// different things.
//
// The founder's own line when this was specified, and it is the design
// in one sentence: "but its good to rate low speeches low."
//
// This is the same shape as the /brain block's two hard limits (see
// lib/brain-schema.mjs): a model told "be kind" with no ceiling starts
// conceding, and the one thing this product sells is a judge that does
// not. So the ceiling is written into the prompt, and
// scripts/test-judge-delivery.mjs asserts the strings survive.
//
// Values are ALLOW-LISTED, never free text. Both fields arrive from a
// client, get concatenated into a judging system prompt, and an unknown
// value is DROPPED to the default rather than passed through, so this
// cannot become a prompt-injection channel into the ballot.
// ────────────────────────────────────────────────────────────────────────

export const DEFAULT_MANNER = 'plain';
export const DEFAULT_DETAIL = 'medium';

// The line every manner is written against. Kept as its own constant so
// the test can assert it appears whichever manner is selected, and so a
// future manner cannot be added without it.
export const MANNER_FLOOR = [
  'MANNER GOVERNS WORDING ONLY. It does not change the winner, the ranking, the speaker points, or which flaws you name. Every criticism you would make in any other manner, you still make in this one.',
  'Do NOT go easier. A weak speech scores low in every manner, and a low score is stated plainly rather than hidden. Encouraging language is never a reason to round a number up, to omit a flaw, or to soften the call itself.',
  'Do NOT manufacture harshness either. Severity is earned by what happened in the round, so never add a criticism to sound tough, and never mark a speaker down to match a register.',
].join('\n');

export const MANNERS = {
  kind: {
    name: 'Kind',
    short: 'Same call, gentler words',
    description: 'The same verdict and the same numbers, delivered the way a coach who wants you back next week would say it.',
    prompt: [
      'MANNER: kind. Write to a debater who is going to read this on their phone straight after losing.',
      'Lead each criticism with what the move was TRYING to do before you say why it failed, so the debater can tell you understood their round.',
      'Name the fix in the same breath as the fault: not "no weighing", but "this needed one line saying why your impact beats theirs, and it was available to you".',
      'Find the genuinely strong moment on each side and say it in specific terms. Not praise for its own sake, praise you can point at.',
      'Plain, warm, human sentences. No sarcasm, no dunking, no rhetorical questions aimed at the debater.',
    ].join('\n'),
  },
  plain: {
    name: 'Straight',
    short: 'Neutral tournament register',
    description: 'How a good chair writes a ballot: direct about what happened, neither warm nor cold.',
    prompt: [
      'MANNER: straight. The neutral register of a competent tournament chair.',
      'Technical and unsentimental. Describe what happened and what it cost, without either cushioning it or sharpening it.',
      'No praise you cannot point at, and no needling. The reasoning carries the ballot.',
    ].join('\n'),
  },
  blunt: {
    name: 'Brutal',
    short: 'Says it hard',
    description: 'Cuts straight to what failed. Same verdict, no cushioning at all.',
    prompt: [
      'MANNER: brutal. Say the hard thing first and do not cushion it.',
      'Open each ruling with the failure itself, in the shortest sentence that is accurate. No lead-in, no compliment sandwich, no softening qualifier.',
      'Call a gap a gap. If a case never discharged its burden, say so in those words rather than calling it underdeveloped.',
      'Still not contempt. Attack the argument, never the person: no mockery, no comment on intelligence or on whether they belong in the activity, nothing about how they sound. A debater must be able to show this ballot to a coach.',
    ].join('\n'),
  },
};

// Length. `deep` is whether the surface should run its second-beat full
// ballot at all (see the 2026-08-18 decision): on 'short' the verdict
// stands alone, which is the point of asking for short.
export const DETAILS = {
  short: {
    name: 'Short',
    short: 'The call and the reason',
    description: 'A tight ballot: what decided it, what it turned on, and the one fix. No full write-up.',
    deep: false,
    words: [110, 190],
    prompt: [
      'LENGTH: short. Target 110 to 190 words for the reason for decision.',
      'Cut to the deciding issue, the test that settled it, and the single change that flips it. Drop the tour of every clash.',
      'Short is a budget on words, never on rigour: the deciding issue is still named, the resolution is still explained, and the one thing that flips it still appears. A short ballot that only announces a winner is a failed ballot at any length.',
    ].join('\n'),
  },
  medium: {
    name: 'Medium',
    short: 'The standard ballot',
    description: 'The usual ballot: the deciding issue, the main clashes, the drops that mattered, and fixes.',
    deep: true,
    words: [700, 1100],
    prompt: [
      'LENGTH: medium. Cover the deciding issue, each clash that carried weight, the drops that mattered, and one concrete fix per side.',
      'Depth comes from covering more of the flow, never from restating a ruling you already made.',
    ].join('\n'),
  },
  extensive: {
    name: 'Extensive',
    short: 'Everything, argument by argument',
    description: 'Walks every argument either side ran, with quotes, the full weighing, and per-speaker notes.',
    deep: true,
    words: [1400, 2200],
    prompt: [
      'LENGTH: extensive. Walk EVERY substantive argument either side ran, one at a time, including the small ones.',
      'For each: state it the way its side ran it, trace what happened to it across later speeches, rule who won it, and quote the line that settled it.',
      'Extensive means more of the round covered, not the same rulings said again at greater length. If you find yourself restating, you have run out of round and should stop.',
    ].join('\n'),
  },
};

// Unknown ids are DROPPED to the default rather than defaulted through a
// coerced string, because a value nobody chose should never assert
// something about how a real ballot was delivered.
export function normalizeManner(v) {
  const k = String(v || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(MANNERS, k) ? k : DEFAULT_MANNER;
}

export function normalizeDetail(v) {
  const k = String(v || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(DETAILS, k) ? k : DEFAULT_DETAIL;
}

// Does this (detail) want the second-beat full ballot? Surfaces call this
// instead of testing the string, so 'short' can never be half-honoured:
// a short ballot followed by a 1200-word one is not a short ballot.
export function wantsFullBallot(detail) {
  return DETAILS[normalizeDetail(detail)].deep;
}

export function detailWords(detail) {
  return DETAILS[normalizeDetail(detail)].words.slice();
}

// The block appended to a judging system prompt. Manner floor FIRST, then
// the manner, so the ceiling is read before the register that might
// otherwise be taken as licence to move a number.
export function deliveryBlock(opts = {}) {
  const manner = normalizeManner(opts.manner);
  const detail = normalizeDetail(opts.detail);
  return [
    'DELIVERY — how this ballot is written. It does not change how it is decided.',
    MANNER_FLOOR,
    MANNERS[manner].prompt,
    DETAILS[detail].prompt,
  ].join('\n\n');
}

// Read the private routing fields off a request body and strip them, the
// same contract lib/adjudication.mjs uses for _feature. Returns the
// normalized pair so a caller can stamp it on the record: a ballot should
// be able to say how it was delivered, and a field the client sent is not
// evidence of that once it has been through the allow-list.
export function takeDelivery(body) {
  if (!body || typeof body !== 'object') {
    return { manner: DEFAULT_MANNER, detail: DEFAULT_DETAIL };
  }
  const manner = normalizeManner(body._judgeManner);
  const detail = normalizeDetail(body._judgeDetail);
  delete body._judgeManner;
  delete body._judgeDetail;
  return { manner, detail };
}

export const MANNER_KEYS = Object.keys(MANNERS);
export const DETAIL_KEYS = Object.keys(DETAILS);
