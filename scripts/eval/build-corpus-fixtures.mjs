#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────
// Turn consented Debatable rounds into eval fixtures.
//
// Input is the JSONL that /api/admin/corpus-export?mode=rounds returns
// (already anonymized and PII-scrubbed server-side; this script never
// touches Firestore and never sees a uid).
//
//   node scripts/eval/build-corpus-fixtures.mjs --in=rounds.jsonl --out=fixtures/corpus
//   cat rounds.jsonl | node scripts/eval/build-corpus-fixtures.mjs --out=fixtures/corpus
//
// WHAT IT WILL NOT DO, and both refusals are the point:
//
// 1. It will not write an expected-winner for a round our own judge
//    decided. Scoring the judge against its own past verdicts reports a
//    high number that measures self-agreement, not accuracy.
//    --with-gold throws on such a row rather than skipping it quietly.
//
// 2. It will not invent a bench split. run-stability-eval's swap and pad
//    conditions need the transcript separated into two bench blocks. A
//    live round in a real format carries speech codes we could map to
//    sides; a voice round is a conversation and carries nothing of the
//    kind, and most of the corpus is voice. A guessed split would move
//    text between benches and the bias number computed from it would be
//    wrong in a way nothing downstream could detect. So rounds ship
//    unsplit and are marked as supporting `repeat` only.
// ────────────────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertAccuracyLabelAllowed,
  LABEL_SOURCES,
} from '../../app/netlify/functions/lib/eval-corpus.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const hit = args.find((a) => a.startsWith('--' + n + '='));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (n) => args.includes('--' + n);

const OUT = opt('out', 'scripts/eval/fixtures/corpus');
const IN = opt('in', '');
const WITH_GOLD = flag('with-gold');

function readInput() {
  const raw = IN ? readFileSync(IN, 'utf8') : readFileSync(0, 'utf8');
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
    try { return JSON.parse(l); } catch (e) {
      throw new Error(`line ${i + 1} is not JSON: ${e.message}`);
    }
  });
}

const rows = readInput();
if (!rows.length) {
  console.log('no rows on input.');
  console.log('If the corpus export returned nothing, that is expected until');
  console.log('accounts opt in: `contributable` is what this reads and it is');
  console.log('0 until the ballot-time opt-in ask lands consents.');
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });

const manifest = [];
const labelCounts = {};
let written = 0;

for (const r of rows) {
  labelCounts[r.labelSource] = (labelCounts[r.labelSource] || 0) + 1;

  if (WITH_GOLD) {
    // Throws for anything our judge labeled. Deliberate: a builder that
    // skipped these quietly would emit a gold file that looks complete.
    assertAccuracyLabelAllowed(r);
  }

  const dir = join(OUT, r.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'transcript.md'), r.transcript || '', 'utf8');
  written++;

  manifest.push({
    id: r.id,
    kind: r.kind,
    format: r.format,
    motion: r.motion,
    transcriptChars: r.transcriptChars,
    speechCount: r.speechCount,
    speakerPoints: r.speakerPoints,
    // Reported as ours, never as gold. See eval-corpus.mjs.
    aiWinner: r.aiWinner,
    labelSource: r.labelSource,
    accuracyGold: r.accuracyGold === true,
    evalUses: r.evalUses || [],
    // Unsplit, so only the condition that needs no split.
    stabilityConditions: ['repeat'],
    transcriptFile: join(r.id, 'transcript.md'),
  });
}

writeFileSync(
  join(OUT, 'corpus-manifest.json'),
  JSON.stringify({
    _about:
      'Consented Debatable rounds as eval material. labelSource records who decided ' +
      'the winner; accuracyGold is true only when a human did. Rounds labeled ' +
      'ai_verdict are usable for stability, bias and calibration, never accuracy.',
    generatedFrom: IN || 'stdin',
    roundCount: manifest.length,
    accuracyGoldCount: manifest.filter((m) => m.accuracyGold).length,
    labelSources: labelCounts,
    rounds: manifest,
  }, null, 2) + '\n',
  'utf8'
);

const goldCount = manifest.filter((m) => m.accuracyGold).length;
console.log(`wrote ${written} round(s) to ${OUT}`);
console.log(`label sources: ${JSON.stringify(labelCounts)}`);
console.log(`accuracy-gold rounds: ${goldCount}`);
if (!goldCount) {
  console.log(
    'No round here can score adjudication ACCURACY, which is correct rather ' +
    'than a gap: every verdict in this corpus was written by the judge under ' +
    'test. Accuracy stays on the external tournament fixtures in ' +
    'adjudication-gold.json, where a human chair announced the call.'
  );
}
