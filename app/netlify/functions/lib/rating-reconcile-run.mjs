import { planRatingReconciliation } from './rating-reconcile.mjs';
import { markStandingsChanged, STANDINGS_VERSION } from './standings-version.mjs';
import { randomUUID } from 'node:crypto';
export async function reconcileRatings(db,{apply=false}={}) {
  const markerRef=db.collection('admin_cache').doc(STANDINGS_VERSION);
  const marker=await markerRef.get();
  const collections=['live_rounds','async_rounds','rating_changes','user_ratings'];
  const snapshots=await Promise.all(collections.map(c=>db.collection(c).get()));
  const rows=s=>s.docs.map(d=>({id:d.id,...d.data()}));
  const plan=planRatingReconciliation({rounds:snapshots.slice(0,2).flatMap((s,i)=>s.docs.map(d=>({id:d.id,source:i?'async':'live',data:d.data()}))),changes:rows(snapshots[2]),ratings:rows(snapshots[3])});
  const summary={missing:plan.missing,accounts:plan.ratings.length,replayedRounds:plan.changes.length/2,applied:false};
  if(!apply||!plan.missing.length)return summary;
  const runId=randomUUID();const audit=db.collection('rating_reconciliations').doc(runId);
  const writes=plan.ratings.length*2+plan.changes.length*2+plan.rounds.length+2;
  if(writes>450)throw Error('Repair exceeds atomic write budget; partition and review first');
  const originals=new Map(snapshots.flatMap(s=>s.docs).map(d=>[d.ref.path,d]));
  const refs=[markerRef,...plan.ratings.map(r=>db.collection('user_ratings').doc(r.id)),...plan.changes.map(r=>db.collection('rating_changes').doc(r.id)),...plan.rounds.map(r=>db.collection('live_rounds').doc(r.id)),...plan.missing.filter(r=>r.source==='async').map(r=>db.collection('async_rounds').doc(r.id))];
  await db.runTransaction(async tx=>{
    const fresh=await tx.getAll(...refs);
    fresh.forEach((s,i)=>{
      const old=i===0?marker:originals.get(refs[i].path);
      if(s.exists!==!!old?.exists || (s.exists&&!s.updateTime.isEqual(old.updateTime)))throw Error('Records changed during repair; rerun the dry run');
    });
    for(const r of plan.ratings){const ref=db.collection('user_ratings').doc(r.id);tx.set(audit.collection('ratings').doc(r.id),{before:originals.get(ref.path)?.data()||null,after:r.data});tx.set(ref,r.data);}
    for(const r of plan.changes){const ref=db.collection('rating_changes').doc(r.id);tx.set(audit.collection('changes').doc(r.id),{before:originals.get(ref.path)?.data()||null,after:r.data});tx.set(ref,r.data);}
    for(const r of plan.rounds)tx.update(db.collection('live_rounds').doc(r.id),{ratingChanges:r.ratingChanges});
    tx.set(audit,{at:Date.now(),missing:plan.missing,cutoff:plan.cutoff,accounts:plan.ratings.length,reason:'Restore missing human results in chronological order; preserve decisions and archive previous rating records.'});
    markStandingsChanged(tx,db,'reconciled_'+runId,Date.now());
  });
  return {...summary,applied:true,runId};
}
