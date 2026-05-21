// TTS humanizer — preprocesses debate speech text before sending to
// ElevenLabs / Cartesia / OpenAI so the audio output sounds less like a
// book being read and more like a debater who's in the middle of a round.
//
// What we change:
//   - Strip bracketed stage directions the AI sometimes emits ([cough],
//     [sighs]) — turbo_v2_5 reads the literal brackets if we don't.
//   - Normalize pause markers (.. → ..., -- / --- → em-dash) so ElevenLabs'
//     built-in pause heuristics fire predictably.
//   - Detect ALL-CAPS emphasis tokens (a debate thing: "YOU. WILL. NOT.")
//     and convert them to italicized-pause form so they don't read
//     shouting-everything but DO get a natural pause.
//   - Detect pattern tells ("here's the thing —", "judge,", "framework
//     first —") and add a short pause after them so delivery lands.
//
// What we return alongside the cleaned text:
//   - auto-detected `intensity` hint in [0..1] if the caller didn't set one.
//     Dense `!` / ALL-CAPS => high intensity; lots of ellipses / reflective
//     phrasing => low intensity. Callers can override.
//
// Scope: pure string manipulation, no I/O. Tested implicitly via tts.mjs.

const STAGE_DIRECTION_RE = /\[(cough(?:s|ing)?|sighs?|laughs?|breath(?:es)?|clears throat|pauses?|um+|uh+|er+|ahem)\]/gi;

