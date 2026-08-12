#!/usr/bin/env node
// Measures /api/blocks against the REAL API, with the real prompt, before
// deploying it. Run by hand, not in CI (it spends money).
//
//   ANTHROPIC_API_KEY=... node scripts/measure-blocks.mjs [--model X] [--tokens N]
//
// This exists because the constraint on that endpoint is a wall clock, not
// a taste judgement: Netlify kills the function at roughly 26 to 30
// seconds, so "does this model and budget fit" is an empirical question.
// Guessing at it cost two deploy cycles, one of which shipped a streaming
// implementation for a timeout that was not an idle timeout. Measure here,
// then ship.
//
// Reports the two numbers that decide it: wall clock, and whether the
// generation hit max_tokens (which truncates the JSON and presents as a
// parse bug rather than as a budget problem).

import { _internal } from '../app/netlify/functions/blocks.mjs';
import { DEBATE_VOICE } from '../app/netlify/functions/lib/voice-guidelines.mjs';

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('Set ANTHROPIC_API_KEY.'); process.exit(1); }

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const MODEL = arg('model', _internal.MODEL);
const FORMAT = arg('format', 'pf');

// A realistic two-contention PF case, which is the median input.
const CASE_TEXT = `CONTENTION ONE: ALUMNI GIVING. Legacy preference is the engine of alumni donation. Alumni give because they believe their children receive consideration. That giving funds need-based financial aid budgets, which is how low-income students attend at all. Removing the preference shrinks the donation pool and therefore shrinks aid. The people harmed first are exactly the students the other side claims to help.

CONTENTION TWO: INSTITUTIONAL AUTONOMY. Private universities are private associations. They may weigh whatever criteria they choose in assembling a class. Government intervention in admissions criteria sets a precedent that reaches far past legacy status, and the same power used here could later be used to dictate criteria we would find far more objectionable. The principle matters more than this one application.`;

const trim = (text, max) => {
  if (!text || text.length <= max) return text || '';
  const cut = text.slice(0, max);
  const lb = cut.lastIndexOf('\n');
  return (lb > max * 0.6 ? cut.slice(0, lb) : cut).trimEnd();
};

const fv = DEBATE_VOICE.forFormat(FORMAT);
const topic = DEBATE_VOICE.inferTopicFromText(CASE_TEXT);
const tp = topic ? DEBATE_VOICE.forTopic(topic) : '';
const suffix = (fv ? '\n\nFORMAT CONVENTIONS (authoritative, these override your priors):\n' + trim(fv, 6000) : '')
             + (tp ? '\n\nDOMAIN CONTEXT (grounding only, still no fabricated citations):\n' + trim(tp, 2500) : '');

const user = _internal.buildUserMessage({
  caseText: CASE_TEXT, format: FORMAT, side: 'neg',
  motion: 'Resolved: The United States should abolish legacy admissions.', sourceNote: '',
});

async function one(label, prompt, maxTokens) {
  const started = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: prompt + suffix, messages: [{ role: 'user', content: user }] }),
  });
  const elapsed = (Date.now() - started) / 1000;
  if (!res.ok) return { label, elapsed, error: `HTTP ${res.status} ${(await res.text()).slice(0, 160)}` };
  const data = await res.json();
  const raw = data?.content?.[0]?.text || '';
  let parsed = null, perr = null;
  try { parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()); }
  catch (e) { perr = e.message; }
  return { label, elapsed, stop: data.stop_reason, inTok: data?.usage?.input_tokens, outTok: data?.usage?.output_tokens, parsed, perr };
}

console.log(`model=${MODEL} format=${FORMAT}  (two concurrent calls)`);
const wall = Date.now();
const [core, support] = await Promise.all([
  one('core', _internal.CORE_PROMPT, 1800),
  one('support', _internal.SUPPORT_PROMPT, 1100),
]);
const total = (Date.now() - wall) / 1000;

for (const r of [core, support]) {
  console.log(`\n${r.label.padEnd(8)}: ${r.elapsed.toFixed(1)}s  stop=${r.stop}  tok ${r.inTok}/${r.outTok}` +
    (r.error ? `  ERROR ${r.error}` : '') + (r.perr ? `  PARSE FAILED: ${r.perr}` : '  parse ok'));
}
console.log(`\nWALL CLOCK : ${total.toFixed(1)}s   ${total < 22 ? 'FITS (budget ~26s)' : 'TOO SLOW'}`);

const c = core.parsed || {}, s2 = support.parsed || {};
const n = (o, k) => Array.isArray(o[k]) ? o[k].length : 0;
console.log(`shape      : ${(c.readBack?.contentions || []).length} contentions, ${n(c,'answers')} answers, ` +
  `${n(s2,'crossEx')} crossEx, ${n(s2,'weighing')} weighing, ${n(s2,'gaps')} gaps, ${n(s2,'theory')} theory, ${n(s2,'evidenceLeads')} leads`);
const a = (c.answers || [])[0];
if (a) {
  console.log(`\ntop answer : ${a.target} [${a.priority}]`);
  console.log(`  best     : ${(a.best || '').slice(0, 210)}`);
  (a.frontlines || []).slice(0, 2).forEach(f => console.log(`  ${f.type}: ${(f.line || '').slice(0, 160)}`));
}
if ((s2.gaps || [])[0]) console.log(`\ngap        : ${s2.gaps[0].slice(0,150)}`);
if ((s2.evidenceLeads || [])[0]) console.log(`lead       : ${String(s2.evidenceLeads[0].claim).slice(0,80)} | note=${s2.evidenceLeads[0].note}`);
