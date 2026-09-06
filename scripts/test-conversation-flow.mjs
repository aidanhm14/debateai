import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('app/live-round.html','utf8');
let clock=120000;const host={innerHTML:''},calls=[];
const state={formatKey:'open',timerState:'running',proName:'Sam <script>',conName:'Jordan',openPeerSegs:[{at:20,text:'A reply',clock:'server'}]};
const context={state,openMode:()=>true,isSpectator:()=>false,mySide:()=> 'pro',openPeerSide:()=> 'con',$:()=>host,
 openSeg:{segs:[{at:10,text:'First point'},{at:30,text:'An answer'}]},Date:{now:()=>clock},
 escHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
 generateRoundNotes:(entry,idx)=>calls.push({entry,idx})};vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  function paintConversationFlow(){'),source.indexOf('  var openSeg =')),context);
context.paintConversationFlow();assert.ok(host.innerHTML.indexOf('First point')<host.innerHTML.indexOf('A reply'));
assert.ok(host.innerHTML.indexOf('A reply')<host.innerHTML.indexOf('An answer'));
assert.ok(!host.innerHTML.includes('<script>'));assert.ok(!host.innerHTML.includes('timestamp'));
vm.runInContext(source.slice(source.indexOf('  var openNotesProgress ='),source.indexOf('  function openSegStart()')),context);
context.openSeg.segs=[{text:Array(40).fill('point').join(' ')}];context.maybeConversationNotes();
assert.equal(calls.length,1);assert.equal(calls[0].entry.side,'pro');assert.equal(calls[0].idx,1000);
clock+=60001;context.maybeConversationNotes();assert.equal(calls.length,1,'An unchanged transcript is never summarized twice');
context.openSeg.segs.push({text:Array(40).fill('response').join(' ')});context.maybeConversationNotes();assert.equal(calls.length,2);assert.equal(calls[1].idx,1002);
console.log('Conversation flow: interleaving, escaped names, speaker attribution and bounded new-excerpt notes passed.');