// Phrases that naturally want a short beat after them in spoken debate.
// We append an em-dash if one isn't already present.
const EMPHASIS_LEADERS = [
  /\b(here'?s the thing)\b(?![,—\-])/gi,
  /\b(framework first)\b(?![,—\-])/gi,
  /\b(judge)\b(?=[,.\s])/gi, // "Judge," — don't touch mid-sentence "judge them"
  /\b(look|listen)\b(?=[,.\s])/gi,
  /\b(so what)\b(?![?])/gi,
];

// Debate tags that read flat without a pause. "Three responses." "Two
// warrants." — we want a micro-pause after the period before the next list
// item. ElevenLabs respects periods but we bolster them with an extra space
// so the prosody engine has something to latch onto.
const LIST_ENUMERATOR_RE = /\b(first|second|third|fourth|one|two|three|four|five)\b([,—])/gi;

function normalizeDashes(s) {
  // run longest-first so --- doesn't get half-converted
  return s
    .replace(/---/g, '—')
    .replace(/--/g, '—')
    .replace(/\s-\s/g, ' — ');
}

function normalizeEllipses(s) {
  // A lone ".." reads as a typo; collapse to "..."
  return s.replace(/(?<![.\d])\.\.(?!\.)/g, '...');
}

function stripStageDirections(s) {
  return s.replace(STAGE_DIRECTION_RE, '').replace(/\s{2,}/g, ' ');
}

function convertAllCapsEmphasis(s) {
  // ALL-CAPS runs of 2+ words ("YOU. WILL. NOT.") read as shouting.
  // Convert to Title Case and wrap with em-dashes so they still land with
  // emphasis but don't blow out the ear.
  return s.replace(/(\b[A-Z]{2,}[.!?]?\s+){2,}\b[A-Z]{2,}[.!?]?/g, (match) => {
    const softened = match.replace(/\b([A-Z])([A-Z]+)/g, (_, a, b) => a + b.toLowerCase());
    return '— ' + softened.trim() + ' —';
  });
}

function expandEmphasisLeaders(s) {
  let out = s;
  for (const re of EMPHASIS_LEADERS) {
    out = out.replace(re, (match, phrase, offset, full) => {
      // Only append em-dash if the char right after isn't punctuation.
      const next = full.charAt(offset + match.length);
      if (next === '' || next === '.' || next === ',' || next === '!' || next === '?' || next === ';') return match;
      return phrase + ' —';
    });
  }
  return out;
}

function padListEnumerators(s) {
  return s.replace(LIST_ENUMERATOR_RE, (_m, word, sep) => word + (sep === '—' ? ' — ' : ', '));
}

// Insert a small set of breath/emphasis pauses where spoken debate
// naturally beats. ElevenLabs/OpenAI both treat "..." as a short pause, so
// dropping ellipses at contrastive pivots and rhetorical hinges makes the
// delivery sound like a debater thinking, not a TTS engine reading.
//
// Capped at MAX_PAUSES per paragraph (split on newlines) so a long speech
// gets a few well-placed beats per block instead of turning into Morse
// code. We never touch a spot that already has an ellipsis or em-dash
// right there, so this composes cleanly after the dash/ellipsis passes.
const PAUSE_BEFORE_CONTRAST_RE = /(,\s*)(but|however|yet|and critically|and crucially)\b/gi;
const HOWEVER_LEAD_RE = /(?<![.…\-]\s?)\b(however|and critically|and crucially)\b/gi;
const THIS_IS_WHY_RE = /\bThis is why\b/g;
const CRITICAL_MOVE_RE = /\b(here(?:'s| is) the critical move)\b(?![.…])/gi;
const RHETORICAL_Q_RE = /\?(\s+)(?=[A-Z])/g;

function addEmphasisPauses(s) {
  const MAX_PAUSES = 4;
  return s.split('\n').map((para) => {
    let count = 0;
    let out = para;
    const guard = (fn) => { if (count >= MAX_PAUSES) return; out = fn(out); };

    // 1. Contrastive pivot after a comma: ", but" → ", ...but"
    guard(() => out.replace(PAUSE_BEFORE_CONTRAST_RE, (m, comma, word) => {
      if (count >= MAX_PAUSES) return m;
      count++;
      return comma + '...' + word;
    }));
    // 2. Sentence-leading "However," / "And critically," → "...however"
    //    (skip if already preceded by a pause mark).
    guard(() => out.replace(HOWEVER_LEAD_RE, (m, word) => {
      if (count >= MAX_PAUSES) return m;
      count++;
      return '...' + word;
    }));
    // 3. "This is why" → "This... is why" — a beat of suspense before the payoff.
    guard(() => out.replace(THIS_IS_WHY_RE, (m) => {
      if (count >= MAX_PAUSES) return m;
      count++;
      return 'This... is why';
    }));
    // 4. "Here is the critical move" → trailing beat before the move lands.
    guard(() => out.replace(CRITICAL_MOVE_RE, (m) => {
      if (count >= MAX_PAUSES) return m;
      count++;
      return m + '...';
    }));
    // 5. Brief beat after a rhetorical question that's followed by more text.
    guard(() => out.replace(RHETORICAL_Q_RE, (m, sp) => {
      if (count >= MAX_PAUSES) return m;
      count++;
      return '?...' + sp;
    }));
    return out;
  }).join('\n');
}

// Intensity heuristic — returns a float in [0, 1].
// Count-based (not per-word) because per-word normalization pathologically
// inflates on short utterances where a single `?` ended up reading as max
// intensity. Long contemplative pieces stay cool via ellipses dampening.
function detectIntensity(text) {
  if (!text) return 0;

  const bangs = (text.match(/!/g) || []).length;
  const allCaps = (text.match(/\b[A-Z]{3,}\b/g) || []).length;
  const rhetoricalQs = (text.match(/\?/g) || []).length;
  const ellipses = (text.match(/\.\.\./g) || []).length;
  const emdashes = (text.match(/—/g) || []).length;

  const hot = bangs + allCaps * 1.5 + rhetoricalQs * 0.3;
  const cool = ellipses + emdashes * 0.3;

  const delta = hot - cool * 0.7;
  let intensity = 0.2 + Math.max(0, Math.min(0.7, delta * 0.07));
  intensity -= Math.min(0.2, cool * 0.04);
  return Math.max(0, Math.min(1, intensity));
}

export function humanizeForTTS(rawText, opts = {}) {
  if (!rawText || typeof rawText !== 'string') {
    return { text: '', intensity: 0 };
  }

  // Detect intensity from the ORIGINAL text so ALL-CAPS emphasis still
  // registers as heat (the humanizer about to soften it for delivery, but
  // the voice engine should still crank up style accordingly).
  const intensity = typeof opts.intensity === 'number'
    ? Math.max(0, Math.min(1, opts.intensity))
    : detectIntensity(rawText);

  let t = rawText;
  t = stripStageDirections(t);
  t = normalizeDashes(t);
  t = normalizeEllipses(t);
  t = convertAllCapsEmphasis(t);
  t = expandEmphasisLeaders(t);
  t = padListEnumerators(t);
  t = addEmphasisPauses(t);

  // Collapse runs of whitespace introduced by the edits.
  t = t.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();

  return { text: t, intensity };
}

export const __test = {
  stripStageDirections,
  normalizeDashes,
  normalizeEllipses,
  convertAllCapsEmphasis,
  expandEmphasisLeaders,
  padListEnumerators,
  addEmphasisPauses,
  detectIntensity,
};
