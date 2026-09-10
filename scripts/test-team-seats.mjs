import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import Teams from '../app/js/room-teams.js';
import {changeTeamSeat,projectTeamRoom,REQUEST_MS} from '../app/netlify/functions/lib/team-seats.mjs';
import {eligibility} from '../app/netlify/functions/lib/rating-apply.mjs';

const now=1_000_000;
// Transactions serialize retries and forbid reads after the first write,
// matching the Firestore contract. Each test executes the real seat engine.
function fixture(extra={}){
  const data=new Map([['live_rounds/room',{proUid:'a',conUid:'b',proName:'Google Full Name',conName:'Other Real Name',posterUid:'a',format:'open',speechIdx:0,...extra}]]);
  for(const uid of ['a','b','c','d','e']){
    data.set('age_bands/'+uid,{band:'adult'});
    data.set('user_profiles/'+uid,{displayName:'Google Full Name',displayNameOverride:uid==='c'?'Nickname':''});
  }
  let queue=Promise.resolve();
  function ref(path){return {path,id:path.split('/').at(-1),collection:key=>({doc:id=>ref(path+'/'+key+'/'+id)}),get:async()=>snap(path)};}
  function snap(path){return {exists:data.has(path),id:path.split('/').at(-1),data:()=>structuredClone(data.get(path))};}
  const db={collection:key=>({doc:id=>ref(key+'/'+id)}),runTransaction(fn){
    const run=queue.then(async()=>{
      const writes=[];
      const tx={get:async ref=>{assert.equal(writes.length,0,'transaction reads precede writes');return snap(ref.path);},
        update:(ref,patch)=>writes.push([ref.path,patch,true]),set:(ref,patch,options)=>writes.push([ref.path,patch,options?.merge])};
      const result=await fn(tx);
      for(const [path,patch,merge] of writes)data.set(path,merge?{...data.get(path),...patch}:patch);
      return result;
    });queue=run.catch(()=>{});return run;
  }};
  return {db,data,round:()=>data.get('live_rounds/room'),act:(uid,action,body={},time=now)=>changeTeamSeat(db,'room',uid,{action,...body},time)};
}
async function reject(promise,code){await assert.rejects(promise,e=>!code||e.code===code);}
let f=fixture();
await reject(f.act('b','enable'),'HOST_ONLY');
await f.act('a','enable');
assert.equal(f.round().teamSize,2);
assert.notEqual(f.round().proName,'Google Full Name','Enabling uses the canonical public alias');
await reject(f.act('a','start'));
await f.act('c','request',{key:'pro2'});
assert.equal(f.round().proUid2,undefined,'Asking never grants a seat');
assert.equal(f.data.get('live_rounds/room/teamSeatRequests/c').name,'Nickname');
await reject(f.act('c','approve',{uid:'c'}),'HOST_ONLY');
await f.act('e','request',{key:'pro2'});
const race=await Promise.allSettled([f.act('a','approve',{uid:'c'}),f.act('a','approve',{uid:'e'})]);
assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'Only one simultaneous approval fills an open seat');
assert.equal(f.round().proUid2,'c');
await reject(f.act('c','request',{key:'con2'}));
await reject(f.act('a','disable'));
await f.act('c','leave');
assert.equal(f.round().proUid2,'');
await f.act('a','disable');
await reject(f.act('d','request',{key:'con2'}));
await f.act('a','enable');
await f.act('e','request',{key:'pro2'});
await reject(f.act('a','approve',{uid:'e'},now+REQUEST_MS+1));
await f.act('e','request',{key:'pro2'});
await f.act('a','decline',{uid:'e'});
await reject(f.act('a','approve',{uid:'e'}));
await f.act('c','request',{key:'pro2'});await f.act('c','withdraw');
await reject(f.act('a','approve',{uid:'c'}));
f.data.delete('age_bands/c');
await reject(f.act('c','request',{key:'pro2'}),'AGE_BAND_REQUIRED');
f.data.set('age_bands/c',{band:'minor'});
await reject(f.act('c','request',{key:'pro2'}),'AGE_BAND_MISMATCH');
f.data.set('age_bands/c',{band:'adult'});
for(const [uid,key] of [['c','pro2'],['d','con2']]){await f.act(uid,'request',{key});await f.act('a','approve',{uid});}
assert.equal(Teams.full(f.round()),true);
await reject(f.act('e','start'),'NOT_SEATED');
await reject(f.act('a','start'));
f.round().seatSeen={a:now,b:now,c:now,d:now-91000};
await reject(f.act('a','start'));
f.round().seatSeen.d=now;
await f.act('a','start');
assert.equal(f.round().teamLockedAt,now);
await reject(f.act('b','start',{format:'quick'}));
for(const [uid,action,body] of [['c','leave'],['a','disable'],['e','request',{key:'con2'}],['a','approve',{uid:'e'}]])await reject(f.act(uid,action,body),'TEAM_SEATS_LOCKED');
assert.equal(projectTeamRoom(f.round(),'a').locked,true);
assert.equal(eligibility('live',{...f.round(),ballot:{winner:'pro'}}).reason,'team_round');
assert.equal(Teams.full({...f.round(),conUid2:'c'}),false);
for(const blocked of [{tournamentRound:1},{recordingRequired:true},{draft:{phase:'striking'}},{currentTimer:{state:'running'}},{speechIdx:1},{openSegs:{pro:[{text:'started'}]}}]){
  const other=fixture(blocked);await reject(other.act('a','enable'));
}
// Four independent streams, identical nicknames, overlapping speech and
// a forged speaker UID. A later timestamp may contain the final upload.
f.round().proName=f.round().proName2='Same nickname';
f.round().openSegs={pro:[{at:now+10,text:'First argument',speakerUid:'a',clock:'server'}],
  pro2:[{at:now+30,text:'Teammate reply',speakerUid:'c',clock:'server'},{at:now+32,text:'Forged',speakerUid:'b'}],
  con:[{at:now+20,text:'Against reply',speakerUid:'b',clock:'server'}],
  con2:[{at:now+40,text:'Final words',speakerUid:'d',clock:'server'}]};
