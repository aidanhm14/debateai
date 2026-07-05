#!/usr/bin/env node
// Build private OpenAI fine-tuning JSONL from local adjudication fixtures.
//
// The generated files contain private flow notes and should not be committed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdjudicationBlock } from '../../app/netlify/functions/lib/adjudication.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BP_SIDES = ['og', 'oo', 'cg', 'co'];
const TWO_SIDES = ['prop', 'opp'];
const DEFAULT_OUT = '/tmp/debateit-adjudication-finetune';

const FORMAT_ALIASES = new Map([
  ['bp', 'bp'],
  ['britishparliamentary', 'bp'],
  ['wudc', 'bp'],
  ['worlds', 'wsdc'],
  ['worldschools', 'wsdc'],
  ['worldschool', 'wsdc'],
  ['wsdc', 'wsdc'],
  ['asian', 'asian'],
  ['asianparli', 'asian'],
  ['asianparliamentary', 'asian'],
  ['ap', 'asian'],
  ['apda', 'apda'],
  ['npda', 'npda'],
  ['pf', 'pf'],
  ['publicforum', 'pf'],
  ['ld', 'ld'],
  ['lincolndouglas', 'ld'],
  ['policy', 'policy'],
  ['cx', 'policy'],
  ['congress', 'congress'],
  ['studentcongress', 'congress'],
  ['kp', 'karl-popper'],
  ['karlpopper', 'karl-popper'],
  ['mun', 'mun'],
]);

const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const opt = (name, def) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
};

function normalizeFormat(raw) {
  const compact = String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return FORMAT_ALIASES.get(compact) || compact;
}

const OUT_DIR = resolve(opt('out', DEFAULT_OUT));
const ONLY = opt('only', '');
const FORMAT = normalizeFormat(opt('format', ''));
const LIMIT = parseInt(opt('limit', '0'), 10) || 0;
const VALID_RATIO = Math.max(0, Math.min(0.5, Number(opt('validation-ratio', '0.2'))));
const INCLUDE_CORE = !flag('compact-system');

const gold = JSON.parse(readFileSync(join(__dirname, 'adjudication-gold.json'), 'utf8'));
const fixtureCandidates = [
  process.env.ADJ_FIXTURES,
  gold.fixturesDirDefault,
  gold.fixturesDirLegacy,
].filter(Boolean);
const fixturesDir = fixtureCandidates.find((p) => existsSync(p)) || fixtureCandidates[0] || '';

let rounds = gold.rounds.filter((r) => !FORMAT || normalizeFormat(r.format) === FORMAT);
if (ONLY) rounds = rounds.filter((r) => r.id === ONLY);
if (LIMIT) rounds = rounds.slice(0, LIMIT);

const VERDICT_LINE_RE = new RegExp(
  '(default to |fourths|loses to |wins because|non[- ]?responsive|\\bNR to\\b|knifes|uncomparative|missing burden|burden:|weighing on certainty|this concedes|isn.?t this squo|what.?s the delta|d/dx|\\bcall\\b|final calls?)',
  'i'
);

