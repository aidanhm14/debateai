import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window:{} };
vm.runInNewContext(fs.readFileSync(new URL('../app/js/chat-challenge.js', import.meta.url), 'utf8'), context);
const people = context.window.DBChatChallenge.people;
const group = { participants:['me', 'jonas', 'sam'], participantInfo:{jonas:{name:'Jonas'},sam:{name:'Sam'}} };
const recent = [{data:{participants:['me','jonas'],participantInfo:{jonas:{name:'Older name'}}}},
  {data:{participants:['me','alex'],participantInfo:{alex:{name:'Alex'}}}}];
const found = JSON.parse(JSON.stringify(people('me', group, recent)));
assert.deepEqual(found.map(p => p.uid), ['jonas','sam','alex'], 'Current participants come first, without self or duplicates');
assert.equal(found[0].name, 'Jonas', 'Current conversation identity outranks an older thread');
assert.deepEqual(JSON.parse(JSON.stringify(people('me',null,[]))), []);
assert.equal(people('me',{participants:['me','__proto__'],participantInfo:{}},[])[0].uid, '__proto__', 'UIDs cannot collide with object prototype keys');
console.log('chat challenge: recipient selection passed');

const slug = context.window.DBChatChallenge.challengeSlug;
assert.equal(slug('View and accept: https://itsdebatable.com/c/veganism-xx4hae'),'veganism-xx4hae');
assert.equal(slug('https://itsdebatable.com.evil.test/c/fake'),'');
assert.equal(slug('https://other.test/c/fake'),'');

const actions = [], timers = new Set();
const challenge = {id:'one',slug:'one',mode:'live',status:'open',claim:'Public transit should be free.',
  creator:{uid:'jonas',name:'Jonas'},challengedUid:'me',sides:{a:'For',b:'Against'},accepted:[{uid:'jonas',side:'b'}]};
let failJoin = true;
const host = {
  hidden:true, nodes:{}, markup:'',
  set innerHTML(html){this.markup=html;this.nodes={};for(const attr of ['data-enter','data-cancel']) if(html.includes(attr))this.nodes['['+attr+']']={};},
  get innerHTML(){return this.markup;},
  querySelector(sel){return this.nodes[sel] || null;}
};
const ui = {
  window:{location:{href:''},daAskAgeBand:cb=>cb('adult'),daRecordAgeBand:(b,cb)=>cb(b)},
  document:{hidden:false,addEventListener(){},removeEventListener(){}},
  setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn),
  fetch:async (_url,opts)=>{
    if(opts?.method==='POST'){
      const action=JSON.parse(opts.body).action;actions.push(action);
      if(action==='accept'){challenge.status='accepted';challenge.accepted.push({uid:'me',side:'a'});}
      if(action==='join' && failJoin){failJoin=false;return {ok:false,json:async()=>({error:'Connection interrupted. Try again.'})};}
      return {ok:true,json:async()=>({url:'/live-round?room=shared'})};
    }
    return {ok:true,json:async()=>({challenge:structuredClone(challenge)})};
  }
};
vm.runInNewContext(fs.readFileSync(new URL('../app/js/chat-challenge.js',import.meta.url),'utf8'),ui);
const card = ui.window.DBChatChallenge.mount({host,user:{uid:'me',getIdToken:async()=>'test'},peerUid:'jonas'});
card.update([{fromUid:'jonas',text:'https://itsdebatable.com/c/one'}]);
await new Promise(resolve=>setImmediate(resolve));
assert.match(host.innerHTML,/Accept and join/);
assert.match(host.innerHTML,/Your side: For/);
await host.querySelector('[data-enter]').onclick();
assert.deepEqual(actions,['accept','join']);
assert.match(host.innerHTML,/Connection interrupted/);
assert.match(host.innerHTML,/Join debate/,'a successful accept followed by a failed join remains accepted');
await host.querySelector('[data-enter]').onclick();
assert.deepEqual(actions,['accept','join','join'],'retry does not accept twice');
assert.equal(ui.window.location.href,'/live-round?room=shared');
card.close();assert.equal(timers.size,0);assert.equal(host.hidden,true);
const forwarded = ui.window.DBChatChallenge.mount({host,user:{uid:'me'},peerUid:'jonas'});
forwarded.update([{fromUid:'me',text:'https://itsdebatable.com/c/one'}]);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(host.hidden,true,'a copied link cannot impersonate its creator');
forwarded.close();
console.log('chat challenge: legacy links, spoofed links, acceptance, failed join retry and listener cleanup passed');
