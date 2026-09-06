import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {audienceAudioAllowed} from '../app/netlify/functions/lib/audience-media.mjs';
const server=readFileSync('app/netlify/functions/audience-cam.mjs','utf8');
const page=readFileSync('app/live-round.html','utf8');
let record={kind:'cam',status:'accepted',audio:true,respondedBy:'pro',respondedAt:{toMillis:()=>Date.now()-1000}};
const db={collection:()=>({doc:()=>({collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>record})})})})})};
const c={console,Date,APPROVAL_TTL_MS:7200000,withDeadline:p=>p};vm.createContext(c);
vm.runInContext(server.slice(server.indexOf('async function approvedToJoin('),server.indexOf('async function verifyTurnstile(')),c);
const round={format:'open',proUid:'pro',conUid:'con'};
let approval=await c.approvedToJoin(db,'room','guest',round);
assert.equal(audienceAudioAllowed(round,approval),true);
assert.equal(audienceAudioAllowed({...round,format:'quick'},approval),false);
assert.equal(audienceAudioAllowed(round,false),false,'Captcha alone cannot grant audio');
assert.equal(audienceAudioAllowed(round,{...approval,audio:false}),false,'Old camera approvals do not grant microphone access');
for(const patch of [{respondedBy:'bystander'},{status:'pending'},{respondedAt:{toMillis:()=>Date.now()-7200001}}]){
 const old=record;record={...record,...patch};assert.equal(await c.approvedToJoin(db,'room','guest',round),false);record=old;
}
const audio={id:'my-mic',enabled:false,readyState:'live'},video={id:'my-camera'};
let joined,leaves=0,unmutes=[];
const tray={appendChild(b){b.parentNode=this}};
Object.assign(c,{state:{dailyUrl:'https://example.daily.co/room'},audCam:{allowAudio:true,active:true,micOn:false,stream:{getAudioTracks:()=>[audio],getVideoTracks:()=>[video]}},
 room:{viewer:true,joined:true,tray,call:{leave:async()=>{leaves++},join:async p=>{joined=p},setLocalAudio:x=>unmutes.push(x)}},
 $:()=>({}),teardownRoom(){},setRoomNote(){},toast(){},
 document:{createElement:()=>({addEventListener(type,cb){this.click=cb},setAttribute(){}})}});
vm.runInContext(page.slice(page.indexOf('  function rejoinViewerCall('),page.indexOf('  function audCamCleanupMedia(')),c);
await c.mountAudCamFrame('approved-token','Audience · Guest');
assert.equal(leaves,1);assert.equal(joined.audioSource,audio);assert.equal(joined.videoSource,video);assert.equal(joined.startAudioOff,true);
vm.runInContext(page.slice(page.indexOf('  function paintAudienceMic('),page.indexOf('  // ── Ask to join the call')),c);
c.paintAudienceMic();c.audCam.micButton.click();assert.equal(audio.enabled,true);assert.deepEqual(unmutes,[true]);
c.audCam.micButton.click();assert.equal(audio.enabled,false);assert.deepEqual(unmutes,[true,false]);
c.audCam.allowAudio=false;c.paintAudienceMic();assert.equal(c.audCam.micButton.hidden,true);
let snapshot,joins=0;
Object.assign(c,{myCallRequestRef:()=>({onSnapshot:cb=>{snapshot=cb;return ()=>{}}}),paintAudCamPill(){},joinAudienceCam(){joins++}});
c.audCam={req:'none',active:false,joining:false};
vm.runInContext(page.slice(page.indexOf('  function watchMyCallRequest('),page.indexOf('  function audCamOnPolicyChange(')),c);
c.watchMyCallRequest();snapshot({exists:true,data:()=>({kind:'cam',status:'accepted'})});assert.equal(joins,0,'A reload never turns the camera on from an old approval');
snapshot({exists:true,data:()=>({kind:'cam',status:'pending'})});snapshot({exists:true,data:()=>({kind:'cam',status:'accepted'})});assert.equal(joins,1);
console.log('Audience call: scoped audio approval, expiry, verified host, same-call media, explicit mute and reload consent passed.');
