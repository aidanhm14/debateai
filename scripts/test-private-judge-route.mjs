// Exercise the actual HTTP handler and stream with controlled auth, billing,
// Firestore and provider boundaries. No credentials or paid API calls.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const values = new Map(); let queue = Promise.resolve();
const ref = path => ({ path, update: async value => { values.set(path,{...values.get(path),...structuredClone(value)}); }, get: async () => ({ exists: values.has(path), data: () => structuredClone(values.get(path)) }) });
const db = { collection: c => ({ doc: id => ref(c + '/' + id) }), runTransaction(fn) {
  const result = queue.then(async () => {
    const staged = new Map([...values].map(([k,v])=>[k,structuredClone(v)]));
    let wrote = false;
    const pending = fn({ get: async r => { assert.equal(wrote,false);return {exists:staged.has(r.path),data:()=>structuredClone(staged.get(r.path))}; }, set: (r,v) => {wrote=true;staged.set(r.path,structuredClone(v));}, update:(r,v)=>{wrote=true;staged.set(r.path,{...staged.get(r.path),...structuredClone(v)});} });
    assert.equal(typeof pending?.then,'function','Firestore transaction callbacks must return a Promise');
    const result = await pending;
    values.clear();for(const [k,v] of staged)values.set(k,v);return result;
  }); queue=result.catch(()=>{});return result;
} };
let providerCalls=0, fail=false, panelCalls=0, ratingCalls=0;
const providerBodies=[];
globalThis.__privateJudgeRouteTest={db,
  panel: async()=>{panelCalls++;return {ballot:{winner:'pro',rfd:'Original live verdict',proPoints:75,conPoints:65},panel:{resolution:'majority',votesCast:3,panelSize:3},jurorResults:[]};},
  rating: async()=>{ratingCalls++;return {applied:false,reason:'already_applied'};},
  team: async uid => uid==='paid' ? {team:{plan:'individual',status:'active'}} : uid==='canceled' ? {team:{plan:'individual',status:'canceled'}} : null,
  provider: async request => {
    providerCalls++;
    const body=await request.json(); providerBodies.push(body);
    const text=fail?'unreadable':body.system.startsWith('Explain the saved final ballot')?'Full explanation of the saved ballot.':JSON.stringify({winner:'pro',rfd:'The direct response carried the round.',proPoints:75,conPoints:65});
    await new Promise(resolve=>setTimeout(resolve,5));
    return new Response('data: '+JSON.stringify({delta:{text}})+'\n\ndata: {"type":"message_stop"}\n\n',{headers:{'content-type':'text/event-stream'}});
  },
};
const hooks=registerHooks({load(url,context,next){
  if(url.endsWith('/lib/firestore.mjs'))return {format:'module',shortCircuit:true,source:'export const getDb=()=>globalThis.__privateJudgeRouteTest.db;export const getUserTeam=uid=>globalThis.__privateJudgeRouteTest.team(uid);export const withDeadline=p=>p;export const FieldValue={serverTimestamp:()=>Date.now(),increment:n=>n,delete:()=>null};export const FieldPath={documentId:()=>"id"};'};
  const effectMocks = {
    'rate-limit.mjs': 'export const callerIp=()=>"test";export const checkLayers=async()=>({ok:true});',
    'judge-run.mjs': 'export const runPanel=async(...args)=>globalThis.__privateJudgeRouteTest.panel(...args);',
    'judge-audit.mjs': 'export const auditRecord=x=>x;export const writeAudit=async()=>{};',
    'judgment.mjs': 'export const recordJudgment=async()=>{};export const judgmentId=(a,b)=>a+":"+b;',
    'settle.mjs': 'export const settleMarket=async()=>({ok:true});',
    'rating-apply.mjs': 'export const applyRoundRating=async()=>globalThis.__privateJudgeRouteTest.rating();',
    'tournament-round.mjs': 'export const verifyTournamentPairing=async()=>null;',
    'tournament-ledger.mjs': 'export const applyTournamentResult=async()=>null;',
  };
  const mockName=Object.keys(effectMocks).find(name=>url.endsWith('/lib/'+name));
  if(mockName)return {format:'module',shortCircuit:true,source:effectMocks[mockName]};
  if(url.endsWith('/lib/auth.mjs'))return {format:'module',shortCircuit:true,source:`export const extractBearerToken=r=>(r.headers.get('authorization')||'').replace('Bearer ','');export async function verifyIdToken(t){if(!t)throw Error('invalid');return {sub:t,firebase:{sign_in_provider:t==='guest'?'anonymous':'google.com'}};}export const isNamedAccount=d=>d?.firebase?.sign_in_provider!=='anonymous';export const isOwnerEmail=()=>false;`};
  if(url.endsWith('/lib/auth-admin.mjs'))return {format:'module',shortCircuit:true,source:`export const getAuthUserByUid=async uid=>({uid,providerData:uid==='guest'?[]:[{providerId:'google.com'}]});`};
  if(url.endsWith('/lib/appcheck.mjs'))return {format:'module',shortCircuit:true,source:'export const checkAppCheck=async()=>({ok:true});'};
  if(/\/functions\/(claude|openai-chat|gemini|grok|deepseek|openlab)\.mjs$/.test(url))return {format:'module',shortCircuit:true,source:`import {guardPrivateJudgeProxy} from './lib/private-judging.mjs';export default async request=>{const copy=request.clone();const denied=await guardPrivateJudgeProxy(request,await copy.json());if(denied)throw Error('proxy authorization missing');return globalThis.__privateJudgeRouteTest.provider(request);};`};
  return next(url,context);
}});
const {default:handler}=await import('../app/netlify/functions/private-judge.mjs');
const body=(n,extra={})=>({model:'claude-opus-5',system:'Judge this round',messages:[{role:'user',content:'Round '+n+' transcript: both sides discussed their reasons.'}],_judgeProvider:'claude',...extra});
const request=(uid,payload)=>new Request('https://itsdebatable.com/api/private-judge',{method:'POST',headers:{'content-type':'application/json',...(uid?{authorization:'Bearer '+uid}:{})},body:JSON.stringify(payload)});
const call=(uid,payload)=>handler(request(uid,payload),{});
const used=uid=>values.get('private_judge_usage/'+uid)?.used||0;
assert.equal((await call('',body(1))).status,401);
assert.equal((await call('guest',body(1))).status,401);
assert.equal((await call('alice',null)).status,400);
assert.equal((await call('alice',body(1,{_judgeProvider:'gpt'}))).status,402,'premium brain requires payment before reserving');
assert.equal(used('alice'),0);assert.equal(providerCalls,0);
const first=await call('alice',body(1));assert.equal(first.status,200);
const receipt=first.headers.get('x-private-judge-receipt');assert.match(receipt,/^[a-f0-9]{64}$/);
assert.match(await first.text(),/message_stop/);assert.equal(used('alice'),1);
const replay=await call('alice',body(1));assert.equal((await replay.json()).receipt,receipt);assert.equal(providerCalls,1,'cached retry does not rerun model');
const supplement=await call('alice',body(1,{system:'full explanation',_judgeSupplement:true,_judgeReceipt:receipt}));
assert.match(await supplement.text(),/Full explanation/);assert.equal(used('alice'),1,'included explanation never spends a second use');
assert.equal(providerBodies.at(-1).model,'claude-sonnet-4-6','supplement model is fixed by server');
assert.match(providerBodies.at(-1).messages[0].content,/Round 1 transcript/);
const beforeSupplementRetry=providerCalls;
const arbitrarySupplement=await call('alice',body(999,{system:'BYPASS SYSTEM',messages:[{role:'user',content:'BYPASS NEW ROUND'}],model:'gpt-expensive',_judgeProvider:'gpt',_judgeSupplement:true,_judgeReceipt:receipt}));
assert.match(await arbitrarySupplement.text(),/Full explanation/);assert.equal(providerCalls,beforeSupplementRetry,'arbitrary supplement prompts only return original cached explanation');
assert.equal(providerBodies.some(b=>JSON.stringify(b).includes('BYPASS')),false,'replacement transcript and system never reach provider');
const supplementReceipt=JSON.parse(await (await call('alice',{_judgeSupplement:true,_judgeReceipt:receipt})).text()).receipt;
assert.equal((await call('alice',{_judgeSupplement:true,_judgeReceipt:supplementReceipt})).status,403,'an explanation cannot mint another explanation capability');

