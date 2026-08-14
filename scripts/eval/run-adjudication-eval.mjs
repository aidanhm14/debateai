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

import { readFileSync } from 'node:fs';
import {
  BP_SIDES, TWO_SIDES, normalizeFormat, loadGold, resolveFixturesDir, selectRounds,
  makeReader, buildPrompt, parseJson, promptTokens,
} from './lib/adjudication-fixtures.mjs';

// Fixture reading, decontamination, round composition and prompt
// assembly moved to ./lib/adjudication-fixtures.mjs on 2026-08-14 so the
// stability harness builds the SAME prompt with one thing perturbed.
// Two copies would mean the accuracy number and the stability number
// measure two different engines while claiming to measure one.

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
const gold = loadGold();
const fixturesDir = resolveFixturesDir(gold);
const rounds = selectRounds(gold, { format: FORMAT, only: ONLY, limit: LIMIT });
const { loadRound } = makeReader(fixturesDir);

// ── parsing + scoring ──
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
      // 3000, not 600. Reasoning models bill thinking against max_tokens,
      // so a long round spends the whole budget reasoning and returns no
      // closing brace, which this harness scored as "unparseable output"
      // and therefore as a wrong call. Measured 2026-08-14: vienna24-r2
      // (the longest BP flow in the gold set) failed to parse at 600 and
      // parses at 3000. Same defect prod hit on 2026-08-12; matches
      // BALLOT_MAX_TOKENS in async-sweep.
      max_tokens: 3000,
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
