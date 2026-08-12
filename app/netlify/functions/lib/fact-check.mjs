// ────────────────────────────────────────────────────────────────────────
// LIVE FACT CHECK
//
// The AI listens to a speech as it is delivered and tells the AUDIENCE when
// a speaker states something that is flatly, checkably wrong. It is not a
// scorer and not a judge: it never says who is winning, never grades the
// argument, and the ballot never reads it. A false statistic that goes
// unchallenged in the room is the audience's problem, not the flow's.
//
// THE BAR IS DELIBERATELY HIGH. Live speech is compressed, rounded, and
// transcribed by a mic that mishears numbers. A checker that fires on every
// loose figure would put a red card on the screen every thirty seconds and
// the audience would stop reading it by the second speech. So this only
// speaks up for the two failures an audience genuinely cannot catch alone:
//
//   false      the record says the opposite, or the event never happened
//   distorted  real thing, stated so wrong it misleads: off by an order of
//              magnitude, wrong country, wrong court, wrong author
//
// Everything else is silence, and silence is the expected answer for most
// speeches. Predictions, values, analogies, contested expert opinion and
// ordinary rhetorical rounding are all things a debate is FOR. Flagging
// them would make the checker a participant in the round.
//
// IT TAKES TWO PASSES, and that is not belt and braces. Measured against a
// deliberately accurate speech, a single pass returned two cards at 0.93
// and 0.98 confidence, one of which moved a correct 1991 date to 1997 and
// called the speaker false. So a candidate is only a card once a second
// call has tried to refute it and failed. See verifyPrompt below.
//
// THE QUOTE GATE IS LOAD-BEARING, same discipline as the clash map. Every
// flag carries a verbatim quote, and `parseFactChecks` verifies it against
// the transcript the speaker actually produced. A flag whose quote is not
// in the transcript is DROPPED, no exceptions. Broadcasting "they said X,
// and X is false" when nobody said X is worse than saying nothing at all,
// and it is the one failure that would cost the surface its credibility on
// the first round it ships.
//
// GROUNDED VS NOT. Perplexity (sonar-pro) is the primary checker because it
// reads live sources and returns them, so a flag arrives with links the
// audience can open. When PERPLEXITY_API_KEY is missing we fall back to
// Claude working from model knowledge alone, with a higher confidence bar,
// and the flag is marked `grounded: false` so the card can say so. An
// unsourced claim about someone else's unsourced claim earns a label.
// ────────────────────────────────────────────────────────────────────────

// This file imports NOTHING so it stays testable without the Firestore SDK
// or any network client. The endpoint passes in whatever it fetched.

export const MAX_FLAGS_PER_PASS = 2;      // one card at a time reads; four is noise
const MIN_QUOTE_CHARS = 12;               // shorter "quotes" match half the speech
const MAX_QUOTE_CHARS = 240;
const MIN_CONFIDENCE_GROUNDED = 0.8;
const MIN_CONFIDENCE_UNGROUNDED = 0.9;    // no sources to show, so be surer
const SEVERITIES = new Set(['false', 'distorted']);

// Normalize for substring matching. The model retypes the quote and the mic
// drifts on punctuation and casing, so compare on letters, digits and
// single spaces only. Same function as clash-map.mjs, duplicated rather
// than imported so neither file owns the other's parsing.
//
// KNOWN LIMIT, and it fails in the safe direction: this strips everything
// outside a-z0-9, so a Devanagari or Cyrillic quote normalizes to an empty
// string and its flag is dropped. A round debated in Hindi therefore gets
// no fact checks rather than unverified ones. Widening the character class
// is the fix when a non-Latin round needs this; leaving the gate open for
// scripts it cannot verify is not.
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// The nit gate, and it is here because the prompt could not hold the line
// on its own. Measured against a real speech, the checker twice wanted to
// card "wage theft in 84% of restaurants" with the correction "violations
// in 83.8%" at 0.97 confidence: the figure is right, the point stands, and
// the card is a vocabulary correction wearing a fact check's clothes.
//
// So a "distorted" flag whose correction restates the SAME figures is
// dropped. Restated means every number in the correction sits within 10%
// of a number in the quote, with years compared exactly (2019 and 2022 are
// three years apart, not 0.1% apart, and that difference is the whole
// claim). A "false" verdict is never subject to this: "the record says the
// opposite" is not a rounding argument, and it can legitimately repeat the
// speaker's own date back at them while denying what happened on it.
// Spelled-out numbers have to count, because they are the normal case on
// the side that matters. The correction is typed by a model and arrives as
// "83.8%"; the quote is a live transcript of someone SAYING it, and both
// the mic and the model transcribe spoken figures as words often enough
// that a digits-only gate abstains on exactly the flags it exists to stop.
const WORD_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const WORD_MULT = { hundred: 100, thousand: 1000, million: 1e6, billion: 1e9, trillion: 1e12 };

