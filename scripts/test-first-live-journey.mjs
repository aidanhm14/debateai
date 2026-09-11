import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { roundOutcome, hasCapturedSpeech } from '../app/netlify/functions/lib/round-funnel.mjs';
const require = createRequire(import.meta.url);
const journey = require('../app/js/live-journey.js');
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const spar = read('app/spar.html'), live = read('app/live-round.html');
const fn = (source, name) => {
  const m = source.match(new RegExp('  function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}'));
  assert.ok(m, name); return m[0];
};
const settle = async () => { for (let i=0; i<30; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const doc = (status, meta={}) => ({exists:true,metadata:meta,data:()=>({status})});
// Listener stalled, server progressed; no optimistic match and no stale read rollback.
let snapshot, nextRead = deferred(), values=[], reports=[], unsubscribed=false;
const stop = journey.watch({onSnapshot(_opts, cb){ snapshot=cb; return ()=>{unsubscribed=true;}; }}, {
  read:()=>nextRead.promise, value:d=>values.push(d.data().status), report:k=>reports.push(k), intervalMs:60000,
});
snapshot(doc('consent')); await settle(); nextRead.resolve(doc('matched')); await settle();
assert.deepEqual(values,['consent'], 'A read started before a newer snapshot is ignored');
nextRead=deferred(); const refresh=stop.refresh(); await settle(); nextRead.resolve(doc('matched')); await refresh;
assert.deepEqual(values,['consent','matched']); assert.ok(reports.includes('sync_recovered'));
snapshot(doc('consent',{fromCache:true})); assert.equal(values.at(-1),'matched','Cached state cannot undo a server read');
nextRead=deferred();const stale=stop.refresh();await settle();snapshot(doc('ballot'));nextRead.resolve(doc('round'));await stale;
assert.equal(values.at(-1),'ballot','A delayed read cannot roll back a fresh snapshot');
nextRead=deferred();const pending=stop.refresh();await settle();snapshot(doc('local-speech',{hasPendingWrites:true}));nextRead.resolve(doc('round'));await pending;
assert.equal(values.at(-1),'local-speech','Never replace unsaved local work');
nextRead=deferred();const stopped=stop.refresh();await settle();stop();nextRead.resolve(doc('matched'));await stopped;
assert.equal(unsubscribed,true);assert.equal(values.at(-1),'local-speech','Stopped watcher cannot navigate');
// Correct Firestore data types are needed for readiness deadlines and attribution.
const decoded=journey.decodeFields({deadline:{timestampValue:'2026-09-11T00:00:00.123456Z'},accepted:{booleanValue:false},n:{integerValue:'2'},empty:{nullValue:null},seats:{arrayValue:{values:[{mapValue:{fields:{uid:{stringValue:'fixture'}}}}]}}});
assert.equal(decoded.deadline.toMillis(),Date.parse('2026-09-11T00:00:00.123Z'));
assert.equal(decoded.deadline.nanoseconds,123456000);assert.equal(decoded.accepted,false);assert.equal(decoded.n,2);assert.equal(decoded.empty,null);assert.equal(decoded.seats[0].uid,'fixture');
// REST uses the user's identity and an independent HTTP request, never SDK Listen.
const realFetch=globalThis.fetch;let request;
try{
 globalThis.fetch=async(url,opts)=>{request={url,opts};return{ok:true,json:async()=>({fields:{status:{stringValue:'matched'}}})};};
 const got=await journey.readDocument({path:'matchmaking_queue/fixture',firestore:{app:{options:{projectId:'fixture-project'}}}},{getIdToken:async()=> 'fixture-id-token'});
 assert.equal(got.data().status,'matched');assert.match(request.url,/firestore.googleapis.com.*matchmaking_queue\/fixture$/);
 assert.equal(request.opts.headers.Authorization,'Bearer fixture-id-token');assert.equal(request.opts.cache,'no-store');
 globalThis.fetch=async()=>({ok:false,status:403});await assert.rejects(journey.readDocument({path:'live_rounds/fixture',firestore:{app:{options:{projectId:'fixture'}}}},{getIdToken:async()=> 'fixture'}),e=>e.code==='http_403');
}finally{globalThis.fetch=realFetch;}
// Real direct sign-in function: one popup across entrances, reuse returned credential,
// and release the controls even when the redirect fallback itself fails.
const buttons = new Map();const node=()=>({disabled:false,textContent:'',setAttribute(){}});
const c={state:{},Promise,Date,console,DBLiveJourney:{event(){}},document:{getElementById:id=>{if(!buttons.has(id))buttons.set(id,node());return buttons.get(id);}},window:{},firebase:{auth:{GoogleAuthProvider:function(){}}},inAppBrowser:()=>false,gtag(){}};
let popup=deferred(),opens=0,credentials=0;c.firebaseAuth={currentUser:null,signInWithPopup:()=>{opens++;return popup.promise;},signInWithCredential:async credential=>{assert.equal(credential,'verified');credentials++;return{user:{uid:'fixture'}};}};
vm.createContext(c);vm.runInContext(fn(spar,'setGateAuthBusy')+fn(spar,'doGoogleSignIn'),c);
const sign=c.doGoogleSignIn();c.doGoogleSignIn();assert.equal(opens,1);assert.equal(buttons.get('signInBtn').disabled,true);
popup.resolve({user:{uid:'fixture'}});await sign;assert.equal(buttons.get('signInBtn').disabled,false);
c.firebaseAuth.currentUser={isAnonymous:true,linkWithPopup:async()=>{throw {code:'auth/credential-already-in-use',credential:'verified'};}};await c.doGoogleSignIn();assert.equal(credentials,1);assert.equal(opens,1);
c.firebaseAuth.currentUser=null;c.firebaseAuth.signInWithPopup=()=>Promise.reject({code:'auth/popup-blocked'});c.firebaseAuth.signInWithRedirect=()=>Promise.reject({code:'auth/network-request-failed'});await c.doGoogleSignIn();assert.equal(c.state.signInPending,null);assert.equal(buttons.get('signInBtn').disabled,false);
// A hung consent token request releases the card, and a late token never sends a POST.
let token=deferred(),posts=0,recovered=0;
const consent={console:{warn(){},info(){}},Promise,Date,AbortController,state:{},formatParam:'open',DECLINE_COOLDOWN_MS:0,gtag(){},DBLiveJourney:{event(){},timeout:p=>journey.timeout(p,5)},firebaseAuth:{currentUser:{getIdToken:()=>token.promise}},fetch:async()=>{posts++;return{status:200,json:async()=>({ok:true})};},recoverConsentCard:()=>{recovered++;}};
vm.createContext(consent);vm.runInContext(fn(spar,'sendConsent'),consent);assert.equal(await consent.sendConsent('peer',true),false);assert.equal(recovered,1);token.resolve('late');await settle();assert.equal(posts,0);
// Media failure does not claim the mic is working or attempt a call. Retrying
// reacquires once and gives Daily the same live microphone track.
let blocked=true,captures=0,joins=0,notice='';const audio={kind:'audio',readyState:'live'},video={kind:'video',readyState:'live'};
class Stream {constructor(tracks=[]){this.tracks=tracks;}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}}
const m={Promise,Date,Error,console,MediaStream:Stream,state:{dailyUrl:'fixture'},room:{viewer:false,joined:false},camConv:{},camJoinNoticeShown:false,
 navigator:{mediaDevices:{getUserMedia:async()=>{captures++;if(blocked)throw Object.assign(new Error('blocked'),{name:'NotAllowedError'});return new Stream([audio,video]);}}},window:{DebateCam:{start:async srcStream=>({srcStream})}},liveJourney(){},captureConstraints:()=>true,seatLabel:()=> 'Fixture',startGuard(){},publishTrackFor:()=>video,tuneSendQuality(){},myRoomName:()=> 'Fixture',setRoomNote(){},setRoomExit:s=>{notice=s;},paintTray(){},toast:s=>{notice=s;},gtag(){},setTimeout,clearTimeout};
m.room.call={join:async props=>{joins++;assert.equal(props.audioSource,audio);m.room.joined=true;}};vm.createContext(m);for(const n of ['ensureAvatarCam','joinWith','joinRoomCall','camJoinNoVideoNotice'])vm.runInContext(fn(live,n),m);
await m.joinRoomCall();assert.equal(joins,0);assert.match(notice,/microphone did not start/);assert.equal(m.camConv.camP,null);
blocked=false;await m.joinRoomCall();assert.equal(captures,3);assert.equal(joins,1);assert.equal(m.room.joined,true);
// A failed video renderer still joins with the microphone already acquired.
m.room.joined=false;audio.stop=()=>{};video.stop=()=>{};
m.camConv.camP=null;m.window.DebateCam.start=async()=>{throw new Error('Renderer unavailable');};
await m.joinRoomCall();assert.equal(joins,2);assert.equal(captures,4);assert.equal(m.room.fallbackAudioTrack,audio);
assert.match(notice,/mic only/);
// Completion reporting must distinguish pending, no evidence, and a legitimate tie.
assert.equal(hasCapturedSpeech({speeches:[],openSegs:{pro:[{text:'Buses need fewer roads.'}]}}),true);
assert.equal(hasCapturedSpeech({speeches:[{text:'(no transcript)'}]}),false);
assert.equal(roundOutcome({status:'ballot',ballotPending:true}),'pending');
assert.equal(roundOutcome({completedAt:123}),'unfinished');
assert.equal(roundOutcome({ballot:{winner:'pro'}}),'decided');
assert.equal(roundOutcome({ballotUnresolved:{resolution:'unresolved'}}),'unresolved');
assert.equal(roundOutcome({ballotUnresolved:{resolution:'no_speech'}}),'no_contest');
// Parse the shipped inline scripts, not just extracted fixtures.
for(const [name,html] of [['spar',spar],['live-round',live]])for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(/\bsrc\s*=|application\/ld\+json|application\/json/.test(match[1]))continue;
 new vm.Script(match[2],{filename:name+'.html'});
}
console.log('First live journey: auth races, consent timeout, HTTP recovery, stale/pending writes, media retry, completion definitions and full inline parsing passed.');