assert.equal((await call('other',body(1,{_judgeSupplement:true,_judgeReceipt:receipt}))).status,403,'another account cannot reuse receipt');
fail=true;const broken=await call('alice',body(2));assert.match(await broken.text(),/"type":"error"/);assert.equal(used('alice'),1,'invalid provider result releases free reservation');
fail=false;const second=await call('alice',body(2));assert.match(await second.text(),/message_stop/);assert.equal(used('alice'),2);
const third=await call('alice',body(3));assert.equal(third.status,402);assert.equal((await third.json()).code,'PRIVATE_JUDGE_PAYMENT_REQUIRED');
for(const n of [1,2,3]){const response=await call('paid',body(n,{_judgeProvider:'deepseek'}));assert.equal(response.status,200);assert.match(await response.text(),/message_stop/);}
assert.equal(used('paid'),0,'active paid plans keep access without trial charges');
for(const n of [1,2]){const response=await call('canceled',body(n));await response.text();}
assert.equal((await call('canceled',body(3))).status,402,'canceled plan cannot bypass trial');
assert.equal((await call('paid',body(4,{_judgeProvider:'invented'}))).status,400);
const {privateJudgeAccounts}=await import('../app/netlify/functions/lib/private-judging.mjs');
await assert.rejects(privateJudgeAccounts(['alice','guest'],{sub:'alice',firebase:{sign_in_provider:'google.com'}}),error=>error.code==='PRIVATE_JUDGE_SIGN_IN_REQUIRED','private peer must also have named account');
await assert.rejects(privateJudgeAccounts(['guest'],null),error=>error.code==='PRIVATE_JUDGE_SIGN_IN_REQUIRED','sweeper cannot grant anonymous private trials');

