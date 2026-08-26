// Guards the silence-hallucination gate in transcribe.mjs.
//
// The rejected cases are VERBATIM outputs measured from gpt-4o-transcribe
// on ten seconds of generated silence and of pink noise at -48dB, sent
// with the live DEBATE_PROMPT (2026-08-26). The kept cases are the thing
// the gate must never eat: real speech, including speech that reuses the
// glossary words the prompt lists.
import { isPromptEcho } from '../app/netlify/functions/transcribe.mjs';

const HINT =
  'A competitive debate round. Terms that appear: motion, resolution, '
  + 'Pro, Con, Aff, Neg, Gov, Opp, contention, framework, warrant, impact, '
  + 'weighing, magnitude, probability, timeframe, turn, drop, extend, '
  + 'crossfire, cross-examination, POI, point of information, rebuttal, '
  + 'summary, final focus, whip, prime minister, speaker points, the flow.';

const GLOSSARY = HINT.slice(HINT.indexOf('motion,'));

let fail = 0;
const check = (label, text, prompt, want) => {
  const got = isPromptEcho(text, prompt);
  if (got !== want) { fail++; console.error(`FAIL  ${label}\n  want ${want} got ${got}\n  text: ${JSON.stringify(String(text).slice(0,90))}`); }
};

// ── measured hallucinations: must be dropped ──
check('silence: bare scaffold',      'context:', HINT, true);
check('silence: hint fragment',      'The flow', HINT, true);
check('silence: fenced glossary',    'context: ###\n' + HINT + '\n###\n\n', HINT, true);
check('quiet: fenced glossary',      'context: ###\n' + HINT + '\n###', HINT, true);
check('quiet: prefixed glossary',    'context: ' + HINT, HINT, true);
check('quiet: bare glossary',        GLOSSARY, HINT, true);
check('empty',                       '', HINT, true);
check('punctuation only',            '  ###  ...  ', HINT, true);
check('scaffold, other word',        'Transcript: the flow', HINT, true);

// carry echo: the model handing back the tail we fed it is the same failure
const carry = 'So the second contention is that turnout collapses in rural counties.';
const withCarry = HINT + ' Continuing from: ' + carry;
check('carry echoed back', carry, withCarry, true);

// ── real speech: must survive ──
check('plain speech',
  'My first contention is that the Electoral College distorts campaign spending, because candidates only visit six states.',
  HINT, false);
check('speech reusing jargon',
  'That is a turn on their own framework. Extend the impact, weigh it on magnitude, and note they dropped the timeframe entirely.',
  HINT, false);
check('short real answer',
  'No, we accept that premise.', HINT, false);
check('speech continuing the carry',
  'Rural counties are the whole ballgame here, and their model does nothing about it.',
  withCarry, false);
check('no prompt at all',
  'motion, resolution, Pro, Con', '', false);

if (fail) { console.error(`\n${fail} case(s) failed`); process.exit(1); }
console.log('transcribe echo gate: all cases pass');
