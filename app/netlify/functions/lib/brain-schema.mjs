// The debate brain: SCHEMA, VALIDATION and PROMPT TEXT. Pure: no
// Firestore import, no IO, no clock. brain.mjs holds the reads and
// writes and re-exports everything here.
//
// The split exists so scripts/test-brain.mjs can import this without
// the Firestore SDK, the same reason judge-charter.mjs is pure. The
// allow-list below is a prompt-injection boundary, so it is the part
// that most needs to stay testable.
//
// WHERE IT LIVES AND WHY IT IS NOT prefs
// prefs-sync.js already mirrors the `da-brain-*` localStorage keys onto
// user_profiles/{uid}.prefs, which is genuinely per-user and survives a
// second device. It is the wrong shape to READ from, for three reasons:
// every value is wrapped in {v,t} for last-write-wins, the push is
// debounced ~1.8s behind the click so the round you start immediately
// after answering can miss it, and it only lands on pages where the
// Firebase SDK actually loaded. So the brain gets its own field,
// user_profiles/{uid}.brain, written server-side through the admin SDK
// on an explicit POST. prefs keeps mirroring the same keys and stays the
// cross-device merge for the CLIENT; this field is what the SERVER reads.
// They can disagree for a second or two after an edit and the newer POST
// always wins, because the POST is the thing the user just did.
//
// ANONYMOUS USERS ARE NOT STORED HERE, deliberately. Firebase anonymous
// accounts are free and unlimited to mint (see the 2026-07-28 rate-limit
// entry), so keying real storage to one invites junk documents at no cost
// to the writer. Anonymous visitors keep their brain in localStorage and
// it is uploaded on their first named sign-in, which is the moment the
// record becomes worth keeping.
//
// VALUES ARE ALLOW-LISTED, NOT SANITISED. Everything here is injected
// into a system prompt, so an open string field would be a prompt
// injection channel into every future round that user runs. Each field
// accepts a fixed set of ids and nothing else; an unknown id is dropped
// rather than coerced, so a client sending garbage degrades to a smaller
// brain instead of a compromised one.

// The six steps of /brain. Ids must match the option values in
// app/brain.html; the labels here are what the model actually reads, so
// this file is the one place the wording is decided.
export const BRAIN_FIELDS = {
  level: {
    'new': 'new to competitive debate',
    school: 'debates on a school team',
    circuit: 'a regular on the competitive circuit',
    elite: 'breaks at national level',
  },
  format: {
    quick: 'the general lay format',
    asian: 'Asian Parliamentary',
    wsdc: 'World Schools (WSDC)',
    bp: 'British Parliamentary',
    apda: 'APDA (American Parliamentary)',
    pf: 'Public Forum',
    ld: 'Lincoln Douglas',
    policy: 'Policy',
  },
  style: {
    evidence: 'wins on evidence: facts, studies, citations',
    framework: 'wins on framework: control the lens, control the round',
    weighing: 'wins on impact weighing: magnitude, probability, timeframe',
    clash: 'wins on clash: direct refutation and rebuttal',
    delivery: 'wins on delivery: persuasion and presence',
  },
  register: {
    surgical: 'calm and surgical',
    aggressive: 'relentless and high pressure',
    warm: 'warm and persuasive',
    technical: 'technical and line by line',
  },
  side: {
    prop: 'prefers Proposition',
    opp: 'prefers Opposition',
  },
  goal: {
    pressure: 'speaking under pressure',
    case: 'case construction',
    rebuttal: 'rebuttal',
    crossex: 'cross examination',
    adapt: 'reading and adapting to the judge',
  },
};

export const BRAIN_KEYS = Object.keys(BRAIN_FIELDS);

/**
 * Keep only recognised ids. Unknown values are DROPPED, not defaulted:
 * a default would silently assert something the user never chose, and a
 * brain that quietly invents your level is worse than one missing it.
 * `side` legitimately arrives as '' ("Surprise me"), which is an answer
 * and is stored as '' rather than treated as absent.
 */
export function sanitizeBrain(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of BRAIN_KEYS) {
    // OWN properties only. `input[key]` alone would read through the
    // prototype chain, so an object carrying a polluted prototype could
    // smuggle a value in without it ever appearing in the request body.
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const raw = input[key];
    if (raw === undefined || raw === null) continue;
    const v = String(raw);
    if (key === 'side' && v === '') { out.side = ''; continue; }
    if (Object.prototype.hasOwnProperty.call(BRAIN_FIELDS[key], v)) out[key] = v;
  }
  return out;
}

/** True when there is at least one real answer to inject. */
export function hasBrain(brain) {
  return !!brain && BRAIN_KEYS.some((k) => brain[k] !== undefined);
}

// Only debate-generation features get the block. The judge must never
// see it: a ballot that knows one debater is "new to competitive debate"
// or wants to work on rebuttal is a ballot with a thumb on the scale,
// and the judge charter is explicit that nothing about who the debater
// is may reach the decision. Same reason exemplars and distillations
// stop at this line.
const BRAIN_FEATURES = new Set([
  'case', 'tightblock', 'opp_attack', 'opponent', 'rebuttal', 'sneaky',
]);

/**
 * The system-prompt block, or '' when it does not apply.
 *
 * Framed as context with an explicit ceiling: it may set difficulty and
 * register, and it may NOT decide the substance of the round or soften
 * the opposition. Without that clause a model reading "new to
 * competitive debate" tends to start conceding, which turns the one
 * feature this product actually sells (an opponent that pushes back)
 * into a coach that agrees with you.
 */
export function renderBrainBlock(brain, feature) {
  if (!hasBrain(brain)) return '';
  if (feature && !BRAIN_FEATURES.has(feature)) return '';

  const lines = [];
  if (brain.level) lines.push(`Experience: ${BRAIN_FIELDS.level[brain.level]}.`);
  if (brain.format) lines.push(`Home format: ${BRAIN_FIELDS.format[brain.format]}.`);
  if (brain.style) lines.push(`Their strength: ${BRAIN_FIELDS.style[brain.style]}.`);
  if (brain.goal) lines.push(`Actively working on: ${BRAIN_FIELDS.goal[brain.goal]}.`);
  if (brain.register) lines.push(`They asked for an opponent who is ${BRAIN_FIELDS.register[brain.register]}.`);
  if (brain.side) lines.push(`Usual side: ${BRAIN_FIELDS.side[brain.side]}.`);
  if (!lines.length) return '';

  return [
    '',
    'THIS DEBATER',
    'What they told us about themselves. Use it to set difficulty, register,',
    'and which of their habits to test hardest.',
    ...lines,
    'Two hard limits. Do NOT go easier on them because of any of this: a',
    'weaker opponent is not a kindness and it is not what they asked for.',
    'And do NOT decide the substance of the round from it. The motion and',
    'what is actually said still decide every argument you make.',
    '',
  ].join('\n');
}
