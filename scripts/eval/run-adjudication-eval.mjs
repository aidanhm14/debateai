#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────
// Adjudication eval harness.
//
// Replays real BP out-rounds (chair/panellist flow notes) through the AI
// judge and scores its 1-2-3-4 ordering against the chair's actual call.
// Uses the SAME server-side adjudication core that ships in prod, so this
// measures the real engine — not a stand-in.
//
// Run:
//   node scripts/eval/run-adjudication-eval.mjs --dry-run        # no API, validates fixtures + prompts
//   ANTHROPIC_API_KEY=sk-... node scripts/eval/run-adjudication-eval.mjs
//   ... --only=vienna24-r2            # one round
//   ... --limit=5                     # first N rounds
//   ADJ_FIXTURES=/path/to/flows ...   # override transcript dir
//   ADJ_MODEL=claude-sonnet-4-6 ...   # override model id
//
// CAVEAT: the fixtures are the chair's own shorthand FLOW notes, not clean
// speech transcripts, and they contain the chair's inline verdict marks
// (bolded interjections, "default to OG", "NR to frame"). We de-contaminate
// (strip bold spans, parenthetical judge marks, all-caps reactions) before
// judging, but the strip is best-effort and the flows are terse. Treat the
// score as a NOISY LOWER BOUND on judging quality, and a regression tripwire
// — not an absolute grade. For a clean eval, drop full transcripts into the
// fixtures dir and add them to adjudication-gold.json.
// ────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdjudicationBlock } from '../../app/netlify/functions/lib/adjudication.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIDES = ['og', 'oo', 'cg', 'co'];

// ── args ──
const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const opt = (name, def) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const DRY = flag('dry-run') || !process.env.ANTHROPIC_API_KEY;
const ONLY = opt('only', '');
const LIMIT = parseInt(opt('limit', '0'), 10) || 0;
const MODEL = process.env.ADJ_MODEL || opt('model', 'claude-sonnet-4-6');

// ── load gold ──
const gold = JSON.parse(readFileSync(join(__dirname, 'adjudication-gold.json'), 'utf8'));
const fixturesDir = process.env.ADJ_FIXTURES || gold.fixturesDirDefault;
let rounds = gold.rounds.filter((r) => r.format === 'bp');
if (ONLY) rounds = rounds.filter((r) => r.id === ONLY);
if (LIMIT) rounds = rounds.slice(0, LIMIT);

