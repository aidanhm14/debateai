// ────────────────────────────────────────────────────────────────────────
// THE CLASH MAP
//
// One structured artifact per round: for every argument a side raised,
// what the other side actually did with it. Four labels, borrowed from
// natural language inference over (claim, candidate response) pairs:
//
//   rebutted           the response contests the claim
//   conceded           the response accepts or restates it
//   self-contradiction the response contradicts the responder's own prior
//   dropped            nothing in their turn bears on it
//
// WHY THIS EXISTS, and the boundary that matters. Until now the judge's
// "who dropped what" reasoning happened inside one opaque LLM call, so a
// debater who disagreed with a ballot had nothing to point at. The map is
// the flow the decision was built on, rendered next to the verdict: a
// bettor reads it before settlement, a debater contests a specific row
// after it. It is NOT a scorer. It never computes a winner, never adjusts
// points, and the judge that reads it is told in the ballot prompt that it
// may be wrong. Adjudication stays with ADJUDICATION_CORE.
//
// Quote discipline is the anti-hallucination gate and it is load-bearing.
// Every row carries verbatim quotes, and `parseClashMap` verifies each one
// against the transcript of the side it is attributed to. A row whose quote
// does not appear is DROPPED — an invented quote in a surface whose whole
// promise is "check it yourself" is worse than a shorter map.
//
// Rows are dropped INDIVIDUALLY here, unlike the ballot's dimensions block
// which is all-or-nothing. Different artifacts: a partial scorecard reads
// as a lopsided verdict, while each clash row is independently rendered and
// independently contestable, so losing one costs nothing but coverage.
// ────────────────────────────────────────────────────────────────────────

// This file imports NOTHING. voice-guidelines.mjs pulls CLASH_DISCIPLINE
// from here and is itself imported by all six brain proxies, so an import
// of async-rounds.mjs would drag @netlify/blobs into every brain request
// for one lookup table. The caller passes the format name instead.

// Turn n → which side spoke it. Mirrors TURN_SPEC in async-rounds.mjs.
const TURN_SIDE = { 1: 'prop', 2: 'opp', 3: 'prop' };

export const CLASH_LABELS = new Set(['rebutted', 'conceded', 'self-contradiction', 'dropped']);

export const CLASH_LABEL_TEXT = {
  rebutted: 'Answered',
  conceded: 'Conceded',
  'self-contradiction': 'Contradicts their own',
  dropped: 'Dropped',
};

const MAX_CLASHES = 8;
const MIN_QUOTE_CHARS = 20;   // shorter "quotes" match half the transcript

// Normalize for substring matching. Whisper punctuation and casing drift
// between what the model retypes and what the transcript holds, so compare
// on letters, digits, and single spaces only.
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// One haystack per side: everything that side said across the round.
function sideTranscripts(d) {
  const out = { prop: [], opp: [] };
  for (const t of d.turns || []) {
    const side = TURN_SIDE[t.n];
    if (!side) continue;
    out[side].push(String(t.transcript || ''));
  }
  return { prop: norm(out.prop.join(' ')), opp: norm(out.opp.join(' ')) };
}

function other(side) {
  return side === 'prop' ? 'opp' : 'prop';
}

export function clashMapPrompt(d, formatName) {
  const propName = (d.prop && d.prop.name) || 'Prop';
  const oppName = (d.opp && d.opp.name) || 'Opp';
  const system =
    'You map the clash in a recorded debate. You are NOT judging it: never name a winner, never score anyone, never say who argued better. ' +
    'Read both transcripts and list the arguments that actually carried weight, then say what the other side did with each one.\n\n' +
    'For each argument, pick exactly one label for what the OTHER side did:\n' +
    '- "rebutted": they contested it. Any real engagement counts, however weak. A bad answer is still an answer.\n' +
    '- "conceded": they accepted it, restated it, or built on it as true.\n' +
    '- "self-contradiction": their answer contradicts something that same side said earlier in the round.\n' +
    '- "dropped": nothing they said bears on it at all. Use this ONLY when you can read their whole turn and find no line that touches the argument. When in doubt, it is rebutted, not dropped.\n\n' +
    'QUOTE RULE, non-negotiable: claimQuote and responseQuote must be copied VERBATIM from the transcript, word for word, including any transcription errors. Do not clean them up, do not paraphrase, do not stitch together two sentences from different places. Quote 15 to 40 words. A quote that is not in the transcript is thrown away.\n' +
    'claimQuote comes from the side named in "by". responseQuote comes from the other side. For "dropped", responseQuote must be an empty string.\n\n' +
    `Return STRICT JSON, nothing else: {"clashes":[{"claim":"<=120 char plain-English name for the argument","by":"prop"|"opp","claimQuote":"verbatim","label":"rebutted"|"conceded"|"self-contradiction"|"dropped","responseQuote":"verbatim or empty","note":"<=180 chars, why this label, no em dashes"}]}\n` +
    `At most ${MAX_CLASHES} entries, the load-bearing ones first. Cover both sides' arguments, not just one side's. If a transcript is missing or unusable, return {"clashes":[]}.`;

  const t = {};
  for (const turn of d.turns || []) t[turn.n] = turn.transcript || '';
  const user =
    'Motion: ' + (d.motion || '') + '\nFormat: ' + (formatName || d.format || '') +
    `\n\nPROP (${propName}) OPENING:\n` + (t[1] || '[missing]') +
    `\n\nOPP (${oppName}) ANSWER:\n` + (t[2] || '[missing]') +
    '\n\nPROP REPLY:\n' + (d.replyWaived ? '[reply waived, the opener never recorded one]' : (t[3] || '[missing]'));
  return { system, user };
}

