import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
let reads=0,counts=0,privateRoom=false,total=500;
const f={Request,Response,URL,Date,Math,console,verifyIdToken:async token=>{if(!token)throw Error('no token');return {sub:token};},
 extractBearerToken:r=>r.headers.get('Authorization'),jsonResponse:(body,status)=>Response.json(body,{status}),corsResponse:()=>new Response(),withDeadline:p=>p,
 getDb:()=>({collection:()=>({doc:()=>({get:async()=>{reads++;return {data:()=>({proUid:'a',conUid:'b',isPrivate:privateRoom})};},collection:()=>query})})})};
const query={where:()=>query,limit:()=>query,count:()=>({get:async()=>{counts++;return {data:()=>({count:total})};}})};
let source=readFileSync(new URL('../app/netlify/functions/room-watch-count.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export const config[\s\S]*/,'').replaceAll('export const','const').replace('export default async request =>','var handler = async request =>');
vm.createContext(f);vm.runInContext(source,f);
const call=uid=>f.handler(new Request('https://test/api/room-watch-count?room=room',{headers:uid?{Authorization:uid}:{}}));
assert.equal((await call()).status,401);assert.equal(reads,0);
assert.equal((await call('outsider')).status,403);assert.equal(counts,0);
assert.deepEqual(await (await call('a')).json(),{count:500,capped:false});
privateRoom=true;assert.deepEqual(await (await call('b')).json(),{count:0,capped:false});assert.equal(counts,1);
privateRoom=false;total=1001;assert.deepEqual(await (await call('a')).json(),{count:1000,capped:true});
console.log('[test-room-watch-count] authentication, seated access, private rooms, 500 viewers and bounded aggregate passed');