const {default:liveJudge}=await import('../app/netlify/functions/live-judge.mjs');
const {privateJudgeKey,guardPrivateJudgeProxy}=await import('../app/netlify/functions/lib/private-judging.mjs');
const round=(uid,other='victim')=>({isPrivate:true,format:'quick',ballotDetail:'extensive',motion:'Remote work should be the default',proUid:uid,conUid:other,proName:'Pro',conName:'Con',speeches:[{side:'pro',text:'Remote work gives people time back and lets companies hire from more places.'},{side:'con',text:'Working together makes questions and collaboration easier when people share a place.'}],ballotPending:true,ballotPendingAt:Date.now()-100000});
const liveCall=(uid,room,internal=false)=>liveJudge(new Request('https://itsdebatable.com/api/live-judge',{method:'POST',headers:{'content-type':'application/json',...(uid?{authorization:'Bearer '+uid}:{}),...(internal?{'x-internal-judge-key':'test-internal-judge-key-long'}:{})},body:JSON.stringify({room})}),{});
values.set('live_rounds/Spar-public',{...round('public-user','public-peer'),isPrivate:false});
const publicJudgment=await liveCall('public-user','Spar-public');assert.equal(publicJudgment.status,200);assert.equal((await publicJudgment.json()).ballot.rfd,'Original live verdict');assert.equal(used('public-user'),0,'public ballot still commits without private usage');
values.set('live_rounds/Private-attacker',round('attacker'));
const judged=await liveCall('attacker','Private-attacker');assert.equal(judged.status,200);assert.equal((await judged.json()).ballot.rfd,'Original live verdict');
assert.equal(used('attacker'),1);assert.equal(used('victim'),0,"a client-written peer UID never consumes that person's allowance");
const immutableKey=privateJudgeKey('live:Private-attacker');
assert.equal(values.get('private_judge_receipts/'+immutableKey).uids[0],'attacker');
assert.equal(values.get('private_judge_receipts/'+immutableKey).source,undefined,'private live receipt does not duplicate the transcript');
const originalSource=values.get('judge_explanation_sources/'+immutableKey).source.transcript;
values.set('live_rounds/Private-attacker',{...round('attacker'),ballot:null,serverJudgeState:'failed',speeches:[{side:'pro',text:'BYPASS changed transcript with enough words and characters to otherwise pass the live judge.'},{side:'con',text:'BYPASS different responses with enough words and characters to otherwise pass the live judge.'}]});
const beforeStrangerReplay=JSON.stringify([...values]);
const strangerReplay=await liveCall('stranger','Private-attacker');assert.equal(strangerReplay.status,403);assert.equal(JSON.stringify([...values]),beforeStrangerReplay,'nonparticipant receipt replay performs no writes');
const panelsBeforeReplay=panelCalls;const liveReplay=await liveCall('attacker','Private-attacker');
assert.equal((await liveReplay.json()).ballot.rfd,'Original live verdict');assert.equal(panelCalls,panelsBeforeReplay,'clearing ballot and replacing transcript cannot rerun completed receipt');assert.equal(used('attacker'),1);
const explanation=await call('attacker',{_judgeRoom:'Private-attacker',_judgeSupplement:true,system:'BYPASS private live',messages:[{role:'user',content:'BYPASS unrelated round'}],_judgeProvider:'gpt'});
assert.match(await explanation.text(),/Full explanation/);assert.match(providerBodies.at(-1).messages[0].content,/Remote work gives people time back/);assert.equal(JSON.stringify(providerBodies.at(-1)).includes('BYPASS'),false,'live explanation derives only from immutable original source');
assert.equal(values.get('judge_explanation_sources/'+immutableKey).source.transcript,originalSource);
assert.equal(providerBodies.at(-1)._judgeDetail,'extensive','live explanation preserves the immutable agreed length');
assert.deepEqual(values.get('private_judge_receipts/'+privateJudgeKey('supplement:'+immutableKey)).uids,['attacker','victim'],'shared explanation cache records all participants for deletion');
const directGuard=await guardPrivateJudgeProxy(request('attacker',{}),{_feature:'live-round',_judgeRoom:'Private-attacker',_judgeSupplement:true,system:'BYPASS',messages:[{role:'user',content:'BYPASS'}]});assert.equal(directGuard.status,402,'generic private proxy rejects supplements even with completed receipt');
process.env.INTERNAL_JUDGE_KEY='test-internal-judge-key-long';
values.set('live_rounds/Private-no-request',round('victim','other'));
const noAuthority=await liveCall('', 'Private-no-request',true);assert.equal(noAuthority.status,401);assert.equal((await noAuthority.json()).code,'PRIVATE_JUDGE_REQUEST_REQUIRED');assert.equal(used('victim'),0,'sweep never invents a new private payer');
// A public guest only receives the explanation of their own saved artifact.
values.set('judge_explanation_sources/'+privateJudgeKey('live:Spar-guest'),{state:'complete',private:false,uids:['guest'],source:{kind:'live',transcript:'Original public guest round',format:'quick'},output:JSON.stringify({ballot:{winner:'pro',rfd:'Saved guest result'}})});
const guestExplanation=await call('guest',{_judgeSupplement:true,_judgeRoom:'Spar-guest'});assert.equal(guestExplanation.status,200);assert.match(await guestExplanation.text(),/message_stop/);
assert.equal((await call('guest',{_judgeSupplement:true,_judgeRoom:'Private-attacker'})).status,403);
values.set('live_rounds/Private-draw',round('draw-user'));
values.set('private_judge_receipts/'+privateJudgeKey('live:Private-draw'),{state:'complete',uids:['draw-user'],output:JSON.stringify({noWinner:{outcome:'no_winner',resolution:'unresolved',reason:'A complete even split',proPoints:70,conPoints:70}})});
const ratingsBeforeDraw=ratingCalls;const drawReplay=await liveCall('draw-user','Private-draw');assert.equal((await drawReplay.json()).rated,true);assert.equal(ratingCalls,ratingsBeforeDraw+1,'restored no-winner receipt preserves rating recovery');
delete process.env.INTERNAL_JUDGE_KEY;
hooks.deregister();delete globalThis.__privateJudgeRouteTest;
console.log('Private judge HTTP: named/paid gates, streams, fixed-source supplements, caching, third-use 402, requester-only charging, terminal receipt restoration, nonparticipant refusal and sweep authorization passed.');
