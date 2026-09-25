#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { seasonFor } from '../../app/netlify/functions/lib/judge-charter.mjs';
import { jurorAvailable } from '../../app/netlify/functions/lib/judge-jurors.mjs';
import { validateCases, casePrompt } from './lib/conversation-behavior.mjs';
import { validateJurors, evaluateJuror } from './lib/model-comparison.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => args.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const live = args.includes('--live') && !args.includes('--dry-run');

async function main() {
  const allowed = /^(--live|--dry-run|--(?:jurors|repeat|formats|only|out|cases)=.+)$/;
  if (args.some(a => !allowed.test(a))) throw new Error('Unknown or empty argument');
  const repeats = Number(opt('repeat', '1'));
  const formats = opt('formats', 'open').split(',');
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error('--repeat must be 1..5');
  if (!formats.length || new Set(formats).size !== formats.length || formats.some(f => !['quick', 'open'].includes(f))) throw new Error('Invalid formats');
  const only = opt('only', '').split(',').filter(Boolean);
  const casesPath = resolve(opt('cases', `${here}/conversation-behavior-cases.json`));
  const jurorsPath = opt('jurors', '');
  if (!jurorsPath) throw new Error('--jurors=JSON-file is required; no implicit model substitutions');
  const jurors = validateJurors(JSON.parse(readFileSync(resolve(jurorsPath), 'utf8')));
  const all = validateCases(JSON.parse(readFileSync(casesPath, 'utf8')));
  if (only.some(id => !all.some(c => c.id === id))) throw new Error('Unknown case id');
  const cases = all.filter(c => !only.length || only.includes(c.id));
  const requests = cases.length * formats.length * repeats * jurors.length;
  if (!cases.length || requests > 180) throw new Error('Select 1..180 provider calls per run');
  if (live && jurors.some(j => !jurorAvailable(j))) throw new Error('Missing comparison provider key; no calls made');
  const out = resolve(opt('out', `${here}/out/comparison-${Date.now()}.json`));
  if (existsSync(out)) throw new Error('Output already exists');
  const maxTokens = Number(process.env.JUDGE_JUROR_MAX_TOKENS || 8000);
  if (!Number.isInteger(maxTokens) || maxTokens < 1000 || maxTokens > 16000) throw new Error('Invalid production token budget');
  const season = seasonFor(Date.now());
  const report = {
    kind: 'judge-model-comparison', status: live ? 'running' : 'dry-run',
    startedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: here, encoding: 'utf8' }).trim(),
    productionSeason: season, experimentalJurors: jurors, maxTokens, timeoutMs: 90000,
    maxProviderCalls: live ? requests : 0, formats, repeats, cases,
    methodology: 'Synthetic, independent-seat comparison using unchanged production prompts, dispatch and parser. No panel verdict or production writes. Expectations withheld from prompts. Raw ballots and response token usage retained. Reasoning review required; transport success is not accuracy.',
    prompts: cases.flatMap(c => formats.map(format => ({ caseId: c.id, format, ...casePrompt(c, format) }))), rows: [],
  };
  mkdirSync(dirname(out), { recursive: true });
  const save = () => writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  save();
  console.log(`${live ? 'LIVE' : 'DRY'} comparison: ${cases.length} cases; ${jurors.length} models; ${repeats} repeats; up to ${live ? requests : 0} calls`);
  if (!live) return 0;
  // Observe only allowlisted response metadata. Never record request headers,
  // URLs (Google carries its key there), credentials or provider error bodies.
  const context = new AsyncLocalStorage();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...params) => {
    const response = await originalFetch(...params);
    const capture = context.getStore();
    if (capture && response.ok) {
      const body = await response.clone().json().catch(() => null);
      if (body) Object.assign(capture, {
        returnedModel: body.model || body.modelVersion || null,
        usage: body.usage || body.usageMetadata || null,
        finishReason: body.choices?.[0]?.finish_reason || body.stop_reason || body.candidates?.[0]?.finishReason || null,
      });
    }
    return response;
  };
  try {
    for (let repeat = 1; repeat <= repeats; repeat++) for (const format of formats) for (const c of cases) {
      // Rotate request order while keeping identical prompts and bounded concurrency.
      const order = [...jurors.slice((repeat - 1) % jurors.length), ...jurors.slice(0, (repeat - 1) % jurors.length)];
      const results = await Promise.all(order.map(j => {
        const telemetry = {};
        return context.run(telemetry, async () => ({ caseId: c.id, format, repeat, ...await evaluateJuror(c, format, j, { maxTokens }), telemetry }));
      }));
      report.rows.push(...results);
      save();
      console.log(`${format}/${c.id}/${repeat}: ${results.map(r => `${r.jurorId}=${r.ok ? r.ballot.winner : 'ERROR'} (${Math.round(r.ms / 100) / 10}s)`).join(', ')}`);
    }
  } finally { globalThis.fetch = originalFetch; }
  report.status = 'awaiting-review';
  report.finishedAt = new Date().toISOString();
  report.summary = { calls: report.rows.length, failures: report.rows.filter(r => !r.ok).length, behaviorAccuracy: null };
  save();
  console.log(JSON.stringify(report.summary));
  return report.summary.failures ? 1 : 0;
}

main().then(code => process.exit(code)).catch(error => { console.error(error.message); process.exit(1); });
