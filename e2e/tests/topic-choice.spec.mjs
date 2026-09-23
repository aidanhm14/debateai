import {test,expect} from '@playwright/test';
import {readApp} from '../helpers/offline-site.mjs';
import {roomDesign} from '../helpers/room-design.mjs';
import {runTopicStrikes} from '../../app/netlify/functions/lib/topic-strikes.mjs';

for(const width of [390,1280])test(`empty room displays choices before Start at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 const fixture=await roomDesign(page,{document:html=>html.replace('  // ── Guest auth.', `
 window.__topicTest={clear:function(){state.motion='';state.room='room';state.proUid='a';state.conUid='b';state.user={uid:'a'};state.topicStrikes=null;state.phase='round';state.speechIdx=0;state.timerState='ready';renderRound();window.__lrSyncMotionBtns();paintRoundReadiness();}};
 // ── Guest auth.`)});
 await page.goto('https://debatable.test/live-round?design=ready');
 await page.evaluate(()=>window.__topicTest.clear());
 await expect(page.locator('#rmbMotion')).toHaveText('Choose topic');
 await expect(page.locator('#rmbTools')).toBeVisible();
 for(const id of ['rmbRollBtn','rmbDifferBtn','rmbChangeBtn','rmbDraftBtn'])await expect(page.locator('#'+id)).toBeVisible();
 await expect(page.locator('#startConvoBtn')).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(fixture.errors).toEqual([]);
});

test('two people accept strikes, commit privately, choose a survivor and split sides',async({browser})=>{
 const pages=[await browser.newPage(),await browser.newPage()];
 const rows=new Map([['live_rounds/room',{proUid:'a',conUid:'b',proName:'Alice',conName:'Bob',motion:'',speechIdx:0,status:'round'}]]);
 let serial=Promise.resolve();
 const db={collection:c=>({doc:id=>c+'/'+id}),runTransaction:fn=>{
  const next=serial.then(async()=>{const writes=[];const result=await fn({get:async path=>({exists:rows.has(path),data:()=>structuredClone(rows.get(path))}),set:(p,d)=>writes.push([p,d]),update:(p,d)=>writes.push([p,{...rows.get(p),...d}])});writes.forEach(([p,d])=>rows.set(p,d));return result;});
  serial=next.catch(()=>{});return next;
 }};
 for(const [index,page] of pages.entries()){
  await page.setViewportSize({width:index?390:1280,height:844});
  await page.setContent('<h1 id="topic">Choose topic</h1><button id="invite">Offer strikes</button><section id="topicStrikes" class="topic-strikes" hidden></section>');
  await page.addStyleTag({content:readApp('live-round.html').match(/\.topic-strikes\{[\s\S]*?(?=#rmbTools \.rmb-change small)/)[0]});
  await page.exposeFunction('sendChoice',async body=>{
   try{
    const result=await runTopicStrikes(db,index?'b':'a',body,{delete:()=>null});
    for(const p of pages)if(await p.evaluate(()=>!!window.paintSnapshot))await p.evaluate(d=>window.paintSnapshot(d),rows.get('live_rounds/room'));
    return {ok:true,data:result};
   }catch(e){return {ok:false,data:{error:e.message}};}
  });
  await page.addScriptTag({content:readApp('js/live-room/topic-choice.js')});
  await page.evaluate(({uid,round})=>{
   const state={...round,room:'room',user:{uid,getIdToken:async()=> 'fixture'}};
   window.fetch=async(_,options)=>{const r=await window.sendChoice(JSON.parse(options.body));return {ok:r.ok,json:async()=>r.data};};
   window.paintSnapshot=d=>{Object.assign(state,window.__lrMergeTopicChoice(d));state.lastRoundDoc=d;document.getElementById('topic').textContent=state.motion||'Choose topic';window.__lrPaintTopicChoice();};
   window.DBLiveTopicChoice.attach({state,escHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),isSpectator:()=>false,toast:msg=>{throw Error(msg);},onRoundSnapshot:window.paintSnapshot,getRoundDocRef:()=>null});
   document.getElementById('invite').onclick=window.__lrInviteStrikes;
   window.paintSnapshot(round);
  },{uid:index?'b':'a',round:rows.get('live_rounds/room')});
 }
 const [a,b]=pages;
 await a.getByRole('button',{name:'Offer strikes'}).click();
 await expect(a.getByText(/Waiting for Bob/)).toBeVisible();
 await b.getByRole('button',{name:'Use strikes',exact:true}).click();
 const picks=a.locator('[data-topic-pick]');
 await picks.nth(0).focus();await a.keyboard.press('Enter');await expect(picks.nth(0)).toBeFocused();
 await picks.nth(1).click();await a.getByRole('button',{name:'Lock two strikes'}).click();
 await expect(a.getByRole('heading',{name:'Your strikes are locked'})).toBeVisible();
 expect(rows.get('live_rounds/room').topicStrikes.strikes).toBeUndefined();
 expect(rows.get('live_rounds/room').motion).toBe('');
 await b.locator('[data-topic-pick]').nth(0).click();await b.locator('[data-topic-pick]').nth(1).click();
 await b.getByRole('button',{name:'Lock two strikes'}).click();
 const d=rows.get('room_topic_strikes/room'),picker=d.motionUid==='a'?a:b,side=d.sideUid==='a'?a:b;
 await expect(picker.locator('[data-topic-action="motion"]')).toHaveCount(3);
 await picker.locator('[data-topic-action="motion"]').first().click();
 await side.getByRole('button',{name:'Against',exact:true}).click();
 for(const p of pages){await expect(p.locator('#topicStrikes')).toBeHidden();await expect(p.locator('#topic')).not.toHaveText('Choose topic');}
 expect(rows.get('live_rounds/room').conUid).toBe(d.sideUid);
 for(const p of pages){await p.evaluate(()=>window.paintSnapshot({motion:'',topicStrikesRevision:0,topicStrikes:null}));await expect(p.locator('#topic')).not.toHaveText('Choose topic');await p.close();}
});
