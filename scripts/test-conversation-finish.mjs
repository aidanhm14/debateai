import { readPageSource } from './lib/page-source.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import Finish from '../app/js/conversation-finish.js';
import {changeConversationFinish, conversationFinishBlocksJudging, FINISH_REQUEST_MS} from '../app/netlify/functions/lib/conversation-finish.mjs';

const now=1_800_000_000_000;
function fixture(extra={}){
  const data=new Map([['live_rounds/room',{proUid:'a',conUid:'b',proName:'Sam',conName:'Jordan',format:'open',speechIdx:0,
    currentTimer:{state:'running',startMs:now-120000,accumulatedMs:10000},...extra}]]);
  let queue=Promise.resolve();
  const ref=path=>({path});
  const db={collection:key=>({doc:id=>ref(key+'/'+id)}),runTransaction(fn){
    const task=queue.then(async()=>{
      const writes=[];
      const result=await fn({get:async r=>{assert.equal(writes.length,0);return {exists:data.has(r.path),data:()=>structuredClone(data.get(r.path))};},
        set:(r,p)=>writes.push([r.path,p,false]),update:(r,p)=>writes.push([r.path,p,true])});
      writes.forEach(([path,p,merge])=>data.set(path,merge?{...data.get(path),...p}:p));return result;
    });queue=task.catch(()=>{});return task;
  }};
  return {data,round:()=>data.get('live_rounds/room'),receipt:()=>data.get('round_finishes/room'),
    act:(uid,action,id,time=now)=>changeConversationFinish(db,'room',uid,{action,id},time)};
}
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);
let f=fixture();
await rejects(f.act('spectator','request'),'NOT_SEATED');
await rejects(fixture({format:'quick'}).act('a','request'),'WRONG_MODE');
await rejects(fixture({teamSize:2}).act('a','request'),'WRONG_MODE');
await rejects(fixture({currentTimer:{state:'ready'}}).act('a','request'),'NOT_STARTED');
const simultaneous=await Promise.all([f.act('a','request'),f.act('b','request')]);
assert.equal(simultaneous[0].finish.id,simultaneous[1].finish.id,'two concurrent requests share one explicit choice');
const id=simultaneous[0].finish.id;
assert.equal(f.round().ballotPending,undefined,'a finish request never opens judging');
assert.ok(conversationFinishBlocksJudging(f.receipt()));
await rejects(f.act('a','accept',id),'NEEDS_PEER');
await rejects(f.act('a','ready',id),'NEEDS_CONSENT');
await rejects(f.act('b','accept','stale'),'STALE_REQUEST');
await f.act('b','cancel',id);
assert.ok(conversationFinishBlocksJudging(f.receipt()),'cancelling does not license a partial verdict');
const next=(await f.act('a','request',null,now+1)).finish;
await rejects(f.act('b','accept',next.id,now+1+FINISH_REQUEST_MS),'REQUEST_EXPIRED');
assert.equal(f.round().ballotPending,undefined,'silence never means consent');
const active=(await f.act('b','request',null,now+2+FINISH_REQUEST_MS)).finish;
await f.act('a','accept',active.id,now+3+FINISH_REQUEST_MS);
await rejects(f.act('a','cancel',active.id),'ALREADY_ACCEPTED');
f.round().openSegs={pro:[{at:10,text:'Opening',speakerUid:'a',clock:'server'},{at:30,text:'Final reply',speakerUid:'a',clock:'server'}],
  con:[{at:20,text:'Response',speakerUid:'b',clock:'server'},{at:25,text:'Forged',speakerUid:'a'}]};
await f.act('a','ready',active.id);
assert.equal(f.round().ballotPending,undefined,'one durable transcript is insufficient');
assert.ok(conversationFinishBlocksJudging(f.receipt()));
await f.act('a','ready',active.id,now+999999);
assert.equal(f.round().ballotPending,undefined,'a disconnected peer never times out into an incomplete verdict');
f.round().openSegs.con.push({at:40,text:'Last words after a slow upload',speakerUid:'b',clock:'server'});
f.round().openSegs.pro=[];
const done=await f.act('b','ready',active.id);
assert.equal(done.finish.phase,'completed');
assert.equal(conversationFinishBlocksJudging(f.receipt()),false);
assert.equal(f.round().ballotPending,true);
assert.match(f.round().speeches[0].text,/Opening[\s\S]*Response[\s\S]*Final reply[\s\S]*Last words/);
assert.doesNotMatch(f.round().speeches[0].text,/Forged/);
assert.equal(f.round().speeches[0].durationSec,190,'time ends when both agree, not at the last network upload');
assert.deepEqual((await f.act('b','ready',active.id)).finish,done.finish,'completed retries are idempotent');
assert.equal('captures' in done.finish,false,'private capture receipts never leak into the room projection');
assert.equal(conversationFinishBlocksJudging(null),false,'legacy completed rounds retain their judging path');

