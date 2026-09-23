import { applyRound, defaultRatingDoc } from './rating.mjs';
import { eligibility, recordCountsAfter, resultForOutcome } from './rating-apply.mjs';

export function ratingTime(value) {
  const n = typeof value?.toMillis === 'function' ? value.toMillis()
    : typeof value === 'number' ? value
    : value instanceof Date ? value.getTime()
    : Number(value?._seconds ?? value?.seconds) * 1000;
  return Number.isFinite(n) && n > 0 ? n : 0;
}
const triple = d => ({ rating: d.rating, rd: d.rd, vol: d.vol });
const equal = (a,b) => ['rating','rd','vol'].every(k => Math.abs(a[k]-b[k]) < 0.00001);

// Reconstruct only the suffix affected by missing results. Earlier seeds,
// completed results and historical eligibility decisions stay intact.
// Corrections require a dedicated replay, so fail closed on that shape.
export function planRatingReconciliation({ rounds, changes, ratings, now = Date.now() }) {
  const byId = new Map(changes.map(r => [r.id,r]));
  const missing = [];
  for (const r of rounds) {
    const e = eligibility(r.source,r.data);
    if (!e.ok) continue;
    const ids = [e.a.uid,e.b.uid].map(uid => `${r.source}_${r.id}_${uid}`);
    const found = ids.map(id => byId.has(id));
    if (found[0] !== found[1]) throw Error('Partial rating pair: '+r.id);
    if (found[0]) continue;
    if (r.data.tournamentId || r.data.tournament) throw Error('Tournament result needs ledger reconciliation: '+r.id);
    const at = ratingTime(r.data.ballot?.at) || ratingTime(r.data.completedAt) || ratingTime(r.data.createdAt);
    if (!at) throw Error('Missing completion timestamp: '+r.id);
    missing.push({source:r.source,id:r.id,e,at,ids});
  }
  if (!missing.length) return {missing:[],ratings:[],changes:[],rounds:[]};
  const cutoff = Math.min(...missing.map(r=>r.at));
  const groups = new Map();
  for (const c of changes.filter(c => ratingTime(c.at) >= cutoff)) {
    if (!['live','async'].includes(c.source) || c.kind || Number(c.rev || 0) !== 0) throw Error('Unsupported correction or seed in replay window: '+c.id);
    const key=c.source+'_'+c.eventId;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(c);
  }
  const events=[];
  for(const pair of groups.values()) {
    if(pair.length!==2)throw Error('Incomplete historical pair');
    const [a,b]=pair;
    if(a.opponentUid!==b.uid || b.opponentUid!==a.uid || ratingTime(a.at)!==ratingTime(b.at)
      || !((a.result==='win'&&b.result==='loss')||(a.result==='loss'&&b.result==='win')||(a.result==='draw'&&b.result==='draw')))throw Error('Inconsistent historical pair');
    events.push({source:a.source,id:a.eventId,at:ratingTime(a.at),pair,
      e:{a:{uid:a.uid},b:{uid:b.uid},outcome:a.result==='draw'?'draw':a.result==='win'?'a':'b'}});
  }
  for(const m of missing)events.push({...m,pair:null});
  events.sort((a,b)=>a.at-b.at || (a.source+'_'+a.id).localeCompare(b.source+'_'+b.id));
  const current=new Map(ratings.map(r=>[r.id,r]));
  const states=new Map();
  for(const event of events)for(const person of [event.e.a,event.e.b]) {
    if(states.has(person.uid))continue;
    const cur=current.get(person.uid)||{...defaultRatingDoc(event.at)};
    const history=events.flatMap(e=>e.pair||[]).filter(c=>c.uid===person.uid).sort((a,b)=>ratingTime(a.at)-ratingTime(b.at));
    if(history.length && !equal(cur,history.at(-1).after))throw Error('Rating differs from ledger: '+person.uid);
    if(!history.length && ratingTime(cur.lastEventAt)>=cutoff)throw Error('Unexplained recent rating: '+person.uid);
    let baseline={...cur,...(history[0]?.before||triple(cur))};
    for(const c of history)baseline={...baseline,...recordCountsAfter(baseline,c.result,-1)};
    if((Number(cur.games)||0)<history.length)throw Error('Rating count differs from ledger: '+person.uid);
    delete baseline.id;
    states.set(person.uid,baseline);
  }
  const updates=[],roomUpdates=[];
  for(const event of events) {
    const e=event.e,preA=states.get(e.a.uid),preB=states.get(e.b.uid);
    const next=applyRound(preA,preB,e.outcome);
    const pair=[['a',e.a,e.b,preA,next.a],['b',e.b,e.a,preB,next.b]].map(([side,me,them,pre,post],i)=>{
      const result=resultForOutcome(e.outcome,side);
      states.set(me.uid,{...pre,...post,...recordCountsAfter(pre,result),peak:Math.max(pre.peak||post.rating,post.rating),lastEventAt:event.at,updatedAt:now});
      const original=event.pair?.[i];
      const id=original?.id||event.ids[i];
      const data={...(original||{uid:me.uid,name:me.name||'',opponentUid:them.uid,side:me.side,source:event.source,eventId:event.id,rev:0,motion:String(e.motion||'').slice(0,300),verdictSource:e.verdictSource,result}),
        before:triple(pre),after:triple(post),delta:Math.round((post.rating-pre.rating)*10)/10,at:event.at};
      delete data.id;
      updates.push({id,data,original:original||null});return data;
    });
    if(event.source==='live')roomUpdates.push({id:event.id,ratingChanges:Object.fromEntries(pair.map(c=>[c.uid,{before:Math.round(c.before.rating),after:Math.round(c.after.rating),delta:c.delta,result:c.result}]))});
  }
  return {missing:missing.map(m=>({source:m.source,id:m.id,at:m.at})),cutoff,
    ratings:[...states].map(([id,data])=>({id,data})),changes:updates,rounds:roomUpdates};
}
