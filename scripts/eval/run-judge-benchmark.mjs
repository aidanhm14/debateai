#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────
// Judge benchmark: which AI lab's brain is the best BP adjudicator?
//
// Runs the SAME gold rounds, decontamination, and adjudication core as
// run-adjudication-eval.mjs across every AI lab reachable with prod keys,
// one flagship model per lab. Differences from the base harness, both
// deliberate:
//   1. Multi-provider — one adapter per lab, same prompt everywhere.
//   2. Flows only — human adjudication notes (oaFile / delibFile /
//      ballotFile / judgeFile) are NEVER included, so no model can read
//      even a decontaminated echo of the human call. Benchmark purity
//      beats context richness here.
// BP rounds only: the 1-2-3-4 ordering gives 6 scored pairs per round,
// so 22 rounds = 132 pairwise calls per model.
//
// Run (keys via env):
//   node scripts/eval/run-judge-benchmark.mjs
//   ... --models=anthropic,openai          # subset of labs
//   ... --limit=5                          # first N rounds
//   ... --out=scripts/eval/benchmark-results.json
//
// Writes an aggregate results JSON (no transcript content — safe to
// commit; the flow-note fixtures themselves stay private, same policy as
// the base harness).
// ────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdjudicationBlock } from '../../app/netlify/functions/lib/adjudication.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BP_SIDES = ['og', 'oo', 'cg', 'co'];

const args = process.argv.slice(2);
const opt = (name, def) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const LIMIT = parseInt(opt('limit', '0'), 10) || 0;
const OUT = opt('out', join(__dirname, 'benchmark-results.json'));
const ONLY_MODELS = opt('models', '').split(',').filter(Boolean);

// ── decontamination — identical to run-adjudication-eval.mjs ──
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

// ── fixture loading — flows ONLY, no human adjudication notes ──
function loadRound(r, fixturesDir) {
  const gov = decontaminate(readFileSync(join(fixturesDir, r.folder, r.govFile), 'utf8'));
  const opp = decontaminate(readFileSync(join(fixturesDir, r.folder, r.oppFile), 'utf8'));
  return [
    'MOTION: ' + r.motion,
    '',
    '=== GOVERNMENT BENCH FLOW (Opening Gov then Closing Gov) ===',
    gov,
    '',
    '=== OPPOSITION BENCH FLOW (Opening Opp then Closing Opp) ===',
    opp,
  ].join('\n');
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

// ── scoring — identical to run-adjudication-eval.mjs ──
function parseOrder(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (!Array.isArray(o.order) || o.order.length !== 4) return null;
    const order = o.order.map((s) => String(s).toLowerCase().trim());
    if (new Set(order).size !== 4 || !order.every((s) => BP_SIDES.includes(s))) return null;
    return { order, oneLine: o.oneLine || '' };
  } catch { return null; }
}
function rankMap(order) { const m = {}; order.forEach((s, i) => (m[s] = i)); return m; }
function pairwiseAgreement(pred, goldOrder) {
  const gp = rankMap(goldOrder), pp = rankMap(pred);
  let ok = 0, total = 0;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = BP_SIDES[i], b = BP_SIDES[j];
    total++;
    if (Math.sign(gp[a] - gp[b]) === Math.sign(pp[a] - pp[b])) ok++;
  }
  return ok / total;
}

// ── provider adapters — one flagship per lab ──
async function postJSON(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000), // reasoner models are slow; hangs are worse
  });
  if (!res.ok) throw new Error(res.status + ': ' + (await res.text()).slice(0, 200));
  return res.json();
}

