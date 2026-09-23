import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const docs=new Map();let uid='one',admin=false,seq=0,provider='google.com';
function ref(name,id='generated'+(++seq)){const key=name+'/'+id;return {id,key,get:async()=>({id,exists:docs.has(key),data:()=>docs.get(key)}),create:async value=>{if(docs.has(key))throw {code:6};docs.set(key,value);},update:async value=>docs.set(key,{...docs.get(key),...value})};}
function collection(name){let after='',limit=999;return {doc:id=>ref(name,id),orderBy(){return this;},startAfter(snap){after=snap.id;return this;},limit(n){limit=n;return this;},get:async()=>{const all=[...docs].filter(([key])=>key.startsWith(name+'/')).map(([key,data])=>({id:key.slice(name.length+1),data:()=>data}));const start=after?all.findIndex(d=>d.id===after)+1:0;return {docs:all.slice(start,start+limit)};}};}
const tx={get:r=>r.get(),create:(r,v)=>docs.set(r.key,v),set:(r,v)=>docs.set(r.key,v),update:(r,v)=>docs.set(r.key,{...docs.get(r.key),...v})};
const db={collection,runTransaction:async fn=>fn(tx),batch:()=>({...tx,commit:async()=>{}})};
function load(file){const src=fs.readFileSync('app/netlify/functions/'+file,'utf8').replace(/^import.*;\n/gm,'').replace('export default async','globalThis.handler=async').replace('export const config','const config');const ctx={createHash,console:{log(){},error(){},warn(){}},setInterval(){},setTimeout,clearTimeout,Date,Map,Set,Number,String,Promise,URL,process:{env:{}},verifyIdToken:async()=>({sub:uid,email:'owner@example.test',firebase:{sign_in_provider:provider}}),isAdminEmail:()=>admin,extractBearerToken:()=> 'token',getDb:()=>db,FieldValue:{serverTimestamp:()=>({toMillis:()=>123})},jsonResponse:(body,status)=>({body,status}),errorResponse:(error,status)=>({error,status})};vm.runInNewContext(src,ctx);return ctx.handler;}
const submit=load('log-generation.mjs'),list=load('admin-list-generations.mjs'),review=load('admin-rate-generation.mjs');
const post=(handler,body)=>handler({method:'POST',headers:{get:()=>null},json:async()=>body});
const get=query=>list({method:'GET',url:'https://example.test/api/admin/list-generations?'+query,headers:{get:()=>null}});
docs.set('live_rounds/room_123',{proUid:'one',conUid:'two',transcript:'PRIVATE WORDS'});
const payload={action:'round_feedback',surface:'live_round',roundId:'room_123',issue:'audio',notes:'Could not hear.',fullTranscript:'MUST NOT STORE'};
const result=await post(submit,payload);assert.equal(result.status,200);const feedbackKey='round_feedback/'+result.body.id;
const record=docs.get(feedbackKey);assert.equal(record.roundVerified,true);assert.equal(record.rating,null);assert.equal(record.fullTranscript,undefined);assert.equal(JSON.stringify(record).includes('PRIVATE WORDS'),false);assert.equal(docs.size,2,'No generation or transcript created');
record.reviewStatus='reviewed';await post(submit,{...payload,notes:'Retry changed'});assert.equal(docs.get(feedbackKey).notes,'Could not hear.');assert.equal(docs.get(feedbackKey).reviewStatus,'reviewed');
provider='anonymous';assert.equal((await post(submit,{...payload,surface:'newvoice',roundId:'anon_123'})).status,401);provider='google.com';
uid='outsider';assert.equal((await post(submit,payload)).status,404);uid='one';
for(const rating of [0,6,2.5,'5'])assert.equal((await post(submit,{...payload,rating})).status,400);
assert.equal((await post(submit,{...payload,issue:'',notes:''})).status,400);
const voice=await post(submit,{...payload,surface:'newvoice',roundId:'voice_123'});assert.equal(voice.status,200);assert.equal(docs.get('round_feedback/'+voice.body.id).roundVerified,false);
assert.equal((await get('queue=feedback')).status,403);admin=true;
const inbox=await get('queue=feedback&onlyUnrated=true');assert.equal(inbox.body.items.length,1);assert.equal(inbox.body.items[0].id,voice.body.id);assert.equal(inbox.body.items[0].roundVerified,false);
assert.equal((await post(review,{reviewType:'round_feedback',generationId:voice.body.id,notes:'Investigated audio recovery.'})).status,200);assert.equal(docs.get('round_feedback/'+voice.body.id).reviewStatus,'reviewed');assert.equal(docs.has('generations/'+voice.body.id),false);
// Feedback submitted before consented capture still excludes its generation
// from learning, while preserving the report and completed review.
const capture=await post(submit,{action:'generation',kind:'voice_round',output:'AI output',context:{roundId:'voice_123'}});
assert.equal(capture.status,200);assert.equal(docs.get('round_feedback/'+voice.body.id).generationId,capture.body.id);
assert.equal(docs.get('round_feedback/'+voice.body.id).reviewStatus,'reviewed');
assert.equal(docs.get('generations/'+capture.body.id).feedbackIssue,'audio');
assert.equal(docs.get('generations/'+capture.body.id).userNotes,'Could not hear.');
docs.delete('generations/'+capture.body.id);
// Capture committed but its browser response is still pending: the report
// finds its deterministic generation even without a supplied generationId.
const earlyCapture=await post(submit,{action:'generation',kind:'voice_round',output:'AI output',context:{roundId:'voice_456'}});
const lateReport=await post(submit,{...payload,surface:'newvoice',roundId:'voice_456'});
assert.equal(docs.get('round_feedback/'+lateReport.body.id).generationId,earlyCapture.body.id);
assert.equal(docs.get('generations/'+earlyCapture.body.id).feedbackIssue,'audio');
docs.delete('generations/'+earlyCapture.body.id);
// An empty filtered page advances; documents sharing a timestamp survive.
for(let i=0;i<7;i++)docs.set('generations/g'+i,{uid:'one',kind:i===6?'live_round':'case',format:'open',output:'x'.repeat(12000),createdAt:{toMillis:()=>100},rating:5});
const first=await get('kind=live_round&limit=1&onlyUnrated=true');assert.equal(first.body.items.length,0);assert.equal(first.body.cursor,'g3');
const next=await get('kind=live_round&limit=1&onlyUnrated=true&after='+first.body.cursor);assert.equal(next.body.items.length,1);assert.equal(next.body.items[0].id,'g6');assert.equal(next.body.items[0].output.length,12000);assert.equal(next.body.items[0].userRating,5);assert.equal(next.body.items[0].adminRating,null);assert.equal(next.body.cursor,null);
assert.equal((await post(review,{generationId:'g6',rating:3,notes:'Complete review'})).status,200);assert.equal(docs.get('generations/g6').adminRating,3);assert.equal((await get('kind=live_round&limit=20&onlyUnrated=true')).body.items.length,0);
await post(submit,{action:'signal',generationId:'g6',signal:'rate',value:1});assert.equal(docs.get('generations/g6').rating,3);assert.equal(docs.get('generations/g6').userRating,1);
console.log('Round feedback: metadata-only consent boundary, ownership, deduplication, admin triage, full review content, pagination and rating provenance passed.');
