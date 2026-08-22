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

import { readFileSync } from 'node:fs';
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

// ── Heuristics ──────────────────────────────────────────────────────
const spoken = {
  name: 'Con Constructive', side: 'con', durationSec: 180,
  text: 'okay so um I think the thing here is you know when we talk about crypto ' +
    'people actually lose real money right and um my opponent said adoption is growing ' +
    'but like adoption growing does not mean harm is shrinking I mean look at the scams ' +
    'the FTX thing basically wiped out regular people so uh yeah that is the first point ' +
    'and the second thing is energy you know mining uses a ton of power and um that cost lands on everyone',
};
const spokenRes = heuristicScreen([spoken], 'quick');
ok(spokenRes.verdict === 'none', 'real disfluent spoken speech screens as none (got ' + spokenRes.verdict + ')');
ok(!spokenRes.hardArtifact, 'spoken speech has no hard artifact');

const pasted = {
  name: 'Pro Constructive', side: 'pro', durationSec: 240,
  text: '**Introduction**\n1. Firstly, cryptocurrency democratizes finance. Furthermore, it is important to note that ' +
    'blockchain provides a comprehensive framework for trustless exchange. [1]\n2. Secondly, adoption underscores ' +
    'legitimacy. Moreover, decentralization is a multifaceted benefit.\nIn conclusion, the harms are overstated.',
};
const pastedRes = heuristicScreen([pasted], 'quick');
ok(pastedRes.hardArtifact, 'markdown remnants are a hard artifact');
ok(pastedRes.verdict === 'strong', 'pasted markdown screens strong (got ' + pastedRes.verdict + ')');

const selfRef = heuristicScreen([{ name: 'X', side: 'pro', durationSec: 60, text: 'As an AI language model I cannot assist with that motion but here are considerations '.repeat(5) }], 'quick');
ok(selfRef.hardArtifact, 'AI self-reference is a hard artifact');

// 400 words in 30 seconds is beyond human delivery.
const fast = heuristicScreen([{ name: 'X', side: 'pro', durationSec: 30, text: 'word '.repeat(400).trim() }], 'quick');
ok(fast.hardArtifact, 'impossible words-per-second is a hard artifact');

// The same pace question stands aside for Policy spread on the SOFT band:
// 5 words/sec is a real spread, not evidence.
const spread = heuristicScreen([{ name: '1AC', side: 'aff', durationSec: 60, text: 'card '.repeat(300).trim() }], 'policy');
ok(!spread.signals.some((s) => s.id === 'suspect_pace'), 'Policy spread pace is not a signal');
ok(!spread.hardArtifact, '5 wps is under the hard line even outside Policy');

// Typed-clean text without artifacts NEVER screens strong on style alone.
const typed = {
  name: 'Pro Rebuttal', side: 'pro', durationSec: 180,
  text: ('The opposition claims regulation suffices. Regulation has failed repeatedly. ' +
    'Consumer losses continue to mount each year. The evidence points one way. ').repeat(8),
};
const typedRes = heuristicScreen([typed], 'quick');
ok(typedRes.verdict !== 'strong' && !typedRes.hardArtifact, 'clean typed prose cannot screen strong on style alone (got ' + typedRes.verdict + ')');

// Skipped and empty speeches are not screened.
const empty = heuristicScreen([{ text: '(skipped)', skipped: true }, { text: '(no transcript)' }], 'quick');
ok(empty.stats.analyzedSpeeches === 0, 'skipped and transcript-less speeches are excluded');
ok(empty.verdict === 'none', 'nothing analyzed screens none');

// ── Prompt fences ───────────────────────────────────────────────────
const prompt = analysisPrompt({ motion: 'THBT x', format: 'quick', accusedName: 'A', speeches: [spoken] });
ok(/Default to none when uncertain/.test(prompt.system), 'fence: default to none');
ok(/NEVER evidence on its own/.test(prompt.system), 'fence: fluency alone never convicts');
ok(/HUMAN reviewer/.test(prompt.system), 'fence: human reviewer owns the outcome');
ok(/never decides a round, a ballot, or a penalty/i.test(prompt.system), 'fence: advisory only');
ok(/evidence AGAINST AI use/.test(prompt.system), 'fence: engagement with the opponent counts for the accused');
ok(prompt.user.indexOf(spoken.text.slice(0, 60)) >= 0, 'prompt carries the transcript');

// ── Parser ──────────────────────────────────────────────────────────
ok(parseAnalysis('noise {"verdict":"weak","signals":["a"],"summary":"s"} tail')?.verdict === 'weak', 'parser finds embedded JSON');
ok(parseAnalysis('not json at all') === null, 'garbage parses to null');
ok(parseAnalysis('{"verdict":"guilty"}') === null, 'out-of-vocabulary verdict rejected');
const longSig = parseAnalysis(JSON.stringify({ verdict: 'weak', signals: Array(20).fill('x'.repeat(999)), summary: 'y'.repeat(2000) }));
ok(longSig.signals.length <= 8 && longSig.signals[0].length <= 240 && longSig.summary.length <= 500, 'parser caps signal and summary size');

// ── Combiner: the style cap is the whole fairness argument ──────────
const softHeur = { verdict: 'none', hardArtifact: false };
const hardHeur = { verdict: 'strong', hardArtifact: true };
ok(combineVerdicts(softHeur, { verdict: 'strong' }) === 'moderate', 'model strong WITHOUT hard artifact caps at moderate');
ok(combineVerdicts(hardHeur, { verdict: 'strong' }) === 'strong', 'model strong WITH hard artifact stands');
ok(combineVerdicts(hardHeur, { verdict: 'none' }) === 'strong', 'a shrugging model cannot erase a mechanical artifact');
ok(combineVerdicts({ verdict: 'weak', hardArtifact: false }, null) === 'weak', 'no model read falls back to heuristics');
ok(combineVerdicts(softHeur, null) === 'none', 'nothing found is none');
ok(AI_USE_VERDICTS.join(',') === 'none,weak,moderate,strong', 'verdict vocabulary is pinned');

// ── Wiring assertions (source reads, same style as the other guards) ─
const reportSrc = readFileSync(join(root, 'app/netlify/functions/report-user.mjs'), 'utf8');
ok(/'ai_use'/.test(reportSrc), 'report-user accepts the ai_use reason');
ok(/aiAnalysis/.test(reportSrc), 'report-user attaches the analysis to the report record');
ok(!/video_bans|banUntil|collection\(['"]strikes|updateParticipants|setUserData|['"]eject/i.test(reportSrc), 'report-user has NO strike/ban/eject write path — the screen is evidence only');
ok(/checkLayers\('aiuse'/.test(reportSrc), 'the model call is rate-limited per reporter');
ok(/Human review proceeds as normal/.test(reportSrc), 'a rate-limited screen still files the report');

const pageSrc = readFileSync(join(root, 'app/live-round.html'), 'utf8');
ok(/value="ai_use"/.test(pageSrc), 'the report modal offers Using AI');
ok(/rosterOppAiReport/.test(pageSrc), 'the opponent card has the one-tap AI report');
ok(/rmbChangeBtn/.test(pageSrc), 'the resolution band has the visible Change control');
ok(/the judge never sees it/i.test(pageSrc), 'the modal states the judge never sees the screen');
// The judge/ballot path must not read the analysis: the only mentions of
// aiAnalysis in the page should be zero (it lives server-side only).
ok(!/aiAnalysis/.test(pageSrc), 'the client never receives or renders the raw analysis');

console.log(passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
