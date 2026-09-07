import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDesign, compileCSS, applicableChanges, pageKey } from '../app/js/design/model.mjs';
import { createDesignHandler } from '../app/netlify/functions/admin-design.mjs';
import { createPublicDesignHandler } from '../app/netlify/functions/site-design.mjs';
import { injectDesign, designPages } from './build-design.mjs';
import vm from 'node:vm';
import { mountDesign } from '../app/js/design/runtime.mjs';
let checks=0;
function ok(condition,message){assert.ok(condition,message);checks++;console.log('✓ '+message);}
const sample={version:1,name:'Globe spacing',changes:[{id:'globe',page:'/landing',selector:'.fs-globe',pseudo:'',tag:'div',label:'Globe',styles:{all:{width:'65%','margin-top':'24px'},phone:{width:'100%','margin-top':'8px'}},text:[]}]};
assert.deepEqual(validateDesign(sample),sample);checks++;
ok(pageKey('/')===pageKey('/landing.html?x=2'),'Homepage aliases resolve to the same design');
ok(compileCSS(sample.changes).includes('@media (max-width: 767px)'),'Phone overrides are bounded to the phone breakpoint');
ok(compileCSS(sample.changes).indexOf('width:65%')<compileCSS(sample.changes).indexOf('width:100%'),'Shared rules precede device overrides');
ok(compileCSS(sample.changes).includes('#__db_design_priority#__db_design_priority'),'Intentional overrides outrank existing important selectors');
const scoped={...sample,changes:[...sample.changes,{...sample.changes[0],id:'global',page:'*',selector:'.ui-topbar'}]};
ok(applicableChanges(scoped,'/watch').length===1,'Page-only edits never leak onto another page');
ok(applicableChanges(scoped,'/').map(c=>c.id).join(',')==='global,globe','Site-wide rules apply before page overrides');
for(const value of ['url(https://example.com/x)','red; display:none','expression(alert(1))','</style><script>alert(1)</script>','red !important','url\\28 /x\\29']){
  assert.throws(()=>validateDesign({...sample,changes:[{...sample.changes[0],styles:{all:{color:value}}}]}));checks++;
}
assert.throws(()=>validateDesign({...sample,changes:[{...sample.changes[0],selector:'body{}@import url(x)'}]}));checks++;
assert.throws(()=>validateDesign({...sample,changes:[{...sample.changes[0],styles:{watch:{width:'10px'}}}]}));checks++;
assert.throws(()=>validateDesign({...sample,changes:[sample.changes[0],sample.changes[0]]}));checks++;
assert.throws(()=>validateDesign({...sample,changes:[{...sample.changes[0],text:[{index:-1,before:'Hello',after:'Other'}]}]}));checks++;
const store=new Map();
function ref(path){return {path,id:path.split('/').at(-1),collection(name){return collection(path+'/'+name);},async get(){return snap(path);}};}
function snap(path){return {exists:store.has(path),data:()=>structuredClone(store.get(path)),id:path.split('/').at(-1)};}
function collection(path){return {doc:id=>ref(path+'/'+id),orderBy(){return this;},limit(){return this;},async get(){return {docs:[...store.keys()].filter(k=>k.startsWith(path+'/')).map(snap)};}};}
const db={collection,async runTransaction(fn){const writes=[];const result=await fn({get:r=>r.get(),set:(r,data)=>writes.push([r.path,structuredClone(data)])});writes.forEach(([k,v])=>store.set(k,v));return result;}};
const unauthorized=createDesignHandler(async()=>({error:new Response('Forbidden',{status:403})}));
for(const action of [undefined,'save','history','restore','publish']){const r=await unauthorized(new Request('https://itsdebatable.com/api/admin/design',{method:action?'POST':'GET',body:action?JSON.stringify({action}):undefined}));ok(r.status===403,'Unauthorized '+(action||'read')+' is rejected');}
const owner=createDesignHandler(async()=>({uid:'owner',db}));
const second=createDesignHandler(async()=>({uid:'second-admin',db}));
async function call(handler,body){return handler(new Request('https://itsdebatable.com/api/admin/design',{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));}
let response=await call(owner);let data=await response.json();
ok(data.draft.revision===0&&data.draft.design.changes.length===0,'New admin starts with an empty private draft');
response=await call(owner,{action:'save',revision:0,design:sample});data=await response.json();
ok(response.status===200&&data.revision===1,'Draft save advances its revision');
ok(response.headers.get('cache-control')==='private, no-store','Private draft responses cannot be cached');
ok(store.has('design_drafts/owner')&&!store.has('site_design/current'),'Saving never writes a public design');
const publicHandler=createPublicDesignHandler(()=>db);
response=await publicHandler(new Request('https://itsdebatable.com/api/site-design?page=/landing'));data=await response.json();
ok(data.changes.length===0&&!JSON.stringify(data).includes('Globe'),'Public endpoint cannot read private draft content');
data=await(await call(second)).json();ok(data.draft.design.changes.length===0,'Another admin cannot read the owner’s private draft');
response=await call(owner,{action:'save',revision:0,design:{...sample,name:'Stale write'}});
ok(response.status===409&&store.get('design_drafts/owner').design.name==='Globe spacing','Stale device writes are rejected without losing saved work');
response=await call(owner,{action:'publish',revision:1,publishedRevision:0,design:sample});data=await response.json();
ok(response.status===200&&data.publishedRevision===1,'Only explicit publish writes the public snapshot');
response=await publicHandler(new Request('https://itsdebatable.com/api/site-design?page=/landing'));data=await response.json();
ok(data.changes.length===1&&!('publishedBy'in data)&&!('name'in data),'Public response contains only applicable design changes');
data=await(await publicHandler(new Request('https://itsdebatable.com/api/site-design?page=/watch'))).json();ok(data.changes.length===0,'Public endpoint scopes published changes by page');
response=await call(owner,{action:'save',revision:2,design:{...sample,name:'Unpublished revision',changes:[]}});data=await response.json();
ok(store.get('site_design/current').design.name==='Globe spacing','Later private changes cannot replace the published snapshot');
response=await call(owner,{action:'publish',revision:3,publishedRevision:0,design:sample});ok(response.status===409,'Publishing rejects a changed public revision');
response=await call(owner,{action:'history'});data=await response.json();ok(data.history.length>0,'Published checkpoints retain a restorable version');
data=await(await call(owner,{action:'restore',id:data.history[0].id})).json();ok(data.design&&store.get('site_design/current').design.name==='Globe spacing','Reading a previous version does not publish or modify the live site');
const markup='<html><head><title>Test</title></head><body>Page</body></html>';
const injected=injectDesign(markup,'/watch.html');
ok(injected.indexOf('design-loader.js')<injected.indexOf('<title>'),'Preview safeguards load before page scripts');
ok(injectDesign(injected,'/watch.html')===injected,'Build injection is idempotent');
ok(designPages().some(p=>p.path==='/landing.html')&&designPages().length>80,'Page browser is generated from real Debatable pages');
// Execute the early preview guard with instrumented network primitives.
let reads=0,writes=0;
class XHR{open(method){/^(GET|HEAD|OPTIONS)$/.test(method)?reads++:writes++;}}
const listeners={};const context={URLSearchParams,Response,Promise,Error,XMLHttpRequest:XHR,document:{currentScript:{getAttribute:()=>'/landing.html'},addEventListener:(name,fn)=>listeners[name]=fn},location:{search:'?__design=1',pathname:'/landing.html'},navigator:{sendBeacon:()=>writes++,mediaDevices:{getUserMedia:()=>writes++,getDisplayMedia:()=>writes++},serviceWorker:{register:()=>writes++}},parent:{__DB_DESIGN_HOST:true},fetch:()=>{reads++;return Promise.resolve(new Response('{}'));}};
context.window=context;vm.runInNewContext(readFileSync(new URL('../app/js/design-loader.js',import.meta.url),'utf8'),context);
ok(context.__DB_DESIGN_PREVIEW===true,'Editor preview is identified before the page initializes');
ok((await context.fetch('/api/spar-pair',{method:'POST'})).status===403,'Preview blocks fetch writes before page actions can run');
assert.throws(()=>new context.XMLHttpRequest().open('POST','/write'));checks++;
assert.throws(()=>new context.WebSocket('wss://example.com'));checks++;
await assert.rejects(context.navigator.mediaDevices.getUserMedia());checks++;
context.navigator.sendBeacon('/api/log-event','x');
await context.fetch('/api/watch-live');
ok(reads===1&&writes===0,'Preview allows read requests while blocking writes, media, sockets and analytics');
let prevented=false;listeners.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){}});ok(prevented,'Preview blocks form submissions');

