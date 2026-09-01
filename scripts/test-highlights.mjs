// Guard for lib/highlights.mjs — the pure half of replay highlights.
// Runs in the pre-commit hook. The two promises that matter:
//   1. THE QUOTE GATE: no moment survives whose quote the host speech's
//      transcript cannot prove verbatim (normalized).
//   2. THE ALIGNMENT FENCE: a speech that does not fit inside the video
//      (the reused-room corruption, measured live 2026-08-31 on
//      SparMatch-aI1PadPg-rV38GBvo-mtbw5v4r) is dropped, and a round
//      with nothing aligned yields NO timeline rather than wrong clips.
// Plus: title lint (length, em-dashes, banned phrases), window clamps,
// overlap dedupe, and the bounded public projection.

import {
  buildTimeline, transcriptForPrompt, highlightPrompt, parseClock,
  parseModelMoments, validateMoments, sanitizeTitle, quoteInText,
  publicHighlights, MIN_CLIP_SEC, MAX_CLIP_SEC, MAX_MOMENTS,
} from '../app/netlify/functions/lib/highlights.mjs';

let failed = 0, passed = 0;
function ok(cond, name){
  if (cond){ passed++; return; }
  failed++;
  console.error('FAIL: ' + name);
}

const WORDS = 'the electoral college distorts every presidential campaign because candidates only visit swing states and the rest of the country is ignored entirely which means voters in safe states have no reason to show up at all and that is the collapse of participation my opponent never answers'.split(' ');
function speechText(times){
  let out = [];
  for (let i = 0; i < times; i++) out.push(WORDS.join(' '));
  return out.join(' ');
}

// A round shaped like the live data: recording starts 40s after the
// round clock, speeches carry atMs relative to roundStartedAt.
const ROUND = {
  roundStartedAt: 1_000_000_000,
  recordingStartedAtMs: 1_000_040_000,
  speeches: [
    { code: 'P1', side: 'pro', speakerName: 'Broderick', text: speechText(3), atMs: 100_000, durationSec: 120 },
    { code: 'C1', side: 'con', speakerName: 'John F.', text: speechText(3), atMs: 240_000, durationSec: 150 },
    { code: 'X', side: 'pro', speakerName: 'Broderick', text: 'too short', atMs: 400_000, durationSec: 5 },
    { code: 'SK', side: 'con', speakerName: 'John F.', text: speechText(2), atMs: 420_000, durationSec: 60, skipped: true },
  ],
};
const REC = { duration: 700 };

// ── Timeline ────────────────────────────────────────────────────────────
const tl = buildTimeline(ROUND, REC);
ok(!!tl, 'timeline builds from an aligned round');
ok(tl.speeches.length === 2, 'short and skipped speeches are dropped (got ' + (tl && tl.speeches.length) + ')');
ok(Math.round(tl.speeches[0].startSec) === 60, 'video offset = roundStart + atMs - recStart (got ' + (tl && tl.speeches[0].startSec) + ')');
ok(tl.firstWordSec === 60, 'firstWordSec is the first aligned speech');

// The reused-room corruption: recording predates the (reset) round clock
// by 27 minutes, so every speech maps past the end of the video.
const corrupt = buildTimeline({
  roundStartedAt: 1_787_859_132_353,
  recordingStartedAtMs: 1_787_857_486_719,
  speeches: [
    { code: 'P1', side: 'pro', speakerName: 'Reese E.', text: speechText(3), atMs: 1_153_649, durationSec: 72 },
  ],
}, { duration: 1667 });
ok(corrupt === null, 'a reused-room round with nothing inside the video yields NO timeline');

ok(buildTimeline({ ...ROUND, recordingStartedAtMs: 0 }, REC) === null, 'no recording start stamp, no timeline');
ok(buildTimeline(ROUND, { duration: 0 }) === null, 'no duration, no timeline');

// ── Prompt carries real timecodes ───────────────────────────────────────
const txt = transcriptForPrompt(tl);
ok(txt.includes('on video 1:00 to 3:00'), 'prompt states the speech video window');
ok(/\[\d+:\d\d\]/.test(txt), 'prompt interpolates word timecodes');
const p = highlightPrompt({ motion: 'Remove the electoral college', proName: 'A', conName: 'B' }, tl);
ok(p.system.includes('VERBATIM'), 'system prompt demands verbatim quotes');
ok(p.user.includes('Remove the electoral college'), 'user prompt carries the motion');

