import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {privateInvite} from '../app/netlify/functions/lib/private-invite.mjs';
import {corsResponse,errorResponse,jsonResponse} from '../app/netlify/functions/lib/response.mjs';

const read=p=>readFileSync(p,'utf8');
const now=Date.now();
function fixture(){
  const rows=new Map();
  let queue=Promise.resolve();
  const db={collection:name=>({doc:id=>({key:name+'/'+id})}),runTransaction:fn=>{
    const next=queue.then(async()=>{
      const pending=[];
      const result=await fn({
        get:async ref=>{assert.equal(pending.length,0,'all reads precede writes');const value=rows.get(ref.key);return {exists:!!value,data:()=>structuredClone(value)};},
        set:(ref,value)=>pending.push([ref.key,structuredClone(value)]),
        update:(ref,value)=>{assert.ok(rows.has(ref.key));pending.push([ref.key,{...rows.get(ref.key),...structuredClone(value)}]);}
      });
      for(const [key,value] of pending)rows.set(key,value);
      return result;
    });
    queue=next.catch(()=>{});return next;
  }};
  const room='Private-test12345678';
  const call=(uid,body,time=now)=>privateInvite(db,uid,{room,...body},time);
  const open=(side='pro')=>call('host',{action:'open',motion:'Public transport should be free',mySide:side,isPrivate:false,proUid:'spoof',conUid:'spoof'});
  return {db,rows,room,call,open,round:()=>rows.get('live_rounds/'+room),inv:()=>rows.get('private_round_invites/'+room)};
}
const f=fixture();
f.rows.set('user_profiles/host',{displayName:'Account legal name',displayNameOverride:'Chosen name'});
const created=await f.open();
assert.equal(f.round().isPrivate,true);
assert.equal(f.round().proUid,'host');
assert.equal(f.round().conUid,undefined);
assert.equal(f.round().proName,'Chosen name');
assert.ok(!JSON.stringify(f.round()).includes(f.inv().token),'bearer secret never stored in readable round');
const link=new URL(created.inviteUrl,'https://itsdebatable.com');
assert.equal(link.searchParams.has('invite'),false,'invite stays out of URL requests and referrers');
assert.equal(new URLSearchParams(link.hash.slice(1)).get('invite'),f.inv().token);
assert.equal(link.searchParams.get('mySide'),'con');
assert.equal(new URL(created.ownUrl,'https://itsdebatable.com').hash,'');
assert.equal((await f.open()).inviteUrl,created.inviteUrl,'retries keep the same invitation');
await assert.rejects(f.call('outsider',{action:'open'}),{status:403});
for(const token of ['', 'a'.repeat(64),f.inv().token+'0'])await assert.rejects(f.call('outsider',{action:'join',invite:token}),{status:403});
await assert.rejects(f.call('host',{action:'join',invite:f.inv().token}),{status:409});
const token=f.inv().token;
const joins=await Promise.allSettled(['peer','racer'].map(uid=>f.call(uid,{action:'join',invite:token,proUid:'spoof',conUid:'spoof'})));
assert.equal(joins.filter(x=>x.status==='fulfilled').length,1,'only one simultaneous claimant gets a seat');
const peer=f.round().conUid;
assert.equal(peer,'peer');
assert.equal((await f.call(peer,{action:'join',invite:token})).mySide,'con','network retry is idempotent');
assert.equal((await f.call(peer,{action:'open'})).inviteUrl,undefined,'invitee cannot mint invitations');
assert.equal(f.inv().claimedBy,peer);
await assert.rejects(f.call('third',{action:'join',invite:token}),{status:409});
assert.deepEqual([f.round().proUid,f.round().conUid],['host','peer']);

f.round().isPrivate=false;f.round().speechIdx=3;f.round().motion='Saved agreed topic';
await f.open();await f.call(peer,{action:'join',invite:token});
assert.equal(f.round().isPrivate,false,'existing explicit publication survives host and peer rejoin');
assert.equal(f.round().speechIdx,3);assert.equal(f.round().motion,'Saved agreed topic');
await f.call(peer,{action:'join',invite:token},now+8*86400000);
f.round().proUid=peer;f.round().conUid='host';
assert.equal((await f.call(peer,{action:'join',invite:token})).mySide,'pro','rejoin follows an agreed side swap');

const expired=fixture();await expired.open();
const oldToken=expired.inv().token;
await assert.rejects(expired.call('peer',{action:'join',invite:oldToken},now+8*86400000),{status:409});
await expired.call('host',{action:'open'},now+8*86400000);
assert.notEqual(expired.inv().token,oldToken,'host can refresh an unclaimed expired link');
await assert.rejects(expired.call('peer',{action:'join',invite:oldToken},now+8*86400000),{status:403});

