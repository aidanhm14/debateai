import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const docs=new Map();let uid='one';const db={collection:name=>({doc:id=>({id,get:async()=>({exists:docs.has(name+'/'+id),data:()=>docs.get(name+'/'+id)}),create:async value=>{const key=name+'/'+id;if(docs.has(key))throw {code:6};docs.set(key,value);},update:async value=>docs.set(name+'/'+id,{...docs.get(name+'/'+id),...value})}),add:async value=>{const id='auto'+docs.size;docs.set(name+'/'+id,value);return {id};}})};
const src=fs.readFileSync('app/netlify/functions/log-generation.mjs','utf8').replace(/^import.*;\n/gm,'').replace('export default async','globalThis.handler = async').replace('export const config','const config');
const ctx={createHash,console:{log(){},error(){}},setInterval(){},setTimeout,clearTimeout,Date,Map,Set,Number,String,Promise,
 verifyIdToken:async()=>({sub:uid,firebase:{sign_in_provider:'google.com'}}),extractBearerToken:()=> 'token',getDb:()=>db,FieldValue:{serverTimestamp:()=>123},
 jsonResponse:(body,status)=>({body,status}),errorResponse:(error,status)=>({error,status})};
vm.runInNewContext(src,ctx);
const send=body=>ctx.handler({method:'POST',headers:{get:()=>null},json:async()=>body});
const payload={action:'generation',kind:'live_round',output:'Decision',context:{roundId:'room_123'},contributable:false};
const first=await send(payload),again=await send(payload);assert.equal(first.status,200);assert.equal(first.body.id,again.body.id);assert.equal(docs.size,1);
uid='two';const other=await send(payload);assert.notEqual(other.body.id,first.body.id);assert.equal(docs.size,2);
assert.equal((await send({action:'signal',generationId:first.body.id,signal:'rate',value:3})).status,404);
uid='one';for(const value of [0,6,2.5,'5'])assert.equal((await send({action:'signal',generationId:first.body.id,signal:'rate',value})).status,400);
assert.equal((await send({action:'signal',generationId:first.body.id,signal:'rate',value:3,meta:{issue:'transcript',notes:'Missing final words'}})).status,200);
assert.equal(docs.get('generations/'+first.body.id).feedbackIssue,'transcript');
await send(payload);assert.equal(docs.get('generations/'+first.body.id).rating,3,'Capture retry preserves feedback');
console.log('Round capture: idempotent writes, account isolation, ownership, rating bounds and linked issue notes passed.');
