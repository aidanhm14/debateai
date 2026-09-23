import assert from 'node:assert/strict';
import { runTopicStrikes } from '../app/netlify/functions/lib/topic-strikes.mjs';
const del = '__delete__';
function fixture(extra = {}, stamp = {}) {
  const rows = new Map([['live_rounds/room', { proUid:'a', conUid:'b', proName:'Alice', conName:'Bob', motion:'', status:'round', speechIdx:0, ...extra }], ['round_drafts/room',stamp]]);
  const db = { collection: c => ({ doc: id => c+'/'+id }), runTransaction: async fn => {
    const writes=[];
    const result=await fn({get:async p=>({exists:rows.has(p),data:()=>structuredClone(rows.get(p))}),set:(p,d)=>writes.push([p,d,false]),update:(p,d)=>writes.push([p,d,true])});
    for(const [p,d,merge] of writes){ const data=merge?{...rows.get(p),...d}:d;for(const k of Object.keys(data))if(data[k]===del)delete data[k]; rows.set(p,data); }
    return result;
  }};
  const call=async(uid,action,body={})=>{const d=rows.get('room_topic_strikes/room');return runTopicStrikes(db,uid,{room:'room',id:d?.id,revision:d?.revision||0,action,...body},{delete:()=>del});};
  return { rows,call,round:()=>rows.get('live_rounds/room'),draft:()=>rows.get('room_topic_strikes/room') };
}
for(const overlap of [0,1,2]) {
  const f=fixture({judgePicks:{pro:'alice-choice',con:'bob-choice'}});
  await assert.rejects(f.call('outsider','invite'),{status:403});
  const invite=await f.call('a','invite');
  assert.equal(invite.round.motion,'');assert.equal(f.draft().pool.length,5);
  assert.equal(new Set(f.draft().pool.map(p=>p.text)).size,5);
  assert.notEqual(f.draft().motionUid,f.draft().sideUid);
  await assert.rejects(f.call('a','accept'),{status:409});
  await f.call('b','accept');
  const ids=f.draft().pool.map(p=>p.id), revision=f.draft().revision;
  for(const invalid of [[ids[0]],[ids[0],ids[0]],[ids[0],'forged']])await assert.rejects(f.call('a','strike',{ids:invalid}),{status:409});
  const half=await f.call('a','strike',{ids:ids.slice(0,2)});
  assert.deepEqual(half.round.topicStrikes.committed,{a:true,b:false});
  assert.ok(!('strikes' in half.round.topicStrikes));assert.ok(!('survivors' in half.round.topicStrikes));
  await assert.rejects(f.call('a','strike',{ids:ids.slice(2,4)}),{status:409});
  const peerIds=overlap===0?ids.slice(2,4):overlap===1?[ids[1],ids[2]]:ids.slice(0,2);
  await f.call('b','strike',{ids:peerIds,revision});
  assert.equal(f.draft().survivors.length,overlap+1);
  assert.equal(f.round().motion,'','even the reveal does not start a round');
  if(overlap){
    await assert.rejects(f.call(f.draft().sideUid,'motion',{motionId:f.draft().survivors[0]}),{status:409});
    await f.call(f.draft().motionUid,'motion',{motionId:f.draft().survivors[0]});
  }
  const d=f.draft(), chosen=d.pool.find(p=>p.id===d.chosenId).text;
  await assert.rejects(f.call(d.motionUid,'side',{side:'pro'}),{status:409});
  await f.call(d.sideUid,'side',{side:'pro'});
  assert.equal(f.round().motion,chosen);assert.equal(f.round().proUid,d.sideUid);
  assert.equal(f.round().proName,d.sideUid==='a'?'Alice':'Bob');
  assert.equal(f.round().conUid,d.motionUid);assert.equal(f.round().topicStrikes.phase,'done');
  assert.equal(f.round().judgePicks.pro,d.sideUid==='a'?'alice-choice':'bob-choice','judge preference follows its owner across assigned sides');
  await assert.rejects(f.call('a','side',{side:'con'}),{status:409});
}
const cancel=fixture({motion:'Keep this agreed topic.'});
await cancel.call('a','invite');await cancel.call('b','accept');await cancel.call('a','strike',{ids:cancel.draft().pool.slice(0,2).map(p=>p.id)});
await cancel.call('b','cancel');assert.equal(cancel.round().motion,'Keep this agreed topic.');
assert.ok(!cancel.round().topicStrikes.strikes,'cancelling cannot expose a unilateral strike');
const old=cancel.draft().id;await cancel.call('b','invite');
await assert.rejects(cancel.call('a','accept',{id:old}),{status:409});
for(const patch of [{speechIdx:1},{currentTimer:{state:'running'}},{currentTimer:{state:'paused'}},{currentTimer:{state:'ready',accumulatedMs:50}},{ballotPending:true},{tournamentId:'t'},{teamSize:2},{motionProposal:{text:'Pending'}},{topicConversation:{phase:'listening'}},{draft:{phase:'offer'}}])await assert.rejects(fixture(patch).call('a','invite'),{status:409});
for(const stamp of [{tournamentId:'t'},{draftConfig:{pool:['Tournament motion.']}},{draft:{phase:'offer'}}])await assert.rejects(fixture({},stamp).call('a','invite'),{status:409});
console.log('Topic strikes: consent, privacy, simultaneous commitments, 1–3 survivors, split roles, cancellation, stale requests and round locks passed.');
