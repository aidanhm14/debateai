import { SCREENS, pageKey, validateDesign, applicableChanges, compileCSS, changeCount } from './model.mjs';
import { mountDesign } from './runtime.mjs';
import { elementLabel, selectorFor, attachSelection } from './selection.mjs';
window.__DB_DESIGN_HOST = true;
const $=id=>document.getElementById(id);
const clone=x=>JSON.parse(JSON.stringify(x));
const state={design:{version:1,name:'My site design',changes:[]},revision:0,publishedRevision:0,page:'/landing.html',device:'desktop',width:1440,height:900,scale:1,scope:'all',selected:null,pseudo:'',selector:'',global:false,preview:false,nav:'pages',pages:[],undo:[],redo:[],dirty:false,saving:false,blocked:false,user:null,local:false,ready:false};
let runtime,selection,frameDoc,saveTimer,rectObserver,layerTimer,toastTimer,gesture,bootstrapId=0;
const status=t=>{$('save-status').textContent=t;};
function toast(t){$('toast').textContent=t;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4800);}
function escapeHTML(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fileDownload(name,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);}
function backup(){fileDownload(`debatable-design-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(state.design,null,2));}
function recoveryKey(){return 'db-design-recovery:'+(state.local?'local':state.user?.uid||'none');}
function keepRecovery(){try{localStorage.setItem(recoveryKey(),JSON.stringify({design:state.design,revision:state.revision,at:Date.now()}));}catch{status('Export a backup; device storage is full');}}
async function api(body){
  const headers={};if(state.user)headers.Authorization='Bearer '+await state.user.getIdToken();if(body)headers['Content-Type']='application/json';
  const res=await fetch('/api/admin/design',{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await res.json();if(!res.ok){const error=new Error(data.error||'The design service could not be reached.');error.status=res.status;error.conflict=data.conflict;throw error;}return data;
}
function markDirty(){state.dirty=true;keepRecovery();status('Saving private draft…');clearTimeout(saveTimer);if(!state.blocked)saveTimer=setTimeout(()=>save(),1400);renderCount();}
function checkpoint(){state.undo.push(clone(state.design));if(state.undo.length>60)state.undo.shift();state.redo=[];}
function mutate(fn){checkpoint();fn();apply();markDirty();renderInspectorValues();}
function apply(){runtime?.update(state.design,state.page);rect();renderCount();renderPages();}
function renderCount(){$('count').textContent=changeCount(state.design);$('undo').disabled=!state.undo.length;$('redo').disabled=!state.redo.length;$('review').disabled=!state.ready;}
async function save(checkpoint=false){
  if(!state.ready||state.blocked)return false;
  if(state.saving){state.saveAgain=true;return false;}
  if(!state.dirty&&!checkpoint)return true;
  state.saving=true;clearTimeout(saveTimer);status('Saving private draft…');
  const sent=clone(state.design);state.saveAgain=false;
  try{
    const data=await api({action:'save',design:sent,revision:state.revision,checkpoint});state.revision=data.revision;
    state.dirty=JSON.stringify(state.design)!==JSON.stringify(sent);
    if(!state.dirty){try{localStorage.removeItem(recoveryKey());}catch{}status(state.local?'Saved on this Mac':'Saved privately');}else keepRecovery();
    return true;
  }catch(e){if(e.conflict){state.blocked=true;status('Another device has a newer draft');}else status('Not synced. Tap Save to retry');toast(e.message);return false;}
  finally{state.saving=false;if((state.dirty||state.saveAgain)&&!state.blocked)saveTimer=setTimeout(()=>save(),5000);}
}
async function bootstrap(user,local=false){
  const id=++bootstrapId;state.user=user;state.local=local;
  try{
    const data=await api();if(id!==bootstrapId)return;
    state.design=validateDesign(data.draft.design);state.revision=data.draft.revision;state.publishedRevision=data.publishedRevision;
    state.local=!!data.local;state.blocked=false;state.ready=true;state.undo=[];state.redo=[];state.dirty=false;
    $('draft-name').value=state.design.name;$('gate').hidden=true;$('workspace').hidden=false;status(state.local?'Saved on this Mac':'Saved privately');
    state.pages=await fetch('/js/design/pages.json').then(r=>r.json());
    renderPages();if(matchMedia('(pointer: coarse)').matches)setDevice('tablet');loadPage('/landing.html');renderCount();
    try{const recovery=JSON.parse(localStorage.getItem(recoveryKey())||'null');if(recovery&&JSON.stringify(recovery.design)!==JSON.stringify(state.design)){
      if(confirm('This device has edits that were not saved. Restore them to your private draft?')){checkpoint();state.design=validateDesign(recovery.design);$('draft-name').value=state.design.name;apply();markDirty();}
    }}catch(e){toast('A local backup could not be read. Your saved draft is intact.');}
  }catch(e){if(id!==bootstrapId)return;$('gate-message').textContent=e.status===401?'Sign in with your Debatable admin account.':e.message;$('gate').hidden=false;$('workspace').hidden=true;}
}
function disableWorkspace(){++bootstrapId;state.ready=false;state.user=null;clearTimeout(saveTimer);runtime?.destroy();selection?.destroy();rectObserver?.disconnect();$('page-frame').src='about:blank';state.design={version:1,name:'My site design',changes:[]};state.undo=[];state.redo=[];$('workspace').hidden=true;$('gate').hidden=false;$('gate-message').textContent='Sign in with your Debatable admin account.';}
async function authInit(){
  if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)){await bootstrap(null,true);return;}
  function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
  try{
    await script('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');await script('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js');
    if(!firebase.apps.length)firebase.initializeApp({apiKey:['AIzaSyDDx','TYlyWLOJnFP99','e7XsLPb3FwIEijNNM'].join(''),authDomain:'debateos-78ac5.firebaseapp.com',projectId:'debateos-78ac5',appId:'1:860359449192:web:f5dc0060dbd50d6c4fb9dd'});
    firebase.auth().onAuthStateChanged(u=>u&&!u.isAnonymous?bootstrap(u):disableWorkspace());
    $('sign-in').onclick=async()=>{try{await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());}catch(e){$('gate-message').textContent=e.message;}};
  }catch{$('gate-message').textContent='Sign-in could not load. Check your connection and reload.';}
}
function renderPages(){
  const filter=$('search').value.toLowerCase();$('page-list').replaceChildren();
  for(const group of ['Main pages','More pages','Policies']){
    const pages=state.pages.filter(p=>p.group===group&&(p.title+' '+p.path).toLowerCase().includes(filter));if(!pages.length)continue;
    const h=document.createElement('h3');h.textContent=group;$('page-list').append(h);
    for(const p of pages){const button=document.createElement('button');button.className='page-row'+(pageKey(p.path)===pageKey(state.page)?' active':'');button.innerHTML=`<span class="page-symbol">▤</span><span>${escapeHTML(p.title)}</span>${state.design.changes.some(c=>c.page===pageKey(p.path))?'<span class="edit-dot"></span>':''}`;button.onclick=()=>{loadPage(p.path);document.body.classList.remove('show-pages');};$('page-list').append(button);}
  }
}
function loadPage(raw){
  let url;try{url=new URL(raw,location.origin);}catch{toast('Choose a page on Debatable.');return;}
  if(url.origin!==location.origin||!/^\/[a-zA-Z0-9_/-]*(\.html)?$/.test(url.pathname)||/^\/(api|\.netlify|netlify|design|admin|studio|air|stage)(\/|\.|$)/.test(url.pathname)){toast('Choose a Debatable page from the page list.');return;}
  if(url.pathname==='/')url.pathname='/landing.html';
  if(url.pathname==='/live-round.html'||url.pathname==='/live-round')url.searchParams.set('design',url.searchParams.get('design')||'ready');
  state.page=url.pathname;$('scene').hidden=pageKey(state.page)!=='/live-round';state.selected=null;state.pseudo='';state.selector='';selection?.destroy();runtime?.destroy();rectObserver?.disconnect();frameDoc=null;
  url.searchParams.set('__design','1');url.searchParams.set('_v',Date.now());
  $('page-frame').src=url.pathname+url.search;$('page-name').textContent=state.pages.find(p=>pageKey(p.path)===pageKey(state.page))?.title||state.page;
  $('canvas-message').textContent='Loading your page…';$('canvas-message').hidden=false;$('selection').hidden=true;renderPages();renderInspector();fitCanvas();
}
$('page-frame').addEventListener('load',()=>{
  if(!state.ready)return;
  try{
    frameDoc=$('page-frame').contentDocument;
    if(!frameDoc?.body||!frameDoc.defaultView.__DB_DESIGN_PREVIEW){$('canvas-message').textContent='This page is not ready for safe editing. Reload the editor after the latest site update.';return;}
    const source=frameDoc.querySelector('script[data-db-design-loader]')?.getAttribute('data-page');if(source){state.page=source;$('page-name').textContent=state.pages.find(p=>pageKey(p.path)===pageKey(source))?.title||source;renderPages();}
    runtime=mountDesign(frameDoc,state.design,state.page);
    selection=attachSelection(frameDoc,{select:selectElement,rect,text:focusText,navigate:loadPage,key:handleKey});selection.mode(!state.preview);
    rectObserver=new frameDoc.defaultView.ResizeObserver(rect);rectObserver.observe(frameDoc.body);
    $('canvas-message').hidden=true;refreshLayers();
    clearInterval(layerTimer);layerTimer=setInterval(()=>{if(!document.hidden){rect();if(state.nav==='layers')refreshLayers();}},1600);
  }catch(e){$('canvas-message').textContent='The page could not be opened. Choose another page or reload.';}
});
function fitCanvas(){
  const available=Math.max(240,$('stage').clientWidth-56);state.scale=$('zoom').value==='fit'?Math.min(1,available/state.width):Number($('zoom').value);
  state.height=state.device==='phone'?844:state.device==='tablet'?1112:900;
  const wrap=$('frame-wrap');wrap.style.width=state.width+'px';wrap.style.height=state.height+'px';wrap.style.transform=`scale(${state.scale})`;
  $('frame-space').style.width=state.width*state.scale+'px';$('frame-space').style.height=state.height*state.scale+'px';
  document.querySelector('.page-caption').style.width=state.width*state.scale+'px';$('canvas-size').textContent=`${state.width} × ${state.height}`;rect();
}
new ResizeObserver(fitCanvas).observe($('stage'));
function setDevice(device){state.device=device;state.width={desktop:1440,tablet:834,phone:390}[device];$('viewport-width').value=state.width;
  document.querySelectorAll('[data-device]').forEach(b=>b.classList.toggle('active',b.dataset.device===device));if(state.scope!=='all'){state.scope=device;$('screen-scope').value=device;}fitCanvas();renderInspectorValues();}
function rect(){
  const el=state.selected;const box=$('selection');
  if(!el?.isConnected||state.preview){box.hidden=true;return;}
  const r=el.getBoundingClientRect();if(!r.width&&!r.height){box.hidden=true;return;}
  box.querySelectorAll('button').forEach(b=>{b.disabled=!!state.pseudo;b.title=state.pseudo?'Use the dimension controls for this generated shape.':b.title;});box.hidden=false;box.style.left=r.left+'px';box.style.top=r.top+'px';box.style.width=r.width+'px';box.style.height=r.height+'px';
  const handleSize=Math.max(1,1/state.scale);box.style.borderWidth=(2*handleSize)+'px';
  box.querySelector('.selection-label').style.transform=`scale(${handleSize})`;box.querySelector('.selection-label').style.transformOrigin='bottom left';
  box.querySelectorAll('[data-handle]').forEach(b=>{b.style.scale=handleSize;});
}
function selectElement(el,pseudo=''){
  if(!el||el===frameDoc.documentElement||['script','style','link','meta','head'].includes(el.localName))return;
  state.selected=el;state.pseudo=pseudo;state.selector=selectorFor(el,frameDoc);
  const found=state.design.changes.find(c=>c.selector===state.selector&&c.pseudo===pseudo&&(c.page==='*'||c.page===pageKey(state.page)));state.global=found?.page==='*';
  $('selection-label').textContent=elementLabel(el)+(pseudo?' '+pseudo:'');rect();renderInspector();renderBreadcrumbs();
  if(innerWidth<781)document.body.classList.add('show-inspector');
}
function renderBreadcrumbs(){
  $('breadcrumbs').replaceChildren();let el=state.selected;const nodes=[];while(el&&el!==frameDoc?.documentElement){nodes.unshift(el);el=el.parentElement;}
  for(const node of nodes.slice(-4)){const b=document.createElement('button');b.textContent=elementLabel(node);b.onclick=()=>selectElement(node);$('breadcrumbs').append(b);}
}
function refreshLayers(){
  if(!frameDoc?.body)return;const filter=state.nav==='layers'?$('search').value.toLowerCase():'';
  const fragment=document.createDocumentFragment();let count=0;
  function visit(el,depth){
    if(count>=650||['SCRIPT','STYLE','LINK','META','NOSCRIPT','BR'].includes(el.tagName)||el.closest('[data-design-chrome]'))return;
    const label=elementLabel(el),visible=el.getClientRects().length>0;
    if(!filter||(label+' '+el.localName+' '+el.id).toLowerCase().includes(filter)){
      const b=document.createElement('button');b.className='layer-row'+(el===state.selected?' active':'');b.style.paddingLeft=Math.min(depth,6)*9+8+'px';if(!visible)b.style.opacity='.48';b.innerHTML=`<code>${escapeHTML(el.localName)}</code><span>${escapeHTML(label)}</span>`;b.onclick=()=>{selectElement(el);el.scrollIntoView({block:'center',behavior:'instant'});rect();};fragment.append(b);count++;
    }
    for(const child of el.children)visit(child,depth+1);
  }
  visit(frameDoc.body,0);$('layer-list').replaceChildren(fragment);
}
function currentChange(create=false){
  const page=state.global?'*':pageKey(state.page);
  let c=state.design.changes.find(c=>c.page===page&&c.selector===state.selector&&c.pseudo===state.pseudo);
  if(!c&&create){c={id:'d_'+crypto.randomUUID().replaceAll('-',''),page,selector:state.selector,pseudo:state.pseudo,label:elementLabel(state.selected),tag:state.selected.localName,styles:{},text:[]};state.design.changes.push(c);}return c;
}
function setStyles(styles){
  const c=currentChange(true);c.styles[state.scope]||={};
  for(const [k,v] of Object.entries(styles)){if(v==='')delete c.styles[state.scope][k];else c.styles[state.scope][k]=String(v);}
  state.design=validateDesign(state.design);
}
const field=(prop,label,options={})=>({prop,label,...options});
const sections=[
  ['Size & position',[
    field('width','Width',{placeholder:'auto'}),field('height','Height',{placeholder:'auto'}),field('max-width','Maximum width',{placeholder:'none'}),field('min-height','Minimum height',{placeholder:'0'}),
    field('translate-x','Move X',{virtual:true}),field('translate-y','Move Y',{virtual:true}),field('rotate','Rotation',{placeholder:'0deg'}),field('scale','Scale',{placeholder:'1'}),
    field('position','Position',{options:['','static','relative','absolute','fixed','sticky']}),field('z-index','Layer order',{placeholder:'auto'}),field('top','Top',{placeholder:'auto'}),field('left','Left',{placeholder:'auto'}),field('right','Right',{placeholder:'auto'}),field('bottom','Bottom',{placeholder:'auto'})
  ]],
  ['Spacing',[
    field('padding-top','Padding top'),field('padding-right','Padding right'),field('padding-bottom','Padding bottom'),field('padding-left','Padding left'),field('margin-top','Margin top'),field('margin-right','Margin right'),field('margin-bottom','Margin bottom'),field('margin-left','Margin left'),field('gap','Gap'),field('row-gap','Row gap')
  ]],
  ['Typography',[
    field('font-family','Font',{wide:true,options:['','inherit','Inter, sans-serif','Archivo, sans-serif','Georgia, serif','system-ui, sans-serif','ui-monospace, monospace']}),field('font-size','Size'),field('font-weight','Weight',{options:['','300','400','500','600','700','800','900']}),field('line-height','Line height'),field('letter-spacing','Letter spacing'),field('text-align','Alignment',{options:['','left','center','right','justify']}),field('text-transform','Case',{options:['','none','uppercase','lowercase','capitalize']}),field('font-style','Style',{options:['','normal','italic']}),field('text-decoration','Decoration',{options:['','none','underline','line-through']}),field('color','Text color',{color:true,wide:true})
  ]],
  ['Appearance',[
    field('background-color','Background',{color:true,wide:true}),field('background','Fill / gradient',{wide:true,placeholder:'linear-gradient(135deg, #ef4444, #fb923c)'}),field('border-radius','Corner radius'),field('opacity','Opacity',{placeholder:'1'}),field('border-width','Border width'),field('border-style','Border style',{options:['','none','solid','dashed','dotted','double']}),field('border-color','Border color',{color:true,wide:true}),field('box-shadow','Shadow',{wide:true,placeholder:'0 8px 24px rgba(0,0,0,.15)'}),field('clip-path','Shape mask',{wide:true,placeholder:'circle(50%)'}),field('filter','Visual filter',{wide:true,placeholder:'blur(2px)'}),field('object-fit','Image fit',{options:['','fill','contain','cover','none','scale-down']}),field('object-position','Image position',{placeholder:'center'})
  ]],
  ['Layout',[
    field('display','Layout',{options:['','block','flex','grid','inline','inline-block','inline-flex','contents','none']}),field('overflow','Overflow',{options:['','visible','hidden','auto','scroll','clip']}),field('flex-direction','Direction',{options:['','row','column','row-reverse','column-reverse']}),field('flex-wrap','Wrap',{options:['','nowrap','wrap','wrap-reverse']}),field('justify-content','Distribute',{options:['','flex-start','center','flex-end','space-between','space-around','space-evenly']}),field('align-items','Align children',{options:['','stretch','flex-start','center','flex-end','baseline']}),field('align-self','Self alignment',{options:['','auto','stretch','flex-start','center','flex-end']}),field('order','Item order'),field('flex-grow','Grow'),field('flex-shrink','Shrink'),field('grid-template-columns','Grid columns',{wide:true,placeholder:'repeat(2, minmax(0, 1fr))'}),field('grid-column','Column span'),field('grid-row','Row span'),field('aspect-ratio','Aspect ratio',{placeholder:'auto'}),field('white-space','Text wrapping',{options:['','normal','nowrap','pre-wrap','pre-line']})
  ]],
  ['Vector shape',[
    field('fill','Fill',{color:true,wide:true}),field('stroke','Stroke',{color:true,wide:true}),field('stroke-width','Stroke width'),field('r','Circle radius'),field('rx','Horizontal radius'),field('ry','Vertical radius'),field('transform-origin','Transform origin',{placeholder:'center'}),field('transform-box','Transform box',{options:['','fill-box','view-box','border-box']})
  ]]
];
function renderInspector(){
  const el=state.selected;$('empty-inspector').hidden=!!el;$('properties').hidden=!el;$('element-title').textContent=el?elementLabel(el)+(state.pseudo?' '+state.pseudo:''):'Make it yours.';
  $('selection').hidden=!el||state.preview;if(!el)return;
  $('global-scope').checked=state.global;$('screen-scope').value=state.scope;$('selector').value=state.selector;
  const holder=$('property-sections');holder.replaceChildren();
  const textNodes=[...el.childNodes].map((node,index)=>({node,index})).filter(x=>x.node.nodeType===3&&x.node.nodeValue.trim());
  if(textNodes.length&&!state.pseudo){
    const d=document.createElement('details');d.className='property-section';d.open=true;d.innerHTML='<summary>Text</summary><div class="fields"></div><p class="help">Text changes apply to every screen size. Inline links and formatting stay intact.</p>';
    for(const {node,index} of textNodes){const label=document.createElement('label');label.className='wide';label.textContent=textNodes.length>1?'Text segment '+(index+1):'Content';const ta=document.createElement('textarea');ta.value=node.nodeValue;ta.dataset.textIndex=index;ta.addEventListener('focus',()=>{ta._checkpoint=false;});ta.addEventListener('input',()=>{
      if(!ta._checkpoint){checkpoint();ta._checkpoint=true;}const c=currentChange(true);const old=c.text.find(x=>x.index===index);const before=old?.before??node.nodeValue;c.text=c.text.filter(x=>x.index!==index);if(ta.value!==before)c.text.push({index,before,after:ta.value});apply();markDirty();
    });label.append(ta);d.querySelector('.fields').append(label);}holder.append(d);
  }
  if(el.localName==='canvas'){const p=document.createElement('p');p.className='help';p.style.padding='0 18px';p.textContent='Resize or style the whole canvas. Objects drawn inside it remain controlled by the page.';holder.append(p);}
  const pseudoOptions=['::before','::after'].filter(p=>frameDoc.defaultView.getComputedStyle(el,p).content!=='none');
  if(pseudoOptions.length){const d=document.createElement('div');d.className='property-section';d.style.paddingTop='10px';for(const p of ['',...pseudoOptions]){const b=document.createElement('button');b.textContent=p||'Element';b.style.cssText='min-height:32px;padding:0 8px;font-size:12px;margin:3px';b.onclick=()=>selectElement(el,p);d.append(b);}holder.append(d);}
  for(const [name,fields] of sections){
    if(name==='Vector shape'&&el.namespaceURI!=='http://www.w3.org/2000/svg')continue;
    const d=document.createElement('details');d.className='property-section';d.open=['Size & position','Spacing'].includes(name);const summary=document.createElement('summary');summary.textContent=name;d.append(summary);
    if(name==='Size & position'){const label=document.createElement('label');label.className='check';label.innerHTML='<input id=lock-ratio type=checkbox> Keep proportions when resizing';label.querySelector('input').checked=['canvas','img','svg','video'].includes(el.localName);d.append(label);const nudge=document.createElement('div');nudge.className='nudge-pad';nudge.innerHTML='<span>Move</span><select aria-label="Nudge distance"><option value=1>1 px</option><option value=8>8 px</option><option value=16>16 px</option></select>';for(const [key,symbol] of [['ArrowLeft','←'],['ArrowUp','↑'],['ArrowDown','↓'],['ArrowRight','→']]){const b=document.createElement('button');b.textContent=symbol;b.setAttribute('aria-label','Move '+key.slice(5).toLowerCase());b.onclick=()=>{handleKey({key,nudgeAmount:Number(nudge.querySelector('select').value),target:b,preventDefault(){}});};nudge.append(b);}d.append(nudge);}
    const grid=document.createElement('div');grid.className='fields';
    for(const f of fields){const label=document.createElement('label');if(f.wide)label.className='wide';label.textContent=f.label;
      let input;if(f.options){input=document.createElement('select');for(const v of f.options){const o=document.createElement('option');o.value=v;o.textContent=v||'Original';input.append(o);}}
      else{input=document.createElement('input');input.type='text';input.placeholder=f.placeholder||'0';input.spellcheck=false;input.autocomplete='off';}
      input.dataset.property=f.prop;input.addEventListener('change',()=>commitField(f.prop,input.value));label.append(input);
      if(f.color){const color=document.createElement('input');color.type='color';color.title=f.label+' picker';color.setAttribute('aria-label',f.label+' picker');color.dataset.colorFor=f.prop;color.addEventListener('change',()=>commitField(f.prop,color.value));label.append(color);}
      grid.append(label);
    }
    d.append(grid);holder.append(d);
  }
  renderInspectorValues();
}
function renderInspectorValues(){
  if(!state.selected||!frameDoc)return;
  const computed=frameDoc.defaultView.getComputedStyle(state.selected,state.pseudo||null);const changes=currentChange();const overridden=changes?.styles[state.scope]||{};
  $('property-sections').querySelectorAll('[data-property]').forEach(input=>{
    if(document.activeElement===input)return;const prop=input.dataset.property;
    const translate=(overridden.translate||computed.translate||'0px 0px').split(/\s+/);
    const value=prop==='translate-x'?translate[0]==='none'?'0px':translate[0]:prop==='translate-y'?translate[1]||'0px':(overridden[prop]??'');
    input.value=value;input.classList.toggle('edited',prop.startsWith('translate-')?!!overridden.translate:prop in overridden);
    if(input.tagName==='INPUT'&&!prop.startsWith('translate-'))input.placeholder=computed.getPropertyValue(prop)||input.placeholder;
  });
  $('property-sections').querySelectorAll('[data-color-for]').forEach(input=>{const val=computed.getPropertyValue(input.dataset.colorFor);const m=val.match(/rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);if(m)input.value='#'+m.slice(1,4).map(x=>Number(x).toString(16).padStart(2,'0')).join('');});
  $('custom-styles').replaceChildren();for(const [k,v] of Object.entries(overridden)){const b=document.createElement('button');b.textContent=`${k}: ${v} ×`;b.title='Remove this override';b.onclick=()=>mutate(()=>setStyles({[k]:''}));$('custom-styles').append(b);}
  $('scope-note').textContent=state.scope==='all'?'Shared changes follow the page’s responsive layout.':`Only the ${state.scope==='tablet'?'iPad':state.scope} layout will change.`;
}
const unitless=new Set(['opacity','scale','z-index','order','flex-grow','flex-shrink','font-weight','line-height']);
function commitField(prop,raw){
  if(!state.selected)return;let value=raw.trim();
  if(value&&/^-?\d+(\.\d+)?$/.test(value)&&!unitless.has(prop))value+=prop==='rotate'?'deg':'px';
  let styles={[prop]:value};
  if(prop.startsWith('translate-')){const before=(currentChange()?.styles[state.scope]?.translate||frameDoc.defaultView.getComputedStyle(state.selected,state.pseudo||null).translate||'0px 0px').split(/\s+/);const x=prop==='translate-x'?value||'0px':before[0]==='none'?'0px':before[0];const y=prop==='translate-y'?value||'0px':before[1]||'0px';styles={translate:`${x} ${y}`};}
  for(const [k,v]of Object.entries(styles))if(v&&!k.startsWith('--')&&!CSS.supports(k,v)){toast('That value does not work for '+k+'. Try a CSS value such as 24px, 50%, or auto.');return;}
  const before=clone(state.design);try{mutate(()=>setStyles(styles));}catch(e){state.design=before;toast(e.message);apply();renderInspectorValues();}
}
function focusText(){const ta=$('property-sections').querySelector('textarea');if(ta){ta.closest('details').open=true;ta.focus();ta.select();}else toast('Select a text element to edit its words.');}
function undo(redo=false){const from=redo?state.redo:state.undo,to=redo?state.undo:state.redo;if(!from.length)return;to.push(clone(state.design));state.design=from.pop();$('draft-name').value=state.design.name;apply();markDirty();renderInspector();}
function handleKey(e){
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save(true);return;}
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable)return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return;}
  if(e.key==='Escape'){state.selected=null;state.pseudo='';renderInspector();rect();return;}
  if(e.key==='Enter'){focusText();return;}
  if(state.selected&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const amount=e.nudgeAmount||(e.shiftKey?10:1);const computed=frameDoc.defaultView.getComputedStyle(state.selected);const t=(currentChange()?.styles[state.scope]?.translate||computed.translate||'0 0').split(' ').map(parseFloat);const x=(t[0]||0)+(e.key==='ArrowLeft'?-amount:e.key==='ArrowRight'?amount:0),y=(t[1]||0)+(e.key==='ArrowUp'?-amount:e.key==='ArrowDown'?amount:0);mutate(()=>setStyles({translate:`${x}px ${y}px`}));}
}
function startGesture(e,handle){
  if(!state.selected||state.pseudo)return;e.preventDefault();e.stopPropagation();const el=state.selected,r=el.getBoundingClientRect(),computed=frameDoc.defaultView.getComputedStyle(el);
  const t=(computed.translate||'0px 0px').split(' ').map(parseFloat);const before=clone(state.design);
  const ownWidth=parseFloat(computed.width)||r.width,ownHeight=parseFloat(computed.height)||r.height;
  gesture={handle,startX:e.clientX,startY:e.clientY,width:ownWidth,height:ownHeight,tx:t[0]||0,ty:t[1]||0,before,moved:false,lock:!!$('lock-ratio')?.checked,vector:!!el.ownerSVGElement&&el.localName!=='svg',sx:parseFloat(computed.scale)||1,sy:parseFloat((computed.scale||'').split(' ')[1])||parseFloat(computed.scale)||1,parentWidth:el.parentElement?.getBoundingClientRect().width||state.width};
  e.currentTarget.setPointerCapture(e.pointerId);
  e.currentTarget.addEventListener('pointermove',moveGesture);e.currentTarget.addEventListener('pointerup',endGesture,{once:true});e.currentTarget.addEventListener('pointercancel',cancelGesture,{once:true});
}
function moveGesture(e){
  if(!gesture)return;const g=gesture;let dx=(e.clientX-g.startX)/state.scale,dy=(e.clientY-g.startY)/state.scale;if(!g.moved&&Math.hypot(dx,dy)<2)return;g.moved=true;
  const styles={};if(g.handle==='move')styles.translate=`${Math.round(g.tx+dx)}px ${Math.round(g.ty+dy)}px`;
  else{
    const dw=g.handle.includes('w')?-dx:g.handle.includes('e')?dx:0,dh=g.handle.includes('n')?-dy:g.handle.includes('s')?dy:0;
    if(dw){const w=Math.max(2,g.width+dw);styles.width=state.scope==='all'?`${Math.round(w/g.parentWidth*10000)/100}%`:`${Math.round(w)}px`;styles['max-width']='100%';styles['min-width']='0';}
    if(g.lock&&(dw||dh)){const width=Math.max(2,dw?g.width+dw:g.width*(g.height+dh)/g.height);styles.width=state.scope==='all'?`${Math.round(width/g.parentWidth*10000)/100}%`:`${Math.round(width)}px`;styles['max-width']='100%';styles['min-width']='0';styles['aspect-ratio']=`${g.width} / ${g.height}`;styles.height='auto';styles['min-height']='0';}
    else if(dh){styles.height=`${Math.round(Math.max(2,g.height+dh))}px`;styles['min-height']='0';}
    if(g.vector){const sx=Math.max(.01,(g.width+dw)/g.width),sy=g.lock?sx:Math.max(.01,(g.height+dh)/g.height);for(const k of Object.keys(styles))delete styles[k];styles.scale=`${g.sx*sx} ${g.sy*sy}`;styles['transform-box']='fill-box';styles['transform-origin']='center';}
    if(g.handle.includes('w')||g.handle.includes('n'))styles.translate=`${Math.round(g.tx+(g.handle.includes('w')?dx:0))}px ${Math.round(g.ty+(g.handle.includes('n')?dy:0))}px`;
  }
  try{setStyles(styles);apply();renderInspectorValues();}catch(e){toast(e.message);cancelGesture(e);}
}
function finishGestureListeners(e){e.currentTarget?.removeEventListener('pointermove',moveGesture);e.currentTarget?.removeEventListener('pointerup',endGesture);e.currentTarget?.removeEventListener('pointercancel',cancelGesture);}
function endGesture(e){finishGestureListeners(e);if(gesture?.moved){state.undo.push(gesture.before);if(state.undo.length>60)state.undo.shift();state.redo=[];markDirty();}gesture=null;}
function cancelGesture(e){finishGestureListeners(e);if(gesture){state.design=gesture.before;apply();renderInspectorValues();}gesture=null;}
$('selection').querySelectorAll('[data-handle]').forEach(b=>b.addEventListener('pointerdown',e=>startGesture(e,b.dataset.handle)));
$('move-handle').addEventListener('pointerdown',e=>startGesture(e,'move'));
$('undo').onclick=()=>undo();$('redo').onclick=()=>undo(true);$('save').onclick=()=>save(true);
$('draft-name').onchange=()=>mutate(()=>{state.design.name=$('draft-name').value||'My site design';});
$('parent-element').onclick=()=>{if(state.selected?.parentElement)selectElement(state.selected.parentElement);};
$('deselect').onclick=()=>{state.selected=null;state.pseudo='';renderInspector();rect();};
$('screen-scope').onchange=()=>{state.scope=$('screen-scope').value;if(state.scope!=='all')setDevice(state.scope);renderInspectorValues();};
$('global-scope').onchange=()=>{const old=currentChange();state.global=$('global-scope').checked;if(old)mutate(()=>{const page=state.global?'*':pageKey(state.page);const existing=state.design.changes.find(c=>c!==old&&c.page===page&&c.selector===state.selector&&c.pseudo===state.pseudo);if(existing){for(const [k,v]of Object.entries(old.styles))existing.styles[k]={...existing.styles[k],...v};existing.text=old.text;state.design.changes=state.design.changes.filter(c=>c!==old);}else old.page=page;});renderInspectorValues();};
$('apply-custom').onclick=()=>{const property=$('custom-property').value.trim();if(!property){toast('Enter a CSS property.');return;}commitField(property,$('custom-value').value);};
$('hide-element').onclick=()=>commitField('display','none');
$('reset-element').onclick=()=>{const c=currentChange();if(c)mutate(()=>{state.design.changes=state.design.changes.filter(x=>x.id!==c.id);});renderInspector();};
$('preview').onclick=()=>{state.preview=!state.preview;selection?.mode(!state.preview);$('preview').classList.toggle('active',state.preview);$('preview').textContent=state.preview?'Back to editing':'Preview';rect();if(state.preview)document.body.classList.remove('show-inspector');};
$('toggle-pages').onclick=()=>document.body.classList.toggle('show-pages');$('toggle-inspector').onclick=()=>document.body.classList.toggle('show-inspector');
$('scene').onchange=()=>loadPage('/live-round.html?design='+$('scene').value);$('zoom').onchange=fitCanvas;$('viewport-width').onchange=()=>{state.width=Math.max(280,Math.min(2560,Number($('viewport-width').value)||1440));state.device=state.width<768?'phone':state.width<1100?'tablet':'desktop';document.querySelectorAll('[data-device]').forEach(b=>b.classList.toggle('active',b.dataset.device===state.device));fitCanvas();};
$('search').oninput=()=>state.nav==='pages'?renderPages():refreshLayers();
for(const b of document.querySelectorAll('[data-device]'))b.onclick=()=>setDevice(b.dataset.device);
for(const b of document.querySelectorAll('[data-nav]'))b.onclick=()=>{state.nav=b.dataset.nav;$('search').value='';$('search').placeholder=state.nav==='pages'?'Find a page':'Find an element';$('page-list').hidden=state.nav!=='pages';$('layer-list').hidden=state.nav!=='layers';document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x===b));state.nav==='layers'?refreshLayers():renderPages();};
$('export').onclick=backup;$('import').onchange=async()=>{const file=$('import').files[0];if(!file)return;try{if(file.size>700000)throw new Error('This file is too large.');const design=validateDesign(JSON.parse(await file.text()));if(confirm('Replace your private draft with this design? You can undo this.')){mutate(()=>{state.design=design;});$('draft-name').value=design.name;renderInspector();toast('Imported into your private draft.');}}catch(e){toast(e.message);}finally{$('import').value='';}};
$('review').onclick=()=>{
  $('review-summary').textContent=`${changeCount(state.design)} edited elements. Check each screen size before publishing.`;$('review-list').replaceChildren();
  for(const c of state.design.changes){const d=document.createElement('div');d.className='change-card';d.innerHTML=`<h3>${escapeHTML(c.label)}</h3><p>${escapeHTML(c.page==='*'?'Matching elements across the site':c.page)}</p>`;for(const [scope,styles]of Object.entries(c.styles)){const p=document.createElement('p');p.textContent=(scope==='all'?'All screens':scope)+': '+Object.entries(styles).map(([k,v])=>`${k} ${v}`).join(' · ');d.append(p);}for(const t of c.text){const p=document.createElement('p');p.textContent=`“${t.before.trim()}” → “${t.after.trim()}”`;d.append(p);}const b=document.createElement('button');b.textContent='Remove change';b.onclick=()=>{mutate(()=>{state.design.changes=state.design.changes.filter(x=>x.id!==c.id);});d.remove();$('review-summary').textContent=`${changeCount(state.design)} edited elements.`;};d.append(b);$('review-list').append(d);}
  $('review-dialog').showModal();
};
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
for(const b of document.querySelectorAll('[data-review-device]'))b.onclick=()=>{setDevice(b.dataset.reviewDevice);$('review-dialog').close();};
$('publish').onclick=async()=>{
  if(state.local){toast('This local preview saves private drafts only. Publish from itsdebatable.com/design.');return;}
  if(state.blocked){toast('Export your changes and reload the latest draft before publishing.');return;}
  if(state.saving){toast('Wait for your current save to finish, then publish.');return;}
  clearTimeout(saveTimer);state.saving=true;$('publish').disabled=true;status('Publishing…');const sent=clone(state.design);
  try{const data=await api({action:'publish',design:sent,revision:state.revision,publishedRevision:state.publishedRevision});state.revision=data.revision;state.publishedRevision=data.publishedRevision;state.dirty=JSON.stringify(sent)!==JSON.stringify(state.design);if(!state.dirty){try{localStorage.removeItem(recoveryKey());}catch{}}status('Published. Draft is saved');$('review-dialog').close();toast('Published to Debatable. Visitors will see it within a minute.');}
  catch(e){if(e.conflict)state.blocked=true;status('Not published');toast(e.message);}finally{state.saving=false;$('publish').disabled=false;if(state.dirty&&!state.blocked)saveTimer=setTimeout(()=>save(),1500);}
};
$('history').onclick=async()=>{
  $('history-list').textContent='Loading saved versions…';$('history-dialog').showModal();
  try{const data=await api({action:'history'});$('history-list').replaceChildren();if(!data.history.length)$('history-list').textContent='Saved checkpoints will appear here as you work.';for(const h of data.history){const d=document.createElement('div');d.className='change-card';d.innerHTML=`<h3>${escapeHTML(h.name)}</h3><p>${escapeHTML(new Date(h.savedAt).toLocaleString())} · ${h.count} elements</p>`;const b=document.createElement('button');b.textContent='Restore to private draft';b.onclick=async()=>{try{const r=await api({action:'restore',id:h.id});mutate(()=>{state.design=validateDesign(r.design);});$('draft-name').value=state.design.name;renderInspector();$('history-dialog').close();toast('Restored privately. The live site has not changed.');}catch(e){toast(e.message);}};d.append(b);$('history-list').append(d);}}
  catch(e){$('history-list').textContent=e.message;}
};
$('account').onclick=async()=>{if(state.local){toast('Local preview. Drafts are saved only on this Mac.');return;}if(state.dirty){await save(true);if(state.dirty){toast('Your draft has not synced. Save or export a backup before signing out.');return;}}if(confirm('Sign out of the design workspace?')){try{localStorage.removeItem(recoveryKey());}catch{}await firebase.auth().signOut();}};
document.addEventListener('keydown',handleKey);
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',()=>{if(state.dirty)save();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.dirty){keepRecovery();save();}});
authInit();