// Walks the words once, accumulating a run of number words into a value.
// A tens word following another tens word ends the run ("twenty twenty
// three" is a spoken year, not 43), so those emit separately and the gate
// simply abstains on them rather than guessing.
function spelledNumbers(s) {
  const words = String(s || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const out = [];
  let cur = null, lastTens = false;
  const flush = () => { if (cur !== null) out.push(cur); cur = null; lastTens = false; };
  for (const w of words) {
    if (w in WORD_NUM) {
      const v = WORD_NUM[w];
      const isTens = v >= 20 && v % 10 === 0;
      if (cur === null) { cur = v; lastTens = isTens; continue; }
      if (isTens || !lastTens) { flush(); cur = v; lastTens = isTens; continue; }
      cur += v; lastTens = false;            // "eighty" + "four"
      continue;
    }
    if (w in WORD_MULT) { cur = (cur === null ? 1 : cur) * WORD_MULT[w]; lastTens = false; continue; }
    if (w === 'a' || w === 'point' || w === 'percent') continue;   // harmless connectors
    flush();
  }
  flush();
  return out;
}

function numbersIn(s) {
  const digits = (String(s || '').match(/\d[\d,]*(?:\.\d+)?/g) || [])
    .map(n => parseFloat(n.replace(/,/g, '')))
    .filter(n => !isNaN(n));
  return digits.concat(spelledNumbers(s));
}
const isYear = (n) => Number.isInteger(n) && n >= 1000 && n <= 2999;
function sameNumber(a, b) {
  if (isYear(a) && isYear(b)) return a === b;
  return Math.abs(a - b) <= 0.1 * Math.max(Math.abs(a), Math.abs(b));
}
// "No source supports a forty percent collapse" has to repeat the figure
// in order to deny it, so by arithmetic alone it looks like a restatement.
// It is the opposite: the strongest kind of flag, a number with nothing
// behind it. Existence denials skip the gate. Note this is deliberately
// narrow, matching a missing SOURCE and not any "not" — "violations in
// 83.8%, not 84%" is the nit this gate exists to stop.
const DENIES_EXISTENCE =
  /\bno\s+(?:\w+\s+){0,2}(?:evidence|source|sources|record|records|data|basis|case|ruling|study|studies|such)\b|\bdoes not exist\b|\bdid not (?:happen|occur|exist)\b|\bnever (?:happened|occurred|existed|ruled)\b|\bunsupported\b|\bnot established\b|\bno such\b/i;

export function isNumericRestatement(quote, correction) {
  if (DENIES_EXISTENCE.test(String(correction || ''))) return false;
  const q = numbersIn(quote);
  const qHasYear = q.some(isYear);
  // A year in the correction that the speaker never gave is context, not
  // the correction ("violations in its 2021 investigations"). Counting it
  // as a figure that failed to match is how one stray date smuggled the
  // 84-versus-85 card back through this gate.
  const c = numbersIn(correction).filter(n => !isYear(n) || qHasYear);
  // Nothing to compare on either side: this gate has no opinion, keep it.
  if (!q.length || !c.length) return false;
  return c.every(n => q.some(m => sameNumber(n, m)));
}

const RULES = [
  'You are the live fact-checker on a competitive debate broadcast. You are NOT a judge.',
  'You never say who is winning, never grade an argument, never score anyone, and never take a side on the motion.',
  'You speak to the AUDIENCE, and only when a speaker states something that is flatly, checkably wrong.',
  '',
  'CHECK ONLY verifiable statements of fact: numbers and statistics, dates, whether an event happened, what a law or ruling says, who said or did a thing, what a named study found.',
  '',
  'NEVER FLAG any of the following, whatever you think of them:',
  '- predictions, forecasts, and claims about what would happen under a counterfactual',
  '- value claims, moral claims, and claims about what matters more',
  '- analogies, hypotheticals, thought experiments, and framing',
  '- policy analysis and causal argument, however shaky the reasoning',
  '- anything credible sources genuinely disagree about, including live estimates that vary by methodology',
  '- rhetorical rounding a listener would read as approximate ("about half", "nearly every", "billions")',
  '- garbled or nonsensical wording. This is live speech-to-text. Assume the mic misheard, not that the speaker lied.',
  '- wording and terminology. If the figure and the direction are right, a different word for the same thing is not a flag ("wage theft" for violations, "cut" for slowed growth, "banned" for restricted). Correcting vocabulary is heckling, not checking.',
  '',
  'THE TEST, apply it to every candidate before you write it down: would someone listening reach a DIFFERENT conclusion about this round if they knew? If they would land in the same place either way, say nothing.',
  '',
  'FLAG ONLY when the statement is wrong by a wide margin, at the level an audience could not catch on its own:',
  '- "false": the record says the opposite, or the event simply did not happen',
  '- "distorted": the underlying thing is real but the statement misleads badly. Off by an order of magnitude or more, wrong country, wrong court, wrong decade, wrong author, a study made to say something it did not find.',
  'A figure that is merely imprecise, stale, or at the edge of a plausible range is NOT a flag. Let it go.',
  '',
  'QUOTE RULE, non-negotiable: "quote" must be copied VERBATIM from the speech below, word for word, including any transcription errors. Do not clean it up, do not paraphrase, do not stitch together words from two places. Quote 6 to 30 words. A quote that is not in the speech is thrown away.',
  '',
  'Write for a listener watching a round, not for a wire service. "correction" is one sentence, at most 25 words, stating what is actually true. No preface, no "actually", no scolding, no em-dashes.',
  '',
  'Returning nothing is the normal answer. Most speeches contain no flag. An empty list is a successful check, not a failure.',
];

const SCHEMA =
  'Return STRICT JSON and nothing else: ' +
  '{"flags":[{"quote":"verbatim from the speech","claim":"<=100 chars, what they asserted, plainly","correction":"<=25 words, what is true","severity":"false"|"distorted","confidence":0.0-1.0}]}. ' +
  `At most ${MAX_FLAGS_PER_PASS} flags, the most consequential first. confidence is how sure you are the statement is wrong, not how sure you are it matters. ` +
  'If nothing meets the bar, return {"flags":[]}.';

/**
 * Build the checker prompt for one pass over one in-progress speech.
 *
 * @param {object} d
 * @param {string} d.motion    the resolution, for context only
 * @param {string} d.format    format name ("British Parliamentary")
 * @param {string} d.speaker   speaker's display name
 * @param {string} d.side      side label as the audience sees it
 * @param {string} d.text      the speech so far, verbatim
 * @param {string[]} d.checked claims already on screen, so we do not repeat
 * @param {boolean} grounded   true when the checker can read live sources
 */
export function factCheckPrompt(d, grounded) {
  const system = RULES.concat(
    grounded
      ? ['', 'You can search. Check the specific statement against current sources before you flag it. If a search does not settle it, that is a reason not to flag.']
      : ['', 'You cannot search. Flag only what you are certain of from your own knowledge. If the statement turns on anything recent, or on a number you would want to look up, do not flag it.'],
    ['', SCHEMA],
  ).join('\n');

  const already = (d.checked || []).filter(Boolean).slice(0, 12);
  const user = [
    'MOTION: ' + (d.motion || '(not given)'),
    'FORMAT: ' + (d.format || 'debate'),
    'SPEAKER: ' + (d.speaker || 'the current speaker') + (d.side ? ' (' + d.side + ')' : ''),
    already.length
      ? '\nALREADY ON SCREEN, do not repeat these or restate them differently:\n' + already.map(c => '- ' + c).join('\n')
      : '',
    '\nSPEECH SO FAR (live transcript, may cut off mid-sentence):\n"""\n' + (d.text || '') + '\n"""',
    '\nCheck it now.',
  ].filter(Boolean).join('\n');

  return { system, user };
}

// ── The second opinion, and it is not optional ──────────────────────────
//
// One pass is not safe enough to put on a screen. Measured against a
// deliberately ACCURATE speech, the first pass returned two cards at 0.93
// and 0.98 confidence: it moved a correct 1991 date to 1997 and called the
// speaker false, and it argued seven states versus eight. A checker that
// invents a correction is worse than no checker, because the audience has
// no way to tell which of the two is wrong and the house is the one with a
// microphone.
//
// So every candidate goes to a fresh call whose job is to REFUTE it, and
// the default is refusal: a flag stands only if the speaker is genuinely
// wrong AND the correction is itself right AND knowing it would change
// what a listener concludes. Anything the verifier cannot settle dies.
// This is the same posture as the judge panel's adversarial pass, for the
// same reason: the cost of a wrong card is paid by someone else.
export function verifyPrompt(d, flags) {
  const system = [
    'You are the second opinion on a live debate fact check. Your job is to REFUTE, not to agree.',
    'For each candidate below, three things must ALL be true for it to stand:',
    '1. The speaker\'s statement is genuinely wrong. Not imprecise, not phrased oddly, wrong.',
    '2. The proposed correction is itself accurate. A correction that ASSERTS a competing fact must be one you can confirm right now; if you cannot confirm the replacement date, figure or ruling, the candidate dies even when the original also looks shaky.',
    '   The exception, and it matters: a correction that says the thing DOES NOT EXIST is confirmed by looking and finding nothing. A case, study, agency finding or law that a real search does not surface is not a thing you failed to verify, it is a thing that is not there. Uphold those.',
    '3. A listener would conclude something different about this round if they knew.',
    '',
    'Refuse a candidate when: the speaker was substantially right; the correction restates the speaker in other words; the disagreement is terminology; the numbers differ by a rounding; sources disagree with each other; the correction asserts a replacement figure you cannot confirm; or you are simply unsure.',
    'DEFAULT TO REFUSING. Dropping a true flag costs the audience one fact. Publishing a false one costs the round its credibility.',
    '',
    'Return STRICT JSON and nothing else: {"verdicts":[{"i":0,"why":"<=140 chars, what you checked and what you found","publish":true|false}]}. One entry per candidate, in order.',
    '"publish": true means PUT THIS CARD ON SCREEN, because the speaker got it wrong and the correction is right. false means show nothing. You are ruling on the CARD, not on the speaker: finding that the speaker was wrong is a reason to publish.',
    'Write "why" BEFORE deciding "publish". A verdict you cannot give a reason for is a refusal.',
  ].join('\n');
  const user = 'MOTION: ' + (d.motion || '') + '\n\nCANDIDATES:\n' +
    flags.map((f, i) =>
      i + '. SPEAKER SAID: "' + f.quote + '"\n   PROPOSED CORRECTION: ' + f.correction).join('\n') +
    '\n\nRule on each one.';
  return { system, user };
}

// Fails closed by design. An unparseable or short verdict list means we do
// not know, and not knowing is silence.
export function applyVerification(text, flags) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return [];
  let j;
  try { j = JSON.parse(m[0]); } catch (_) { return []; }
  const verdicts = Array.isArray(j.verdicts) ? j.verdicts : null;
  if (!verdicts) return [];
  return flags.filter((_, i) => {
    const v = verdicts.find(x => x && Number(x.i) === i);
    return !!(v && v.publish === true);
  });
}

