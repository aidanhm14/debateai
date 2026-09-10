// Run against a disposable emulator, never a live project:
// FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 node scripts/test-team-seats-rules.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {changeTeamSeat} from '../app/netlify/functions/lib/team-seats.mjs';
const host=process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host||'',/^(127\.0\.0\.1|localhost):\d+$/,'Only a local emulator may run this test');
const project='demo-debatable';
const base='http://'+host;
const require=createRequire(new URL('../app/package.json',import.meta.url));
const {Firestore}=require('@google-cloud/firestore');
const db=new Firestore({projectId:project});
const result=await fetch(base+'/emulator/v1/projects/'+project+':securityRules',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:readFileSync('app/firestore.rules','utf8')}]}})});
const compile=await result.json();
assert.ok(result.ok,JSON.stringify(compile));
assert.ok(!(compile.issues||[]).some(i=>i.severity==='ERROR'),JSON.stringify(compile));
const stamp=Date.now(),room='teams-test-'+stamp;
const ref=db.collection('live_rounds').doc(room);
const initial={proUid:'team-a',conUid:'team-b',posterUid:'team-a',proName:'For person',conName:'Against person',format:'open',motion:'More public parks',speechIdx:0};
await ref.set(initial);
const ids=['team-a','team-b','team-c','team-d','team-e'];
for(const uid of ids)await db.collection('age_bands').doc(uid).set({band:'adult'});
await changeTeamSeat(db,room,'team-a',{action:'enable'});
for(const uid of ['team-c','team-e'])await changeTeamSeat(db,room,uid,{action:'request',key:'pro2'});
const outcomes=await Promise.allSettled(['team-c','team-e'].map(uid=>changeTeamSeat(db,room,'team-a',{action:'approve',uid})));
assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1,'Real Firestore transactions allow exactly one approval');
const partner=(await ref.get()).data().proUid2;
const outsider=partner==='team-c'?'team-e':'team-c';
await changeTeamSeat(db,room,'team-d',{action:'request',key:'con2'});
await changeTeamSeat(db,room,'team-a',{action:'approve',uid:'team-d'});
function token(uid){
  const now=Math.floor(Date.now()/1000), enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  return enc({alg:'none',typ:'JWT'})+'.'+enc({aud:project,iss:'https://securetoken.google.com/'+project,sub:uid,user_id:uid,iat:now,exp:now+3600,firebase:{sign_in_provider:'google.com'}})+'.';
}
function value(x){
  if(typeof x==='string')return {stringValue:x};
  if(typeof x==='number')return {integerValue:String(x)};
  if(typeof x==='boolean')return {booleanValue:x};
  if(Array.isArray(x))return {arrayValue:{values:x.map(value)}};
  return {mapValue:{fields:Object.fromEntries(Object.entries(x).map(([k,v])=>[k,value(v)]))}};
}
const documents=base+'/v1/projects/'+project+'/databases/(default)/documents/';
async function patch(uid,path,fields,expected){
  const query=Object.keys(fields).flatMap(key=>['seatSeen','openSegs','openLive'].includes(key)?Object.keys(fields[key]).map(child=>key+'.`'+child+'`'):[key]).map(key=>'updateMask.fieldPaths='+encodeURIComponent(key)).join('&');
  const response=await fetch(documents+path+'?'+query,{method:'PATCH',headers:{Authorization:'Bearer '+token(uid),'Content-Type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(fields).map(([key,v])=>[key,value(v)]))})});
  assert.equal(response.status,expected,uid+' '+JSON.stringify(fields)+' '+await response.text());
}
const path='live_rounds/'+room;
await patch(outsider,path,{proUid2:outsider},403);
await patch('team-a',path,{conUid2:outsider},403);
await patch('team-a',path,{teamLockedAt:stamp},403);
await patch('team-a',path,{teamFinishedAt:stamp},403);
await patch('team-a',path,{proUid:'team-b',conUid:'team-a'},403);
await patch(partner,path,{openSegs:{pro2:[{speakerUid:partner,at:stamp,text:'My own stream'}]}},200);
await patch(partner,path,{openSegs:{pro:[{speakerUid:'team-a',at:stamp,text:'Forged teammate stream'}]}},403);
await patch(outsider,path,{openLive:{con2:{text:'Viewer speaks'}}},403);
await patch('team-d',path,{openLive:{con2:{text:'My live stream'}}},200);
await patch(partner,path,{seatSeen:{[partner]:stamp}},200);
await patch(partner,path,{seatSeen:{'team-a':stamp}},403);
await patch(partner,path,{currentTimer:{state:'running'}},403);
// Server start can lock only after all four own presence writes.
// Remove the test transcript, which correctly made the round immutable.
await ref.update({openSegs:{},openLive:{}});
for(const uid of ['team-a','team-b',partner,'team-d'])await patch(uid,path,{seatSeen:{[uid]:Date.now()}},200);
assert.equal(Object.keys((await ref.get()).data().seatSeen).length,4);
await changeTeamSeat(db,room,'team-a',{action:'start'});
await patch(partner,path,{currentTimer:{state:'running'}},200);
await patch(partner,path,{format:'quick'},403);
await patch(outsider,path+'/teamSeatRequests/'+outsider,{status:'accepted',uid:outsider},403);
await patch('team-a','live_rounds/forged-'+stamp,{...initial,teamSize:2,proUid2:outsider},403);
await patch('team-a','live_rounds/regular-'+stamp,initial,200);
await patch('team-a','live_rounds/regular-'+stamp,{currentTimer:{state:'running'}},200);
await db.recursiveDelete(ref);
await db.collection('live_rounds').doc('regular-'+stamp).delete();
for(const uid of ids)await db.collection('age_bands').doc(uid).delete();
await db.terminate();
console.log('Firestore emulator: rules compile, real approval race, server-only roster, per-seat streams, own presence, start lock, private requests and unchanged 1v1 permissions passed.');
