#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────
// Adjudication eval harness.
//
// Replays real debate rounds (chair/panellist flow notes) through the AI
// judge and scores the output against the configured expected call. BP rounds
// are scored as 1-2-3-4 team orderings. WSDC / other two-sided rounds are
// scored as side winners. A fixture can preserve the human panel's call while
// setting an expected disagreement label, so the model can learn to challenge
// bad calls rather than imitate every note blindly. Uses the SAME server-side
// adjudication core that ships in prod, so this measures the real engine, not
// a stand-in.
//
// Run:
//   node scripts/eval/run-adjudication-eval.mjs --dry-run
//   ANTHROPIC_API_KEY=sk-... node scripts/eval/run-adjudication-eval.mjs
//   node scripts/eval/run-adjudication-eval.mjs --only=vienna24-r2
//   node scripts/eval/run-adjudication-eval.mjs --format=bp
//   node scripts/eval/run-adjudication-eval.mjs --limit=5
//   ADJ_FIXTURES=/path/to/flows node scripts/eval/run-adjudication-eval.mjs
//   ADJ_MODEL=claude-sonnet-4-6 node scripts/eval/run-adjudication-eval.mjs
//
// CAVEAT: the fixtures are the chair's own shorthand FLOW notes, not clean
// speech transcripts, and they contain inline verdict marks. We decontaminate
// before judging, but the strip is best-effort. Treat the score as a noisy
// lower bound and a regression tripwire, not an absolute grade.
// ────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdjudicationBlock } from '../../app/netlify/functions/lib/adjudication.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BP_SIDES = ['og', 'oo', 'cg', 'co'];
const TWO_SIDES = ['prop', 'opp'];
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

function normalizeFormat(raw) {
  const compact = String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return FORMAT_ALIASES.get(compact) || compact;
}

// ── args ──
const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const opt = (name, def) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const DRY = flag('dry-run') || !process.env.ANTHROPIC_API_KEY;
const ONLY = opt('only', '');
const FORMAT = normalizeFormat(opt('format', ''));
const LIMIT = parseInt(opt('limit', '0'), 10) || 0;
const MODEL = process.env.ADJ_MODEL || opt('model', 'claude-sonnet-4-6');

// ── load gold ──
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

