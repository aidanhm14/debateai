import assert from 'node:assert/strict';
import { config, run } from './ai-vs-ai-smoke.mjs';
const options=config([]);
assert.equal(options.live,false);assert.equal(options.maxRequests,4);
assert.throws(()=>config(['--rounds','200']),/integer/);
assert.throws(()=>config(['--turns','Infinity']),/integer/);
assert.throws(()=>config(['--live','--origin','https://itsdebatable.com']),/local development/);
assert.throws(()=>config(['--max-tokens','99999']),/integer/);
const report=await run(options);assert.equal(report.requests,4);assert.equal(report.passed,true);
let calls=0;
const failed=await run(options,async()=>{calls++;throw Error('SECRET_TOKEN');});
assert.equal(calls,1);assert.equal(failed.complete,false);assert.equal(JSON.stringify(failed).includes('SECRET_TOKEN'),false);
const repeated=await run(options,async()=>({text:'The same point every turn.'}));assert.equal(repeated.passed,false);
const empty=await run(options,async()=>({text:''}));assert.equal(empty.requests,1);assert.equal(empty.passed,false);
assert.throws(()=>config(['--transport','anthropic']),/requires --live/);
assert.throws(()=>config(['--live','--transport','anthropic','--origin','https://example.com']),/does not accept/);
const previousKey=process.env.ANTHROPIC_API_KEY,previousFetch=globalThis.fetch;
try {
  process.env.ANTHROPIC_API_KEY='test-key-never-output';
  const direct=config(['--live','--transport','anthropic','--model','claude-haiku-4-5-20251001','--turns','2']);
  let requests=0;
  globalThis.fetch=async(url,request)=>{
    requests++;assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(request.redirect,'error');
    assert.equal(request.headers['x-api-key'],'test-key-never-output');
    const body=JSON.parse(request.body);assert.equal(body.max_tokens,256);assert.equal(body.stream,false);assert.equal(body._feature,undefined);
    return {ok:true,json:async()=>({content:[{type:'text',text:'Provider response '+requests}],usage:{input_tokens:10,output_tokens:5},stop_reason:'end_turn'})};
  };
  const actual=await run(direct);assert.equal(actual.passed,true);assert.equal(actual.mode,'live-anthropic-direct');assert.equal(actual.reportedTokens,30);assert.equal(requests,2);assert.equal(JSON.stringify(actual).includes('test-key-never-output'),false);
  const truncated=await run(direct,async()=>({text:'An unfinished point',stopReason:'max_tokens'}));assert.equal(truncated.passed,false);
} finally {globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=previousKey;}
console.log('AI harness: mock, hard caps, production rejection, fail-fast, error redaction and repetition checks passed.');
const previousOpenAI=process.env.OPENAI_API_KEY;
try {
  process.env.OPENAI_API_KEY='fixture-key';
  const settings=config(['--live','--transport','openai','--prompt-profile','voice','--model','gpt-5.6-luna','--turns','2']);
  let n=0;
  globalThis.fetch=async(url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.redirect,'error');
    const b=JSON.parse(init.body);assert.equal(b.store,false);assert.equal(b.max_output_tokens,256);
    assert.match(b.instructions,n===0?/you argue for that exact claim/:/you argue against that exact claim/);
    n++;return {ok:true,json:async()=>({status:'completed',output:[{type:'reasoning'},{type:'message',content:[{type:'output_text',text:'Distinct reason '+n}]}],usage:{input_tokens:8,output_tokens:4}})};
  };
  const result=await run(settings);assert.equal(result.mode,'live-openai-direct');assert.equal(result.passed,true);assert.equal(result.reportedTokens,24);assert.equal(result.rounds[0].promptHashes.For.length,64);assert.match(result.coverage,/not gpt-live-1 audio/);
} finally {globalThis.fetch=previousFetch;if(previousOpenAI===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousOpenAI;}
console.log('OpenAI transport: fixed endpoint, no storage, response parsing, side assignments and prompt provenance passed.');