// Validate a model's clash map against the round it claims to describe.
// Returns null when nothing survives, so callers can treat "no map" and
// "the model failed" identically.
export function parseClashMap(text, d) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  const j = JSON.parse(m[0]);
  const raw = Array.isArray(j.clashes) ? j.clashes : [];
  if (!raw.length) return null;

  const hay = sideTranscripts(d);
  const rows = [];
  const seen = new Set();
  let rejected = 0;

  for (const c of raw) {
    if (rows.length >= MAX_CLASHES) break;
    const by = c && c.by === 'opp' ? 'opp' : c && c.by === 'prop' ? 'prop' : null;
    const label = c && CLASH_LABELS.has(c.label) ? c.label : null;
    const claim = String((c && c.claim) || '').trim().slice(0, 120);
    const claimQuote = String((c && c.claimQuote) || '').trim().slice(0, 400);
    const responseQuote = String((c && c.responseQuote) || '').trim().slice(0, 400);
    if (!by || !label || !claim || !claimQuote) { rejected++; continue; }

    const nClaim = norm(claimQuote);
    if (nClaim.length < MIN_QUOTE_CHARS || !hay[by].includes(nClaim)) { rejected++; continue; }

    // "dropped" means there is nothing to quote. Anything else has to show
    // the line it is talking about, in the responder's own transcript.
    let quoted = '';
    if (label !== 'dropped') {
      const nResp = norm(responseQuote);
      if (nResp.length < MIN_QUOTE_CHARS || !hay[other(by)].includes(nResp)) { rejected++; continue; }
      quoted = responseQuote;
    }

    const key = by + '|' + nClaim.slice(0, 60);
    if (seen.has(key)) { rejected++; continue; }
    seen.add(key);

    rows.push({
      claim,
      by,
      claimQuote,
      label,
      responseQuote: quoted,
      note: String((c && c.note) || '').trim().slice(0, 180),
    });
  }

  if (!rows.length) return null;
  return { clashes: rows, rejected, at: Date.now() };
}

// The block the ballot prompt carries. The judge reads the map as the flow
// but keeps the call: an LLM handed a structured artifact will otherwise
// treat it as ground truth and launder a bad row into the verdict.
export function clashMapForBallot(map) {
  if (!map || !map.clashes || !map.clashes.length) return '';
  const lines = map.clashes.map((c, i) => {
    const who = c.by === 'prop' ? 'Prop' : 'Opp';
    const what = c.label === 'dropped' ? 'the other side never touched it'
      : c.label === 'conceded' ? 'the other side accepted it'
      : c.label === 'self-contradiction' ? 'the answer contradicts that side\'s own earlier line'
      : 'the other side contested it';
    return `${i + 1}. [${who}] ${c.claim} → ${c.label.toUpperCase()}: ${what}.` +
      (c.note ? ' ' + c.note : '');
  });
  return '\n\nCLASH MAP (a separate pass over the same transcripts, quote-verified):\n' + lines.join('\n') +
    '\nUse this as the flow when you name what was answered and what was dropped, and cite the specific clash you decided on. ' +
    'It is a draft, not a verdict: it never says who won, and it can be wrong. If it contradicts what you read in the transcripts, trust the transcripts and say so in the RFD.';
}

// ── The debater side of the same discipline ────────────────────────────
// The judge grades on responded-vs-dropped, so the AI opponent is taught
// to argue that way rather than being scored against a standard it never
// saw. Appended to the speech-generating feature stacks in
// voice-guidelines.mjs.
export const CLASH_DISCIPLINE = `

────────────────────────────────────────────────────────
CLASH DISCIPLINE. The judge maps every argument to your answer
────────────────────────────────────────────────────────

The ballot is built from one question asked of every argument on the
table: did the other side answer it, concede it, contradict themselves,
or say nothing. That map gets shown to the room. Argue like someone who
knows it is being drawn.

1. BEFORE YOU SPEAK, ACCOUNT FOR EVERY ARGUMENT THEY MADE. Each one gets
   answered, or conceded on purpose, or beaten by something that
   outweighs it. There is no fourth option that helps you. Silence is
   not neutral; it reads as a drop and it costs you the argument you
   never lost.

2. RUNNING OUT OF TIME IS NOT AN EXCUSE TO GO QUIET. Concede out loud
   and weigh around it. "Grant them the cost point. It is the smaller
   harm and here is why" is a line you win. Skipping it in silence is a
   line you lose.

3. ANSWERING A CLAIM THEY DID NOT MAKE IS NOT AN ANSWER. If you rebut a
   stronger or dumber version of their argument, the map records a drop
   on the real one. Hit what they actually said, in their words.

4. DO NOT CONTRADICT YOUR OWN EARLIER TURN. A judge tracking the flow
   across your speeches will catch a later line that undercuts your own
   constructive, and it costs more than the point you were reaching for.
   If you have to shift, name the shift and explain why.

5. SAY THE LABEL OUT LOUD. "They never answered the capacity question"
   is worth more than the answer itself, because it tells the judge
   exactly where to look. Point at the drop, name what it was, say what
   it costs them. One line, no preface.

6. QUOTE THEM. A response anchored to their actual words is scored as
   engagement. A response that gestures at "their argument about the
   economy" is scored as vague and frequently as a drop.
`;
