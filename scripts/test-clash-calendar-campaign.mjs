import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {CAMPAIGN,SUBJECT,MESSAGE,cohort,payload} from '../app/netlify/functions/lib/clash-calendar-email.mjs';
process.env.EMAIL_UNSUB_SECRET='test-secret';process.env.RESEND_API_KEY='test-key';
const source=fs.readFileSync(new URL('../app/netlify/functions/admin-clash-calendar.mjs',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace('export default async request =>','return async request =>').replace(/^export const config.*$/m,'');
let records=new Map(), calls=[],fail=false,gateError=false;
function merge(key,value){const old=records.get(key)||{};records.set(key,{...old,...value,...(value.sent?{sent:{...old.sent,...value.sent}}:{})});}
const doc=key=>({key,data:()=>records.get(key),get:async()=>doc(key),set:async value=>merge(key,value)});
const db={doc,collection:()=>({get:async()=>({docs:[]})}),
  runTransaction:async fn=>fn({get:async ref=>doc(ref.key),set:(ref,value)=>merge(ref.key,value)}),
  batch:()=>{const work=[];return {set:(ref,value)=>work.push([ref.key,value]),commit:async()=>work.forEach(([k,v])=>merge(k,v))};}};
const accounts=Array.from({length:51},(_,i)=>({uid:'user'+i,email:'person'+i+'@example.org',emailVerified:true}));
const fakeDate=class extends Date {static now(){return Date.parse('2026-09-25T12:00:00Z');}};
const handler=new Function('campaignSuppressions','createHash','randomUUID','requireAdmin','FieldValue','listAllAuthUsers',
  'corsResponse','jsonResponse','errorResponse','CAMPAIGN','SUBJECT','MESSAGE','cohort','payload','fetch','Date',source)(
  async()=>new Set(),createHash,randomUUID,async()=>gateError?{error:{status:403}}:{db,uid:'user0'},
  {serverTimestamp:()=>123},async()=>accounts,()=>({}),x=>x,(message,status)=>({message,status}),
  CAMPAIGN,SUBJECT,MESSAGE,cohort,payload,async(url,init)=>{
    calls.push({url,...init});if(fail)throw new Error('timeout');
    return {ok:true,status:200,json:async()=>({data:JSON.parse(init.body).map((_,i)=>({id:'receipt-'+calls.length+'-'+i}))})};
  },fakeDate);
const req=b=>({method:'POST',json:async()=>b});
let result=await handler(req({}));assert.equal(result.remaining,51);assert.equal(records.size,0);assert.equal(calls.length,0);
gateError=true;assert.equal((await handler(req({confirm:'SEND'}))).status,403);gateError=false;
assert.equal((await handler(req({confirm:'SEND'}))).status,409);
await handler(req({confirm:'PREPARE'}));
accounts.push({uid:'late',email:'late@example.org',emailVerified:true});
result=await handler(req({confirm:'SEND',test:true}));assert.equal(result.sent,1);assert.equal(result.remaining,50);
result=await handler(req({confirm:'SEND'}));assert.equal(result.sent,50);assert.equal(result.remaining,0);
result=await handler(req({confirm:'SEND'}));assert.equal(result.sent,0);assert.equal(calls.length,2);
records=new Map();calls=[];fail=true;accounts.pop();
await handler(req({confirm:'PREPARE'}));
assert.equal((await handler(req({confirm:'SEND'}))).status,502);
const first=calls[0];fail=false;
result=await handler(req({confirm:'SEND'}));assert.equal(result.sent,50);
assert.equal(first.headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
assert.equal(first.body,calls[1].body);
assert.equal(records.get('email_campaigns/'+CAMPAIGN).active,null);
console.log('PASS calendar campaign: frozen cohort, consent, disabled accounts, dedup, individual envelopes, preview, admin gate, resumable batches and identical retries');
const {reviewedSuppressions}=await import('../app/netlify/functions/lib/campaign-suppressions.mjs');
const review={complete:true,reviewedAt:10000,suppressed:['blocked@example.org'],unsubscribed:['out@example.org'],suppressionCount:1,unsubscribedCount:1};
assert.equal(reviewedSuppressions(review,10001).size,2);
assert.equal(reviewedSuppressions({...review,complete:false},10001),null);
assert.equal(reviewedSuppressions({...review,suppressionCount:2},10001),null);
assert.equal(reviewedSuppressions(review,10000+3600001),null);
console.log('Provider exclusions: complete, campaign-scoped server review with expiry required');
