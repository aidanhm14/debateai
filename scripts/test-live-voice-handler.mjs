import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as live from '../app/netlify/functions/lib/live-voice.mjs';
import * as rt from '../app/netlify/functions/lib/realtime-tools.mjs';
import * as guard from '../app/netlify/functions/lib/content-guard.mjs';
import * as topic from '../app/netlify/functions/lib/topic-isolation.mjs';
import * as funding from '../app/netlify/functions/lib/realtime-funding.mjs';
const source=readFileSync('app/netlify/functions/realtime-session.mjs','utf8').replace(/^import\b[\s\S]*?from ['"][^'"]+['"];\s*/gm,'').replace('export default async','globalThis.handler = async').replace('export const config','const config');
const requests=[],charges=[];
let decoded={sub:'uid-test',email:'test@example.invalid',firebase:{sign_in_provider:'password'}};
let allowed=true,upstreamStatus=201;
const context={...live,...rt,...guard,...topic,...funding,
 Request,Response,Headers,AbortSignal,FormData,console:{log(){},warn(){},error(){}},
 process:{env:{OPENAI_API_KEY:'platform-test-key',VOICE_CONTINUE_SECRET:'continuation-test'}},
 setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;},clearTimeout,
 checkAppCheck:async()=>({ok:true}),extractBearerToken:r=>r.headers.get('authorization'),verifyIdToken:async()=>decoded,
 isOwnerEmail:()=>false,checkLayers:async()=>({ok:true}),callerIp:()=> 'ip',
 TOKENS:{VOICE_ROUND:10},TOKENS_LIVE:true,getTokenBalance:async()=>0,spendTokens:async()=>{throw new Error('unexpected token spend');},
 getDb:()=>({collection:()=>({doc:()=>({get:async()=>({exists:false})})})}),FieldValue:{},getUserTeam:async()=>({team:{plan:'individual',status:'active'}}),
 voiceGate:async()=>({allowed,used:1,reserve:2,remaining:2,budget:{minutes:3}}),
 openVoiceSession:async(_db,uid,session)=>{charges.push({uid,...session});return {used:1,reserve:2,remaining:2};},
 freeVoiceLimit:()=>3,SESSION_RESERVE_MIN:8,FREE_VOICE_NAMED:3,FREE_VOICE_ANON:0,planBypassesVoiceCap:()=>true,
 DEBATE_VOICE:'',getExemplarBlock:async()=>'',getDistillationBlock:async()=>'',
 fetch:async(url,init)=>{requests.push({url,init});return new Response(JSON.stringify(upstreamStatus===201?{session:{id:'live_test'},transport:{sdp:'v=0\r\nanswer'}}:{error:{message:'upstream denied'}}),{status:upstreamStatus});},
};
// createLiveVoice's real request builder must use this harness's fetch.
context.createLiveVoice=args=>live.createLiveVoice({...args,fetcher:context.fetch});
vm.createContext(context);vm.runInContext(source,context);
const body={transport:'live',sdp:'v=0\r\noffer',mode:'clash',motion:'Cities should make buses free',side:'gov',voice:'marin'};
const call=b=>context.handler(new Request('https://itsdebatable.com/api/realtime-session',{method:'POST',headers:{Authorization:'Bearer test',Origin:'https://itsdebatable.com','Content-Type':'application/json'},body:JSON.stringify(b)}));
let result=await call({...body,sdp:''});assert.equal(result.status,400);assert.equal(requests.length,0);
decoded={sub:'anonymous',firebase:{sign_in_provider:'anonymous'}};
result=await call(body);assert.equal(result.status,401);assert.equal(requests.length,0);assert.equal(charges.length,0);
decoded={sub:'uid-test',email:'test@example.invalid',firebase:{sign_in_provider:'password'}};
allowed=false;result=await call(body);assert.equal(result.status,402);assert.equal(requests.length,0);
allowed=true;result=await call({...body,motion:'Abortion should be banned'});assert.equal(result.status,400);assert.equal(requests.length,0);
result=await call(body);assert.equal(result.status,200);const session=await result.json();
assert.equal(session.model,'gpt-live-1');assert.equal(session.transport,'live');assert.equal(session.sdp,'v=0\r\nanswer');
assert.equal(session.client_secret,undefined);assert.equal(JSON.stringify(session).includes('platform-test-key'),false);
assert.equal(session.voiceUsage.sessionId,'live_test');assert.equal(charges.length,1);assert.equal(charges[0].sessionId,'live_test');
assert.equal(result.headers.get('cache-control'),'no-store');
const sent=JSON.parse(requests[0].init.body);assert.equal(sent.session.model,'gpt-live-1');assert.equal(sent.transport.type,'webrtc');
assert.ok(sent.session.delegation.responses.instructions.includes('THE CLAIM'));
allowed=false;result=await call({...body,continuation:session.roundToken,priorTranscript:'USER: It helps commuters.'});assert.equal(result.status,200,'signed continuation passes allowance gate');
assert.equal(charges.length,2,'continuation still meters the new session');
assert.equal((await result.json()).roundToken,session.roundToken,'continuation keeps first admission time');
allowed=true;upstreamStatus=403;const before=requests.length;
result=await call(body);assert.equal(result.status,502);assert.equal(requests.length,before+1,'no fallback session on Live failure');assert.equal(charges.length,2,'failed Live request does not charge');
assert.equal(requests.at(-1).url,'https://api.openai.com/v1/live/sessions');
console.log('Live handler: guest/content/quota gates, exact Live transport, no secret exposure, metering, signed continuation and failed-mint no-charge passed.');
// The tool proposal is screened before it can be displayed or scored.
const claimSource=readFileSync('app/netlify/functions/voice-claim.mjs','utf8').replace(/^import\b[^\n]+\n/gm,'').replace('export default async','globalThis.handler = async').replace('export const config','const config');
let claimUser=true;
const claimContext={...guard,...topic,Response,
 checkAppCheck:async()=>({ok:true}),extractBearerToken:()=> 'test',verifyIdToken:async()=>({}),isNamedAccount:()=>claimUser,
 corsResponse:()=>new Response(null,{status:204}),jsonResponse:(body,status=200)=>new Response(JSON.stringify(body),{status}),errorResponse:(error,status)=>new Response(JSON.stringify({error}),{status}),
};
vm.createContext(claimContext);vm.runInContext(claimSource,claimContext);
const propose=b=>claimContext.handler(new Request('https://itsdebatable.com/api/voice-claim',{method:'POST',body:JSON.stringify(b)}));
assert.equal((await propose({claim:'Cities should make buses free',user_side:'for'})).status,200);
assert.equal((await propose({claim:'Abortion should be banned',user_side:'for'})).status,422);
assert.equal((await propose({claim:'',user_side:'for'})).status,422);
assert.equal((await propose({claim:'Cities should make buses free',user_side:'anything'})).status,400);
claimUser=false;assert.equal((await propose({claim:'Cities should make buses free',user_side:'for'})).status,401);
console.log('Spoken claim gate: named account, valid side, sanitized claim and sensitive-topic refusal passed.');

// A preflight read or post-mint charge failure must never release a session.
upstreamStatus=201; allowed=true;
const goodGate=context.voiceGate, goodOpen=context.openVoiceSession;
context.voiceGate=async()=>null;
let countBefore=requests.length;result=await call(body);assert.equal(result.status,503);assert.equal(requests.length,countBefore);
context.voiceGate=goodGate;context.openVoiceSession=async()=>{throw Error('write failed');};
result=await call(body);assert.equal(result.status,503);assert.equal((await result.json()).sdp,undefined);
context.openVoiceSession=goodOpen;allowed=false;context.getTokenBalance=async()=>10;
context.spendTokens=async()=>({ok:false,balance:0});
result=await call(body);assert.equal(result.status,402);assert.equal((await result.json()).sdp,undefined);
context.spendTokens=async()=>{throw Error('ledger unavailable');};
result=await call(body);assert.equal(result.status,503);assert.equal((await result.json()).sdp,undefined);
context.spendTokens=async()=>({ok:true,balance:0});
result=await call(body);assert.equal(result.status,200);assert.equal((await result.json()).voiceUsage.tokensSpent,10);
console.log('Live funding failures: unreadable allowance, failed usage write and token balance race release no session.');
await import('./test-voice-paywalls.mjs');