// ── decontaminate a flow note: strip the judge's inline verdict marks so
// the AI cannot read the answer off the page. Best-effort. ──
const VERDICT_LINE_RE = new RegExp(
  '(default to |fourths|loses to |wins because|non[- ]?responsive|\\bNR to\\b|knifes|uncomparative|missing burden|burden:|weighing on certainty|this concedes|isn.?t this squo|what.?s the delta|d/dx|\\bcall\\b|final calls?)',
  'i'
);
function decontaminate(raw) {
  return raw
    .split('\n')
    .map((line) => {
      let l = line;
      l = l.replace(/\*\*[^*]*\*\*/g, ''); // bold spans = judge interjections
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
  if (format === 'wsdc') {
    const prop = readFirstFixture(r, ['propFile', 'govFile', 'affFile', 'proFile']);
    const opp = readFirstFixture(r, ['oppFile', 'negFile', 'conFile']);
    const notes = loadHumanNotes(r);
    return [
      'MOTION: ' + r.motion,
      '',
      '=== PROPOSITION FLOW ===',
      prop,
      '',
      '=== OPPOSITION FLOW ===',
      opp,
      notes ? '\n=== HUMAN ADJUDICATION NOTES, DECONTAMINATED AND NON-AUTHORITATIVE ===\n' + notes : '',
    ].join('\n');
  }
  const prop = readFirstFixture(r, ['propFile', 'govFile', 'affFile', 'proFile']);
  const opp = readFirstFixture(r, ['oppFile', 'negFile', 'conFile']);
  const notes = loadHumanNotes(r);
  return [
    'MOTION: ' + r.motion,
    '',
    '=== PRO / AFF FLOW ===',
    prop,
    '',
    '=== OPP / NEG FLOW ===',
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

function buildPrompt(r, transcript) {
  const format = normalizeFormat(r.format);
  const core = buildAdjudicationBlock({ format });
  const notePosture = '\nIf human adjudication notes appear below, treat them as non-authoritative evidence. They may contain useful reasoning, split-panel confusion, or a bad call. Decide independently from the flow.';

  if (format === 'bp') {
    const instruction =
      core +
      '\n\nYou are chairing this British Parliamentary round. The text below is a JUDGE FLOW of what each bench argued (terse notes, both halves of each bench). Decide the round by the half-call and ORDER ALL FOUR TEAMS 1-2-3-4.\n\n' +
      notePosture + '\n\n' +
      'Return ONLY a single JSON object, no prose before or after:\n' +
      '{"order":["<1st>","<2nd>","<3rd>","<4th>"],"oneLine":"<one sentence naming the deciding clash and why 1st beat 2nd>"}\n' +
      'Each element is one of: og, oo, cg, co (each exactly once).';
    return { system: instruction, user: transcript };
  }

  const instruction =
    core +
    '\n\n' + formatPromptLine(format) + '\n\n' +
    notePosture + '\n\n' +
    'Return ONLY a single JSON object, no prose before or after:\n' +
    '{"winner":"prop"|"opp","oneLine":"<one sentence naming the deciding issue and why the winner won>"}';
  return { system: instruction, user: transcript };
}

// ── parsing + scoring ──
function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); }
  catch { return null; }
}

function parseBpOrder(text) {
  const o = parseJson(text);
  if (!o || !Array.isArray(o.order) || o.order.length !== 4) return null;
  const order = o.order.map((s) => String(s).toLowerCase().trim());
  if (new Set(order).size !== 4 || !order.every((s) => BP_SIDES.includes(s))) return null;
  return { order, oneLine: o.oneLine || '' };
}

function parseWinner(text) {
  const o = parseJson(text);
  if (!o || !o.winner) return null;
  const winner = String(o.winner).toLowerCase().trim();
  if (!TWO_SIDES.includes(winner)) return null;
  return { winner, oneLine: o.oneLine || '' };
}

function rankMap(order) {
  const m = {};
  order.forEach((s, i) => (m[s] = i));
  return m;
}

function pairwiseAgreement(pred, goldOrder) {
  const gp = rankMap(goldOrder);
  const pp = rankMap(pred);
  let ok = 0;
  let total = 0;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = BP_SIDES[i];
    const b = BP_SIDES[j];
    total++;
    if (Math.sign(gp[a] - gp[b]) === Math.sign(pp[a] - pp[b])) ok++;
  }
  return ok / total;
}

async function callAnthropic(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    }),
  });
  if (!res.ok) throw new Error('Anthropic ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  return (data.content || []).map((c) => c.text || '').join('');
}

function verdictMode(r) {
  return r.verdictMode || (r.expectedOrder || r.expectedWinner ? 'challenge' : 'reference');
}

function expectedBpOrder(r) {
  return r.expectedOrder || r.order;
}

function expectedSideWinner(r) {
  return r.expectedWinner || r.winner || 'unknown';
}

function goldLabel(r) {
  return normalizeFormat(r.format) === 'bp' ? expectedBpOrder(r).join('>') : expectedSideWinner(r);
}

function promptTokens(prompt) {
  return Math.round(prompt.system.length / 4) + Math.round(prompt.user.length / 4);
}

// ── run ──
console.log(`\nAdjudication eval  ·  ${rounds.length} rounds${FORMAT ? ' (' + FORMAT + ')' : ''}  ·  fixtures: ${fixturesDir}`);
console.log(DRY ? '(DRY RUN — set ANTHROPIC_API_KEY and drop --dry-run to score)\n' : `(model: ${MODEL})\n`);

