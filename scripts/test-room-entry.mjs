import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('app/live-round.html','utf8');
const start=html.indexOf('        // Enter every matched room');
const end=html.indexOf('\n      } else {\n        renderUserChip();',start);
const source=html.slice(start,end);
for(const motion of ['', 'A preselected topic.'])for(const uid of ['a','b'])for(const saved of [null,{status:'round',motion:'Already agreed.',speechIdx:0},{status:'round',motion:'',speechIdx:0},{status:'round',motion:'Ongoing topic.',speechIdx:2},{status:'setup',motion:'Chosen during setup.'}]){
 let pending, starts=0;
 const state={phase:'setup',room:'r',user:{uid},proUid:'a',conUid:'b',motion};
 const c={prefill:{source:'spar'},state,isSpectator:()=>false,setTimeout:fn=>pending=fn,gtag:()=>{},getRoundDocRef:()=>({get:async()=>({exists:!!saved,data:()=>saved})}),
 onRoundSnapshot:d=>{state.motion=d.motion;if(d.status==='round')state.phase='round';},startRound:allow=>{assert.equal(allow,true);starts++;state.phase='round';}};
 vm.runInNewContext(source,c);assert.ok(pending,'every seated match schedules entry even with a prefilled motion');pending();await new Promise(r=>setImmediate(r));
 assert.equal(state.phase,'round');assert.equal(starts,saved?.status==='round'?0:1);
 if(saved)assert.equal(state.motion,saved.motion,'reload keeps saved topic, including empty');
}
console.log('Room entry: both seats, blank and prefilled links, peer-created rooms and mid-round reloads passed.');
