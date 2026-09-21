import assert from 'node:assert/strict';
import fs from 'node:fs';
import Teams from '../app/js/room-teams.js';
import * as challenge from '../app/netlify/functions/lib/challenge.mjs';
import * as room from '../app/netlify/functions/lib/challenge-room.mjs';
import { setChallengeFollow } from '../app/netlify/functions/lib/challenge-follow.mjs';
import { safeIdentity } from '../app/netlify/functions/lib/public-avatar.mjs';
import { displayRating } from '../app/netlify/functions/lib/rating.mjs';
import { corsResponse, jsonResponse, errorResponse } from '../app/netlify/functions/lib/response.mjs';
const rows = new Map(), notifications=[];
let sequence=0, queue=Promise.resolve();
function patch(path,data){const value=rows.get(path)||{};for(const [key,v] of Object.entries(data)){const [a,b]=key.split('.');if(b)(value[a] ||= {})[b]=v;else value[a]=v;}rows.set(path,value);}
function ref(path){return {id:path.split('/').at(-1),path,
 get:async()=>({id:path.split('/').at(-1),ref:ref(path),exists:rows.has(path),data:()=>structuredClone(rows.get(path))}),
 set:async data=>rows.set(path,structuredClone(data)),update:async data=>patch(path,data),
 collection:name=>collection(path+'/'+name)};}
function collection(path,filters=[]){return {
 doc:id=>ref(path+'/'+(id||'new'+ ++sequence)),
 where:(key,op,value)=>collection(path,[...filters,[key,value]]),limit:()=>collection(path,filters),orderBy:()=>collection(path,filters),
 get:async()=>{const docs=[];for(const [key,value]of rows)if(key.startsWith(path+'/')&&key.split('/').length===path.split('/').length+1&&filters.every(([k,v])=>value[k]===v))docs.push(await ref(key).get());return {docs,empty:!docs.length,size:docs.length};}
};}
const db={collection,runTransaction:fn=>{const run=queue.then(async()=>{const writes=[];const result=await fn({
 get:async r=>{assert.equal(writes.length,0,'all transaction reads precede writes');return r.get();},
 set:(r,v)=>writes.push(()=>rows.set(r.path,structuredClone(v))),update:(r,v)=>writes.push(()=>patch(r.path,v)),delete:r=>writes.push(()=>rows.delete(r.path))});writes.forEach(w=>w());return result;});queue=run.catch(()=>{});return run;}};
const deps={...challenge,...room,setChallengeFollow,displayRating,safeIdentity,corsResponse,jsonResponse,errorResponse,
 getDb:()=>db,FieldValue:{increment:n=>n},withDeadline:p=>p,
 extractBearerToken:r=>r.headers.get('authorization')?.replace('Bearer ',''),
 verifyIdToken:async token=>({sub:token.split(':')[0],firebase:{sign_in_provider:token.split(':')[1]||'password'},picture:'https://example.com/private-auth-photo.jpg'}),
 publicIdentity:(uid,p={})=>({name:p.displayNameOverride||'Alias '+uid,username:p.usernameOverride||'alias-'+uid}),
 getCachedShared:async()=>null,setCachedShared:async()=>{},deleteCachedShared:async()=>{},checkLayers:async()=>({ok:true}),
 sendToUser:async(uid,p)=>notifications.push({uid,...p}),sendSmsToUser:async()=>{}};