const results = [];
for (const r of rounds) {
  let transcript;
  try { transcript = loadRound(r); }
  catch (e) { console.log(`x ${r.id.padEnd(28)} fixture missing: ${e.message.split(':')[0]}`); continue; }
  const prompt = buildPrompt(r, transcript);

  if (DRY) {
    const mode = verdictMode(r) === 'challenge' ? ' challenge' : '';
    console.log(`• ${r.id.padEnd(28)} ${normalizeFormat(r.format).padEnd(12)} gold=${goldLabel(r).padEnd(15)} conf=${(r.confidence || '').padEnd(9)}${mode.padEnd(10)} transcript=${String(transcript.length).padStart(5)}ch  prompt≈${promptTokens(prompt)} tok`);
    continue;
  }

  try {
    const raw = await callAnthropic(prompt);
    if (normalizeFormat(r.format) === 'bp') {
      const parsed = parseBpOrder(raw);
      if (!parsed) { console.log(`x ${r.id.padEnd(28)} unparseable output`); continue; }
      const expected = expectedBpOrder(r);
      const agree = pairwiseAgreement(parsed.order, expected);
      const exact = parsed.order.join() === expected.join();
      const top1 = parsed.order[0] === expected[0];
      results.push({ format: normalizeFormat(r.format), id: r.id, conf: r.confidence, mode: verdictMode(r), agree, exact, top1 });
      const tag = exact ? 'EXACT' : top1 ? 'top1 ok' : 'top1 miss';
      console.log(`${exact ? '✓' : top1 ? '~' : 'x'} ${r.id.padEnd(28)} pred=${parsed.order.join('>').padEnd(15)} gold=${expected.join('>').padEnd(15)} pair=${(agree * 100).toFixed(0)}% ${tag}`);
    } else {
      const parsed = parseWinner(raw);
      if (!parsed) { console.log(`x ${r.id.padEnd(28)} unparseable output`); continue; }
      const expected = expectedSideWinner(r);
      const exact = parsed.winner === expected;
      results.push({ format: normalizeFormat(r.format), id: r.id, conf: r.confidence, mode: verdictMode(r), exact, top1: exact });
      console.log(`${exact ? '✓' : 'x'} ${r.id.padEnd(28)} pred=${parsed.winner.padEnd(5)} gold=${expected.padEnd(5)} ${exact ? 'winner ok' : 'winner miss'}`);
    }
  } catch (e) {
    console.log(`x ${r.id.padEnd(28)} ${e.message.slice(0, 120)}`);
  }
}

if (!DRY && results.length) {
  const mean = (xs, f) => xs.reduce((s, x) => s + f(x), 0) / xs.length;
  const bp = results.filter((x) => x.format === 'bp');
  const two = results.filter((x) => x.format !== 'bp');
  const challenge = results.filter((x) => x.mode === 'challenge');

  console.log('\n── SCORECARD ──');
  console.log(`rounds scored:       ${results.length}`);
  if (challenge.length) console.log(`challenge rounds:    ${challenge.length}`);
  if (bp.length) {
    console.log(`BP rounds:           ${bp.length}`);
    console.log(`BP top-1 acc:        ${(mean(bp, (x) => x.top1 ? 1 : 0) * 100).toFixed(0)}%   (random ≈ 25%)`);
    console.log(`BP exact acc:        ${(mean(bp, (x) => x.exact ? 1 : 0) * 100).toFixed(0)}%   (random ≈ 4%)`);
    console.log(`BP pairwise agree:   ${(mean(bp, (x) => x.agree) * 100).toFixed(0)}%   (random ≈ 50%, perfect = 100%)`);
  }
  if (two.length) {
    console.log(`Two-sided rounds:    ${two.length}`);
    console.log(`Winner accuracy:     ${(mean(two, (x) => x.exact ? 1 : 0) * 100).toFixed(0)}%   (random ≈ 50%)`);
  }
  console.log('\nBP pairwise agreement is the headline metric for four-team rooms. Winner accuracy is the headline metric for WSDC and other two-sided flows.\n');
}
