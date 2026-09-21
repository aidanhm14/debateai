import { test, expect } from '@playwright/test';
import { readApp } from '../helpers/offline-site.mjs';
import { roomDesign } from '../helpers/room-design.mjs';

for(const width of [320,390,1280]){
  test(`conversation starts with one primary choice and visible own side at ${width}px`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:844});
    const fixture=await roomDesign(page);
    await page.goto('https://debatable.test/live-round?design=ready&mySide=con');
    await expect(page.locator('#startConvoBtn')).toBeVisible();
    await expect(page.locator('#startFormalBtn')).toBeHidden();
    await expect(page.locator('#roundReadiness')).toContainText('Connected');
    if(width<761){
      await expect(page.locator('#roundMobileContext')).toBeInViewport();
      await expect(page.locator('#roundMobileSide')).toHaveText('You’re arguing AGAINST');
      await expect(page.locator('#startConvoBtn')).toBeInViewport();
      await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
      await expect(page.locator('#roundMobileTopic')).toBeInViewport();
      await expect(page.locator('#startConvoBtn')).toBeInViewport();
    }
    await page.locator('.round-mode-options>summary').click();
    await expect(page.locator('#startFormalBtn')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(fixture.errors).toEqual([]);
    await page.screenshot({path:testInfo.outputPath('round-start.png')});
  });
}
test('incoming finish request and explicit acceptance stay visible on a phone',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const fixture=await roomDesign(page);
  await page.goto('https://debatable.test/live-round?design=finish');
  await expect(page.locator('#conversationFinishAccept')).toHaveText('Yes, finish the round');
  await expect(page.locator('#conversationFinishAccept')).toBeInViewport();
  await expect(page.locator('#conversationFinishText')).toContainText('Are you done speaking?');
  await expect(page.locator('#roundMobileTopic')).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath('finish-request.png')});
  expect(fixture.errors).toEqual([]);
});
test('judging becomes a visible recovery action when no result arrives',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await page.clock.install();
  const fixture=await roomDesign(page);
  await page.goto('https://debatable.test/live-round?design=deciding');
  await expect(page.locator('#ballotLoading')).toBeInViewport();
  await page.clock.fastForward(91000);
  await expect(page.locator('#judgeRecoveryAction')).toBeVisible();
  await expect(page.locator('#ballotRetryNote')).toContainText('decision is delayed');
  await expect(page.locator('#ballotLoading .spinner')).toBeHidden();
  expect(fixture.errors).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('decision-retry.png')});
});

test('camera view keeps the topic, side and finish confirmation visible',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const fixture=await roomDesign(page);
  await page.goto('https://debatable.test/live-round?design=finish&mySide=con');
  await page.getByRole('button',{name:'Camera view',exact:true}).click();
  await expect(page.locator('#roundMobileSide')).toHaveText('You’re arguing AGAINST');
  await expect(page.locator('#roundMobileTopic')).toBeInViewport();
  await expect(page.locator('#conversationFinishAccept')).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath('camera-finish.png')});
  expect(fixture.errors).toEqual([]);
});

// The actual recovery function must release its UI lock even if token refresh
// never resolves. The server remains responsible for a judging lease/result.
test('a stalled recovery unlocks its retry button after the deadline',async({page})=>{
  await page.clock.install();
  await page.setContent('<button id="judgeRecoveryAction">Retry</button><div id="status"></div>');
  const html=readApp('live-round.html');
  const source=html.slice(html.indexOf('  function requestBallotRecovery(){'),html.indexOf('  // ── Durable round capture'));
  await page.addScriptTag({content:`
    var $=id=>document.getElementById(id), notices=0;
    var state={room:'test',user:{getIdToken:()=>new Promise(()=>{})},ballotRecoveryAttempts:3};
    var BALLOT_RECOVERY_MAX_ATTEMPTS=4;
    function ballotStatus(s){$('status').textContent=s;}
    function showJudgingRecoveryNotice(){notices++;}
    ${source}
    requestBallotRecovery();
  `});
  await expect(page.locator('#judgeRecoveryAction')).toBeDisabled();
  await page.clock.fastForward(46000);
  await expect(page.locator('#judgeRecoveryAction')).toBeEnabled();
  expect(await page.evaluate(()=>({pending:state.ballotRecoveryRequest,notices}))).toEqual({pending:false,notices:1});
});