// Exercise the actual client controller against the real transaction engine.
// One final upload fails, then is delayed. Neither screen may finish early.
f=fixture();
const originalFetch=globalThis.fetch;
let peers=[], complete=0, flushes={a:0,b:0}, failPeer=true, release;
const wait=()=>new Promise(resolve=>setImmediate(resolve));
globalThis.fetch=async(url,options)=>{
  const b=JSON.parse(options.body),uid=options.headers.Authorization.slice(7);
  try {const result=await f.act(uid,b.action,b.id);queueMicrotask(()=>peers.forEach(p=>p.sync(result.finish)));return Response.json(result);}
  catch(e){return Response.json({error:e.message,code:e.code},{status:e.status});}
};
function client(uid){
  return Finish.attach({room:()=> 'room',user:()=>({uid,getIdToken:async()=>uid}),side:()=>uid==='a'?'pro':'con',seated:()=>true,
    paint:()=>{},hold:()=>{},complete:async()=>{complete++;},flush:async()=>{
      flushes[uid]++;
      if(uid==='b'&&failPeer)throw new Error('offline');
      if(uid==='b')await new Promise(resolve=>{release=resolve;});
      const side=uid==='a'?'pro':'con';
      f.round().openSegs={...f.round().openSegs,[side]:[{at:uid==='a'?10:20,text:uid+' final words',speakerUid:uid,clock:'server'}]};
    }});
}
try{
  peers=[client('a'),client('b')];
  await peers[0].act('request');await peers[1].act('accept');await wait();await wait();
  assert.equal(complete,0);assert.equal(f.round().ballotPending,undefined);
  failPeer=false;await peers[1].act('retry');await wait();
  assert.equal(complete,0,'retrying a slow upload still holds judging');
  release();await wait();await wait();await wait();
  assert.equal(complete,2,'both clients open the decision after both durable acknowledgments');
  assert.equal(flushes.a,1,'snapshot echoes do not duplicate capture');
  assert.equal(flushes.b,2,'failed save retries before acknowledgment');
  peers[0].sync({id:'old',revision:0,phase:'requested'});assert.equal(complete,2);
  const returning=client('a');returning.sync(f.round().conversationFinish);await wait();
  assert.equal(complete,3,'a rejoining client recovers a completed round');
}finally{globalThis.fetch=originalFetch;}

// Real page helpers, with browser/timer boundaries controlled.
const html=readPageSource(new URL('../app/live-round.html',import.meta.url),'utf8');
function helper(name,next){return html.slice(html.indexOf('  function '+name+'('),html.indexOf(next,html.indexOf('  function '+name+'(')));}
let slowResolve, timeout;
const ctx={srv:{pending:[new Promise(resolve=>{slowResolve=resolve;})]},state:{micActive:false},mic:{},
  setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{},Promise,Error};
vm.createContext(ctx);vm.runInContext(helper('finishPendingTranscription','  // ── Backstop transcription'),ctx);
const pending=ctx.finishPendingTranscription(true);timeout();
await assert.rejects(pending,/still saving/);slowResolve();
await ctx.finishPendingTranscription(true);
// The final durable stream must keep the opening as well as the ending.
// A disconnected Firestore write must never acknowledge readiness.
let streamWrite, saveTimeout, stalledSave=false;
const capture={state:{isDuo:false},openSeg:{segs:[
  {at:1,text:'Opening argument. '+ 'a'.repeat(14000)}, {at:2,text:'Closing argument.'}
]}, TextEncoder,Promise,Error,JSON,console,
  isSpectator:()=>false,openMode:()=>true,myConversationKey:()=> 'pro',
  getRoundDocRef:()=>({set:payload=>{streamWrite=payload;return stalledSave?new Promise(()=>{}):Promise.resolve();}}),
  setTimeout:fn=>{saveTimeout=fn;return 1;},clearTimeout:()=>{},
  RoundEvidence:{hasWords:s=>!!s},liveJourney(){},toast(){}};