// ── parseClock / parseModelMoments ──────────────────────────────────────
ok(parseClock('3:05') === 185 && parseClock('12:00') === 720, 'm:ss parses');
ok(parseClock('nope') === null, 'garbage clock rejected');
const parsed = parseModelMoments('Here you go:\n{"moments":[{"start":"1:10","end":"1:45","title":"T","quote":"q"}]}');
ok(parsed.length === 1, 'JSON extracted from surrounding prose');

// ── validateMoments: the gates ──────────────────────────────────────────
const realQuote = 'voters in safe states have no reason to show up';
function moment(over){
  return Object.assign({ start: '1:10', end: '1:45', title: 'Pro turns participation', quote: realQuote }, over);
}
ok(validateMoments([moment()], tl, REC.duration).length === 1, 'a verifiable in-window moment survives');

// THE QUOTE GATE.
ok(validateMoments([moment({ quote: 'words nobody in this round ever said aloud' })], tl, REC.duration).length === 0,
  'QUOTE GATE: an unverifiable quote kills the moment');
ok(validateMoments([moment({ quote: 'the collapse' })], tl, REC.duration).length === 0,
  'QUOTE GATE: a sub-4-word quote proves nothing and is refused');
{
  // The same words exist in both speeches here (repeated bank), so build
  // a con-only assertion: a window outside every speech is refused.
  const out = validateMoments([moment({ start: '10:30', end: '10:55' })], tl, REC.duration);
  ok(out.length === 0, 'ALIGNMENT: a window outside every aligned speech is refused');
}

// Clamps.
{
  const out = validateMoments([moment({ start: '1:10', end: '4:10' })], tl, REC.duration);
  ok(out.length === 1 && (out[0].end - out[0].start) <= MAX_CLIP_SEC, 'overlong window clamped to MAX_CLIP_SEC');
}
{
  const out = validateMoments([moment({ start: '1:10', end: '1:14' })], tl, REC.duration);
  ok(out.length === 0 || (out[0].end - out[0].start) >= MIN_CLIP_SEC, 'short window extended or dropped, never a 4s stub');
}
// Overlap dedupe + cap.
{
  // Five VALID, non-overlapping windows, so only the cap can trim them:
  // a set the dedupe already thins would let a deleted cap pass unseen.
  const out = validateMoments([
    moment({ start: '1:00', end: '1:30' }), moment({ start: '1:31', end: '2:01' }),
    moment({ start: '2:02', end: '2:32' }), moment({ start: '4:10', end: '4:40' }),
    moment({ start: '4:41', end: '5:11' }),
  ], tl, REC.duration);
  ok(out.length === MAX_MOMENTS, 'moment count capped at ' + MAX_MOMENTS + ' (got ' + out.length + ')');
  for (let i = 1; i < out.length; i++) ok(out[i].start >= out[i-1].start, 'moments sorted by start');
}
// Speaker attribution comes from the host speech, not the model.
{
  const out = validateMoments([moment()], tl, REC.duration);
  ok(out[0] && out[0].speaker === 'Broderick' && out[0].side === 'pro', 'speaker/side stamped from the host speech');
}

// ── Title lint ──────────────────────────────────────────────────────────
ok(sanitizeTitle('Con concedes the cost argument') === 'Con concedes the cost argument', 'clean title passes');
ok(!sanitizeTitle('The turn — and the collapse').includes('—'), 'em-dash stripped');
ok(sanitizeTitle("Let's dive in to the framework") === '', 'banned phrase kills the title');
ok(sanitizeTitle('x'.repeat(200)).length <= 80, 'title capped at 80 chars');
{
  const out = validateMoments([moment({ title: "Let's unpack this" })], tl, REC.duration);
  ok(out.length === 1 && out[0].title.includes('"'), 'a dead title falls back to the quoted line');
}
ok(quoteInText('VOTERS in safe states, have no reason', tl.speeches[0].text), 'quote match survives case and punctuation');

// ── Public projection is bounded and whitelisted ────────────────────────
{
  const pub = publicHighlights([
    { start: 5, end: 40, title: 'ok', quote: 'q', speaker: 's', side: 'pro', uid: 'LEAK', secret: 'LEAK' },
    { start: 90, end: 10 },
    null,
  ]);
  ok(pub.length === 1, 'invalid rows dropped from the public shape');
  ok(!('uid' in pub[0]) && !('secret' in pub[0]), 'public shape is whitelisted, stray fields never leak');
}
ok(publicHighlights('nope').length === 0, 'non-array highlights read as empty');

if (failed){
  console.error('\n' + failed + ' highlight guard(s) failed (' + passed + ' passed).');
  process.exit(1);
}
console.log('highlights guard: ' + passed + ' assertions passed.');
