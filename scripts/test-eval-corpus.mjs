#!/usr/bin/env node
// Guards on lib/eval-corpus.mjs.
//
// The invariant worth a test file: a verdict our own judge wrote must
// never become the ground truth our own judge is scored against. That
// mistake does not surface as a failure. It surfaces as a very good
// accuracy number, which is why it needs a guard rather than care.

import {
  LABEL_SOURCES,
  ACCURACY_GOLD_SOURCES,
  usableAsAccuracyGold,
  assertAccuracyLabelAllowed,
  toEvalRound,
  evalUsesFor,
  winnerFromSideResult,
  MIN_TRANSCRIPT_CHARS,
} from '../app/netlify/functions/lib/eval-corpus.mjs';

let pass = 0;
const fails = [];
const ok = (cond, msg) => { if (cond) pass++; else fails.push(msg); };

// ── the circularity rule ───────────────────────────────────────────
ok(!usableAsAccuracyGold(LABEL_SOURCES.AI_VERDICT),
  'our own judge verdict must never be accuracy gold');
ok(!usableAsAccuracyGold(LABEL_SOURCES.NONE),
  'an unlabeled round must never be accuracy gold');
ok(!usableAsAccuracyGold(LABEL_SOURCES.CROWD),
  'a crowd vote must not be silently promoted to adjudication ground truth');
ok(usableAsAccuracyGold(LABEL_SOURCES.HUMAN_PANEL),
  'a human chair call is accuracy gold');
ok(usableAsAccuracyGold(LABEL_SOURCES.HUMAN_REVIEW),
  'a human appeal outcome is accuracy gold');
ok(ACCURACY_GOLD_SOURCES.size === 2,
  'exactly two label sources may be scored for accuracy');

// The assert must THROW, not return false: a builder can ignore a
// boolean and write a silently circular gold file.
let threw = false;
try { assertAccuracyLabelAllowed({ id: 'x', labelSource: LABEL_SOURCES.AI_VERDICT }); }
catch (e) { threw = /refusing to write an accuracy label/.test(e.message); }
ok(threw, 'assertAccuracyLabelAllowed throws on an AI-labeled row');

let threwHuman = false;
try { assertAccuracyLabelAllowed({ id: 'x', labelSource: LABEL_SOURCES.HUMAN_PANEL }); }
catch (e) { threwHuman = true; }
ok(!threwHuman, 'assertAccuracyLabelAllowed passes a human-labeled row');

// ── label inference from a real generations row ─────────────────────
const longText = 'clash. '.repeat(200);
const liveRow = toEvalRound({
  kind: 'live_round', format: 'quick', motion: 'THW ban zoos', side: 'pro',
  context: { result: 'won', speechCount: 4, speakerPoints: 78, fullTranscript: longText },
}, 'gen1');
ok(liveRow.aiWinner === 'pro', 'side+result resolves the winner our judge picked');
ok(liveRow.labelSource === LABEL_SOURCES.AI_VERDICT,
  'a stored round is labeled ai_verdict, never inferred to be human');
ok(liveRow.accuracyGold === false, 'a stored round is not accuracy gold');
ok(liveRow.evalUses.includes('stability') && liveRow.evalUses.includes('bias'),
  'a stored round still feeds stability and bias');
ok(liveRow.evalUses.includes('calibration'),
  'speaker points make a round usable for calibration');
ok(!liveRow.evalUses.includes('accuracy'),
  'a stored round never feeds accuracy');

// A voice round with no verdict is unlabeled, not a loss.
const voiceRow = toEvalRound({
  kind: 'voice_round', format: 'clash', motion: 'm', side: 'pro',
  context: { turnCount: 12, fullTranscript: longText },
}, 'gen2');
ok(voiceRow.labelSource === LABEL_SOURCES.NONE, 'no verdict means no label');
ok(voiceRow.aiWinner === null, 'no verdict means no winner');
ok(voiceRow.evalUses.includes('stability'), 'an unlabeled round is still eval material');

// A losing row does not name the winning bench: the row only knows its
// own side, and a two-sided assumption breaks the moment BP shows up.
ok(winnerFromSideResult('pro', 'lost') === null,
  'a loss must not be flipped into a winner for the other bench');

// ── the length floor ────────────────────────────────────────────────
const shortRow = toEvalRound({
  kind: 'live_round', format: 'quick', side: 'pro',
  context: { result: 'won', fullTranscript: 'too short' },
}, 'gen3');
ok(shortRow.evalUses.length === 0, 'a stub transcript is not a round');
ok(MIN_TRANSCRIPT_CHARS > 0, 'there is a length floor at all');

// ── crowd labels are exported, under their own name ─────────────────
const crowdRow = toEvalRound({
  kind: 'live_round', format: 'quick', side: 'pro', crowdVerdict: true,
  context: { result: 'won', fullTranscript: longText },
}, 'gen4');
ok(crowdRow.labelSource === LABEL_SOURCES.CROWD, 'a crowd verdict is labeled crowd');
ok(crowdRow.evalUses.includes('crowd_agreement'),
  'a crowd verdict is reported as its own signal');
ok(!crowdRow.evalUses.includes('accuracy'),
  'a crowd verdict is not accuracy');

if (fails.length) {
  console.error(`[eval-corpus] ${fails.length} FAILED:`);
  for (const f of fails) console.error('  x ' + f);
  process.exit(1);
}
console.log(`[eval-corpus] ${pass} assertions passed`);