function decontaminate(raw) {
  return raw
    .split('\n')
    .map((line) => {
      let l = line;
      l = l.replace(/\*\*[^*]*\*\*/g, '');
      l = l.replace(/\((?:why+\??|really|d\/dx|knife|unstrategic|same as [a-z]+|nr[^)]*|\?+)\)/gi, '');
      l = l.replace(/\?{2,}/g, '').replace(/\*{2,}/g, '');
      return l;
    })
    .filter((l) => {
      const t = l.trim();
      if (!t) return true;
      if (/^scores?\s+for\b/i.test(t)) return false;
      if (/^(\d{1,3}\s*,\s*)+\d{1,3}\s*$/i.test(t)) return false;
      if (/^[A-Z][A-Z \t!?.'-]{8,}$/.test(t)) return false;
      if (/^(?:og|oo|cg|co|prop|opp)(?:\s*>\s*(?:og|oo|cg|co|prop|opp)){1,3}$/i.test(t)) return false;
      if (VERDICT_LINE_RE.test(t) && t.replace(/[*>\- ]/g, '').length < 90) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readFixture(r, key) {
  const file = r[key];
  if (!file) return '';
  return decontaminate(readFileSync(join(fixturesDir, r.folder, file), 'utf8'));
}

function readFirstFixture(r, keys) {
  for (const key of keys) {
    if (r[key]) return readFixture(r, key);
  }
  return '';
}

function loadHumanNotes(r) {
  const noteKeys = [
    ['oaFile', 'ORAL ADJUDICATION / OA NOTES'],
    ['delibFile', 'DELIBERATION NOTES'],
    ['ballotFile', 'BALLOT NOTES'],
    ['judgeFile', 'JUDGE NOTES'],
  ];
  return noteKeys
    .filter(([key]) => r[key])
    .map(([key, label]) => '--- ' + label + ' ---\n' + readFixture(r, key))
    .join('\n\n');
}

function loadRound(r) {
  const format = normalizeFormat(r.format);
  if (format === 'bp') {
    const gov = readFixture(r, 'govFile');
    const opp = readFixture(r, 'oppFile');
    const notes = loadHumanNotes(r);
    return [
      'MOTION: ' + r.motion,
      '',
      '=== GOVERNMENT BENCH FLOW (Opening Gov then Closing Gov) ===',
      gov,
      '',
      '=== OPPOSITION BENCH FLOW (Opening Opp then Closing Opp) ===',
      opp,
      notes ? '\n=== HUMAN ADJUDICATION NOTES, DECONTAMINATED AND NON-AUTHORITATIVE ===\n' + notes : '',
    ].filter(Boolean).join('\n');
  }

  const prop = readFirstFixture(r, ['propFile', 'govFile', 'affFile', 'proFile']);
  const opp = readFirstFixture(r, ['oppFile', 'negFile', 'conFile']);
  const notes = loadHumanNotes(r);
  return [
    'MOTION: ' + r.motion,
    '',
    format === 'wsdc' ? '=== PROPOSITION FLOW ===' : '=== PRO / AFF FLOW ===',
    prop,
    '',
    format === 'wsdc' ? '=== OPPOSITION FLOW ===' : '=== OPP / NEG FLOW ===',
    opp,
    notes ? '\n=== HUMAN ADJUDICATION NOTES, DECONTAMINATED AND NON-AUTHORITATIVE ===\n' + notes : '',
  ].join('\n');
}

function formatPromptLine(format) {
  const lines = {
    wsdc: 'You are adjudicating this World Schools round from terse judge flow notes. Decide the winner by WSDC content/style/strategy discipline, with special attention to third-speaker and reply weighing.',
    asian: 'You are adjudicating this Asian Parliamentary round from terse judge flow notes. Decide the winner by definitions, model, team line, engagement, POIs where extended, and whip weighing.',
    apda: 'You are adjudicating this APDA round from terse judge flow notes. Decide the winner on general-knowledge parliamentary norms, tight-case fairness, PMR/LOR new-matter discipline, and comparative weighing.',
    npda: 'You are adjudicating this NPDA round from terse judge flow notes. Decide the winner on the flow, including theory, topicality, kritiks, counterplans, and weighing only when those positions are actually run.',
    pf: 'You are adjudicating this Public Forum round from terse judge flow notes. Decide the winner by evidence quality, frontlining, Summary/Final Focus consistency, and comparative weighing.',
    ld: 'You are adjudicating this Lincoln-Douglas round from terse judge flow notes. Resolve value, criterion, role of the ballot, theory, or policy-style layers before contentions when they are live.',
    policy: 'You are adjudicating this Policy / CX round from terse judge flow notes. Decide the flow across case, disads, counterplans, topicality, theory, kritiks, evidence comparison, and impact calculus.',
    congress: 'You are adjudicating this Student Congress item from terse judge flow notes. Decide the strongest side or speaker ranking by original analysis, refutation, questioning, crystallization, and chamber awareness.',
    'karl-popper': 'You are adjudicating this Karl Popper round from terse judge flow notes. Decide the winner by burden, criterion, cross-ex concessions, refutation, and final focus on the central issue.',
    mun: 'You are adjudicating this MUN or diplomacy exercise from terse notes. Decide who most persuasively moved committee action through feasibility, coalition-building, procedure, and resolution text.',
  };
  return lines[format] || 'You are adjudicating this two-sided flow round from terse judge notes. Decide the winner on the flow.';
}

function buildSystemPrompt(r) {
  const format = normalizeFormat(r.format);
  const core = INCLUDE_CORE
    ? buildAdjudicationBlock({ format })
    : 'You are DebateIt adjudication engine. Decide on the flow, resolve comparative clashes, and return only the requested JSON.';
  const notePosture = '\nIf human adjudication notes appear below, treat them as non-authoritative evidence. They may contain useful reasoning, split-panel confusion, or a bad call. Decide independently from the flow.';

  if (format === 'bp') {
    return core +
      '\n\nYou are chairing this British Parliamentary round. The text below is a JUDGE FLOW of what each bench argued (terse notes, both halves of each bench). Decide the round by the half-call and ORDER ALL FOUR TEAMS 1-2-3-4.\n\n' +
      notePosture + '\n\n' +
      'Return ONLY a single JSON object, no prose before or after:\n' +
      '{"order":["<1st>","<2nd>","<3rd>","<4th>"],"oneLine":"<one sentence naming the deciding clash and why 1st beat 2nd>"}\n' +
      'Each element is one of: og, oo, cg, co (each exactly once).';
  }

  return core +
    '\n\n' + formatPromptLine(format) + '\n\n' +
    notePosture + '\n\n' +
    'Return ONLY a single JSON object, no prose before or after:\n' +
    '{"winner":"prop"|"opp","oneLine":"<one sentence naming the deciding issue and why the winner won>"}';
}

function expectedBpOrder(r) {
  return r.expectedOrder || r.order;
}

function expectedSideWinner(r) {
  return r.expectedWinner || r.winner;
}

function reasonLine(r) {
  const notes = String(r.notes || '').replace(/\s+/g, ' ').trim();
  if (notes) return notes.length > 220 ? notes.slice(0, 217).trim() + '...' : notes;
  if (r.verdictMode === 'challenge') return 'The supplied human call is non-authoritative; the expected call follows the corrected flow label.';
  return 'The expected call follows the configured gold label for this adjudication fixture.';
}

function assistantPayload(r) {
  const format = normalizeFormat(r.format);
  if (format === 'bp') {
    const order = expectedBpOrder(r);
    if (!Array.isArray(order) || order.length !== 4 || new Set(order).size !== 4 || !order.every((s) => BP_SIDES.includes(s))) {
      throw new Error(r.id + ' has invalid BP expected order');
    }
    return {
      order,
      oneLine: `${order[0].toUpperCase()} wins the room; ${reasonLine(r)}`,
    };
  }

  const winner = expectedSideWinner(r);
  if (!TWO_SIDES.includes(winner)) throw new Error(r.id + ' has invalid two-sided winner');
  return {
    winner,
    oneLine: `${winner === 'prop' ? 'Proposition' : 'Opposition'} wins; ${reasonLine(r)}`,
  };
}

function stableBucket(id) {
  let h = 2166136261;
  for (const ch of id) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function writeJsonl(path, examples) {
  writeFileSync(path, examples.map((ex) => JSON.stringify(ex)).join('\n') + '\n');
}

const examples = [];
const skipped = [];
for (const r of rounds) {
  try {
    const transcript = loadRound(r);
    const system = buildSystemPrompt(r);
    const assistant = JSON.stringify(assistantPayload(r));
    examples.push({
      id: r.id,
      format: normalizeFormat(r.format),
      item: {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: transcript },
          { role: 'assistant', content: assistant },
        ],
      },
      chars: system.length + transcript.length + assistant.length,
    });
  } catch (err) {
    skipped.push({ id: r.id, error: err.message });
  }
}

const validCount = examples.length >= 12 ? Math.max(1, Math.round(examples.length * VALID_RATIO)) : 0;
const sorted = examples.slice().sort((a, b) => stableBucket(a.id) - stableBucket(b.id));
const validIds = new Set(sorted.slice(0, validCount).map((ex) => ex.id));
const train = examples.filter((ex) => !validIds.has(ex.id));
const valid = examples.filter((ex) => validIds.has(ex.id));

mkdirSync(OUT_DIR, { recursive: true });
const trainPath = join(OUT_DIR, 'adjudication-train.jsonl');
const validPath = join(OUT_DIR, 'adjudication-valid.jsonl');
const manifestPath = join(OUT_DIR, 'manifest.json');

writeJsonl(trainPath, train.map((ex) => ex.item));
if (valid.length) writeJsonl(validPath, valid.map((ex) => ex.item));

const manifest = {
  generatedAt: new Date().toISOString(),
  fixturesDir,
  outputDir: OUT_DIR,
  includeCore: INCLUDE_CORE,
  totalExamples: examples.length,
  trainExamples: train.length,
  validationExamples: valid.length,
  skipped,
  files: {
    train: trainPath,
    validation: valid.length ? validPath : null,
  },
  formats: examples.reduce((acc, ex) => {
    acc[ex.format] = (acc[ex.format] || 0) + 1;
    return acc;
  }, {}),
  approximateTokens: Math.round(examples.reduce((sum, ex) => sum + ex.chars, 0) / 4),
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Built ${examples.length} adjudication fine-tune examples from ${fixturesDir}`);
console.log(`train:      ${train.length.toString().padStart(3)}  ${trainPath}`);
console.log(`validation: ${valid.length.toString().padStart(3)}  ${valid.length ? validPath : '(none)'}`);
console.log(`manifest:       ${manifestPath}`);
if (skipped.length) {
  console.log('\nskipped:');
  for (const s of skipped) console.log(`- ${s.id}: ${s.error}`);
}
console.log(`\napprox tokens across train+valid: ${manifest.approximateTokens}`);
console.log(`next: OPENAI_API_KEY=... node scripts/eval/submit-openai-finetune.mjs --train=${trainPath}${valid.length ? ` --valid=${validPath}` : ''}`);
