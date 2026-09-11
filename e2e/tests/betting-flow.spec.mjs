import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../../app/'+name,import.meta.url),'utf8');
async function fork(page){
  await page.setContent(read('bet.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,''));
  await page.addStyleTag({content:read('css/bet.css')});
  await page.addScriptTag({content:read('js/bet-fork.js')});
}
test('scroll follows the mouse between guides without leaving the split page',async({page})=>{
  await page.setViewportSize({width:1440,height:960});await fork(page);
  await page.mouse.move(200,500);await page.mouse.wheel(0,700);
  await expect(page.locator('#bet-fork')).toHaveAttribute('data-choice','self');
  await expect(page.locator('#bet-yourself')).toHaveAttribute('aria-hidden','false');
  await expect.poll(async()=>page.locator('.fork-self').evaluate(e=>e.offsetWidth)).toBeGreaterThan(700);
  const y=await page.evaluate(()=>scrollY);
  await page.mouse.move(1250,500);
  await expect(page.locator('#bet-fork')).toHaveAttribute('data-choice','others');
  await expect(page.locator('#bet-others')).toHaveAttribute('aria-hidden','false');
  await expect.poll(async()=>page.locator('.fork-others').evaluate(e=>e.offsetWidth)).toBeGreaterThan(700);
  await expect(page.locator('#bet-fork')).toBeVisible();
  expect(await page.evaluate(()=>scrollY)).toBe(y);
  expect(await page.evaluate(()=>location.hash)).toBe('');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await expect(page.locator('[data-bet-route="others"]')).toHaveAttribute('aria-expanded','false');
});
test('touch and reduced-motion keyboard users open guides in place',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await fork(page);
  await page.locator('[data-bet-route="self"]').click();
  await expect(page.locator('#bet-yourself')).toHaveAttribute('aria-hidden','false');
  await expect.poll(async()=>page.locator('#bet-yourself').evaluate(e=>e.offsetHeight)).toBeGreaterThan(100);
  await page.locator('[data-bet-route="others"]').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#bet-others')).toHaveAttribute('aria-hidden','false');
  await expect(page.locator('#bet-yourself')).toHaveAttribute('aria-hidden','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('#bet-fork')).toBeVisible();
});
test('round panel starts the conversation, opens betting and confirms a stake',async({page})=>{
  const live=read('live-round.html'),a=live.indexOf('      <section class="round-bet"'),b=live.indexOf('</section>',a)+10;
  await page.setContent(live.slice(a,b));await page.addStyleTag({content:read('css/round-bet.css')+read('css/bet-charts.css')});
  await page.evaluate(()=>{
    window.betCalls=[];window.roundStarted=false;window.savedBet=null;
    window.firebase={auth:()=>({currentUser:{uid:'me',isAnonymous:false,getIdToken:async()=> 'test-token'},onAuthStateChanged:()=>{}})};
    window.fetch=async(url,init)=>{
      const data=JSON.parse(init.body);window.betCalls.push(data);
      if(data.action==='bet'){if(!window.roundStarted)throw Error('not started');window.savedBet={pick:data.pick,stake:data.stake};}
      return {ok:true,json:async()=>({ok:true,ownSide:'pro',balance:window.savedBet?950:1000,myBet:window.savedBet,
        market:window.roundStarted?{status:'open',lockAt:Date.now()+240000,proName:'You',conName:'Your opponent',poolPro:window.savedBet?50:0,poolCon:0,betCount:window.savedBet?1:0,priceHistory:window.savedBet?[{at:Date.now(),proPct:100}]:[]}:null})};
    };
  });
  await page.addScriptTag({content:read('js/bet-charts.js')});await page.addScriptTag({content:read('js/round-bet.js')});
  await page.evaluate(()=>{
    document.addEventListener('round-bet-start',()=>{window.roundStarted=true;DBRoundBet.update({room:'test',enabled:true,viewer:false,canStart:false,started:true});DBRoundBet.refresh();});
    DBRoundBet.update({room:'test',enabled:true,viewer:false,canStart:true,started:false});
  });
  await expect(page.locator('#rb-chart svg')).toBeVisible();
  await expect(page.locator('#rb-start')).toBeVisible();
  await expect(page.locator('#rb-form')).toBeHidden();
  await page.locator('#rb-start').click();
  await expect(page.locator('#rb-form')).toBeVisible();
  await expect(page.locator('#rb-pick-con')).toBeDisabled();
  await page.locator('#rb-stake').fill('50');await page.locator('#rb-submit').click();
  await expect(page.locator('#rb-status')).toHaveText('You backed PRO with 50 tokens.');
  await expect(page.locator('#rb-balance')).toHaveText('950 tokens');
  await expect(page.locator('#rb-chart .pool-dot-pro')).toBeVisible();
  expect(await page.evaluate(()=>betCalls.filter(c=>c.action==='bet'))).toEqual([{action:'bet',room:'test',pick:'pro',stake:50}]);
});
