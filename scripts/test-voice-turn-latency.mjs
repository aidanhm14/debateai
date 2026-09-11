import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('app/newvoice.html','utf8');
let now=5000; const sent=[];
const context={Date:{now:()=>now},window:{},dc:{readyState:'open',send:v=>sent.push(JSON.parse(v))},
  liveVoice:null,previewRound:false,
  aiTalking:false,awaitingResponse:false,pendingTurn:false,vadSpeechActive:true,lastActiveAt:3800,
  nudgeFired:false,lastAiDoneAt:0,bargeMs:0,pttMode:false,pttOpen:false,
  userAnalyser:null,userBuf:null,micLive:()=>true,level:()=>0,speechGate:()=>0.5,
  turnWaitMs:()=>1200,setSpeaking(){},responseRequestedAt:0};
vm.createContext(context);
const tick=source.slice(source.indexOf('function bargeTick(){'),source.indexOf('/* Session config.'));
const events=source.slice(source.indexOf('function handleEvent(e){'),source.indexOf('function setSpeaking(who'));
vm.runInContext(tick+'\n'+events,context);
context.handleEvent({type:'input_audio_buffer.speech_stopped'});
assert.equal(context.lastActiveAt,3800,'VAD completion must not start a second silence wait');
context.bargeTick(); assert.equal(sent.length,1); assert.equal(sent[0].type,'response.create');
context.bargeTick(); assert.equal(sent.length,1,'A pending response cannot be requested twice');
context.awaitingResponse=false;context.pendingTurn=true;context.vadSpeechActive=true;
context.bargeTick();assert.equal(sent.length,1,'Continued speech holds the floor');
context.vadSpeechActive=false;context.pttMode=true;context.pttOpen=true;
context.bargeTick();assert.equal(sent.length,1,'Tap-to-speak never hands over while open');
context.pttMode=false;context.turnWaitMs=()=>3200;
context.bargeTick();assert.equal(sent.length,1,'Long pause preference still holds');
now=7000;context.bargeTick();assert.equal(sent.length,2);
console.log('Voice turn latency: overlapping VAD wait, continuous speech, no duplicate response, tap-to-speak and Long pause passed.');
