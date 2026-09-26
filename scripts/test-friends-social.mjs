import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import outlook from '../app/js/public-outlook.js';
import { outlookWrite, readPublicOutlooks } from '../app/netlify/functions/lib/public-outlook.mjs';
import { checkContent } from '../app/netlify/functions/lib/content-guard.mjs';

assert.throws(() => outlookWrite({label:'Independent',belief:'Housing matters.'}), /public/);
assert.throws(() => outlookWrite({label:'invented',publish:true}), /list/);
assert.throws(() => outlookWrite({belief:'x'.repeat(241),publish:true}), /240/);
assert.deepEqual(outlookWrite({label:'',belief:'',publish:false}), {publicIdeology:null,publicBelief:'',publicBeliefPublished:false});
assert.equal(outlook.read({publicBelief:'Private draft',publicBeliefPublished:false}).belief, '');
assert.equal(outlook.read({stances:{economy:'redistribute'}}).label, '');
assert.equal(outlook.read({publicIdeology:'Liberal'}).label, 'Liberal');
assert.ok(!outlook.html({label:'Liberal',belief:'<img src=x onerror=alert(1)>'}).includes('<img'));

const records={user_profiles:{public01:{publicIdeology:'Independent',publicBelief:'More homes.',publicBeliefPublished:true,email:'secret'},private1:{publicIdeology:'Green',publicBelief:'Private text',publicBeliefPublished:true}},public_profiles:{private1:{visibility:'private'}}};
const db={collection:c=>({doc:id=>({c,id})}),getAll:async(...refs)=>refs.map(({c,id})=>({id,exists:!!records[c][id],data:()=>records[c][id]}))};
assert.deepEqual(await readPublicOutlooks(db,['public01','private1']), {public01:{label:'Independent',belief:'More homes.'}});
assert.equal((await readPublicOutlooks(db,['private1'],'private1')).private1.belief,'Private text');

let writes=[], auth={sub:'owner123',named:true}, limiterCalls=0;
const server=fs.readFileSync('app/netlify/functions/public-outlook.mjs','utf8').replace(/^import .*;\n/gm,'').replace('export default async','globalThis.handler = async').replace(/export const config[^]*$/,'');
const scope={URL,Response, getDb:()=>({collection:c=>({doc:id=>({set:async fields=>writes.push({c,id,fields})})})}),FieldValue:{serverTimestamp:()=>123},
  verifyIdToken:async()=>auth,extractBearerToken:r=>r.headers.get('Authorization'),isNamedAccount:u=>u.named,
  jsonResponse:(v,status)=>new Response(JSON.stringify(v),{status}),errorResponse:(error,status)=>new Response(JSON.stringify({error}),{status}),
  checkLayers:async()=>{limiterCalls++;return {ok:true};},callerIp:()=> 'test',checkContent,outlookWrite,readPublicOutlooks:async()=>({}),};
vm.runInNewContext(server,scope);
function post(body,token=true){return scope.handler(new Request('https://itsdebatable.com/api/public-outlook',{method:'POST',headers:token?{Authorization:'test'}:{},body:JSON.stringify(body)}));}
assert.equal((await post({label:'Liberal',publish:true},false)).status,401);
auth.named=false;assert.equal((await post({label:'Liberal',publish:true})).status,401);auth.named=true;
assert.equal((await post({label:'Liberal',publish:false})).status,400);
assert.equal(writes.length,0);
assert.equal((await post({uid:'someone-else',label:'Independent',belief:'More homes near transit.',publish:true})).status,200);
assert.equal(writes[0].id,'owner123');assert.equal(writes[0].fields.publicBeliefPublished,true);
assert.equal((await post({label:'',belief:'',publish:false})).status,200);assert.equal(writes[1].fields.publicBelief,'');
assert.equal((await scope.handler(new Request('https://itsdebatable.com/api/public-outlook?uids=public01'))).headers.get('Cache-Control'),'no-store');

let watcher, relation='none', calls=[], fail=false;
const window={DBFriends:{init(){watcher?.({status:'ready'});},watch(cb){watcher=cb;cb({status:'ready'});},statusWith:()=>relation,
  request:async(uid)=>{calls.push(['request',uid]);if(fail)throw Error('offline');},accept:async(uid)=>calls.push(['accept',uid])}};
let user={uid:'owner123'}, target={uid:'peer1234',name:'Peer'}, messages=[];
const document={addEventListener(){}};
vm.runInNewContext(fs.readFileSync('app/js/room-friends.js','utf8'),{window,document});
const controls=window.DBRoomFriends.attach({user:()=>user,db:()=>db,target:()=>target,opponent:()=>target,name:()=> 'My alias',repaint(){},toast:m=>messages.push(m)});
const button={};controls.paint(button,target);assert.equal(button.textContent,'Add friend');
assert.equal(calls.length,0,'rendering must never send a request');
controls.act(target);controls.act(target);await new Promise(setImmediate);assert.equal(calls.length,1,'double taps must not duplicate writes');
controls.paint(button,target);assert.equal(button.textContent,'Request sent');assert.equal(button.disabled,true);
relation='incoming';watcher({status:'ready'});controls.paint(button,target);assert.equal(button.textContent,'Accept request');
controls.act(target);await new Promise(setImmediate);assert.equal(calls[1][0],'accept');controls.paint(button,target);assert.equal(button.textContent,'Friends');
relation='none';fail=true;watcher({status:'ready'});controls.act(target);await new Promise(setImmediate);controls.paint(button,target);assert.equal(button.disabled,false);assert.equal(button.textContent,'Add friend');
controls.paint(button,{uid:user.uid});assert.equal(button.hidden,true);
controls.paint(button,{uid:'ai'});assert.equal(button.hidden,true);
user={uid:'guest123',isAnonymous:true};controls.paint(button,target);assert.equal(button.hidden,true);
console.log('Friends social: public consent, removal, visibility, escaping, owner-only writes, named auth, and in-round request states passed.');
