// Read-only stranger walks. Mutating network requests are blocked before send.
// node e2e/astra-onboarding-audit.mjs [case,case|timeline] --out /absolute/path
// BASE_URL defaults to production. No queue joins, writes, or paid API calls.
// --allow-anonymous-auth permits an empty anonymous Firebase signup plus its read-only account lookup.
// Tokens and UIDs are never included in evidence. Named signup remains blocked.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args=process.argv.slice(2);
const output=path.resolve(args.includes('--out') ? args[args.indexOf('--out')+1] : path.join(repo,'e2e','astra-onboarding-output'));
await fs.mkdir(output,{recursive:true});
const base=process.env.BASE_URL || 'https://itsdebatable.com';
const allowAnonymousAuth=args.includes('--allow-anonymous-auth');
const desktopUA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 DebatableE2E/1';
// Representative TikTok iOS UA. The decision log names musical_ly as its
// load-bearing marker but does not contain the four historical raw strings.
const tiktokUA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1 musical_ly_39.8.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US';
const cases=[
 ['root-desktop','/',false,false],['root-iphone','/',true,false],
 ['organic-desktop','/debate-online',false,false],['organic-iphone','/debate-online',true,false],
 ['practice-iphone','/practice',true,false],['voice-iphone','/voice-debate',true,false],['newvoice-iphone','/newvoice',true,false],
 ['tiktok-spar','/spar',true,true],['tiktok-practice','/practice',true,true],['tiktok-voice','/voice-debate',true,true],['tiktok-profile','/profile',true,true],
];
const specified=args[0] && !args[0].startsWith('--') ? args[0] : undefined;
if(specified==='timeline')cases.push(['timeline','/',false,false]);
const browser=await chromium.launch({channel:'chromium'});
const results=[];
function inspect(){
 const visible=e=>{let s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
 const node=e=>{let r=e.getBoundingClientRect();return {id:e.id,tag:e.tagName,text:(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,180),href:e.getAttribute('href'),type:e.type,disabled:e.disabled,box:{x:r.x,y:r.y,w:r.width,h:r.height},inViewport:r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth}};
 return {url:location.href,title:document.title,time:performance.now(),body:document.body.innerText.slice(0,18000),controls:[...document.querySelectorAll('a,button,input,select,textarea')].filter(visible).map(node),dialogs:[...document.querySelectorAll('[role=dialog],[aria-modal=true],#daExpAsk,#uiOpenModal,#lookingPrompt')].filter(visible).map(node),plain:{experience:document.documentElement.dataset.debateExperience,plainNodes:document.querySelectorAll('[data-plain]').length,audienceScript:[...document.scripts].some(s=>s.src.includes('audience-mode'))},inapp:typeof window.__ditIsInAppBrowser==='function'?window.__ditIsInAppBrowser():null,account:typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser?{anonymous:firebase.auth().currentUser.isAnonymous}:null,events:(window.dataLayer||[]).filter(x=>x&&x[0]==='event').map(x=>({name:x[1],params:x[2]})).slice(-50)};
}
try{
 for(const [name,route,mobile,tiktok] of cases){
  if(specified&&!specified.split(',').includes(name))continue;
  const opts=mobile?{...devices['iPhone 14'],viewport:{width:390,height:844}}:{viewport:{width:1280,height:800}};
  delete opts.defaultBrowserType;
  const context=await browser.newContext({...opts,userAgent:tiktok?tiktokUA:mobile?devices['iPhone 14'].userAgent:desktopUA,serviceWorkers:'block',permissions:[]});
  const blocked=[],errors=[];
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   const listen=u.hostname==='firestore.googleapis.com'&&/\/Listen\/channel$/.test(u.pathname);
   let anonymousMint=false, accountLookup=false;
   if(allowAnonymousAuth&&req.method()==='POST'&&u.hostname==='identitytoolkit.googleapis.com'&&u.pathname==='/v1/accounts:signUp'){
    try{const body=req.postDataJSON();anonymousMint=body&&body.returnSecureToken===true&&Object.keys(body).every(k=>k==='returnSecureToken');}catch{}
   }
   if(allowAnonymousAuth&&req.method()==='POST'&&u.hostname==='identitytoolkit.googleapis.com'&&u.pathname==='/v1/accounts:lookup'){
    try{const body=req.postDataJSON();accountLookup=body&&typeof body.idToken==='string'&&Object.keys(body).every(k=>k==='idToken');}catch{}
   }
   const unsafe=/\/api\/admin(?:[/-]|$)|\/.netlify\/functions\/admin/.test(u.pathname)||u.hostname==='firestore.googleapis.com'&&/\/Write\/channel$/.test(u.pathname)||!['GET','HEAD','OPTIONS'].includes(req.method())&&!listen&&!anonymousMint&&!accountLookup;
   if(unsafe){blocked.push({method:req.method(),url:u.origin+u.pathname});await route.abort('blockedbyclient');}else await route.continue();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async d=>{errors.push('Native dialog: '+d.type()+' '+d.message());await d.dismiss()});
  const item={name,route,allowAnonymousAuth,viewport:opts.viewport,mobile,tiktok,ua:tiktok?tiktokUA:mobile?devices['iPhone 14'].userAgent:desktopUA,blocked,errors,steps:[]};
  async function capture(label){const data=await page.evaluate(inspect);const image=`${name}-${label}.png`;await page.screenshot({path:path.join(output,image)});item.steps.push({label,image,...data});return data;}
  try{
   const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:45000});item.status=response.status();
   await page.waitForTimeout(2500);let data=await capture('arrival');
   if(name==='timeline'){
    item.timeline=[];
    for(let second=3;second<=90;second++){
     await page.waitForTimeout(1000);
     const state=await page.evaluate(()=>{
      const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
      return {at:performance.now(),hidden:document.hidden,overlays:[...document.querySelectorAll('[role=dialog],[aria-modal=true],.signup-pill,.signup-nudge,.ui-beta-strip,#daExpAsk,#lookingPrompt,#ditLivePopup')].filter(visible).map(e=>({id:e.id,className:e.className,text:e.innerText.slice(0,250)}))};
     });
     item.timeline.push(state);
     if([30,60,90].includes(second))await capture('second-'+second);
    }
   }
   if(name!=='timeline'&&(route==='/'||route==='/debate-online')){
    const c=data.controls.filter(c=>c.tag==='A'&&c.href&&c.href.startsWith('/spar')&&c.inViewport).sort((a,b)=>b.box.w*b.box.h-a.box.w*a.box.h)[0];
    if(c){item.action={type:'primary-link',...c};await page.locator(c.id?'#'+c.id:'a[href="'+c.href+'"]').filter({visible:true}).first().click();await page.waitForTimeout(2500);data=await capture('primary');}
   }
   if(new URL(page.url()).pathname==='/spar'){
    const skip=page.locator('.mp-skip-big');if(await skip.isVisible()){await skip.click();await page.waitForTimeout(1800);await capture('skip-wall');}
   }
   if(!tiktok&&route==='/practice'){
    const start=page.getByRole('button',{name:/Start casual 1v1/i}).first();
    if(await start.isVisible()){await start.click();await page.waitForTimeout(1200);await capture('prep');}
    const speech=page.locator('.prep-start-cta');
    if(await speech.isVisible()){await speech.click();await page.waitForTimeout(2200);await capture('speech-or-wall');}
   }
   if(!tiktok&&route==='/voice-debate'){
    const start=page.locator('.selection-guide__launch');
    if(await start.isVisible()&&await start.isEnabled()){await start.click();await page.waitForTimeout(2200);await capture('permission-or-wall');}
   }
   if(tiktok&&route!=='/spar'){
    const buttons=page.getByRole('button',{name:/^sign in$|^sign in.*free$|^sign in with google$|^continue with google$/i});
    for(const button of await buttons.all())if(await button.isVisible()){await button.click();await page.waitForTimeout(1500);await capture('auth');break;}
   }
  }catch(e){item.error=e.message;}
  results.push(item);await fs.writeFile(path.join(output,specified?'walks-'+specified.replaceAll(',','_')+'.json':'walks.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({name,status:item.status,error:item.error,steps:item.steps.map(s=>({label:s.label,url:s.url,body:s.body.slice(0,2300),controls:s.controls.filter(c=>c.inViewport).slice(0,20)})),blocked:blocked.length,errors}));
  await context.close();
 }
}finally{await browser.close()}