let source=fs.readFileSync(new URL('../app/netlify/functions/challenge.mjs',import.meta.url),'utf8');
source=source.replace(/^import[\s\S]*?;\n/gm,'').replace('export default async','return async').replace(/export const config[\s\S]*$/,'');
const handler=Function(...Object.keys(deps),source)(...Object.values(deps));
async function post(uid,body){const response=await handler(new Request('https://itsdebatable.com/api/challenge',{method:'POST',headers:{Authorization:'Bearer '+uid,'Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,...await response.json()};}
async function get(id,uid){const response=await handler(new Request('https://itsdebatable.com/api/challenge?id='+id,{headers:uid?{Authorization:'Bearer '+uid}:{}}));return {status:response.status,...await response.json()};}
for(const uid of ['host','guest','third']){rows.set('age_bands/'+uid,{band:'adult'});rows.set('user_profiles/'+uid,{displayNameOverride:uid+' alias',usernameOverride:uid+'-handle'});}
rows.set('user_ratings/host',{rating:1427,rd:90,games:5});
rows.get('user_profiles/host').avatarIdentity={kind:'live',design:{style:'mask'}};
let made=await post('host',{action:'create',claim:'Employers should publish everyone’s salary.',side:'b',mode:'live'});
assert.equal(made.status,201);let id=made.challenge.id;
assert.equal(made.challenge.creator.name,'host alias');assert.equal(made.challenge.creator.photo,'','auth photo is not silently published');
assert.equal(made.challenge.creator.rating,1427);assert.equal(made.challenge.accepted[0].side,'b');
assert.deepEqual(rows.get('challenges/'+id).creator.avatarIdentity,{kind:'live',design:{style:'mask'}},'stored avatars omit undefined Firestore fields');
assert.equal((await post('host',{action:'accept',id})).status,409,'self acceptance fails');
assert.equal((await post('guest:anonymous',{action:'accept',id})).status,401,'anonymous acceptance fails');
assert.equal((await post('guest:phone',{action:'accept',id})).status,403,'provider blocked before reserving a video seat');
rows.set('age_bands/guest',{band:'minor'});
assert.equal((await post('guest',{action:'accept',id})).status,409,'age mismatch does not consume a seat');
rows.set('age_bands/guest',{band:'adult'});
const race=await Promise.all([post('guest',{action:'accept',id}),post('third',{action:'accept',id})]);
assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
assert.equal(rows.get('challenges/'+id).accepted.length,2);
assert.equal(notifications.length,1);
assert.equal((await post('guest',{action:'accept',id})).status,200);
assert.equal(notifications.length,1,'accept retry does not send another alert');
const joined=await post('guest',{action:'join',id});assert.equal(joined.status,200);
assert.ok(joined.url.startsWith('/live-round?'));assert.equal((await post('host',{action:'join',id})).room,joined.room);
await Promise.all(Array.from({length:8},()=>post('third',{action:'follow',id,following:true})));
assert.equal(rows.get('challenges/'+id).crowd.followers,1,'retry/concurrent follow counts once');
assert.equal((await get(id,'third')).challenge.following,true);
assert.equal((await get(id)).challenge.following,false);
await Promise.all(Array.from({length:8},()=>post('third',{action:'follow',id,following:false})));
assert.equal(rows.get('challenges/'+id).crowd.followers,0,'unfollow never underflows');
assert.equal((await post('third',{action:'sync',id,result:{winner:'con'}})).status,403);
const saved=rows.get('live_rounds/'+joined.room);assert.equal(saved.isPrivate,false,'new live challenge starts public');saved.ballot={winner:'pro',rfd:'Access wins.',proPoints:80,conPoints:77};saved.status='ballot';
const sync=await post('host',{action:'sync',id,result:{winner:'con'}});assert.equal(sync.challenge.result.winner,'pro','client cannot choose winner');assert.equal(sync.completed,true);
assert.equal((await post('guest',{action:'sync',id})).completed,false,'completion is idempotent');
rows.set('recordings/private',{roomName:joined.room,published:false});
assert.equal((await get(id)).challenge.replayUrl,'');
rows.set('recordings/public',{roomName:joined.room,published:true});
assert.equal((await get(id)).challenge.replayUrl,'/watch?r=public');
const directed=await post('host',{action:'create',claim:'Public transit should be free.',mode:'live',opponentUsername:'@guest-handle'});
assert.equal(directed.challenge.challengedUid,'guest');
assert.equal((await post('third',{action:'accept',id:directed.challenge.id})).status,409);
assert.equal((await post('host',{action:'create',claim:'Public transit should be free.',mode:'live',opponentUsername:'missing'})).status,400);
assert.equal((await post('host',{action:'create',claim:'Public transit should be free.',mode:'live',timing:'scheduled',scheduledAt:Date.now()-1000})).status,400);
assert.equal((await post('host',{action:'create',claim:'Abortion should be banned.',mode:'live'})).status,400);
console.log('Challenge API: atomic acceptance, retry alerts, alias/rating identity, age/provider gates, idempotent followers, directed lookup, completion and published-only replays passed.');

await post('guest',{action:'accept',id:directed.challenge.id});
const directRoom=await post('host',{action:'join',id:directed.challenge.id});
let roomRequest,tokenRequest,tokenFailure=false;
const dailyDeps={getDb:()=>db,withDeadline:p=>p,verifyIdToken:deps.verifyIdToken,
  checkLayers:deps.checkLayers,parseTournamentRoom:()=>null,Teams,challengeRoomAdmission:room.challengeRoomAdmission,
  process:{env:{DAILY_API_KEY:'fixture',DAILY_DOMAIN:'fixture',DAILY_RECORD:'0'}},
  fetch:async(url,init)=>{
    if(url.endsWith('/meeting-tokens')){tokenRequest=JSON.parse(init.body);return new Response(JSON.stringify(tokenFailure?{}:{token:'fixture-token'}),{status:tokenFailure?500:200});}
    roomRequest=JSON.parse(init.body);return new Response(JSON.stringify({name:directRoom.room,url:'https://fixture.daily.co/'+directRoom.room,privacy:'private'}));
  }};
let dailySource=fs.readFileSync(new URL('../app/netlify/functions/create-daily-room.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default async','return async').replace(/export const config[\s\S]*$/,'');
const dailyHandler=Function(...Object.keys(dailyDeps),dailySource)(...Object.values(dailyDeps));
async function video(uid,role){return dailyHandler(new Request('https://itsdebatable.com/api/create-daily-room',{method:'POST',headers:{Authorization:'Bearer '+uid,'Content-Type':'application/json'},body:JSON.stringify({name:directRoom.room,role})}));}
assert.equal((await video('third','debater')).status,403,'outsider cannot mint a sending token');
assert.equal((await video('host','debater')).status,200);
assert.equal(roomRequest.privacy,'private');
assert.equal((await video('third','viewer')).status,200,'new public challenge accepts receive-only viewers');
rows.get('live_rounds/'+directRoom.room).isPrivate=true;
assert.equal((await video('third','viewer')).status,403,'making the challenge private blocks viewers');
rows.get('live_rounds/'+directRoom.room).isPrivate=false;
assert.equal((await video('third','viewer')).status,200);
assert.equal(tokenRequest.properties.permissions.canSend,false);
tokenFailure=true;assert.equal((await video('third','viewer')).status,503,'challenge viewer cannot fall back to a sending token');
console.log('Challenge Daily admission: private room, accepted seats, receive-only audience and closed token failure passed.');
