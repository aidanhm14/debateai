import { readPageSource } from './lib/page-source.mjs';
// Guard for the AI-use screen (lib/ai-use.mjs + its wiring). The promises
// pinned here are published to users in the report modal, so breaking one
// is a lie on a safety surface, not a refactor:
//   1. The screen is EVIDENCE, never a verdict: no strike/ban/eject path
//      may exist in report-user.mjs, and a failed screen never blocks the
//      report itself.
//   2. Style can never convict: a model verdict of 'strong' is capped at
//      'moderate' unless the heuristics found a mechanical artifact.
//   3. The prompt carries the fairness fences verbatim.
//   4. The AI judge never sees the analysis: nothing in the judge path
//      reads safety_reports.
// Run: node scripts/test-ai-use.mjs

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  AI_USE_VERDICTS, benchOfSide, heuristicScreen,
  analysisPrompt, parseAnalysis, combineVerdicts,
} from '../app/netlify/functions/lib/ai-use.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + label);
}

// ── benchOfSide covers every format side key ────────────────────────
for (const s of ['pro', 'gov', 'aff', 'prop', 'og', 'cg']) ok(benchOfSide(s) === 'pro', 'side ' + s + ' → pro bench');
for (const s of ['con', 'opp', 'neg', 'oo', 'co']) ok(benchOfSide(s) === 'con', 'side ' + s + ' → con bench');
ok(benchOfSide('mystery') === '', 'unknown side maps to neither bench, never guessed');

// Reviewable evidence must survive spoofing, attribution and style controls.
const styled = {id:'t1',text:'**Introduction**\n1. Furthermore, the opposition has not answered. '.repeat(40),durationSec:5};
for (const sp of [styled,{...styled,text:'word '.repeat(900)},{...styled,text:'um okay I think that this is wrong'}]) {
  const r=heuristicScreen([sp]); ok(r.verdict==='none'&&!r.hardArtifact,'formatting, pace and fluency are not authorship evidence');
}
const direct={id:'t2',text:'I used ChatGPT to write this speech.'};
const hr=heuristicScreen([direct]);
ok(hr.verdict==='moderate'&&!hr.hardArtifact,'self-report is reviewable, never proof');
ok(heuristicScreen([{text:'For example, "I used ChatGPT" could be a quotation.'}]).verdict==='weak','quotation cannot strengthen a signal');
ok(heuristicScreen([{text:'As an AI language model I cannot do that.'}]).verdict==='weak','assistant phrase needs context');
ok(heuristicScreen([{text:'(skipped)',skipped:true},{text:'(no transcript)'}]).stats.analyzedSpeeches===0,'missing capture is not evidence');
const prompt=analysisPrompt({motion:'A safe motion',speeches:[direct]});
for(const fence of ['HUMAN reviewer','Default to none','NEVER evidence','punctuation','accent','untrusted data'])ok(prompt.system.includes(fence),'prompt fence: '+fence);
ok(prompt.user.includes(direct.text),'quoted transcript reaches model');
const signal={speechId:'t2',quote:direct.text,kind:'self_report',alternative:'Could be quotation or a description of allowed preparation.'};
ok(parseAnalysis(JSON.stringify({signals:[signal]}),[direct]).signals[0].quoteVerified,'exact attributed quote survives');
ok(parseAnalysis(JSON.stringify({signals:[{...signal,speechId:'other'}]}),[direct]).signals.length===0,'wrong speaker rejected');
ok(parseAnalysis(JSON.stringify({signals:[{...signal,quote:'I copied the whole answer from Claude.'}]}),[direct]).signals.length===0,'invented quote rejected');
ok(parseAnalysis('bad json')===null,'invalid output unavailable');
ok(parseAnalysis('{"verdict":"strong","signals":["sounds AI"]}',[direct]).verdict==='none','style verdict cannot become evidence');
ok(combineVerdicts({verdict:'strong',hardArtifact:true},{verdict:'strong'})==='none','legacy strength labels cannot convict');
ok(combineVerdicts(hr,null)==='moderate','direct self-report still needs review');
ok(combineVerdicts(null,parseAnalysis(JSON.stringify({signals:[signal]}),[direct]))==='weak','model only extracts candidate evidence');
ok(AI_USE_VERDICTS.includes('strong'),'historical records stay readable');

// ── Wiring assertions (source reads, same style as the other guards) ─
const reportSrc = readPageSource(join(root, 'app/netlify/functions/report-user.mjs'), 'utf8');
ok(/'ai_use'/.test(reportSrc), 'report-user accepts the ai_use reason');
ok(/aiAnalysis/.test(reportSrc), 'report-user attaches the analysis to the report record');
ok(!/video_bans|banUntil|collection\(['"]strikes|updateParticipants|setUserData|['"]eject/i.test(reportSrc), 'report-user has NO strike/ban/eject write path — the screen is evidence only');
ok(/checkLayers\('aiuse'/.test(reportSrc), 'the model call is rate-limited per reporter');
ok(/Human review proceeds as normal/.test(reportSrc), 'a rate-limited screen still files the report');

const pageSrc = readPageSource(join(root, 'app/live-round.html'), 'utf8');
ok(/value="ai_use"/.test(pageSrc), 'the report modal offers Using AI');
ok(/rosterOppAiReport/.test(pageSrc), 'the opponent card has the one-tap AI report');
ok(/rmbChangeBtn/.test(pageSrc), 'the resolution band has the visible Change control');
ok(/the judge never sees it/i.test(pageSrc), 'the modal states the judge never sees the screen');
// The judge/ballot path must not read the analysis: the only mentions of
// aiAnalysis in the page should be zero (it lives server-side only).
ok(!/aiAnalysis/.test(pageSrc), 'the client never receives or renders the raw analysis');

// ── The review bench (admin-safety-reports.mjs) ─────────────────────
// Same constitution as admin-appeals: the queue where a human reads the
// evidence must contain no model call and no cron, and it must never be
// able to strike, ban, or eject from a dashboard button.
const benchSrc = readPageSource(join(root, 'app/netlify/functions/admin-safety-reports.mjs'), 'utf8');
ok(/requireAdmin/.test(benchSrc), 'the review bench is admin-gated');
ok(!/api\.anthropic\.com|api\.openai\.com|generativelanguage|ANTHROPIC_API_KEY|OPENAI_API_KEY/.test(benchSrc), 'the review bench makes NO provider call — a model may not review a report about a model');
ok(!/schedule\s*:/.test(benchSrc), 'no cron resolves a report on its own');
ok(!/video_bans|banUntil|collection\(['"]strikes|['"]eject/i.test(benchSrc), 'resolving a report cannot strike, ban, or eject');
ok(/note\.length < 10/.test(benchSrc), 'a resolution requires a written reason');
ok(/already_resolved/.test(benchSrc), 'a resolved report stays resolved (no double-resolve)');

const adminSrc = readPageSource(join(root, 'app/admin.html'), 'utf8');
ok(/loadSafetyReports/.test(adminSrc) && /api\/admin\/safety-reports/.test(adminSrc), '/admin renders the queue');
ok(/evidence for you, never a verdict/i.test(adminSrc), 'the card states the evidence-not-verdict posture');

console.log(passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
