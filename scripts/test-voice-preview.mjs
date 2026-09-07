import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { reserveVoicePreview, createVoicePreview, signPreviewStop, verifyPreviewStop, hangupPreview, previewSession, PREVIEW_MS, PREVIEW_SERVER_MS } from '../app/netlify/functions/lib/voice-preview.mjs';
const store=new Map();let queue=Promise.resolve();
const db={collection:c=>({doc:id=>({path:c+'/'+id})}),runTransaction(fn){const work=queue.then(async()=>{const staged=new Map(store);const result=await fn({get:async ref=>({exists:staged.has(ref.path),data:()=>staged.get(ref.path)}),set:(ref,value)=>staged.set(ref.path,value)});store.clear();for(const [k,v]of staged)store.set(k,v);return result;});queue=work.catch(()=>{});return work;}};
const races=await Promise.allSettled([1,2,3].map(()=>reserveVoicePreview(db,'same-user','network',100000)));
assert.equal(races.filter(r=>r.status==='fulfilled').length,1,'identity cannot race two previews');
await reserveVoicePreview(db,'user2','network',100000);await reserveVoicePreview(db,'user3','network',100000);
await assert.rejects(reserveVoicePreview(db,'user4','network',100000),e=>e.code==='PREVIEW_USED');
await assert.rejects(reserveVoicePreview({collection:db.collection,runTransaction:async()=>{throw new Error('offline');}},'a','b'),/offline/);
const secret='test-only-key';const job=signPreviewStop(secret,'rtc_example',15000);
assert.equal(verifyPreviewStop(secret,job,1000),true);
for(const changed of [{...job,deadline:20000},{...job,callId:'rtc_other'},{...job,callId:'../../other'},{...job,signature:'0'.repeat(64)}]) assert.equal(verifyPreviewStop(secret,changed,1000),false);
assert.equal(verifyPreviewStop(secret,job,700000),false);
const calls=[];let queued=false;
const fetcher=async(url,options)=>{calls.push({url,options});if(url.endsWith('/hangup')) return new Response(null,{status:200});return new Response('v=0\r\nanswer',{status:201,headers:{location:'/v1/realtime/calls/rtc_example'}});};
const result=await createVoicePreview({sdp:'v=0\r\noffer',motion:'Public transport should be free'},{apiKey:secret,secret,fetcher,now:()=>1000,enqueue:async j=>{assert.equal(j.deadline,1000+PREVIEW_SERVER_MS);queued=true;}});
assert.equal(queued,true);assert.equal(result.previewMs,PREVIEW_MS);assert.equal(PREVIEW_MS,45000);assert.equal(PREVIEW_SERVER_MS,50000);assert.equal(result.client_secret,undefined);assert.equal(JSON.stringify(result).includes(secret),false);
await assert.rejects(createVoicePreview({sdp:'v=0\r\noffer'},{apiKey:secret,secret,fetcher,now:()=>1000,enqueue:async()=>{throw new Error('queue unavailable');}}),/queue unavailable/);
assert.equal(calls.at(-1).url.endsWith('/rtc_example/hangup'),true,'enqueue failure closes call before refusing browser');
await assert.rejects(hangupPreview(secret,'https://attacker.invalid',fetcher),/Invalid/);
assert.equal(previewSession({}).model,'gpt-realtime');
assert.match(previewSession({}).instructions,/What is one thing you think most people get wrong/);
assert.match(previewSession({}).instructions,/Do not mention a trial, preview, time limit, countdown/);
const page=readFileSync('app/newvoice.html','utf8');
assert.match(page,/setTimeout\(\(\) => finishPreview\('time_limit'\), previewMaxMs\)/);
assert.match(page,/Math\.min\(45000, Math\.max\(1000, Number\(answer.previewMs\)/);
assert.doesNotMatch(page,/Try voice for 10 seconds|10-second voice exchange|PREVIEW ·/);
assert.match(page,/'Test it out'/);
assert.match(page,/if \(previewRound\) \{ finishPreview\(\); return; \}/,'preview ends before judging or leaderboard');
assert.match(page,/window.VoiceTranscript && !previewRound/,'preview does not persist transcript');
assert.match(page,/clearTimeout\(previewStopTimer\)/);
assert.match(readFileSync('app/js/app-check.js','utf8'),/\/api\/voice-preview/);
// Drive the shipped policy with actual Realtime event shapes and ordering.
const browser={};runInNewContext(readFileSync('app/js/voice-preview-momentum.js','utf8'),{window:browser});
const make=()=>{const p=browser.DBVoicePreviewMomentum.create(0);p.handle({type:'response.created',response:{id:'initial-opener'}},0);p.handle({type:'response.done',response:{id:'initial-opener',status:'completed'}},0);p.handle({type:'output_audio_buffer.stopped',response_id:'initial-opener'},0);return p;};
let tick=20000;
const feed=(p,type,data={})=>p.handle({type,...data},tick);
function user(p,id,text='Cities should make buses free'){
  feed(p,'input_audio_buffer.speech_started');
  feed(p,'input_audio_buffer.speech_stopped',{item_id:id});
  feed(p,'conversation.item.input_audio_transcription.completed',{item_id:id,transcript:text});
}
function generated(p,id,status='completed'){
  feed(p,'response.created',{response:{id}});
  feed(p,'output_audio_buffer.started',{response_id:id});
  feed(p,'response.done',{response:{id,status}});
}
function heard(p,id){return feed(p,'output_audio_buffer.stopped',{response_id:id});}
let policy=make();generated(policy,'opening');assert.equal(heard(policy,'opening'),false,'opener alone is not an exchange');
user(policy,'u1');generated(policy,'r1');assert.equal(heard(policy,'r1'),false,'first exchange keeps the conversation open');
user(policy,'u2','Taxes could pay for the buses');generated(policy,'r2');assert.equal(policy.ready(tick),false,'generation finishing is not audio finishing');
assert.equal(heard(policy,'r2'),true,'second complete, heard reply is a natural cutoff');
policy=make();for(const i of [1,2]){user(policy,'u'+i);generated(policy,'r'+i);heard(policy,'r'+i);}
feed(policy,'input_audio_buffer.speech_started');assert.equal(policy.ready(tick),false,'never end while the user is speaking');
policy=make();user(policy,'u1');generated(policy,'r1');heard(policy,'r1');user(policy,'u2');generated(policy,'r2','cancelled');assert.equal(heard(policy,'r2'),false,'cancelled response is not a heard answer');
generated(policy,'r3');feed(policy,'output_audio_buffer.cleared',{response_id:'r3'});assert.equal(heard(policy,'r3'),false,'cleared audio cannot count as a complete reply');
policy=make();for(const i of [1,2]){user(policy,'u1');generated(policy,'r'+i);heard(policy,'r'+i);}assert.equal(policy.ready(tick),false,'duplicate transcriptions and repeated replies to one input count once');
policy=make();for(const i of [1,2]){user(policy,'u'+i,'hmm');generated(policy,'r'+i);heard(policy,'r'+i);}assert.equal(policy.ready(tick),false,'backchannels do not stand in for two points');
policy=make();user(policy,'u1');generated(policy,'r1');heard(policy,'r1');feed(policy,'input_audio_buffer.speech_stopped',{item_id:'u2'});generated(policy,'r2');heard(policy,'r2');assert.equal(feed(policy,'conversation.item.input_audio_transcription.completed',{item_id:'u2',transcript:'Public transport helps everyone get around'}),true,'late transcription still belongs to the response to that input');
tick=9000;policy=make();for(const i of [1,2]){user(policy,'u'+i);generated(policy,'r'+i);heard(policy,'r'+i);}assert.equal(policy.ready(11999),false);assert.equal(policy.ready(12000),true,'very fast turns still get a minimum taste');
tick=20000;policy=browser.DBVoicePreviewMomentum.create(0);user(policy,'early');generated(policy,'opening');heard(policy,'opening');user(policy,'next');generated(policy,'answer');assert.equal(heard(policy,'answer'),false,'speaking before the opener is created does not make its greeting a scored exchange');
console.log('Voice preview: protected one-use budget, signed server hangup, bounded fallback, two heard exchanges, interruptions, late transcripts, deduplication and no durable preview capture passed.');
