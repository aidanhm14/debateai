import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const values=new Map();let chain=Promise.resolve(),dispatches=0,advances=0;
const snap=path=>({id:path.split('/').at(-1),exists:values.has(path),data:()=>structuredClone(values.get(path))});
const ref=path=>({path,get:async()=>snap(path),create:async v=>{assert.ok(!values.has(path));values.set(path,structuredClone(v));},update:async v=>values.set(path,{...values.get(path),...structuredClone(v)})});
const collection=c=>{let checks=[],cap=1000;const q={doc:id=>ref(c+'/'+id),where:(key,op,v)=>{checks.push(d=>key.split('.').reduce((x,k)=>x?.[k],d)===v);return q;},orderBy:()=>q,limit:n=>{cap=n;return q;},get:async()=>({docs:[...values.keys()].filter(k=>k.startsWith(c+'/')&&checks.every(f=>f(values.get(k)))).slice(0,cap).map(snap)})};return q;};
const db={collection,runTransaction(fn){const p=chain.then(async()=>{const writes=[];const result=await fn({get:async r=>{assert.equal(writes.length,0);return snap(r.path);},create:(r,v)=>{assert.ok(!values.has(r.path));writes.push(()=>values.set(r.path,structuredClone(v)));},set:(r,v,o)=>writes.push(()=>values.set(r.path,o?.merge?{...values.get(r.path),...structuredClone(v)}:structuredClone(v))),update:(r,v)=>writes.push(()=>values.set(r.path,{...values.get(r.path),...structuredClone(v)}))});writes.forEach(f=>f());return result;});chain=p.catch(()=>{});return p;}};
globalThis.__challengeTest={db,advance:async j=>{advances++;return {...j,status:'paused',attackText:'A preserved test attack.'};}};
process.env.INTERNAL_JUDGE_KEY='test-worker-secret-at-least-sixteen';
const hooks=registerHooks({load(url,ctx,next){
  const source=url.endsWith('/lib/firestore.mjs')?'export const getDb=()=>globalThis.__challengeTest.db;export const getUserTeam=async()=>null;export const withDeadline=p=>p;export const FieldValue={serverTimestamp:()=>Date.now(),increment:n=>n,delete:()=>null};export const FieldPath={documentId:()=>"id"};'
    :url.endsWith('/lib/auth.mjs')?'export const extractBearerToken=r=>(r.headers.get("authorization")||"").replace("Bearer ","");export const verifyIdToken=async t=>{if(!t)throw Error("auth");return {sub:t};};export const isNamedAccount=d=>d.sub!=="guest";export const isOwnerEmail=()=>false;'
    :url.endsWith('/lib/rate-limit.mjs')?'export const callerIp=()=>"test";export const checkLayers=async()=>({ok:true});'
    :url.endsWith('/lib/synthetic-lab-auth.mjs')?'export const authConfig=()=>({});export const readSession=c=>c==="test-lab-session";export const permittedOrigin=r=>r.headers.get("origin")==="https://itsdebatable.com";'
    :url.endsWith('/lib/judge-attacks.mjs')?`export * from ${JSON.stringify(url+'?actual')};export const advanceAttack=j=>globalThis.__challengeTest.advance(j);`:null;
  return source?{format:'module',shortCircuit:true,source}:next(url,ctx);
}});
const {default:challenge}=await import('../app/netlify/functions/judge-challenge.mjs');
const {default:lab}=await import('../app/netlify/functions/judge-attacks.mjs');
const {default:worker}=await import('../app/netlify/functions/judge-attacks-background.mjs');
const {default:followups}=await import('../app/netlify/functions/round-followups.mjs');
const {EXAMPLE_CASE,VARIANTS}=await import('../app/netlify/functions/lib/judge-attacks.mjs');
globalThis.fetch=async()=>{dispatches++;return new Response(null,{status:202});};
const request=(path,body,{uid='',session=false,origin='https://itsdebatable.com',internal=false}={})=>new Request('https://itsdebatable.com'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin,...(uid?{authorization:'Bearer '+uid}:{}),...(session?{cookie:'test-lab-session'}:{}),...(internal?{'x-internal-judge-key':process.env.INTERNAL_JUDGE_KEY}:{})},...(body?{body:JSON.stringify(body)}:{})});
const call=(fn,body,options)=>fn(request('/api/test',body,options));
const submission={example:EXAMPLE_CASE,description:'The judge treats a conditional admission as a total concession.',synthetic:true,alias:'Tester',publicConsent:true};
assert.equal((await call(challenge,submission)).status,401);
assert.equal((await call(challenge,submission,{uid:'guest'})).status,401);
assert.equal((await call(challenge,{...submission,synthetic:false},{uid:'alice'})).status,400);
const saved=await call(challenge,submission,{uid:'alice'});assert.equal(saved.status,201);const {id}=await saved.json();assert.equal(dispatches,0,'submission cannot trigger paid calls');
assert.equal((await call(lab,{action:'create',submissionId:id})).status,401);
assert.equal((await call(lab,{action:'create',submissionId:id},{session:true,origin:'https://bad.example'})).status,403);
let created=await call(lab,{action:'create',submissionId:id},{session:true});assert.equal(created.status,201);let job=(await created.json()).job;
assert.deepEqual(job.example,EXAMPLE_CASE);assert.equal(job.submissionId,id);
assert.equal((await call(lab,{action:'award',id:job.id,summary:submission.description},{session:true})).status,400,'no automatic badge before human review');
const steps=await Promise.all(Array.from({length:8},()=>call(lab,{action:'step',id:job.id},{session:true})));assert.ok(steps.every(r=>r.status===202));assert.equal(dispatches,1,'one dispatch under concurrent requests');
const leased=values.get('judge_attack_runs/'+job.id),work={id:job.id,token:leased.lease.token};
await call(worker,work);assert.equal(advances,0);
await Promise.all([call(worker,work,{internal:true}),call(worker,work,{internal:true})]);assert.equal(advances,1,'worker claims a dispatch only once');
job=values.get('judge_attack_runs/'+job.id);job.status='complete';job.results=VARIANTS.flatMap(kind=>[1,2].map(repetition=>({kind,repetition,configuration:job.season.panel,result:{ballot:{winner:'con'},panel:{votesCast:3},jurorResults:[]}})));
const review={action:'review',id:job.id,reviewer:'Human',notes:'I checked the two full reproductions and the limited scope of the admission.',expectedWinner:'pro',failingVariant:'attack',failureType:'winner',checked:true,expert:true,qualification:'Experienced debate adjudicator'};
const reviewed=await Promise.all([call(lab,review,{session:true}),call(lab,review,{session:true})]);assert.deepEqual(reviewed.map(r=>r.status).sort(),[200,400],'review is immutable even under a race');
assert.equal((await call(lab,{action:'award',id:job.id,summary:submission.description},{session:true})).status,200);
const visible=await (await call(challenge)).json();assert.equal(visible.badges.length,1);assert.deepEqual(Object.keys(visible.badges[0]).sort(),['alias','id','summary','verifiedAt']);
assert.equal((await call(lab,{action:'award',id:job.id,summary:submission.description},{session:true})).status,400,'no duplicate badge');
assert.equal((await call(challenge,{action:'withdraw',id},{uid:'other'})).status,400);
assert.equal((await call(challenge,{action:'withdraw',id},{uid:'alice'})).status,200);assert.equal((await (await call(challenge)).json()).badges.length,0);
const replay=await call(lab,{action:'replay',id:job.id},{session:true});assert.equal(replay.status,201);const repeated=(await replay.json()).job;assert.equal(repeated.attackText,job.attackText);assert.equal(repeated.regressionOf,job.id);assert.equal(repeated.review,null,'replays cannot inherit an approval');
values.set('live_rounds/test_room',{format:'quick',proUid:'alice',conUid:'bob',speeches:EXAMPLE_CASE.turns});
assert.equal((await call(followups,{room:'test_room'},{uid:'other'})).status,403);
const qs=await (await call(followups,{room:'test_room'},{uid:'alice'})).json();assert.equal(qs.questions.length,2);
values.get('live_rounds/test_room').speeches=[];
assert.deepEqual((await (await call(followups,{room:'test_room'},{uid:'bob'})).json()).questions,qs.questions,'both participants get the same saved pair');
hooks.deregister();console.log('Challenge routes: account/privacy gates, no paid public calls, dispatch dedupe, immutable human reviews, badge consent/redaction, regression replay and paired followups passed.');