for(const bands of [['minor','adult'],['adult','minor'],['minor','unknown'],['minor','minor']]){
  const x=fixture();await x.open('con');
  x.rows.set('age_bands/host',{band:bands[0]});x.rows.set('age_bands/peer',{band:bands[1]});
  const join=x.call('peer',{action:'join',invite:x.inv().token});
  if(bands.every(b=>b==='minor')){
    assert.equal((await join).mySide,'pro');assert.equal(x.round().conUid,'host');
  }else{await assert.rejects(join,{status:403});assert.equal(x.round().proUid,undefined);}
}
const ended=fixture();await ended.open();ended.round().status='done';
await assert.rejects(ended.call('peer',{action:'join',invite:ended.inv().token}),{status:409});
const legacy=fixture();legacy.rows.set('live_rounds/'+legacy.room,{posterUid:'host',isPrivate:true,status:'round',motion:'Existing topic',speechIdx:2});
await legacy.open('con');
assert.equal(legacy.round().conUid,'host');assert.equal(legacy.round().speechIdx,2);
assert.equal((await legacy.call('peer',{action:'join',invite:legacy.inv().token})).mySide,'pro');
const full=fixture();full.rows.set('live_rounds/'+full.room,{posterUid:'host',proUid:'one',conUid:'two'});
await assert.rejects(full.open(),{status:403});
const named=fixture();await named.call('host',{action:'open',motion:'Public transport should be free',hostName:'Chosen room name',guestName:'Invited friend'});
assert.equal(named.round().proName,'Chosen room name');assert.equal(named.round().conName,'Invited friend');
await named.call('peer',{action:'join',invite:named.inv().token});
assert.notEqual(named.round().conName,'Invited friend','joining account supplies its own public identity');
await assert.rejects(privateInvite(f.db,'host',null),{status:400});
await assert.rejects(f.call('host',{action:'open',room:'../other'}),{status:400});

// Authenticate at the route before any datastore access or client-claimed UID.
let provider='google.com',verified=true,requests=0;
const deps={Request,Response,URL,Headers,console,corsResponse,errorResponse,jsonResponse,
  verifyIdToken:async()=>{if(!verified)throw new Error('bad token');return {sub:'verified-user',firebase:{sign_in_provider:provider}};},
  extractBearerToken:()=> 'token',getDb:()=>({}),checkLayers:async()=>({ok:true}),
  privateInvite:async(db,uid,body)=>{requests++;assert.equal(uid,'verified-user');return {room:body.room};}};
const handler=read('app/netlify/functions/private-invite.mjs').replace(/^import .*;\n/gm,'').replace('export default async request=>','var handler=async request=>').replace(/export const config=.*$/m,'');
vm.createContext(deps);vm.runInContext(handler,deps);
const request=()=>deps.handler(new Request('https://itsdebatable.com/api/private-invite',{method:'POST',body:JSON.stringify({room:f.room,uid:'spoof'})}));
for(provider of ['google.com','apple.com','password']){
  const response=await request();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
}
provider='anonymous';assert.equal((await request()).status,403);assert.equal(requests,3);
verified=false;assert.equal((await request()).status,401);assert.equal(requests,3);

// The fragment is captured and removed before any analytics or assets load.
const page=read('app/live-round.html');
const earlyScript=page.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const storage=new Map();
const location={href:'https://itsdebatable.com'+created.inviteUrl};
const capture={URL,URLSearchParams,location,window:{},sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)},
  history:{state:null,replaceState:(s,t,url)=>{location.href=new URL(url,location.href).href;}}};
vm.runInNewContext(earlyScript,capture);
assert.equal(capture.window.__dbPrivateInviteToken,token);
assert.equal(new URL(location.href).hash,'');
capture.window={};vm.runInNewContext(earlyScript,capture);
assert.equal(capture.window.__dbPrivateInviteToken,token,'reload keeps the invitation for sign-in');
assert.ok(page.indexOf('db-private-invite:')<page.indexOf('googletagmanager.com'));

const inviteSource=page.slice(page.indexOf('  function openPrivateRoundInvite(){'),page.indexOf('  function publishRoundInit(){'));
let finish;
const client={state:{user:{uid:'peer'},room:f.room},prefill:{invite:token},DBPrivateInvite:{request:()=>new Promise(resolve=>{finish=resolve;})}};
vm.createContext(client);vm.runInContext(inviteSource,client);
const pending=client.openPrivateRoundInvite();client.state.user={uid:'another'};
finish({proUid:'host',conUid:'peer',mySide:'con'});
await assert.rejects(pending,/account changed/);assert.equal(client.state.privateInviteReady,undefined);
const good=client.openPrivateRoundInvite();finish({proUid:'host',conUid:'another',mySide:'con'});await good;
assert.equal(client.state.privateInviteReady,'another');
assert.equal(client.state.conUid,'another');
const adoption=page.slice(page.indexOf('    if (d.proUid && d.conUid && ((!state.proUid'),page.indexOf('    // A committed side swap'));
const roster={state:{room:f.room,proUid:'host',user:{uid:'host'}},d:{proUid:'host',conUid:'peer'},prefill:{mySide:'pro'},isSpectator:()=>false};
vm.runInNewContext(adoption,roster);assert.equal(roster.state.conUid,'peer','host learns the newly verified peer');
roster.d={proUid:'peer',conUid:'host'};vm.runInNewContext(adoption,roster);
assert.equal(roster.state.proUid,'host','existing roster stays available to the side-swap reconciliation');

for(const path of ['app/live-round.html','app/private.html']){
  for(const match of read(path).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
    if(!/\bsrc=|application\/ld\+json|type="module"/.test(match[1]))new vm.Script(match[2],{filename:path});
  }
}
console.log('Private invite: authenticated creation, one-seat claims, concurrency, replay, expiry, age boundaries, legacy recovery, preserved round state and safe URL handling passed.');
