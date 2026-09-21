// Manual paid test: synthetic evidence, no saved round, audit or rating writes.
// At most three panels and twelve provider requests. Never a CI check.
import { writeFileSync } from 'node:fs';
import { buildPrompt } from '../app/netlify/functions/live-judge.mjs';
import { seasonFor } from '../app/netlify/functions/lib/judge-charter.mjs';
import { runPanel } from '../app/netlify/functions/lib/judge-run.mjs';
if (!process.argv.includes('--live')) throw new Error('Requires --live and operator-provided provider keys');
const count = Number(process.env.LOAD_PANELS || 3);
if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error('One to three panels only');
const season = seasonFor(Date.now());
const { system, user } = buildPrompt({ format:'quick', motion:'The city should make bus travel free.', proName:'A', conName:'B', speeches:[
  {side:'pro',name:'A',text:'Free buses help people on low incomes reach jobs and appointments. The city can redirect the money it spends collecting fares. More riders also means fewer cars and less congestion.'},
  {side:'con',name:'B',text:'Collecting fares costs less than the fares bring in. The proposal leaves a funding gap. People will not switch from cars if buses are unreliable. Spend the available money on more frequent buses and keep discounted fares for people who need them.'},
  {side:'pro',name:'A',text:'Frequency matters, but a frequent service still excludes someone who cannot afford a ticket. A means test misses people with irregular incomes. The city should fund universal access from general revenue.'},
  {side:'con',name:'B',text:'General revenue has other uses. My alternative preserves access for people who cannot pay while funding frequency. They did not show that savings from collecting fares cover the gap, or why targeted discounts cannot address irregular incomes.'},
]});
const rates = { 'api.anthropic.com':[2,10], 'api.x.ai':[1.25,2.5], 'generativelanguage.googleapis.com':[.75,3.75] };
const report = { kind:'synthetic-live-judge-panels', startedAt:new Date().toISOString(), season:season.id, panels:[], calls:[], conservativeCostCeilingUsd:3 };
// One UTF-8 byte per token is deliberately conservative. The actual bounded
// request payload and output ceiling are checked before any paid call.
const rawFetch = globalThis.fetch;
let attempted = 0;
globalThis.fetch = async (input, options) => {
  const host = new URL(String(input)).hostname;
  if (!rates[host] || ++attempted > count * 4) throw new Error('Load test provider/call budget exceeded');
  const body = JSON.parse(options?.body || '{}');
  const max = body.max_tokens || body.max_completion_tokens || body.generationConfig?.maxOutputTokens;
  if (Buffer.byteLength(options.body) > 50000 || max > 8000) throw new Error('Load test token budget exceeded');
  const began = Date.now();
  const response = await rawFetch(input, options);
  const data = await response.clone().json().catch(()=>({}));
  const usage = data.usage || data.usageMetadata || {};
  const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount ?? 0;
  const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? ((usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0));
  report.calls.push({ provider:host, status:response.status, ms:Date.now()-began, inputTokens, outputTokens,
    estimatedCostUsd:(inputTokens*rates[host][0]+outputTokens*rates[host][1])/1e6 });
  return response;
};
try {
  await Promise.all(Array.from({length:count}, async (_, i) => {
    const started = Date.now();
    try {
      const result = await runPanel(season, system, user, {aKey:'pro',bKey:'con',scoreScale:100,jurorTimeoutMs:90000,allowRuntimeFallbackCall:true});
      const row = { panel:i, ms:Date.now()-started, resolution:result.panel?.resolution, votes:result.panel?.votesCast,
        jurors:result.jurorResults.map(j=>({provider:j.provider,model:j.model,ok:j.ok,ms:j.ms,error:j.ok?undefined:j.error})) };
      report.panels.push(row); console.log(JSON.stringify(row));
    } catch(error) { report.panels.push({panel:i,ms:Date.now()-started,error:String(error.message)}); }
  }));
  report.passed = report.panels.every(p=>p.votes===3 && p.jurors.every(j=>j.ok));
  report.estimatedCostUsd = report.calls.reduce((sum,c)=>sum+c.estimatedCostUsd,0);
} finally {
  globalThis.fetch = rawFetch;
  report.finishedAt = new Date().toISOString();
  if(process.env.LOAD_REPORT_PATH) writeFileSync(process.env.LOAD_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
}
if(!report.passed) process.exitCode=1;