/**
 * Validate a checker response against the speech it claims to describe.
 *
 * Drops, individually and silently: unparseable rows, severities we do not
 * broadcast, low confidence, and above all any quote that is not actually
 * in the transcript. Returns [] when nothing survives, which callers treat
 * the same as "the speech was clean" — from the audience's side those are
 * the same event.
 */
export function parseFactChecks(text, d, opts) {
  const grounded = !!(opts && opts.grounded);
  const sources = (opts && Array.isArray(opts.sources) ? opts.sources : []).slice(0, 3);
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return [];

  let j;
  try { j = JSON.parse(m[0]); } catch (_) { return []; }
  const raw = Array.isArray(j.flags) ? j.flags : [];
  if (!raw.length) return [];

  const hay = norm(d.text);
  const seenBefore = new Set((d.checked || []).map(c => norm(c).slice(0, 60)));
  const minConf = grounded ? MIN_CONFIDENCE_GROUNDED : MIN_CONFIDENCE_UNGROUNDED;
  const out = [];
  const seen = new Set();

  for (const f of raw) {
    if (out.length >= MAX_FLAGS_PER_PASS) break;
    const quote = String((f && f.quote) || '').trim().slice(0, MAX_QUOTE_CHARS);
    const claim = String((f && f.claim) || '').trim().slice(0, 100);
    const correction = String((f && f.correction) || '').trim().slice(0, 220);
    const severity = f && SEVERITIES.has(f.severity) ? f.severity : null;
    const confidence = typeof (f && f.confidence) === 'number' ? f.confidence : 0;
    if (!quote || !claim || !correction || !severity) continue;
    if (confidence < minConf) continue;
    if (severity === 'distorted' && isNumericRestatement(quote, correction)) continue;

    // The gate. An invented quote is the one failure this surface cannot
    // absorb, so it is checked against the transcript, not trusted.
    const nQuote = norm(quote);
    if (nQuote.length < MIN_QUOTE_CHARS || !hay.includes(nQuote)) continue;

    const key = nQuote.slice(0, 60);
    if (seen.has(key) || seenBefore.has(norm(claim).slice(0, 60))) continue;
    seen.add(key);

    // A card whose finding is "this does not exist" has nothing to cite,
    // and the search results from that pass are whatever the topic threw
    // up. Shipped once and it read badly: a denial of a US Supreme Court
    // case carried three links to UK tipping legislation under the words
    // "checked against", which invites the audience to open a source that
    // says nothing about the claim. Absence flags carry no links and say
    // what actually happened instead.
    const absence = DENIES_EXISTENCE.test(correction);
    out.push({
      quote, claim, correction, severity,
      confidence: Math.round(confidence * 100) / 100,
      grounded, absence,
      sources: (grounded && !absence) ? sources : [],
    });
  }
  return out;
}
