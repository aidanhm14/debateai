import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const win = {};
vm.runInNewContext(readFileSync(new URL('app/js/live-room/speech-timing.js',root),'utf8'), {window:win,Number,Array,Promise,Error});
const timing = win.DBRoundTiming;
const plain = value => JSON.parse(JSON.stringify(value));
const plan = {version:1,seconds:[240,240,180,180,120,120]};
assert.deepEqual(plain(timing.defaults()),plan.seconds);
assert.deepEqual(plain(timing.speeches(timing.defaults())).map(s=>s.side),['pro','con','pro','con','pro','con']);
assert.deepEqual(plain(timing.speeches(timing.defaults())).map(s=>s.code),['P1','C1','P2','C2','P3','C3']);
assert.deepEqual(plain(timing.forRound({format:'quick',status:'round',currentTimer:{state:'ready'}})),plan.seconds);
for (const data of [{currentTimer:{state:'running'}},{currentTimer:{state:'paused'}},{speechIdx:1},{speeches:[{}]},{status:'ballot'},{status:'done'},{status:'forfeit'},{ballot:{}},{tournamentId:'t'},{teamSize:2}]){
  assert.deepEqual(plain(timing.forRound({format:'quick',...data})),[300,300,180,180], 'historical and tournament plans keep their four speeches');
}
assert.deepEqual(plain(timing.forRound({format:'quick',speechTiming:plan,speechIdx:3})),plan.seconds, 'saved version survives reload during response speeches');
const custom = {version:1,seconds:[300,300,150,150,90,90]};
assert.deepEqual(plain(timing.forRound({format:'quick',speechTiming:custom,speechIdx:5})),custom.seconds);
for (const team of [{teamSize:2},{proUid2:'partner'},{conUid2:'partner'}]){
  assert.deepEqual(plain(timing.forRound({format:'quick',speechTiming:custom,...team})),[300,300,180,180],'team expansion wins over saved casual six-speech settings on every snapshot');
}
for (const value of [{version:2,seconds:plan.seconds},{version:1,seconds:[240,240]},{version:1,seconds:[240,120,180,180,120,120]},{version:1,seconds:[0,0,180,180,120,120]},{version:1,seconds:[241,241,180,180,120,120]},{version:1,seconds:[660,660,180,180,120,120]}]) assert.equal(timing.normalize(value),null);
let data = {format:'open',proUid:'a',conUid:'b'}, writes=[];
const ref={};
const db = {runTransaction: async fn=>fn({get:async()=>({exists:true,data:()=>data}),update:(r,p)=>{writes.push(p);data={...data,...p};}})};
await timing.save(db,ref,'a',custom,false);
assert.equal(data.format,'open','editing durations alone does not change conversation mode');
assert.deepEqual(plain(data.speechTiming),custom);
await timing.save(db,ref,'b',plan,true);
assert.equal(data.format,'quick');
assert.deepEqual(plain(data.speechTiming),custom,'choosing timed mode adopts the latest peer edit rather than stale controls');
for (const change of [{currentTimer:{state:'running'}},{currentTimer:{state:'paused'}},{speechIdx:1},{speeches:[{}]},{status:'ballot'},{status:'done'},{status:'forfeit'},{tournamentId:'t'},{speechTimingLocked:true},{teamSize:2},{proUid2:'partner'},{conUid2:'partner'}]){
  data={format:'quick',proUid:'a',conUid:'b',...change};
  await assert.rejects(()=>timing.save(db,ref,'a',custom,false));
}
data={format:'open',proUid:'a',conUid:'b'};
await assert.rejects(()=>timing.save(db,ref,'watcher',plan,true),/Only people/);
assert.equal(writes.length,2,'late edits and viewers never write');
data={format:'quick',proUid:'a',conUid:'b',speechTiming:custom};
const locked=await timing.save(db,ref,'a',plan,false,true);
assert.equal(data.speechTimingLocked,true,'the start transaction locks settings before the clock runs');
assert.deepEqual(plain(locked),custom,'a stale Start adopts the latest shared plan inside its transaction');
assert.deepEqual(plain(data.speechTiming),custom,'the first clock cannot overwrite a newer peer edit');
await assert.rejects(()=>timing.save(db,ref,'b',custom,false),/locked/);
assert.equal(writes.length,3,'a peer cannot change timing after Start but before the first clock write');
const html=readFileSync(new URL('app/live-round.html',root),'utf8');
assert.match(html,/var changedSetup = syncSpeechTiming\(d\)/,'snapshots adopt the saved plan before the main render');
assert.match(html,/get ensureSpeechTiming\(\)\{ return ensureSpeechTiming; \}/);
const timer=readFileSync(new URL('app/js/live-room/timers.js',root),'utf8');
assert.ok(timer.indexOf('context.ensureSpeechTiming()')<timer.indexOf("context.state.timerState = 'running'"));
const rules=readFileSync(new URL('app/firestore.rules',root),'utf8');
assert.match(rules,/&& speechTimingHeld\(\)/);
console.log('Speech timing: six alternating defaults, shared custom durations, both-seat edits, pre-start locking, legacy/tournament compatibility and save-before-clock passed.');