vm.createContext(capture);vm.runInContext(helper('openPublishSegs','  function openPeerSide('),capture);
await capture.openPublishSegs(true);
assert.equal(streamWrite.openSegs.pro.length,2);
assert.match(streamWrite.openSegs.pro[0].text,/^Opening argument/);
assert.equal(streamWrite.openSegs.pro[1].text,'Closing argument.');
stalledSave=true;
const disconnected=capture.openPublishSegs(true);saveTimeout();
await assert.rejects(disconnected,/have not reached the server/);
stalledSave=false;await capture.openPublishSegs(true);
const previousWrite=streamWrite;
capture.openSeg.segs=[{at:1,text:'界'.repeat(50000)}];
await assert.rejects(capture.openPublishSegs(true),/storage limit/);
assert.equal(streamWrite,previousWrite,'oversized UTF-8 capture must not overwrite a saved stream with a truncated version');
const flushSource=html.slice(html.indexOf('  async function flushConversationCapture('),html.indexOf('  var conversationFinishControls'));
assert.doesNotMatch(flushSource,/waitForPendingWrites/,'unrelated writes must not block a final acknowledged stream');
// End controls must enforce ownership even when triggered outside the UI.
const locked={state:{phase:'round'},isSpectator:()=>false,isMyTurn:()=>false};
vm.createContext(locked);vm.runInContext(helper('endSpeech','  function finishRound('),locked);locked.endSpeech();
const elements={};
const element=id=>elements[id]||(elements[id]={hidden:false,innerHTML:'',setAttribute(){}});
const plan={state:{phase:'round',formatKey:'quick',speechIdx:0,timerState:'ready',proName:'Sam',conName:'Jordan',proUid:'a',conUid:'b',user:{uid:'b'}},
  $:element,mySide:()=> 'con',isSpectator:()=>false,escHtml:s=>s,fmtTime:n=>`${n/60}:00`,
  speakerNameFor:(f,i)=>f.speeches[i].side==='pro'?'Sam':'Jordan',
  FORMATS:{quick:{speeches:[{side:'pro',time:300},{side:'con',time:300},{side:'pro',time:180},{side:'con',time:180}]}}};
vm.createContext(plan);
vm.runInContext(helper('roundDmTarget','  // ── DM your opponent.')+helper('paintRoundPlan','  // Which seat speaks'),plan);plan.paintRoundPlan();
assert.match(element('roundOwnSide').innerHTML,/You argue AGAINST/,'own side is independent of the first speaker');
assert.match(element('roundPlan').innerHTML,/2\. Against \(you\)/);
assert.match(element('roundPlan').innerHTML,/4\. Against \(you\)/);
assert.match(element('roundSidePair').innerHTML,/FOR<\/b><span class="round-side-member"><span>Sam/);
assert.match(element('roundSidePair').innerHTML,/AGAINST<\/b><span class="round-side-member"><span>Jordan <small>\(you\)/);
assert.match(element('roundSidePair').innerHTML,/data-dm-seat="pro"/);
assert.doesNotMatch(element('roundSidePair').innerHTML,/data-dm-seat="con"/);
assert.match(element('roundPlan').innerHTML,/1\. For<\/b><span class="plan-person">Sam/);
assert.match(element('roundPlan').innerHTML,/2\. Against \(you\)<\/b><span class="plan-person">Jordan/);
plan.state.speechIdx=3;plan.state.timerState='running';plan.paintRoundPlan();
assert.match(element('roundPlan').innerHTML,/<li aria-current="step"><b>4\. Against \(you\)/);
let modesPainted=0;
const controls={paintRoundReadiness(){},paintRoundPlan(){},paintModeDoors(){modesPainted++;},updatePlayPauseBtnCore(){return;},updateRoundFocus(){}};
vm.createContext(controls);vm.runInContext(helper('updatePlayPauseBtn','  function updatePlayPauseBtnCore'),controls);controls.updatePlayPauseBtn();
assert.equal(modesPainted,1,'the waiting speaker still gets the initial mode choices');
const modes={state:{phase:'round',speechIdx:0,timerState:'ready'},openMode:()=>false,
  isSpectator:()=>false,mySide:()=> 'pro',tournamentControlsLocked:()=>false};
vm.createContext(modes);vm.runInContext(helper('modeDoorsVisible','  function paintModeDoors('),modes);
assert.equal(modes.modeDoorsVisible(),false,'timed rounds use the original current-speaker controls');
modes.openMode=()=>true;
assert.equal(modes.modeDoorsVisible(),true,'explicit conversation rooms retain their start choices');
modes.state.timerState='running';
assert.equal(modes.modeDoorsVisible(),false,'running conversations cannot switch modes');
console.log('Conversation finish: consent, concurrent requests, expiry, disconnect, durable tails, retry, reconnect, capture timeout and turn ownership passed.');
