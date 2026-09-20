import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {CAMPAIGN,SUBJECT,MESSAGE,cohort,payload} from '../app/netlify/functions/lib/peak-hours-email.mjs';
process.env.EMAIL_UNSUB_SECRET='test-secret';process.env.RESEND_API_KEY='test-key';
const users = [{uid:'a',email:'A@example.org'},{uid:'b',email:'a@example.org'},
  {uid:'c',email:'c@example.org',disabled:true},{uid:'d',email:'d@example.org'},
  {uid:'e',email:'invalid'},{uid:'f',email:'test@itsdebatable.com'}];
assert.equal(cohort(users,new Map()).recipients.length,2);
for(const flag of ['emailOptOut','wauDigestOptOut','winbackOptOut','sparNightOptOut','openOptOut','streamOptOut']) {
  const c=cohort(users,new Map([['b',{[flag]:true}]]));
  assert.deepEqual(c.recipients.map(p=>p.email),['d@example.org']);
}
const message=payload({uid:'test',email:'test@example.org'});
assert.deepEqual(message.to,['test@example.org']);
assert.equal(message.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
assert.match(message.text,/9pm London time/);assert.match(message.text,/9pm India time \(IST\)/);
assert.match(message.text,/9pm Eastern time \(New York\)/);assert.doesNotMatch(message.text,/—|Berlin|Sydney/);
const source=fs.readFileSync(new URL('../app/netlify/functions/admin-peak-hours.mjs',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace('export default async request =>','return async request =>').replace(/^export const config.*$/m,'');
let records=new Map(), calls=[],fail=false,gateError=false;
function merge(key,value){const old=records.get(key)||{};records.set(key,{...old,...value,...(value.sent?{sent:{...old.sent,...value.sent}}:{})});}
const doc=key=>({key,data:()=>records.get(key),get:async()=>doc(key),set:async value=>merge(key,value)});
const db={doc,collection:()=>({get:async()=>({docs:[]})}),
  runTransaction:async fn=>fn({get:async ref=>doc(ref.key),set:(ref,value)=>merge(ref.key,value)}),
  batch:()=>{const work=[];return {set:(ref,value)=>work.push([ref.key,value]),commit:async()=>work.forEach(([k,v])=>merge(k,v))};}};
const accounts=Array.from({length:51},(_,i)=>({uid:'user'+i,email:'person'+i+'@example.org'}));
const fakeDate=class extends Date {static now(){return Date.parse('2026-09-20T18:00:00Z');}};
const handler=new Function('createHash','randomUUID','requireAdmin','FieldValue','listAllAuthUsers',
  'corsResponse','jsonResponse','errorResponse','CAMPAIGN','SUBJECT','MESSAGE','cohort','payload','fetch','Date',source)(
  createHash,randomUUID,async()=>gateError?{error:{status:403}}:{db,uid:'user0'},
  {serverTimestamp:()=>123},async()=>accounts,()=>({}),x=>x,(message,status)=>({message,status}),
  CAMPAIGN,SUBJECT,MESSAGE,cohort,payload,async(url,init)=>{
    calls.push({url,...init});if(fail)throw new Error('timeout');
    return {ok:true,status:200,json:async()=>({data:JSON.parse(init.body).map((_,i)=>({id:'receipt-'+calls.length+'-'+i}))})};
  },fakeDate);
const req=b=>({method:'POST',json:async()=>b});
let result=await handler(req({}));assert.equal(result.remaining,51);assert.equal(records.size,0);assert.equal(calls.length,0);
gateError=true;assert.equal((await handler(req({confirm:'SEND'}))).status,403);gateError=false;
result=await handler(req({confirm:'SEND',test:true}));assert.equal(result.sent,1);assert.equal(result.remaining,50);
result=await handler(req({confirm:'SEND'}));assert.equal(result.sent,50);assert.equal(result.remaining,0);
result=await handler(req({confirm:'SEND'}));assert.equal(result.sent,0);assert.equal(calls.length,2);
records=new Map();calls=[];fail=true;
assert.equal((await handler(req({confirm:'SEND'}))).status,502);
const first=calls[0];fail=false;
result=await handler(req({confirm:'SEND'}));assert.equal(result.sent,50);
assert.equal(first.headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
assert.equal(first.body,calls[1].body);
assert.equal(records.get('email_campaigns/'+CAMPAIGN).active,null);
console.log('PASS campaign: consent, disabled accounts, dedup, individual envelopes, preview, admin gate, resumable batches and identical retries');
