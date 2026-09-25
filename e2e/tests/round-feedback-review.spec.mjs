import {test,expect} from '@playwright/test';
import {offlineSite,readApp,between} from '../helpers/offline-site.mjs';

test('admin feedback inbox escapes reports, marks review and reaches older empty-page matches',async({page},testInfo)=>{
  await page.addInitScript(()=>{const user={uid:'admin',email:'admin@example.test',getIdToken:async()=>'fixture'};const auth={currentUser:user,onAuthStateChanged:fn=>setTimeout(()=>fn(user),20),signOut(){}};window.firebase={apps:[{}],auth:()=>auth};});
  const fixture=await offlineSite(page,{api:url=>{
    if(url.pathname==='/api/admin/rate-generation')return {json:{ok:true}};
    if(url.pathname==='/api/admin/list-generations')return {json:url.searchParams.get('queue')==='feedback'?{items:[{id:'report_123',reviewType:'round_feedback',roundId:'round_123',roundVerified:false,output:'<img src=x onerror="window.reportXss=true"> Audio failed.',outputLength:66,feedbackIssue:'audio',userRating:null,reviewStatus:'pending',createdAt:Date.now()}],cursor:null}:url.searchParams.has('after')?{items:[{id:'capture_123',kind:'voice_round',output:'Full captured ending.',outputLength:21,userRating:5,adminRating:null}],cursor:null}:{items:[],cursor:'older_123'}};
  }});
  await page.goto('https://debatable.test/admin-rate');
  await expect(page.getByText('Client-reported AI round reference, not independently verified.',{exact:false})).toBeVisible();
  await expect(page.locator('#output-body')).toContainText('<img src=x');await expect(page.locator('#output-body img')).toHaveCount(0);expect(await page.evaluate(()=>window.reportXss)).toBeUndefined();
  await page.locator('#notes-input').fill('Checked. Retry path fixed.');await page.getByRole('button',{name:'Mark reviewed + next'}).click();
  await expect(page.locator('.meta-row')).toContainText('Reviewed');
  await expect(page.locator('#stars')).toBeHidden();await expect(page.locator('#boring-toggle')).toBeHidden();
  expect(JSON.parse(fixture.requests.find(x=>x.path==='/api/admin/rate-generation').body)).toMatchObject({reviewType:'round_feedback',generationId:'report_123',notes:'Checked. Retry path fixed.'});
  await page.screenshot({path:testInfo.outputPath('feedback-inbox.png')});
  await page.locator('#filter-queue').selectOption('generations');await expect(page.getByRole('button',{name:'Load older records'})).toBeVisible();
  await page.getByRole('button',{name:'Load older records'}).click();await expect(page.locator('#output-body')).toHaveText('Full captured ending.');
  expect(fixture.errors).toEqual([]);
});

test('AI endRound permits explicit feedback after transcript consent is declined',async({page})=>{
  const source=readApp('newvoice.html');const end=between(source,'async function endRound(){','/* ── the judge');const capture=between(source,'function logRound(){','/* ── save round');
  const fixture=await offlineSite(page,{document:html=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''),api:()=>({json:{ok:true}})});
  await page.goto('https://debatable.test/newvoice');await page.addScriptTag({content:readApp('js/round-feedback.js')});
  await page.addScriptTag({content:`var $=id=>document.getElementById(id),status='live',previewRound=false,trainingRequested=false,trainingScenario=null,liveVoice=null,startedAt=Date.now()-60000,roundElapsedMs=0,roundId='',vtSession=null,vtPending=[],roundStartIdx=0,turns=[{who:'you',text:'Private spoken words'},{who:'ai',text:'Private AI words'}],currentMotion='Public transport',side='for',startBtn=$('startBtn'),startLabel=$('startLabel');window.firebase={auth:()=>({currentUser:{uid:'one',isAnonymous:false,getIdToken:async()=>'fixture'}})};window.TranscriptConsent={granted:()=>false};function resetSaveBtn(){}function cleanup(){}function fmtTime(){return '1:00';}function judgeRound(){}function show(id){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('on',x.id===id));}${capture}${end}`});
  await page.evaluate(()=>endRound());const host=page.locator('#roundFeedback');await expect(host.getByRole('button',{name:'Send feedback'})).toBeVisible();
  await host.getByLabel('Anything we should improve?').selectOption('audio');await host.getByRole('button',{name:'Send feedback'}).click();await expect(host.getByRole('status')).toContainText('Feedback saved');
  const writes=fixture.requests.filter(x=>x.path==='/api/log-generation');expect(writes).toHaveLength(1);const sent=JSON.parse(writes[0].body);expect(sent).toMatchObject({action:'round_feedback',surface:'newvoice',rating:null,issue:'audio'});expect(JSON.stringify(sent)).not.toContain('Private');expect(fixture.errors).toEqual([]);
});
