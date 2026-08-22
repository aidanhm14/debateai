// AI-use screen for live-round conduct reports. PURE: no I/O, no keys, no
// clock. Every function here is deterministic on its inputs so the guard
// (scripts/test-ai-use.mjs) can pin the promises below.
//
// POSTURE, and it is load-bearing (same shape as the NSFW watchdog rule,
// 2026-08-18): a machine read is EVIDENCE for a human reviewer, never a
// verdict. Nothing in this module or any caller may strike, ban, eject,
// or move a ballot off it. The AI judge NEVER sees this analysis: an
// accusation with a thumb on the scale is exactly what the judge charter
// forbids, so it rides the safety_reports record and stops there.
//
// The fairness fence, and why the combiner is shaped the way it is:
// fluent, well-structured, well-worded speech is what practice produces,
// and it is also what second-language and simply GOOD debaters get
// accused over. Style can therefore never convict. A verdict of
// 'strong' requires a MECHANICAL artifact that style cannot explain:
// markdown remnants in a "spoken" transcript, the model referring to
// itself as an AI, or more words on the clock than a human can say in
// the time. A model read based on style alone is capped at 'moderate'.

export const AI_USE_VERDICTS = ['none', 'weak', 'moderate', 'strong'];
const RANK = { none: 0, weak: 1, moderate: 2, strong: 3 };

// Which bench a format side-key sits on. live_rounds docs store bench
// uids as proUid/conUid whatever the format calls its sides, so the
// server maps a speech's `side` back to a seat through this. Unknown
// keys return '' and the speech is left out of the screen rather than
// guessed onto a bench.
const PRO_SIDES = new Set(['pro', 'gov', 'aff', 'prop', 'og', 'cg', 'a']);
const CON_SIDES = new Set(['con', 'opp', 'neg', 'oo', 'co', 'b']);
export function benchOfSide(side) {
  const s = String(side || '').toLowerCase();
  if (PRO_SIDES.has(s)) return 'pro';
  if (CON_SIDES.has(s)) return 'con';
  return '';
}

// ── Heuristics ──────────────────────────────────────────────────────
// Mechanical reads on the transcript text. Each signal carries a weight
// (1 weak, 2 moderate, 4 hard) and hard signals set hardArtifact, which
// is the only road to a 'strong' verdict anywhere in the system.

