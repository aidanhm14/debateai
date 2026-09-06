import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('app/live-round.html','utf8');
const upload=source.slice(source.indexOf('  function srvUpload('),source.indexOf('  function srvSegment()'));
let deliver, side='pro';
const ctx={FormData:class{append(){}},state:{speechIdx:0,micFinal:''},mic:{generation:1,finals:[]},srv:{fails:0},
  Date,Promise,String,mySide:()=>side,isMyTurn:()=>true,isSpectator:()=>false,myLang:()=> 'en',
  micState(){},micRender(){},micFail(){},fetch:()=>new Promise(resolve=>{deliver=resolve;})};
vm.createContext(ctx);vm.runInContext(upload,ctx);
async function finish(text){deliver({ok:true,json:async()=>({text})});for(let i=0;i<10;i++)await Promise.resolve();}
ctx.srvUpload({size:3000},0,0,true);ctx.state.speechIdx=1;side='con';
await finish('Words from the previous speaker');assert.equal(ctx.state.micFinal,'','A late response cannot write into the opponent speech');
ctx.srvUpload({size:3000},0,0,true);await finish('My own words');assert.equal(ctx.state.micFinal,'My own words');
ctx.srvUpload({size:3000},1,0,true);ctx.mic.generation++;
await finish('Old microphone session');assert.equal(ctx.state.micFinal,'My own words');

const track=source.slice(source.indexOf('  function bkSpeakerAudioTrack(){'),source.indexOf('  function bkStopCapture(){'));
const proTrack={id:'pro'},otherTrack={id:'other'};
Object.assign(ctx,{FORMATS:{open:{speeches:[{side:'pro'}]}},sideBench:()=> 'gov',trackOf:t=>t,
  isAudienceName:n=>n.startsWith('Audience'),room:{call:{participants:()=>({
    wrong:{user_name:'Sam',user_id:'con',tracks:{audio:otherTrack}},
    right:{user_name:'Sam',user_id:'pro',tracks:{audio:proTrack}},
  })}}});
Object.assign(ctx.state,{formatKey:'open',speechIdx:0,proUid:'pro',conUid:'con',proName:'Sam',conName:'Sam'});
vm.runInContext(track,ctx);assert.equal(ctx.bkSpeakerAudioTrack(),proTrack,'Same-name accounts are mapped by verified UID');
ctx.state.proUid='absent';assert.equal(ctx.bkSpeakerAudioTrack(),null,'An absent seat cannot borrow a bystander track');
console.log('Live attribution: delayed speech responses, microphone restarts, identical names and absent speaker passed.');
// Finishing the speech waits for the recorder's final upload, before the
// generation changes and the next speaker's transcript becomes active.
Object.assign(ctx,{setTimeout,clearTimeout});
vm.runInContext(source.slice(source.indexOf('  function finishPendingTranscription(){'),source.indexOf('  // ── Backstop transcription:')),ctx);
let stopped;
ctx.srv.rec={state:'recording',addEventListener(type,cb){stopped=cb},stop(){ctx.srvUpload({size:3000},2,0,true);stopped();}};
ctx.srv.on=true;
let drained=false;const drain=ctx.finishPendingTranscription().then(()=>{drained=true});
await Promise.resolve();assert.equal(drained,false);
await finish('The final sentence matters');await drain;
assert.ok(ctx.state.micFinal.endsWith('The final sentence matters'));
assert.equal(ctx.srv.on,false);
const render=source.slice(source.indexOf('  function escHtml(s){'),source.indexOf('  // For surfaces that must stay plain text'));
vm.runInContext(render,ctx);
assert.equal(ctx.judgeHtml('“**A < B and that matters.**”'),'“<strong>A &lt; B and that matters.</strong>”');
console.log('Final transcript drain and escaped bold quote rendering passed.');
