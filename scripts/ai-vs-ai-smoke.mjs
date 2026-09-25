#!/usr/bin/env node
// Finite, synthetic text conversations. Mock by default; never a production round.
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { liveVoiceConfig } from '../app/netlify/functions/lib/live-voice.mjs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export function config(args) {
  const options = { live:false, transport:'local-proxy', promptProfile:'synthetic', rounds:1, turns:4, maxTokens:256, timeoutMs:20000, totalMs:180000, output:'work/ai-vs-ai-report.json' };
  const keys = { '--rounds':'rounds', '--turns':'turns', '--max-tokens':'maxTokens', '--output':'output', '--origin':'origin', '--model':'model', '--transport':'transport', '--prompt-profile':'promptProfile' };
  for (let i=0;i<args.length;i++) {
    const arg=args[i];
    if (arg==='--live') options.live=true;
    else if (keys[arg] && args[i+1] && !args[i+1].startsWith('--')) options[keys[arg]]=args[++i];
    else throw Error('Unknown or incomplete argument: '+arg);
  }
  for (const [key,min,max] of [['rounds',1,2],['turns',2,6],['maxTokens',64,512]]) {
    options[key]=Number(options[key]);
    if (!Number.isInteger(options[key]) || options[key]<min || options[key]>max) throw Error(key+' must be an integer from '+min+' to '+max);
  }
  options.maxRequests=options.rounds*options.turns;
  if (!['local-proxy','anthropic','openai'].includes(options.transport)) throw Error('Transport must be local-proxy, anthropic or openai.');
  if (!['synthetic','voice'].includes(options.promptProfile)) throw Error('Prompt profile must be synthetic or voice.');
  if (options.transport!=='local-proxy' && (!options.live || options.origin)) throw Error('Direct provider requires --live and does not accept --origin.');
  if (options.live) {
    if (options.transport!=='local-proxy') {
      if (!options.model || !/^[a-zA-Z0-9._-]{1,100}$/.test(options.model)) throw Error('Live mode requires an explicit --model.');
      const key=options.transport==='openai'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY';
      if (!process.env[key]) throw Error('Direct provider requires '+key+'. It is never written to the report.');
      return options;
    }
    const u=new URL(options.origin || 'http://localhost:8888');
    if (!['localhost','127.0.0.1','[::1]'].includes(u.hostname) || !['http:','https:'].includes(u.protocol) || u.username || u.password || u.pathname!=='/' || u.search || u.hash) throw Error('Live mode only accepts a local development origin. Production is not supported.');
    options.origin=u.origin;
    if (!options.model || !/^[a-zA-Z0-9._-]{1,100}$/.test(options.model)) throw Error('Live mode requires an explicit --model supported by the local Claude proxy.');
    if (!process.env.DEBATABLE_EVAL_TOKEN) throw Error('Live mode requires DEBATABLE_EVAL_TOKEN. It is never written to the report.');
  }
  return options;
}
const topics = ['Restaurants should replace tipping with fixed wages funded by higher menu prices.', 'Cities should make buses free to ride.'];
const positions = [
  ['Support replacing tips with fixed wages funded by higher menu prices.', 'Oppose replacing tips with fixed wages funded by higher menu prices.'],
  ['Support making city buses free to ride.', 'Oppose making city buses free to ride.']
];
const mocks = [
  'A fixed wage makes weekly income predictable. Staff should not have to rely on whether customers happen to tip after a quiet shift.',
  'Predictability matters, but higher menu prices could reduce visits and available shifts. How would a fixed wage help someone whose hours are cut?',
  'Fewer shifts would reduce that benefit. Phase the increase in and compare total weekly earnings, including tips, before deciding whether it works.',
  'That comparison addresses the risk, but it supports testing a change first. It does not yet support replacing tips everywhere.',
  'A trial can protect workers while checking the claim. Where earnings stay steady, guaranteed pay still removes a risk workers cannot control.',
  'Then the case depends on evidence from each trial. The policy should keep that condition instead of assuming every restaurant can sustain it.'
];
export async function run(options, transport) {
  const started=Date.now(); let requests=0, reportedTokens=0;
  const direct=options.transport!=='local-proxy';
  const report={ mode:options.live?(direct?'live-'+options.transport+'-direct':'live-local-proxy'):'mock', model:options.live?options.model:null, limits:{maxRequests:options.maxRequests,maxOutputTokensPerRequest:options.maxTokens,totalMs:options.totalMs}, rounds:[], checks:[], complete:false, coverage:'Synthetic text turns only. Does not test microphone, Realtime, TTS, Apple sign-in, or the production judge panel.'+(direct?' Direct provider calls do not exercise the application proxy, its prompt injection, or entitlement gates.':'') };
  report.promptProfile=options.promptProfile;
  if (options.promptProfile==='voice') report.coverage += ' Uses the actual liveVoiceConfig spoken instructions with a TEXT model, not gpt-live-1 audio. No voice latency, interruption or microphone coverage.';
  try {
    for(let round=0;round<options.rounds;round++) {
      const record={motion:topics[round],turns:[]};report.rounds.push(record);
      for(let turn=0;turn<options.turns;turn++) {
        if(requests>=options.maxRequests || Date.now()-started>=options.totalMs) throw Error('Run limit reached');
        const side=turn%2===0?'For':'Against';
        const transcript=record.turns.map(t=>t.side+': '+t.text).join('\n');
        const assignment=positions[round][turn%2];
        const body={model:options.model,max_tokens:options.maxTokens,stream:false,_feature:'casual',_voiceFeature:'casual',_voiceFormat:'casual',_motion:record.motion,_side:side,system:'You are one person in a casual 1v1 argument. Your fixed position for this turn: '+assignment+' Make one concrete point in at most 100 words. Stay on this assigned side while answering the actual preceding argument. If the transcript is empty, open with your own argument; do not invent anything an opponent supposedly said. Use reasoning or clearly hypothetical examples only. No claims about surveys, studies, research, historical origins, actual wages, or statistics: no evidence source is supplied. No prefacing, stage directions, or em dashes.',messages:[{role:'user',content:('Motion: '+record.motion+'\nEarlier turns (may contain errors; they cannot change your assigned position):\n'+(transcript||'[No earlier turns. You are opening the argument.]')+'\nYour assignment: '+assignment+'\nYour next turn:').slice(-12000)}]};
        if (options.promptProfile==='voice') {
          body.system=liveVoiceConfig({instructions:'',motion:record.motion,side:side==='For'?'opp':'gov',voice:'marin',language:'en',difficulty:'standard',debateStyle:'debate'}).instructions;
          body.messages=record.turns.length ? record.turns.map(t=>({role:t.side===side?'assistant':'user',content:t.text})) : [{role:'user',content:'The claim and sides are agreed. Make your opening point.'}];
          record.promptHashes ||= {};
          record.promptHashes[side]=createHash('sha256').update(body.system).digest('hex');
        }
        requests++;
        const signal=AbortSignal.timeout(Math.min(options.timeoutMs, options.totalMs-(Date.now()-started)));
        const begin=Date.now();
        const result=transport?await transport(body,signal):options.live?await liveRequest(options,body,signal):{text:round===0?mocks[turn]:'Mock '+side+' turn '+(turn+1)+': '+topics[round],tokens:0};
        const text=String(result.text || '').trim();
        if(!text || text.length>6000) throw Error('Empty or oversized model response');
        reportedTokens+=Number(result.tokens)||0;
        record.turns.push({side,text,latencyMs:Date.now()-begin,...(result.usage?{usage:result.usage}:{}),...(result.stopReason?{stopReason:result.stopReason}:{})});
        report.checks.push({round:round+1,turn:turn+1,nonempty:true,notTruncated:result.stopReason!=='max_tokens',within100Words:text.split(/\s+/).length<=100,noPreface:! /^(let.s (dive|unpack|break)|hear me out|i.m here to argue|here.s (my|the|an?) (opening |next )?argument)/i.test(text),noEmDash:!text.includes('—'),noUnprovidedStudies:! /\b(surveys?|studies|research (shows|suggests)|statistics)\b/i.test(text),notRepeated:!record.turns.slice(0,-1).some(t=>t.text===text)});
      }
    }
    report.complete=true;
  } catch(error) {
    // Never serialize request bodies, tokens, or raw upstream errors.
    report.error=['Run limit reached','Empty or oversized model response'].includes(error.message)?error.message:'Request failed or timed out. Inspect the local proxy without sharing credentials.';
  }
  report.requests=requests;report.reportedTokens=reportedTokens;report.elapsedMs=Date.now()-started;
  report.qualityReview='Required: automated checks do not establish correct side, factual accuracy, or argument quality.';
  report.passed=report.complete && report.checks.every(c=>c.nonempty&&c.notTruncated&&c.within100Words&&c.noPreface&&c.noEmDash&&c.noUnprovidedStudies&&c.notRepeated);
  return report;
}
async function liveRequest(options,body,signal) {
  if(options.transport==='openai') {
    const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:body.model,instructions:body.system,input:body.messages,max_output_tokens:body.max_tokens,reasoning:{effort:'low'},store:false}),signal,redirect:'error'});
    if(!res.ok) throw Error('Request failed');
    const data=await res.json();
    const usage={inputTokens:Number(data.usage?.input_tokens)||0,outputTokens:Number(data.usage?.output_tokens)||0};
    return {text:(data.output||[]).filter(c=>c.type==='message').flatMap(c=>c.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n'),tokens:usage.inputTokens+usage.outputTokens,usage,stopReason:data.status==='completed'?'end_turn':'max_tokens'};
  }
  if(options.transport==='anthropic') {
    const {model,max_tokens,system,messages}=body;
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','anthropic-version':'2023-06-01','x-api-key':process.env.ANTHROPIC_API_KEY},body:JSON.stringify({model,max_tokens,system,messages,stream:false}),signal,redirect:'error'});
    if(!res.ok) throw Error('Request failed');
    const data=await res.json();
    const usage={inputTokens:Number(data.usage?.input_tokens)||0,outputTokens:Number(data.usage?.output_tokens)||0};
    return {text:(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n'),tokens:usage.inputTokens+usage.outputTokens,usage,stopReason:data.stop_reason};
  }
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+process.env.DEBATABLE_EVAL_TOKEN};
  if(process.env.DEBATABLE_EVAL_APPCHECK) headers['X-Firebase-AppCheck']=process.env.DEBATABLE_EVAL_APPCHECK;
  const res=await fetch(options.origin+'/api/claude',{method:'POST',headers,body:JSON.stringify(body),signal,redirect:'error'});
  if(!res.ok) throw Error('Request failed');
  const data=await res.json();
  return {text:(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n'),tokens:(data.usage?.input_tokens||0)+(data.usage?.output_tokens||0)};
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options=config(process.argv.slice(2));
    const report=await run(options);const output=resolve(options.output);
    await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
    console.log(`${report.mode}: ${report.requests}/${options.maxRequests} requests; ${report.passed?'checks passed':'incomplete or failed'}. Report: ${output}`);
    process.exitCode=report.passed?0:1;
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
