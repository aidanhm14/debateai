import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('app');
const server = createServer(async (req,res) => {
  const path = new URL(req.url,'http://localhost').pathname;
  const name = /^\/(?:challenge(?:s|\/)|c\/)/.test(path) ? '/challenges.html' : path;
  try {
    const body = await readFile(root+name);
    res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(name)] || 'application/octet-stream');
    res.end(body);
  } catch {res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base = 'http://127.0.0.1:'+server.address().port;
const browser = await chromium.launch({headless:true});
const sample = {id:'one',slug:'employers-should-publish-salaries-test',claim:'Employers should publish everyone’s salary.',
  creator:{uid:'host',name:'Test host',rating:1427,provisional:false},
  accepted:[{uid:'host',name:'Test host',side:'b',rating:1427}],sides:{a:'For',b:'Against'},
  status:'open',mode:'live',scheduledAt:0,description:'Transparency makes unfair pay harder to hide.',
  crowd:{followers:0,supportA:0,supportB:0,pctA:50},visibility:'public',eventId:'',following:false};
let current = structuredClone(sample), user='guest', creates=[], actions=[], failCreate=false;
const errors=[];
const context = await browser.newContext({viewport:{width:1280,height:950}});
await context.addInitScript(() => {
  window.gtag = (...args)=>(window.testEvents ||= []).push(args);
  window.daAskAgeBand = fn=>fn('adult'); window.daRecordAgeBand=(band,fn)=>fn(true);
  window.daEnableMessageAlerts=()=>Promise.resolve(true);
});
await context.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.hostname==='www.gstatic.com') return route.fulfill({contentType:'text/javascript',body:`window.firebase={apps:[{}],auth:()=>({onAuthStateChanged:fn=>setTimeout(()=>fn({uid:${JSON.stringify(user)},isAnonymous:false,getIdToken:async()=>'fixture'}),0)})};`});
 if(u.origin!==base) return route.abort();
 if(['/js/native-bridge.js','/js/topbar.js','/js/auth-modal.js','/js/track.js','/js/sfx.js','/js/ui-neural.js','/js/avatar.js'].includes(u.pathname))return route.fulfill({contentType:'text/javascript',body:''});
 if(u.pathname==='/api/challenge') {
  if(route.request().method()==='POST'){
   const data=route.request().postDataJSON(); actions.push(data);
   if(data.action==='create'){
    creates.push(data);
    if(failCreate)return route.fulfill({status:400,json:{error:'Choose a safer question.'}});
    current={...structuredClone(sample),claim:data.claim,description:data.description,scheduledAt:data.scheduledAt,creator:{uid:user,name:'Your alias',rating:null},accepted:[{uid:user,name:'Your alias',side:data.side}]};
    return route.fulfill({json:{challenge:current}});
   }
   if(data.action==='accept'){current.accepted.push({uid:user,name:'Your alias',side:'a'});current.status='accepted';return route.fulfill({json:{ok:true,side:'a'}});}
   if(data.action==='join')return route.fulfill({json:{room:'Challenge-one',url:'/live-round?room=Challenge-one'}});
   if(data.action==='follow'){current.following=data.following;current.crowd.followers=data.following?1:0;return route.fulfill({json:{ok:true,following:current.following,followers:current.crowd.followers}});}
  }
  return route.fulfill({json:u.searchParams.has('feed')?{challenges:[current]}:{challenge:current}});
 }
 if(u.pathname==='/live-round')return route.fulfill({contentType:'text/html',body:'<h1>Existing room reached</h1>'});
 return route.continue();
});
const page=await context.newPage();page.on('pageerror',e=>{ if (e.message !== 'Transition was skipped') errors.push(e.message); });
try {
 await page.goto(base+'/challenges');await page.getByRole('heading',{name:sample.claim}).waitFor();
 assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);
 if(process.env.SCREENSHOTS)await page.screenshot({path:process.env.SCREENSHOTS+'/challenge-board.png',fullPage:true});
 await page.getByRole('button',{name:'Start a challenge',exact:true}).click();
 assert.equal(new URL(page.url()).pathname,'/challenge/new');
 await page.locator('#cClaim').fill('Working from home should be the default.');
 await page.locator('#cSide').selectOption('b');
 await page.locator('#cDesc').fill('The commute costs more than people admit.');
 await page.locator('#cTiming').selectOption('scheduled');
 assert.equal(await page.locator('#whenField').isVisible(),true);
 const date=new Date(Date.now()+3600000);date.setSeconds(0,0);const local=new Date(date-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
 await page.locator('#cWhen').fill(local);await page.locator('#cOpponent').fill('@test-person');
 failCreate=true;await page.getByRole('button',{name:'Post challenge'}).click();

 await page.getByText('Choose a safer question.').waitFor();
 assert.equal(await page.locator('#cClaim').inputValue(),'Working from home should be the default.');
 assert.equal(await page.locator('#cWhen').inputValue(),local);
 failCreate=false;await page.getByRole('button',{name:'Post challenge'}).click();
 await page.getByRole('heading',{name:'Working from home should be the default.'}).waitFor();
 assert.equal(creates.at(-1).mode,'live');assert.equal(creates.at(-1).side,'b');assert.equal(creates.at(-1).opponentUsername,'@test-person');assert.ok(creates.at(-1).scheduledAt>Date.now());
 await page.getByRole('button',{name:'Notify me when someone accepts'}).click();
 await page.getByRole('status').filter({hasText:'Notifications are on'}).waitFor();
 current={...structuredClone(sample),scheduledAt:Date.now()+3600000};
 await page.goto(base+'/challenge/'+current.slug);await page.getByRole('button',{name:'Take the other side'}).click();
 await page.getByRole('button',{name:'Side reserved'}).waitFor();
 assert.equal(actions.filter(a=>a.action==='join').length,0,'scheduled acceptance must not join early');
 current=structuredClone(sample);await page.goto(base+'/challenge/'+current.slug);
 await page.getByRole('button',{name:'Watch',exact:true}).click();await page.getByRole('button',{name:'On your watch list'}).waitFor();
 assert.equal(current.crowd.followers,1);
 await page.getByRole('button',{name:'On your watch list'}).click();await page.getByRole('button',{name:'Watch',exact:true}).waitFor();
 assert.equal(current.crowd.followers,0);
 await page.getByRole('button',{name:'Take the other side'}).click();
 await page.getByRole('heading',{name:'Existing room reached'}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/live-round');
 current={...structuredClone(sample),status:'completed',result:{winner:'pro',winnerName:'Test guest',rfd:'The case for transparency carried the round.'}};
 await page.goto(base+'/challenge/'+current.slug);await page.getByRole('heading',{name:'Test guest wins.'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Take the other side'}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Watch replay'}).count(),0);
 current.replayUrl='/watch?r=published';await page.reload();await page.getByRole('button',{name:'Watch replay'}).waitFor();
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Save share card'}).click();assert.ok((await dl).suggestedFilename().endsWith('.png'));
 if(process.env.SCREENSHOTS)await page.screenshot({path:process.env.SCREENSHOTS+'/challenge-completed.png',fullPage:true});
 current=structuredClone(sample);await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/challenge/'+current.slug);await page.getByRole('button',{name:'Take the other side'}).waitFor();
 assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false,'mobile has no horizontal overflow');
 if(process.env.SCREENSHOTS)await page.screenshot({path:process.env.SCREENSHOTS+'/challenge-mobile.png',fullPage:true});
 await page.goto(base+'/challenge/new');await page.locator('#cClaim').waitFor();
 if(process.env.SCREENSHOTS)await page.screenshot({path:process.env.SCREENSHOTS+'/challenge-create.png',fullPage:true});
 assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('Challenge browser: creation, preserved drafts, scheduling, acceptance, room handoff, watch interest, notifications, completion, share card and mobile layout passed.');
} finally {await browser.close();await new Promise(r=>server.close(r));}