assert.deepEqual(Teams.conversationRows(f.round()).map(r=>r.uid),['a','b','c','d']);
assert.equal(Teams.conversationRows(f.round(),'c',[{at:now+35,text:'Local tail',speakerUid:'c',clock:'server'}])[2].text,'Local tail');
await reject(f.act('e','finish'),'NOT_SEATED');
await reject(f.act('c','finish-ready'));
await f.act('a','finish',{},now+35);
for(const uid of ['a','b','c'])await f.act(uid,'finish-ready',{},now+45);
assert.equal(f.round().speechIdx,0,'No ballot until all four final streams have landed');
await f.act('d','finish-ready',{},now+46);
assert.equal(f.round().speechIdx,1);
assert.equal(f.round().speeches.length,1);
for(const phrase of ['First argument','Against reply','Teammate reply','Final words'])assert.ok(f.round().speeches[0].text.includes(phrase));
assert.ok(!f.round().speeches[0].text.includes('Forged'));
await f.act('a','finish',{},now+60);
assert.equal(f.round().speeches.length,1,'Finish retries never duplicate a speech');
const timeout=fixture({...f.round(),teamFinishedAt:null,teamEnding:null,teamFinished:{},speechIdx:0,speeches:[],ballotPending:false});
await timeout.act('a','finish');await timeout.act('a','finish-ready',{},now+20001);
assert.equal(timeout.round().speeches.length,1,'A disconnected teammate cannot block completion forever');

// Execute the actual in-page attribution helpers, including seat 2 turns.
const page=readFileSync('app/live-round.html','utf8');
const ctx={state:{isDuo:true,user:{uid:'c'},proUid:'a',proUid2:'c',conUid:'b',conUid2:'d'},
  mySide:()=> 'pro',sideBench:(_f,side)=>side==='pro'?'gov':'opp'};
