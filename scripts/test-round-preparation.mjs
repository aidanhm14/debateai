import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ctx={};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['speech-timing','round-start']) vm.runInContext(readFileSync(new URL('../app/js/live-room/'+file+'.js',import.meta.url),'utf8'),ctx);
const api=ctx.DBRoundStart, timing=ctx.DBRoundTiming;
let d, writes=0, tail=Promise.resolve(), fail=false;
const seed=()=>({format:'quick',motion:'Cities should build more parks.',proUid:'a',conUid:'b',status:'round'});
const ref={};
const db={runTransaction(fn){
  const run=tail.then(()=>{if(fail)throw new Error('Offline. Try again.');return fn({
    get:async()=>({exists:true,data:()=>d}),update:(_r,p)=>{d={...d,...p};writes++;}
  });});tail=run.catch(()=>{});return run;
}};
const act=(uid,action,mode,expected=api.signature(d))=>api.act(db,ref,uid,action,expected,mode);
const readyBoth=async()=>{await act('a','ready');await act('b','ready');};
d=seed();
await assert.rejects(()=>act('a','start'),/Both people/);
await act('a','ready');assert.equal(api.bothReady(d),false);
await act('b','ready');assert.equal(api.bothReady(d),true);
await act('b','unready');await assert.rejects(()=>act('a','start'),/Both people/);
await readyBoth();await assert.rejects(()=>act('b','start'),/For starts/);
const initial=d;await act('a','start');assert.equal(d.currentTimer.state,'running');assert.equal(d.speechTimingLocked,true);
assert.equal(d.speechTiming.seconds.length,6);
await assert.rejects(()=>act('b','mode','open'),/already started/);
await assert.rejects(()=>act('a','ready'),/already started/);
for(const patch of [{motion:'Cities should make buses free.'},{proUid:'b',conUid:'a'},{format:'open'},
  {speechTiming:{version:1,seconds:[60,60,60,60,60,60]}},{judgePicks:{pro:'lay',con:'lay'}},{contextFrame:'Worldwide'}]){
  d={...initial,...patch};assert.equal(api.bothReady(d),false,'a changed shared choice needs new agreement');
}
d=seed();await readyBoth();const old=api.signature(d);await act('b','mode','open');
assert.equal(api.bothReady(d),false);await assert.rejects(()=>act('a','ready',null,old),/settings changed/);
await readyBoth();
const results=await Promise.allSettled([act('a','start'),act('b','start')]);
assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'simultaneous starts write one clock');
assert.equal(d.currentTimer.totalSec,3600);assert.equal(d.speechTimingLocked,undefined);
d=seed();await readyBoth();await timing.save(db,ref,'a',{version:1,seconds:[60,60,60,60,60,60]},false);
assert.equal(api.bothReady(d),false,'duration edits reset confirmation on both seats');
for(const patch of [{draft:{phase:'strike'}},{topicStrikes:{phase:'pick'}},{motionProposal:{text:'New topic'}},
  {sideSwap:{by:'a'}},{judgePicks:{pro:'chair',con:'lay'}},{motion:''}]){
  d={...seed(),...patch};await assert.rejects(()=>act('a','ready'));
}
d=seed();const before=writes;await assert.rejects(()=>act('viewer','ready'),/Only the two/);assert.equal(writes,before);
fail=true;await assert.rejects(()=>act('a','ready'),/Offline/);assert.equal(api.ready(d,'a'),false);fail=false;
await act('a','ready');assert.equal(api.ready(d,'a'),true,'retry saves after failure');
for(const patch of [{proUid2:'partner'},{tournamentId:'t'},{conUid:'a'},{format:'legacy'}]) assert.equal(api.eligible({...seed(),...patch}),false);
console.log('Round preparation: mutual agreement, setting changes, stale clients, ownership, atomic starts, pending choices, failed writes and compatibility passed.');
