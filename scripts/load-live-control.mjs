// Explicit, bounded integration exercise in server-only temporary collections.
// Uses real Firestore transport/transactions. No public queue, real accounts,
// actual verdicts, ratings, or paid AI calls are created by this script.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { getDb, FieldPath } from '../app/netlify/functions/lib/firestore.mjs';
import { admitVideoRequest } from '../app/netlify/functions/lib/video-capacity.mjs';
import { createRecoveryQueue } from '../app/netlify/functions/lib/ballot-recovery.mjs';
import { changeConversationFinish } from '../app/netlify/functions/lib/conversation-finish.mjs';
if (!process.argv.includes('--live')) throw new Error('Requires --live and operator-provided test credentials');
const real=getDb(), run='scale-'+Date.now()+'-'+randomUUID().slice(0,8);
const root=real.collection('scale_test_runs').doc(run);
console.log('Test root: '+root.path);
let txAttempts=0;
const db={collection:name=>root.collection(name),getAll:(...refs)=>real.getAll(...refs),
  runTransaction:fn=>real.runTransaction(tx=>{txAttempts++;return fn(tx);},{maxAttempts:8})};
const report={run,kind:'isolated-real-firestore',transport:'rest',startedAt:new Date().toISOString(),scenarios:[]};
const percentile=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))]||0;
async function burst(name,n,act,concurrency=Number(process.env.LOAD_CONCURRENCY || 10)){
 const start=performance.now(),times=[];
 console.log('Starting '+name+' ('+Math.min(n,concurrency)+' in flight)');
 const results=Array(n);let next=0;
 await Promise.all(Array.from({length:Math.min(n,concurrency)},async()=>{
  while(next<n){const i=next++;const t=performance.now();
   try{const value=await act(i);times.push(performance.now()-t);results[i]={status:'fulfilled',value};}
   catch(reason){results[i]={status:'rejected',reason};}
  }
 }));
 const errors=results.filter(r=>r.status==='rejected').map(r=>String(r.reason?.code||r.reason?.message||r.reason).slice(0,100));
 const row={name,requests:n,maxInFlight:Math.min(n,concurrency),ok:n-errors.length,errors:errors.slice(0,5),elapsedMs:Math.round(performance.now()-start),p50Ms:Math.round(percentile(times,.5)),p95Ms:Math.round(percentile(times,.95))};
 report.scenarios.push(row);console.log(JSON.stringify(row));
 assert.equal(errors.length,0,name+' has request failures');return results.map(r=>r.value);
}
try{
 await root.set({createdAt:new Date(),purpose:'temporary capacity test'});
 await burst('600 admissions',600,async i=>assert.equal((await admitVideoRequest(db,'test-'+i)).ok,true));
 await burst('600 reconnect admissions',600,async i=>assert.equal((await admitVideoRequest(db,'test-'+i)).ok,true));
 const start=Date.now()-120_000;
 await burst('initialize 50 isolated conversations',50,i=>db.collection('live_rounds').doc('room-'+i).set({
  isPrivate:true,format:'open',proUid:'pro-'+i,conUid:'con-'+i,status:'round',speechIdx:0,
  currentTimer:{state:'running',startMs:start},
  openSegs:{pro:[{at:start,text:'The park gives everyone a shared place to meet.',speakerUid:'pro-'+i,clock:'server'}],
   con:[{at:start+10000,text:'Repairing homes first would help people who cannot use the park.',speakerUid:'con-'+i,clock:'server'}]},
 }));
 const finishes=await burst('50 finish requests',50,i=>changeConversationFinish(db,'room-'+i,'pro-'+i,{action:'request'}));
 await burst('50 finish acceptances',50,i=>changeConversationFinish(db,'room-'+i,'con-'+i,{action:'accept',id:finishes[i].finish.id}));
 await burst('100 durable transcript receipts',100,i=>{
  const n=Math.floor(i/2);return changeConversationFinish(db,'room-'+n,(i%2?'con-':'pro-')+n,{action:'ready',id:finishes[n].finish.id});
 });
 for(let i=0;i<50;i++){
  const r=(await db.collection('live_rounds').doc('room-'+i).get()).data();
  assert.equal(r.ballotPending,true);assert.match(r.speeches[0].text,/park/);assert.match(r.speeches[0].text,/homes/);
 }
 const watch=db.collection('live_rounds').doc('room-0').collection('watchers');
 await burst('500 audience heartbeats',500,i=>watch.doc('watcher-'+i).set({ts:new Date()}));
 await burst('audience aggregate at 500 viewers',10,async()=>assert.equal((await watch.where('ts','>',new Date(Date.now()-75_000)).limit(1001).count().get()).data().count,500));
 const q=createRecoveryQueue({db,documentId:FieldPath.documentId(),now:()=>Date.now()+120_000});
 let recovered=0,invocations=0,maxBatch=0;
 const tickStart=performance.now();
 for(let tick=0;tick<30 && recovered<50;tick++){
  const jobs=[];await q.dispatch(async job=>{jobs.push(job);});maxBatch=Math.max(maxBatch,jobs.length);
  await Promise.all(jobs.map(async job=>{
   const judge=async request=>{invocations++;const {room}=await request.json();
    await db.collection('live_rounds').doc(room).update({ballotPending:false,ballot:{testOnly:true,winner:'pro'}});
    return Response.json({ballot:{testOnly:true,winner:'pro'}});};
   const outcomes=await Promise.all([q.run(job,judge),q.run(job,judge)]);
   assert.equal(outcomes.filter(x=>x.code==='decided').length,1);recovered++;
  }));
 }
 assert.equal(recovered,50);assert.equal(invocations,50);assert.ok(maxBatch<=3);
 report.scenarios.push({name:'50 recovered rooms with duplicate worker deliveries',ok:recovered,judgeStubs:invocations,maxBatch,elapsedMs:Math.round(performance.now()-tickStart)});
 console.log(JSON.stringify(report.scenarios.at(-1)));
 report.passed=true;
}catch(error){report.passed=false;report.error=String(error.message);process.exitCode=1;console.error('Load check failed:',report.error);
}finally{
 report.transactionAttempts=txAttempts;
 // Persist measurements before cleanup. BulkWriter uses unref'ed timers;
 // keep Node alive until its deletions have actually completed.
 if(process.env.LOAD_REPORT_PATH)writeFileSync(process.env.LOAD_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
 const keepAlive=setInterval(()=>{},1000);
 try { await real.recursiveDelete(root); report.cleanedUp=true; }
 finally { clearInterval(keepAlive); }
 report.finishedAt=new Date().toISOString();
 if(process.env.LOAD_REPORT_PATH)writeFileSync(process.env.LOAD_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
 await real.terminate();
}