vm.createContext(ctx);
for(const [start,end] of [['  function mySeat(){','  function teamDisplayName('],['  function seatForSpeech(','  // The individual speaking']]){
  vm.runInContext(page.slice(page.indexOf(start),page.indexOf(end,page.indexOf(start))),ctx);
}
assert.equal(ctx.mySeat(),2);assert.equal(ctx.myConversationKey(),'pro2');
const format={speeches:['pro','con','pro','con'].map(side=>({side}))};
assert.deepEqual([0,1,2,3].map(i=>ctx.seatForSpeech(format,i)),[1,1,2,2]);
const track={id:'partner'};
Object.assign(ctx,{FORMATS:{quick:format},trackOf:t=>t,isAudienceName:()=>false,room:{call:{participants:()=>({
  stranger:{user_id:'e',user_name:'Same nickname',tracks:{audio:{id:'wrong'}}},
  partner:{user_id:'c',user_name:'Same nickname',tracks:{audio:track}},
})}}});Object.assign(ctx.state,{formatKey:'quick',speechIdx:2,proName:'Same nickname'});
vm.runInContext(page.slice(page.indexOf('  function bkSpeakerAudioTrack(){'),page.indexOf('  function bkStopCapture(){')),ctx);
assert.equal(ctx.bkSpeakerAudioTrack(),track);
let backupElapsed=0;
Object.assign(ctx,{DBRoomTeams:Teams,CUSTOM_TRACK_OK:true,BK_MIN_ELAPSED_MS:1000,bk:{idx:0},
  bkStopCapture(){},bkReset(){},isSpectator:()=>false,isMyTurn:()=>false,isFactCheckDriver:()=>true,
  getElapsed:()=>{backupElapsed++;return 0;}});
Object.assign(ctx.state,{phase:'round',speechIdx:0,timerState:'running'});ctx.room.joined=true;
vm.runInContext(page.slice(page.indexOf('  function bkTick(){'),page.indexOf('  function startBackstopLoop(){')),ctx);
ctx.bkTick();assert.equal(backupElapsed,1,'A seated partner can be the elected backup transcriber');

assert.ok(page.includes('if (state.isDuo) return {ok:false,reason:'));
console.log('Team seats: host approval, simultaneous requests, expiry, age groups, four-seat start, roster lock, four streams, final drain, timeout, teammate turns and unrated results passed.');

// Run the real Daily handler with only network/auth/database dependencies
// stubbed. A viewer cannot turn a copied URL into a sending credential.
let dailyBody,tokenBody,tokenFails=false;
const dailySource=readFileSync('app/netlify/functions/create-daily-room.mjs','utf8').replace(/^import .*;\n/gm,'').replace('export default async (req) =>','var handler = async (req) =>').replace(/export const config\s*=[\s\S]*$/,'');
const dailyCtx={Request,Response,URL,Headers,TextEncoder,crypto,console,process:{env:{DAILY_API_KEY:'test',DAILY_DOMAIN:'test',DAILY_RECORD:'0'}},Teams,
  getDb:()=>f.db,withDeadline:p=>p,verifyIdToken:async uid=>({sub:uid,firebase:{sign_in_provider:'google.com'}}),
  checkLayers:async()=>({ok:true}),parseTournamentRoom:()=>null,
  fetch:async(url,init)=>{
    if(url.endsWith('/meeting-tokens')){tokenBody=JSON.parse(init.body);return new Response(JSON.stringify(tokenFails?{}:{token:'fake-token'}),{status:tokenFails?500:200});}
    dailyBody=JSON.parse(init.body);return new Response(JSON.stringify({name:'room',url:'https://test.daily.co/room',privacy:'private'}));
  }};
vm.createContext(dailyCtx);vm.runInContext(dailySource,dailyCtx);
const handler=vm.runInContext('handler',dailyCtx);
function join(uid,role){return handler(new Request('https://itsdebatable.com/api/create-daily-room',{method:'POST',headers:{Authorization:'Bearer '+uid,'Content-Type':'application/json'},body:JSON.stringify({name:'room',role})}));}
assert.equal((await join('e','debater')).status,403);
assert.equal((await join('c','debater')).status,200);
assert.equal(dailyBody.privacy,'private');assert.equal(tokenBody.properties.user_id,'c');
assert.equal((await join('e','viewer')).status,200);
assert.equal(tokenBody.properties.permissions.canSend,false);assert.equal(tokenBody.properties.permissions.hasPresence,false);
tokenFails=true;assert.equal((await join('e','viewer')).status,503,'No public fallback when a receive-only token cannot be issued');
console.log('Team video: unapproved sender denied, approved teammate admitted, spectators receive only, private-room token failure fails closed.');