// Each adapter stashes the model id the API says it SERVED on prov._served
// (labs alias requested ids to newer models, e.g. grok-4 -> grok-4.3); the
// leaderboard reports the served id, not the requested one.
const PROVIDERS = [
  {
    key: 'anthropic', lab: 'Anthropic', model: 'claude-opus-4-8', fallbackModels: ['claude-sonnet-4-6'], env: 'ANTHROPIC_API_KEY',
    call: async function (p, model) {
      const d = await postJSON('https://api.anthropic.com/v1/messages',
        { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        { model, max_tokens: 600, system: p.system, messages: [{ role: 'user', content: p.user }] });
      this._served = d.model || model;
      return (d.content || []).map((c) => c.text || '').join('');
    },
  },
  {
    key: 'openai', lab: 'OpenAI', model: 'gpt-5.2', fallbackModels: ['gpt-5.1', 'gpt-5', 'gpt-4o'], env: 'OPENAI_API_KEY',
    call: async function (p, model) {
      // gpt-5 / o-series models reject max_tokens and spend budget on
      // reasoning before output, so they get max_completion_tokens + headroom
      const reasoning = /^(gpt-5|o\d)/.test(model);
      const body = { model, messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }] };
      if (reasoning) body.max_completion_tokens = 4000; else body.max_tokens = 600;
      const d = await postJSON('https://api.openai.com/v1/chat/completions',
        { authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body);
      this._served = d.model || model;
      return d.choices?.[0]?.message?.content || '';
    },
  },
  {
    key: 'google', lab: 'Google', model: 'gemini-2.5-pro', fallbackModels: ['gemini-2.5-flash', 'gemini-2.0-flash'], env: 'GEMINI_API_KEY',
    call: async function (p, model) {
      const d = await postJSON(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {},
        { systemInstruction: { parts: [{ text: p.system }] }, contents: [{ role: 'user', parts: [{ text: p.user }] }], generationConfig: { maxOutputTokens: 4000 } });
      this._served = (d.modelVersion || model);
      return (d.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
    },
  },
  {
    key: 'xai', lab: 'xAI', model: 'grok-4', fallbackModels: ['grok-3'], env: 'XAI_API_KEY',
    call: async function (p, model) {
      const d = await postJSON('https://api.x.ai/v1/chat/completions',
        { authorization: 'Bearer ' + process.env.XAI_API_KEY },
        { model, max_tokens: 600, messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }] });
      this._served = d.model || model;
      return d.choices?.[0]?.message?.content || '';
    },
  },
  {
    key: 'deepseek', lab: 'DeepSeek', model: 'deepseek-reasoner', fallbackModels: ['deepseek-chat'], env: 'DEEPSEEK_API_KEY',
    call: async function (p, model) {
      const d = await postJSON('https://api.deepseek.com/chat/completions',
        { authorization: 'Bearer ' + process.env.DEEPSEEK_API_KEY },
        // reasoner spends its budget thinking before the answer lands in
        // content; a tight cap yields empty content = unparseable
        { model, max_tokens: 16000, messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }] });
      this._served = d.model || model;
      return d.choices?.[0]?.message?.content || '';
    },
  },
];

// ── load gold ──
const gold = JSON.parse(readFileSync(join(__dirname, 'adjudication-gold.json'), 'utf8'));
const fixtureCandidates = [process.env.ADJ_FIXTURES, gold.fixturesDirDefault, gold.fixturesDirLegacy].filter(Boolean);
const fixturesDir = fixtureCandidates.find((p) => existsSync(p)) || fixtureCandidates[0] || '';
let rounds = gold.rounds.filter((r) => r.format === 'bp');
if (LIMIT) rounds = rounds.slice(0, LIMIT);
const prompts = rounds.map((r) => ({ r, prompt: buildPrompt(loadRound(r, fixturesDir)) }));

// ── run one provider over all rounds, small concurrency, retries with
// backoff (rate limits get longer waits than parse failures) ──
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function judgeOne(prov, model, item) {
  const waits = [3000, 15000, 30000];
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      const raw = await prov.call(item.prompt, model);
      const parsed = parseOrder(raw);
      if (parsed) return parsed;
      if (attempt >= 1) return null; // two parse failures = give up
    } catch (e) {
      if (attempt === waits.length) throw e;
      const rateLimited = /^429/.test(e.message);
      await sleep(rateLimited ? waits[attempt] * 2 : waits[attempt]);
    }
  }
  return null;
}