const FILLER_RE = /\b(um+|uh+|erm|hmm|you know|i mean|kind of|kinda|sort of|sorta|gonna|wanna|basically)\b/gi;
const SCAFFOLD_RE = /\b(firstly|secondly|thirdly|furthermore|moreover|in conclusion|it is important to note|it's important to note|delve|underscores|multifaceted|comprehensive framework)\b/gi;
const MARKDOWN_RE = /(\*\*|(^|\n)#{1,4}\s|(^|\n)\s*[-*•]\s+\S|\[\d+\]|```|(^|\n)\s*\d+\.\s+[A-Z])/;
const AI_SELF_RE = /\b(as an ai\b|as a language model|i (cannot|can't) (assist|help) with|i don't have (personal )?opinions)\b/i;

function usableText(sp) {
  const t = String((sp && sp.text) || '').trim();
  if (!t || sp.skipped) return '';
  if (t === '(skipped)' || t === '(no transcript)') return '';
  return t;
}

export function heuristicScreen(speeches, format) {
  const signals = [];
  let hardArtifact = false;
  let words = 0, analyzed = 0;
  const fmt = String(format || '').toLowerCase();

  for (const sp of Array.isArray(speeches) ? speeches : []) {
    const text = usableText(sp);
    if (!text) continue;
    analyzed++;
    const w = text.split(/\s+/).filter(Boolean).length;
    words += w;
    const label = (sp.name || sp.code || 'speech') + (sp.speakerName ? ' (' + sp.speakerName + ')' : '');

    if (MARKDOWN_RE.test(text)) {
      hardArtifact = true;
      signals.push({ id: 'markdown', weight: 4, note: label + ': markdown or citation artifacts in a spoken transcript. Speech recognition never emits these; the text was pasted.' });
    }
    if (AI_SELF_RE.test(text)) {
      hardArtifact = true;
      signals.push({ id: 'ai_self_reference', weight: 4, note: label + ': the transcript refers to itself as an AI or refuses like one.' });
    }
    // More words than the clock allows. Policy spreads at 260-320 wpm
    // (~5.3 words/sec), so the hard line sits above any human delivery
    // and the softer line stands aside for Policy entirely.
    const dur = Number(sp.durationSec || 0);
    if (dur >= 20 && w >= 150) {
      const wps = w / dur;
      if (wps > 6) {
        hardArtifact = true;
        signals.push({ id: 'impossible_pace', weight: 4, note: label + ': ' + w + ' words in ' + dur + 's (' + wps.toFixed(1) + '/sec) is beyond human delivery; the transcript holds more text than was spoken.' });
      } else if (wps > 4.7 && fmt !== 'policy') {
        signals.push({ id: 'suspect_pace', weight: 2, note: label + ': ' + wps.toFixed(1) + ' words/sec is faster than all but a Policy spread.' });
      }
    }
    const scaffold = (text.match(SCAFFOLD_RE) || []).length;
    const per100 = w ? (scaffold * 100) / w : 0;
    if (per100 >= 1.8) signals.push({ id: 'scaffold_heavy', weight: 2, note: label + ': dense essay scaffolding (firstly/furthermore/in conclusion) at ' + per100.toFixed(1) + ' per 100 words.' });
    else if (per100 >= 0.8) signals.push({ id: 'scaffold', weight: 1, note: label + ': essay-style scaffolding phrases.' });

    const fillers = (text.match(FILLER_RE) || []).length;
    const sentences = (text.match(/[.!?](\s|$)/g) || []).length;
    if (w >= 150 && fillers === 0 && sentences >= w / 30) {
      // Typed, not spoken. Typing notes into the box is allowed, so
      // this alone is the weakest signal here.
      signals.push({ id: 'reads_typed', weight: 1, note: label + ': no spoken disfluency and clean sentence punctuation; reads typed or pasted rather than transcribed. Typing is allowed, so this is weak on its own.' });
    }
  }

  const score = signals.reduce((a, s) => a + s.weight, 0);
  let verdict = 'none';
  if (hardArtifact) verdict = 'strong';
  else if (score >= 4) verdict = 'moderate';
  else if (score >= 2) verdict = 'weak';
  return { verdict, signals, hardArtifact, stats: { analyzedSpeeches: analyzed, words } };
}

// ── Model pass ──────────────────────────────────────────────────────
// One bounded call whose prompt states the fences out loud. The guard
// asserts the fence strings survive; do not reword them casually.

const SPEECH_CHAR_CAP = 4000;
const MAX_SPEECHES = 6;

export function analysisPrompt({ motion, format, accusedName, speeches }) {
  const system = [
    'You screen a live debate transcript for signs that a debater read AI-generated text aloud (or pasted it) during the round. Your read is advisory evidence for a HUMAN reviewer. It never decides a round, a ballot, or a penalty.',
    'Default to none when uncertain. A false accusation costs a real person their standing.',
    'Fluency, good structure, strong vocabulary, or confident argument is NEVER evidence on its own. Skilled and second-language debaters produce exactly that, honestly.',
    'What IS evidence: text that reads written-for-the-page rather than spoken (no repairs, no reactivity to the opponent), generic essay boilerplate that ignores what the opponent actually said, verbatim assistant-register phrasing, or content that could not have been composed in the time available.',
    'A rebuttal that directly engages the opponent\'s specific words is evidence AGAINST AI use.',
    'Answer with ONLY a JSON object: {"verdict":"none|weak|moderate|strong","signals":["..."],"summary":"one or two sentences"}. Each signal names the speech and quotes the phrase it rests on.',
  ].join('\n');
  const parts = [];
  parts.push('Motion: ' + String(motion || '(unknown)'));
  parts.push('Format: ' + String(format || '(unknown)'));
  parts.push('Accused debater: ' + String(accusedName || '(unnamed)'));
  parts.push('Their speeches (live transcript, may be rough ASR):');
  let n = 0;
  for (const sp of Array.isArray(speeches) ? speeches : []) {
    const text = usableText(sp);
    if (!text) continue;
    if (++n > MAX_SPEECHES) break;
    parts.push('--- ' + (sp.name || sp.code || 'Speech') + ' (' + (sp.durationSec || '?') + 's) ---');
    parts.push(text.slice(0, SPEECH_CHAR_CAP));
  }
  return { system, user: parts.join('\n') };
}

export function parseAnalysis(raw) {
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(text.slice(start, end + 1)); } catch (e) { return null; }
  if (!obj || AI_USE_VERDICTS.indexOf(obj.verdict) < 0) return null;
  const signals = (Array.isArray(obj.signals) ? obj.signals : [])
    .map((s) => String(s || '').slice(0, 240)).filter(Boolean).slice(0, 8);
  return { verdict: obj.verdict, signals, summary: String(obj.summary || '').slice(0, 500) };
}

// Final read. The model may only reach 'strong' when the heuristics
// found a mechanical artifact; otherwise its ceiling is 'moderate'
// (style cannot convict). The heuristic verdict is a floor: a model
// that shrugs cannot erase a markdown block sitting in the transcript.
export function combineVerdicts(heuristic, model) {
  const h = heuristic && RANK[heuristic.verdict] != null ? heuristic.verdict : 'none';
  const cap = heuristic && heuristic.hardArtifact ? 'strong' : 'moderate';
  let m = model && RANK[model.verdict] != null ? model.verdict : 'none';
  if (RANK[m] > RANK[cap]) m = cap;
  return RANK[m] >= RANK[h] ? m : h;
}