// Exercise the actual text runtime against mixed-content elements and React-like replacement.
const textA={nodeType:3,nodeValue:'Start ',isConnected:true};
const nested={nodeType:1,localName:'strong',nodeValue:null,isConnected:true};
const textB={nodeType:3,nodeValue:' now',isConnected:true};
let matched={localName:'button',childNodes:[textA,nested,textB]};
let observerCallback;const installedStyles=[];
class Observer{constructor(cb){observerCallback=cb;}disconnect(){}observe(){}}
const doc={head:{appendChild:s=>installedStyles.push(s)},documentElement:{},createElement:()=>({dataset:{},textContent:'',remove(){}}),querySelectorAll:()=>[matched],defaultView:{MutationObserver:Observer,requestAnimationFrame:cb=>cb(),Event:class{},dispatchEvent(){}}};
const textDesign={version:1,changes:[{id:'text',page:'/landing',tag:'button',selector:'#start',styles:{},text:[{index:0,before:'Start ',after:'Join '},{index:2,before:' now',after:' today'}]}]};
const mounted=mountDesign(doc,textDesign,'/landing');
ok(textA.nodeValue==='Join '&&textB.nodeValue===' today'&&matched.childNodes[1]===nested,'Text editing preserves inline children and their identity');
mounted.update({version:1,changes:[]});ok(textA.nodeValue==='Start '&&textB.nodeValue===' now','Undo restores edited text without rebuilding the element');
mounted.update(textDesign);textA.nodeValue='New live state';observerCallback();ok(textA.nodeValue==='New live state','A newer application state is never replaced with stale design text');
const fresh={nodeType:3,nodeValue:'Start ',isConnected:true};matched={localName:'button',childNodes:[fresh]};observerCallback();ok(fresh.nodeValue==='Join ','Saved text changes reapply when React replaces an element');
mounted.destroy();ok(fresh.nodeValue==='Start ','Destroying a preview restores its original text');
const badScreen={...sample,changes:[{...sample.changes[0],styles:{constructor:{width:'10px'}}}]};assert.throws(()=>validateDesign(badScreen));checks++;
const richText={...sample,changes:[{...sample.changes[0],text:Array.from({length:55},(_,i)=>({index:i,before:'a',after:'界'.repeat(5000)}))}]};assert.throws(()=>validateDesign(richText));checks++;
console.log(`\n${checks} design checks passed.`);
