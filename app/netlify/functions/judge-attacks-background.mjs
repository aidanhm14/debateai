import {getDb} from './lib/firestore.mjs';
import {isInternalJudgeCall} from './live-judge.mjs';
import {advanceAttack} from './lib/judge-attacks.mjs';
export default async request=>{
  if(request.method!=='POST'||!isInternalJudgeCall(request))return;
  let b;try{b=await request.json();}catch{return;}
  if(!/^[a-f0-9-]{36}$/.test(String(b.id||''))||typeof b.token!=='string')return;
  const db=getDb(),ref=db.collection('judge_attack_runs').doc(b.id);
  const job=await db.runTransaction(async tx=>{const s=await tx.get(ref),j=s.data();if(!j||j.lease?.token!==b.token||j.lease?.started||j.lease.until<Date.now())return null;tx.update(ref,{lease:{...j.lease,started:true}});return j;});
  if(!job)return;
  try{
    const next=await advanceAttack(job),step=next.results.length;
    let trace=null;
    if(step>job.results.length){
      const row=next.results.at(-1),traceId=b.id+'-'+step;
      trace={runId:b.id,id:traceId,prompt:row.prompt,raw:row.raw};
      next.results[step-1]={...row,traceId};delete next.results[step-1].prompt;delete next.results[step-1].raw;
    }
    next.lease=null;next.updatedAt=Date.now();
    if(Buffer.byteLength(JSON.stringify(next))>850000)throw Error('Run storage limit reached. Export the saved stages.');
    await db.runTransaction(async tx=>{const fresh=await tx.get(ref);if(fresh.data()?.lease?.token!==b.token)return;if(trace)tx.set(db.collection('judge_attack_traces').doc(trace.id),trace);tx.set(ref,next);});
  }catch(e){await db.runTransaction(async tx=>{const fresh=await tx.get(ref);if(fresh.data()?.lease?.token===b.token)tx.update(ref,{status:'paused',lease:null,error:String(e.message||'Step failed').slice(0,250),updatedAt:Date.now()});});}
};
export const config={background:true};
