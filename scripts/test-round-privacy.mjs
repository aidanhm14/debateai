import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import Teams from '../app/js/room-teams.js';
const read=p=>readFileSync(p,'utf8');
const page=read('app/live-round.html');
const init=page.slice(page.indexOf('  function publishRoundInit(){'),page.indexOf('  function publishSpeech(entry){'));
let saved=null, writes=[];
const state={motion:'Free public transit',formatKey:'open',proUid:'a',conUid:'b',proName:'A',conName:'B',user:{uid:'a'},isPrivate:true};
const firestore=()=>({runTransaction:async fn=>fn({get:async()=>({exists:!!saved,data:()=>saved}),set:(ref,data)=>writes.push(structuredClone(data))})});
firestore.FieldValue={serverTimestamp:()=>123};
const ctx={state,isSpectator:()=>false,getRoundDocRef:()=>({}),firebase:{firestore},publicNameOf:()=> 'A',currentPublicAvatarIdentity:()=>null,DBRoomTeams:Teams,gtag:()=>{},console};
vm.createContext(ctx);vm.runInContext(init,ctx);
await ctx.publishRoundInit();assert.equal(writes[0].isPrivate,true,'new round private');
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
console.log('Round privacy: private creation, saved visibility on both reload paths, seat-only admission, direct Daily protection, public receive-only access and closed failure paths passed.');
