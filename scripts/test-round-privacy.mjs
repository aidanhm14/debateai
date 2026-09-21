import { readPageSource } from './lib/page-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import Teams from '../app/js/room-teams.js';
const read=p=>readPageSource(p,'utf8');
const page=read('app/live-round.html');
const init=page.slice(page.indexOf('  function publishRoundInit(){'),page.indexOf('  function publishSpeech(entry){'));
let saved=null, writes=[];
const state={motion:'Free public transit',formatKey:'open',proUid:'a',conUid:'b',proName:'A',conName:'B',user:{uid:'a'},isPrivate:true};
const firestore=()=>({runTransaction:async fn=>fn({get:async()=>({exists:!!saved,data:()=>saved}),set:(ref,data)=>writes.push(structuredClone(data))})});
firestore.FieldValue={serverTimestamp:()=>123};
const ctx={state,isSpectator:()=>false,getRoundDocRef:()=>({}),firebase:{firestore},publicNameOf:()=> 'A',currentPublicAvatarIdentity:()=>null,DBRoomTeams:Teams,gtag:()=>{},console};
vm.createContext(ctx);vm.runInContext(init,ctx);
for(const localPrivacy of [true,false,undefined]){
 state.isPrivate=localPrivacy;writes=[];
 await ctx.publishRoundInit();assert.equal(writes[0].isPrivate,true,'fresh round is private even after a partial local snapshot');
}
for(const privacy of [true,false,undefined])for(const speechIdx of [0,2]){
 saved={proUid:'a',conUid:'b',isPrivate:privacy,speechIdx};writes=[];
 state.isPrivate=!privacy;
 await ctx.publishRoundInit();
 assert.ok(writes.every(w=>!Object.hasOwn(w,'isPrivate')),'reload never writes visibility');
}
assert.ok(page.includes('isPrivate: true,'),'query string cannot default a new room public');
assert.ok(!page.includes('id="privacyMenu"'),'no visibility menu');
assert.ok(!page.includes('nudgedUnlisted'),'no repeated unlisted nag');
assert.ok(page.includes('Promise.resolve(publishRoundInit()).then(mountDaily)'),'privacy saves before video credentials');
const adoptPrivacy=page.slice(page.indexOf('    var hasSavedVisibility ='),page.indexOf('    if (privacyChanged){'));
for(const partial of [{lastSeenAt:123},{motion:'More parks'},{judgePicks:{pro:'chair'}}]){
 const privacy={state:{isPrivate:true,roundDocSeen:false},d:partial};
 vm.runInNewContext(adoptPrivacy,privacy);
 assert.equal(privacy.state.isPrivate,true,'a rejected partial creation cannot make the next init public');
 assert.equal(privacy.state.roundDocSeen,false,'partial local data is not an initialized room');
}
for(const savedPrivacy of [true,false,undefined]){
 const privacy={state:{isPrivate:true,roundDocSeen:false},d:{status:'round',posterUid:'a',isPrivate:savedPrivacy}};
 vm.runInNewContext(adoptPrivacy,privacy);
 assert.equal(privacy.state.isPrivate,savedPrivacy===true,'saved legacy and explicit visibility are preserved');
}
const beat=page.slice(page.indexOf('        var seatBeat = function(){'),page.indexOf('        seatBeat();'));
for(const waiting of [{roundDocSeen:false,dailyMounted:false},{roundDocSeen:true,dailyMounted:false}]){
 const beforeRoom={state:{phase:'setup',...waiting}};
 beforeRoom.context=beforeRoom;
 vm.runInNewContext(beat+'seatBeat();',beforeRoom);
}

let round={isPrivate:true,proUid:'a',conUid:'b',posterUid:'a'},calls=[],failToken=false,failRead=false;
const deps={Request,Response,URL,Headers,TextEncoder,crypto,console,Teams,
 process:{env:{DAILY_API_KEY:'test',DAILY_DOMAIN:'test',DAILY_RECORD:'0'}},
 getDb:()=>({collection:name=>({doc:()=>({get:async()=>{
   if(failRead)throw new Error('offline');
   return {exists:name==='live_rounds'&&!!round,data:()=>round};
 }})})}),withDeadline:p=>p,verifyIdToken:async uid=>({sub:uid,firebase:{sign_in_provider:'google.com'}}),
 checkLayers:async()=>({ok:true}),parseTournamentRoom:()=>null,challengeRoomAdmission:async()=>false,
 fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body||'{}')});
  if(url.endsWith('meeting-tokens'))return new Response(JSON.stringify(failToken?{}:{token:'test'}),{status:failToken?500:200});
  return new Response(JSON.stringify({name:'room',privacy:'private',url:'https://test.daily.co/room'}));
 }};