async function runProvider(prov, skipModels = new Set()) {
  if (!process.env[prov.env]) { console.log(`— ${prov.lab}: no ${prov.env}, skipped`); return null; }
  // probe candidate models in order with a REAL round (a toy probe can pass
  // while full-size calls blow a token quota); first one that answers wins
  const candidates = [prov.model, ...(prov.fallbackModels || [])].filter((m) => !skipModels.has(m));
  let model = null;
  for (const m of candidates) {
    try { await prov.call(prompts[0].prompt, m); model = m; break; }
    catch (e) { console.log(`  ${prov.lab}: ${m} unavailable (${e.message.slice(0, 80)})`); }
  }
  if (!model) { console.log(`— ${prov.lab}: no usable model, skipped`); return null; }
  console.log(`\n${prov.lab} · ${model}`);
  const perRound = [];
  const queue = [...prompts];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        const parsed = await judgeOne(prov, model, item);
        if (!parsed) { console.log(`  ✗ ${item.r.id} unparseable`); perRound.push({ id: item.r.id, error: 'unparseable' }); continue; }
        const agree = pairwiseAgreement(parsed.order, item.r.order);
        const exact = parsed.order.join() === item.r.order.join();
        const top1 = parsed.order[0] === item.r.order[0];
        perRound.push({ id: item.r.id, confidence: item.r.confidence, agree, exact, top1 });
        console.log(`  ${exact ? '✓' : top1 ? '~' : '✗'} ${item.r.id.padEnd(28)} pred=${parsed.order.join('>').padEnd(15)} pair=${(agree * 100).toFixed(0)}%`);
      } catch (e) {
        console.log(`  ✗ ${item.r.id} ${e.message.slice(0, 100)}`);
        perRound.push({ id: item.r.id, error: e.message.slice(0, 200) });
      }
    }
  });
  await Promise.all(workers);
  const ok = perRound.filter((x) => !x.error);
  const n = ok.length;
  const mean = (f) => (n ? ok.reduce((s, x) => s + f(x), 0) / n : 0);
  return {
    lab: prov.lab, model: prov._served || model, requestedModel: model,
    rounds: n, errors: perRound.length - n,
    top1: mean((x) => (x.top1 ? 1 : 0)),
    exact: mean((x) => (x.exact ? 1 : 0)),
    pairwise: mean((x) => x.agree),
    perRound,
  };
}

// ── main ──
const active = PROVIDERS.filter((p) => !ONLY_MODELS.length || ONLY_MODELS.includes(p.key));
console.log(`Judge benchmark · ${rounds.length} BP rounds · ${active.length} labs · fixtures: ${fixturesDir}`);
const results = [];
for (const prov of active) {
  // a lab crashing or quota-ing out must not kill the other labs' runs; if a
  // model passes the probe but then errors every round (per-day quota), demote
  // to the next candidate and try again
  const skip = new Set();
  const maxTries = 1 + (prov.fallbackModels || []).length;
  for (let t = 0; t < maxTries; t++) {
    let r = null;
    try { r = await runProvider(prov, skip); }
    catch (e) { console.log(`— ${prov.lab}: run failed (${e.message.slice(0, 100)})`); break; }
    if (!r) break;
    if (r.rounds > 0) { results.push(r); break; }
    console.log(`— ${prov.lab}: ${r.requestedModel} scored 0 rounds, demoting`);
    skip.add(r.requestedModel);
  }
}

results.sort((a, b) => b.pairwise - a.pairwise);
console.log('\n── LEADERBOARD (pairwise agreement with the human chair) ──');
for (const r of results) {
  console.log(`${r.lab.padEnd(10)} ${r.model.padEnd(30)} pairwise=${(r.pairwise * 100).toFixed(0)}%  top1=${(r.top1 * 100).toFixed(0)}%  exact=${(r.exact * 100).toFixed(0)}%  (${r.rounds} rounds, ${r.errors} errors)`);
}

const payload = {
  _about: 'Aggregate results of the AI judge benchmark: one flagship model per lab, chairing the same real BP out-rounds against the human chair call. No transcript content. See run-judge-benchmark.mjs.',
  generatedAt: new Date().toISOString(),
  roundCount: rounds.length,
  metrics: {
    pairwise: 'fraction of the 6 team-pairs ordered the same way as the human chair (random 50%)',
    top1: 'same 1st place as the chair (random 25%)',
    exact: 'entire 1-2-3-4 ordering matches (random 4%)',
  },
  results,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
console.log(`\nwrote ${OUT}`);
