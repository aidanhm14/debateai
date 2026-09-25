#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { seasonFor } from '../../app/netlify/functions/lib/judge-charter.mjs';
import { jurorAvailable } from '../../app/netlify/functions/lib/judge-jurors.mjs';
import { validateCases, casePrompt, evaluateCase, summarize } from './lib/conversation-behavior.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => args.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const live = args.includes('--live') && !args.includes('--dry-run');
const repeats = Number(opt('repeat', '1'));
const formats = opt('formats', 'open').split(',');
const only = opt('only', '').split(',').filter(Boolean);
const out = resolve(opt('out', `${here}/out/conversation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
const casesPath = resolve(opt('cases', `${here}/conversation-behavior-cases.json`));
const candidatePath = opt('candidate', '');

async function main() {
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error('--repeat must be 1..5');
  if (!formats.length || new Set(formats).size !== formats.length || formats.some(f => !['quick', 'open'].includes(f))) {
    throw new Error('--formats accepts quick,open with no duplicates');
  }
  const packet = JSON.parse(readFileSync(casesPath, 'utf8'));
  const candidateRules = candidatePath ? readFileSync(resolve(candidatePath), 'utf8').trim() : '';
  if (candidatePath && !candidateRules) throw new Error('Empty candidate rules');
  const all = validateCases(packet);
  if (only.some(id => !all.some(c => c.id === id))) throw new Error('Unknown --only case id');
  const cases = all.filter(c => !only.length || only.includes(c.id));
  if (!cases.length || cases.length > 24) throw new Error('Select 1..24 cases');
  const season = seasonFor(Date.now());
  if (!season?.panel?.jurors?.length) throw new Error('No current pinned panel');
  const requests = cases.length * formats.length * repeats * season.panel.jurors.length;
  if (requests > 180) throw new Error('Maximum 180 provider calls per run; select fewer cases or repeats');
  if (live && process.env.JUDGE_PANEL_ENABLED === '0') throw new Error('This eval requires the pinned panel enabled');
  if (live && season.panel.jurors.some(j => !jurorAvailable(j))) throw new Error('Missing a pinned provider key; no silent single-model eval');
  if (existsSync(out)) throw new Error('Output exists; choose a new --out to preserve the prior run');
  const report = {
    kind: 'conversation-behavior-eval', status: live ? 'running' : 'dry-run',
    startedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: here, encoding: 'utf8' }).trim(),
    season: { id: season.id, rubricVersion: season.rubricVersion, panel: season.panel },
    casesFile: casesPath, formats, repeats, maxProviderCalls: live ? requests : 0,
    candidate: candidateRules ? { path: resolve(candidatePath), rules: candidateRules, experimental: true } : null,
    methodology: 'Synthetic prompt-and-panel eval. No round, audit, rating or billing-ledger writes. Does not exercise room eligibility or audio transcription. Raw responses and parsed ballots are both retained. Expected behaviors never enter judge prompts. Review is separate from transport success.',
    cases, rows: [],
  };
  mkdirSync(dirname(out), { recursive: true });
  const save = () => { report.summary = summarize(report.rows); writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); };
  save();
  console.log(`${live ? 'LIVE' : 'DRY'}: ${cases.length} cases, ${formats.join(',')}, ${repeats} repeat(s), up to ${live ? requests : 0} provider calls`);
  for (let repeat = 1; repeat <= repeats; repeat++) for (const format of formats) for (const c of cases) {
    const row = { caseId: c.id, format, repeat, ...(live
      ? await evaluateCase(c, format, season, { candidateRules })
      : { prompt: (() => { const p = casePrompt(c, format); if (candidateRules) p.system += '\n\n' + candidateRules; return p; })(), complete: false, dryRun: true }) };
    report.rows.push(row);
    save();
    console.log(`${format}/${c.id}/${repeat}: ${live ? `${row.complete ? 'complete' : 'incomplete'}; winner=${row.ballot?.winner ?? 'none'}` : 'assembled'}`);
  }
  report.status = live ? 'awaiting-review' : 'dry-run';
  report.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify(report.summary));
  console.log(`Report: ${out}`);
  return live && report.rows.some(r => !r.complete) ? 1 : 0;
}

main().then(code => process.exit(code)).catch(error => { console.error(error.message); process.exit(1); });
