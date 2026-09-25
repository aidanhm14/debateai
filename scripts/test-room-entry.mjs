import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('app/live-round.html','utf8');
const source=html.match(/  function kickoffMatchedRound\([^)]*\)\{[\s\S]*?\n  \}/)?.[0];
assert.ok(source,'matched entry helper exists');
for(const motion of ['', 'A preselected topic.'])for(const uid of ['a','b'])for(const saved of [null,{status:'round',motion:'Already agreed.',speechIdx:0},{status:'round',motion:'',speechIdx:0},{status:'round',motion:'Ongoing topic.',speechIdx:2},{status:'setup',motion:'Chosen during setup.'}]){
 let starts=0, reads=0;
 const state={phase:'setup',room:'r',user:{uid},proUid:'a',conUid:'b',motion};
 const c={Promise,prefill:{source:'spar'},state,isSpectator:()=>false,gtag:()=>{},getRoundDocRef:()=>({id:'r'}),
 DBLiveJourney:{readDocument:async(ref,user)=>{assert.equal(ref.id,'r');assert.equal(user.uid,uid);reads++;return {exists:!!saved,data:()=>saved};}},
 onRoundSnapshot:d=>{state.motion=d.motion;if(d.status==='round')state.phase='round';},startRound:allow=>{assert.equal(allow,true);starts++;state.phase='round';}};
 vm.runInNewContext('var matchedKickoffPending = null;'+source,c);await c.kickoffMatchedRound();
 assert.equal(reads,1,'every seated match reads immediately even with a prefilled motion');
 assert.equal(state.phase,'round');assert.equal(starts,saved?.status==='round'?0:1);
 if(saved)assert.equal(state.motion,saved.motion,'reload keeps saved topic, including empty');
}
console.log('Room entry: both seats, blank and prefilled links, peer-created rooms and mid-round reloads passed.');