// ── de-contaminate a flow note: strip the judge's inline verdict marks so
// the AI can't read the answer off the page. Best-effort. ──
const VERDICT_LINE_RE = new RegExp(
  '(default to |fourths|loses to |wins because|non[- ]?responsive|\\bNR to\\b|knifes|uncomparative|missing burden|burden:|weighing on certainty|this concedes|isn.?t this squo|what.?s the delta|d/dx)',
  'i'
);
function decontaminate(raw) {
  return raw
    .split('\n')
    .map((line) => {
      let l = line;
      l = l.replace(/\*\*[^*]*\*\*/g, ''); // bold spans = judge interjections
      // parenthetical judge marks
      l = l.replace(/\((?:why+\??|really|d\/dx|knife|unstrategic|same as [a-z]+|nr[^)]*|\?+)\)/gi, '');
      l = l.replace(/\?{2,}/g, '').replace(/\*{2,}/g, ''); // stray ??? / ***
      return l;
    })
    // drop whole lines that are pure judge verdict annotations
    .filter((l) => {
      const t = l.trim();
      if (!t) return true; // keep blank lines for readability
      if (/^[A-Z][A-Z \t!?.'-]{8,}$/.test(t)) return false; // ALL-CAPS reaction line
      if (VERDICT_LINE_RE.test(t) && t.replace(/[*>\- ]/g, '').length < 90) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function loadRound(r) {
  const govPath = join(fixturesDir, r.folder, r.govFile);
  const oppPath = join(fixturesDir, r.folder, r.oppFile);
  const gov = decontaminate(readFileSync(govPath, 'utf8'));
  const opp = decontaminate(readFileSync(oppPath, 'utf8'));
  const transcript =
    'MOTION: ' + r.motion + '\n\n' +
    '=== GOVERNMENT BENCH FLOW (Opening Gov then Closing Gov) ===\n' + gov + '\n\n' +
    '=== OPPOSITION BENCH FLOW (Opening Opp then Closing Opp) ===\n' + opp;
  return transcript;
}

function buildPrompt(transcript) {
  const core = buildAdjudicationBlock({ format: 'bp' });
  const instruction =
    core +
    '\n\nYou are chairing this British Parliamentary round. The text below is a JUDGE FLOW of what each bench argued (terse notes, both halves of each bench). Decide the round by the half-call and ORDER ALL FOUR TEAMS 1-2-3-4.\n\n' +
    'Return ONLY a single JSON object, no prose before or after:\n' +
    '{"order":["<1st>","<2nd>","<3rd>","<4th>"],"oneLine":"<one sentence naming the deciding clash and why 1st beat 2nd>"}\n' +
    'Each element is one of: og, oo, cg, co (each exactly once).';
  return { system: instruction, user: transcript };
}

// ── scoring ──
function parseOrder(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (!Array.isArray(o.order) || o.order.length !== 4) return null;
    const order = o.order.map((s) => String(s).toLowerCase().trim());
    if (new Set(order).size !== 4 || !order.every((s) => SIDES.includes(s))) return null;
    return { order, oneLine: o.oneLine || '' };
  } catch { return null; }
}
function rankMap(order) { const m = {}; order.forEach((s, i) => (m[s] = i)); return m; }
// fraction of the 6 unordered pairs the predicted order gets in the same
// relative order as gold (Kendall agreement; 1.0 = identical, 0.5 = random)
function pairwiseAgreement(pred, goldOrder) {
  const gp = rankMap(goldOrder), pp = rankMap(pred);
  let ok = 0, total = 0;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = SIDES[i], b = SIDES[j];
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

// ── run ──
console.log(`\nAdjudication eval  ·  ${rounds.length} BP rounds  ·  fixtures: ${fixturesDir}`);
console.log(DRY ? '(DRY RUN — set ANTHROPIC_API_KEY and drop --dry-run to score)\n' : `(model: ${MODEL})\n`);

const results = [];
for (const r of rounds) {
  let transcript;
  try { transcript = loadRound(r); }
  catch (e) { console.log(`✗ ${r.id.padEnd(26)} fixture missing: ${e.message.split(':')[0]}`); continue; }
  const prompt = buildPrompt(transcript);

  if (DRY) {
    console.log(`• ${r.id.padEnd(26)} gold=${r.order.join('>').padEnd(15)} conf=${(r.confidence||'').padEnd(9)} transcript=${String(transcript.length).padStart(5)}ch  prompt≈${Math.round(prompt.system.length/4)+Math.round(transcript.length/4)} tok`);
    continue;
  }
  try {
    const raw = await callAnthropic(prompt);
    const parsed = parseOrder(raw);
    if (!parsed) { console.log(`✗ ${r.id.padEnd(26)} unparseable output`); continue; }
    const agree = pairwiseAgreement(parsed.order, r.order);
    const exact = parsed.order.join() === r.order.join();
    const top1 = parsed.order[0] === r.order[0];
    results.push({ id: r.id, conf: r.confidence, agree, exact, top1 });
    const tag = exact ? 'EXACT' : top1 ? 'top1✓' : 'top1✗';
    console.log(`${exact ? '✓' : top1 ? '~' : '✗'} ${r.id.padEnd(26)} pred=${parsed.order.join('>').padEnd(15)} gold=${r.order.join('>').padEnd(15)} pair=${(agree*100).toFixed(0)}% ${tag}`);
  } catch (e) {
    console.log(`✗ ${r.id.padEnd(26)} ${e.message.slice(0, 120)}`);
  }
}

if (!DRY && results.length) {
  const n = results.length;
  const mean = (f) => results.reduce((s, x) => s + f(x), 0) / n;
  console.log('\n── SCORECARD ──');
  console.log(`rounds scored:       ${n}`);
  console.log(`top-1 (winner) acc:  ${(mean((x) => x.top1 ? 1 : 0) * 100).toFixed(0)}%   (random ≈ 25%)`);
  console.log(`exact 1-2-3-4 acc:   ${(mean((x) => x.exact ? 1 : 0) * 100).toFixed(0)}%   (random ≈ 4%)`);
  console.log(`pairwise agreement:  ${(mean((x) => x.agree) * 100).toFixed(0)}%   (random ≈ 50%, perfect = 100%)`);
  console.log('\npairwise agreement is the headline metric: it gives partial credit and is robust to the close/split rounds where even human panels disagree.\n');
}