let source=read('app/netlify/functions/create-daily-room.mjs').replace(/^import .*;\n/gm,'').replace('export default async (req) =>','var handler = async (req) =>').replace(/export const config\s*=[\s\S]*$/,'');
vm.createContext(deps);vm.runInContext(source,deps);
const join=(uid,role)=>deps.handler(new Request('https://itsdebatable.com/api/create-daily-room',{method:'POST',headers:uid?{Authorization:'Bearer '+uid}:{},body:JSON.stringify({name:'room',role})}));
for(const uid of ['a','b'])assert.equal((await join(uid,'debater')).status,200);
assert.ok(calls.filter(c=>c.url.endsWith('/rooms')).every(c=>c.body.privacy==='private'),'tokens required even on a direct Daily URL');
for(const role of ['viewer','stage','debater']){
 calls=[];assert.equal((await join('outsider',role)).status,403);assert.equal(calls.length,0,'denied before contacting Daily');
}
assert.equal((await join(null,'stage')).status,403,'stage cannot bypass privacy');
round.isPrivate=false;
assert.equal((await join('outsider','viewer')).status,200);
assert.equal(calls.at(-1).body.properties.permissions.canSend,false);
assert.equal(calls.at(-1).body.properties.permissions.hasPresence,false);
assert.equal((await join('outsider','debater')).status,403,'public visibility does not grant a seat');
failToken=true;assert.equal((await join('outsider','viewer')).status,503,'no tokenless fallback');failToken=false;
failRead=true;assert.equal((await join('a','debater')).status,503);failRead=false;
round=null;assert.equal((await join('outsider','viewer')).status,409,'no view of a not-yet-initialized round');
// Slow admission reads start together, but never issue credentials early.
round={isPrivate:true,proUid:'a',conUid:'b',posterUid:'a'};calls=[];
const originalDb=deps.getDb;
let releaseBans, releaseRound;
const bans=new Promise(resolve=>{releaseBans=resolve;});
const roundWait=new Promise(resolve=>{releaseRound=resolve;});
const started=[];
deps.getDb=()=>({collection:name=>({doc:()=>({get:async()=>{
  started.push(name);
  if(name==='video_bans')await bans;
  if(name==='live_rounds')await roundWait;
  return {exists:name==='live_rounds',data:()=>round};
}})})});
const pendingAdmission=join('a','debater');
for(let i=0;i<30&&!started.includes('live_rounds');i++)await new Promise(resolve=>setImmediate(resolve));
assert.ok(started.includes('video_bans')&&started.includes('live_rounds'),'seat lookup does not wait for ban lookup');
assert.equal(calls.length,0,'pending checks cannot issue video credentials');
releaseRound();await new Promise(resolve=>setImmediate(resolve));
assert.equal(calls.length,0,'completed seat check still waits for the ban check');
releaseBans();assert.equal((await pendingAdmission).status,200);
deps.getDb=originalDb;
console.log('Round privacy: private creation, saved visibility on both reload paths, seat-only admission, direct Daily protection, public receive-only access and closed failure paths passed.');

const { draftFixture } = await import('./test-support/draft-fixture.mjs');
const early = draftFixture();early.rows.delete('live_rounds/room');
await early.action('a','open');
assert.equal(early.round().isPrivate,true,'draft-created rooms start private too');
assert.deepEqual([early.round().proUid,early.round().conUid].sort(),['a','b'],'both assigned seats can read the private draft');
const published = draftFixture();published.rows.get('live_rounds/room').isPrivate=false;
await published.action('a','open');assert.equal(published.round().isPrivate,false,'draft does not change existing visibility');
console.log('Round privacy: draft-first creation and saved public draft visibility passed.');
