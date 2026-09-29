import {randomUUID} from 'node:crypto';
import {getDb} from './lib/firestore.mjs';
import {authConfig,readSession,permittedOrigin} from './lib/synthetic-lab-auth.mjs';
import {safeText} from './lib/synthetic-lab-core.mjs';
import {newAttackRun,reviewAttack,compareExpertRuns,ATTACKS,EXAMPLE_CASE} from './lib/judge-attacks.mjs';
const response=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}});
const idOf=value=>{if(!/^[a-f0-9-]{36}$/.test(String(value||'')))throw Error('Invalid run.');return value;};
export default async request=>{
  try{
    if(!readSession(request.headers.get('cookie'),authConfig()))return response({error:'Unlock the private lab first.'},401);
    const db=getDb(),runs=db.collection('judge_attack_runs'),url=new URL(request.url);
    if(request.method==='GET'){
      if(url.searchParams.has('id')){
        const id=idOf(url.searchParams.get('id')),snap=await runs.doc(id).get();
        if(!snap.exists)return response({error:'Run not found.'},404);
        const job=snap.data();
        if(url.searchParams.get('raw')==='1')job.traces=(await db.collection('judge_attack_traces').where('runId','==',id).get()).docs.map(d=>d.data());
        return response({job});
      }
      const jobs=(await runs.orderBy('createdAt','desc').limit(60).get()).docs.map(d=>d.data());
      const submissions=(await db.collection('judge_challenge_submissions').orderBy('createdAt','desc').limit(30).get()).docs.map(d=>({id:d.id,...d.data()}));
      return response({attacks:ATTACKS,example:EXAMPLE_CASE,runs:jobs.map(j=>({id:j.id,motion:j.example.motion,status:j.status,steps:j.results.length,review:j.review})),benchmark:compareExpertRuns(jobs),submissions});
    }
    if(request.method!=='POST')return response({error:'Method not allowed.'},405);
    if(!permittedOrigin(request))return response({error:'Use the private lab.'},403);
    const text=await request.text();if(text.length>80000)return response({error:'Request too large.'},413);
    const b=JSON.parse(text),now=Date.now(),day=new Date(now).toISOString().slice(0,10);
    if(b.action==='create'||b.action==='replay'){
      if(String(process.env.INTERNAL_JUDGE_KEY || '').length<16)throw Error('Background worker unavailable.');
      const job=newAttackRun(b,now),budget=db.collection('synthetic_lab_control').doc('attacks-'+day);
      if(b.action==='replay'){
        const parent=(await runs.doc(idOf(b.id)).get()).data();
        if(!parent?.review?.confirmed)throw Error('Only a human-confirmed regression can be replayed.');
        job.example=parent.example;job.attack=parent.attack;job.attackText=parent.attackText;job.regressionOf=parent.id;
      }
      // Public submissions carry synthetic text explicitly licensed by the
      // submitter, never an imported private round or an arbitrary room id.
      if(b.submissionId){
        const submission=await db.collection('judge_challenge_submissions').doc(idOf(b.submissionId)).get();
        if(!submission.exists)throw Error('Submission not found.');
        job.example=newAttackRun({example:submission.data().example},now).example;
        job.submissionId=b.submissionId;
      }
      await db.runTransaction(async tx=>{const usage=await tx.get(budget);if((usage.data()?.count||0)>=10)throw Error('Daily 10-run limit reached.');tx.set(budget,{count:(usage.data()?.count||0)+1});tx.create(runs.doc(job.id),job);});
      return response({job},201);
    }
    if(b.action==='regressions'){
      const jobs=(await runs.where('review.confirmed','==',true).limit(100).get()).docs.map(d=>d.data());
      return response({version:'break-the-judge-v1',regressions:jobs.map(j=>({id:j.id,example:j.example,attack:j.attack,attackText:j.attackText,review:j.review,season:j.season,results:j.results}))});
    }
    const id=idOf(b.id),ref=runs.doc(id),snap=await ref.get();if(!snap.exists)return response({error:'Run not found.'},404);
    const job=snap.data();
    if(b.action==='review'){
      const reviewed=await db.runTransaction(async tx=>{
        const fresh=(await tx.get(ref)).data();
        if(fresh.review)throw Error('This reviewed record is immutable. Create a new reproduction for a revised finding.');
        const review=reviewAttack(fresh,b,now);tx.update(ref,{review,updatedAt:now});return {...fresh,review};
      });
      return response({job:reviewed});
    }
    if(b.action==='award'){
      if(!job.submissionId || !job.review?.confirmed || !job.review?.expert)throw Error('A reproduced, expert-reviewed submission is required.');
      const summary=String(b.summary||'').trim();if(summary.length<30||summary.length>300)throw Error('Write a public summary of 30 to 300 characters.');safeText(summary);
      const submissionRef=db.collection('judge_challenge_submissions').doc(job.submissionId),badgeRef=db.collection('judge_challenge_badges').doc(job.submissionId);
      await db.runTransaction(async tx=>{
        const [submission,badge]=await Promise.all([tx.get(submissionRef),tx.get(badgeRef)]),data=submission.data();
        if(!data?.publicConsent)throw Error('The submitter has not consented to a public badge.');
        if(badge.exists&&badge.data().verifiedAt)throw Error('This discovery already has a badge.');
        tx.set(badgeRef,{uid:data.uid,alias:data.alias,summary,public:true,runId:id,verifiedAt:now,reviewer:job.review.reviewer});
        tx.update(submissionRef,{status:'verified',runId:id});
      });
      return response({ok:true});
    }
    if(b.action!=='step')throw Error('Unknown action.');
    const token=randomUUID(),budget=db.collection('synthetic_lab_control').doc('attack-calls-'+day);
    const claimed=await db.runTransaction(async tx=>{
      const [fresh,usage]=await Promise.all([tx.get(ref),tx.get(budget)]),j=fresh.data();
      if(j.status==='complete'||j.lease?.until>now)return false;
      if(j.attempts>=26||(usage.data()?.count||0)+(j.attackText?3:1)>300)throw Error('Retry or daily model-call limit reached.');
      tx.update(ref,{lease:{token,until:now+210000},status:'running',error:'',attempts:j.attempts+1});
      tx.set(budget,{count:(usage.data()?.count||0)+(j.attackText?3:1)});return true;
    });
    if(claimed){
      const origin=process.env.DEPLOY_PRIME_URL||process.env.URL||'https://itsdebatable.com';
      try{await fetch(new URL('/.netlify/functions/judge-attacks-background',origin),{method:'POST',headers:{'Content-Type':'application/json','x-internal-judge-key':process.env.INTERNAL_JUDGE_KEY},body:JSON.stringify({id,token}),signal:AbortSignal.timeout(8000),redirect:'error'});}catch{/* Polling can resume an expired dispatch, never double-send. */}
    }
    return response({job:(await ref.get()).data()},202);
  }catch(e){return response({error:String(e.message||'Request failed.').slice(0,300)},400);}
};
export const config={path:'/api/judge-attacks'};
