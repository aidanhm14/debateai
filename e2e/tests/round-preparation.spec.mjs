import {test,expect} from '@playwright/test';
import {roomDesign} from '../helpers/room-design.mjs';

async function visit(page, query='ready&format=quick'){
  const fixture=await roomDesign(page,{document:html=>html.replace('    function silence(){',`    function silence(){
      setMicActive = function(){};
      window.roomQA = {
        state: state, doc: preparationDoc, snapshot:onRoundSnapshot,
        receive: function(d){
          var changed=state.formatKey!==d.format;
          state.lastRoundDoc=d;state.formatKey=d.format;syncSpeechTiming(d);
          if(changed)renderRound();
          if(d.currentTimer)applyRemoteTimer(d.currentTimer);
          updatePlayPauseBtn();
        },
        connection:function(text){roundConnectionState=function(){return {ready:!text,text:text||'Connected'};};updatePlayPauseBtn();},
        peerReady:function(){var d=preparationDoc();d.preRoundReady=d.preRoundReady||{};d.preRoundReady['design-'+(mySide()==='pro'?'con':'pro')]=DBRoundStart.signature(d);state.lastRoundDoc=d;updatePlayPauseBtn();},
        nextTurn:function(){state.speechIdx=1;state.log=[{side:'pro',text:'Opening',durationSec:60}];renderRound();},
        nextOwnTurn:function(){state.speechIdx=2;state.log.push({side:'con',text:'Response',durationSec:60});renderRound();}
      };
  `)});
  await page.goto('https://debatable.test/live-round?design='+query);
  await expect(page.locator('#roundPreparation')).toBeVisible();
  return fixture;
}

test('choose either mode without starting, both confirm, then explicitly start conversation',async({page})=>{
  const f=await visit(page);
  await expect(page.locator('#startConvoBtn')).toBeVisible();
  await expect(page.locator('#startFormalBtn')).toBeVisible();
  await expect(page.locator('#playPauseBtn')).toBeDisabled();
  await page.locator('#startConvoBtn').click();
  await expect(page.locator('#startConvoBtn')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>roomQA.state.timerState)).toBe('ready');
  await page.locator('#roundReadyBtn').click();
  await expect(page.locator('#roundReadyStatus')).toContainText('Waiting for Jordan');
  await expect(page.locator('#playPauseBtn')).toBeDisabled();
  await page.evaluate(()=>roomQA.peerReady());
  await expect(page.locator('#playPauseBtn')).toHaveText('▶ Start conversation');
  await expect(page.locator('#roundReadyStatus')).toContainText('has not started');
  await page.locator('#playPauseBtn').click();
  await expect(page.locator('#roundPreparation')).toBeHidden();
  await expect(page.locator('#roundStartInstruction')).toContainText('Conversation started');
  await expect(page.locator('#playPauseBtn')).toHaveText('⏸ Pause');
  await expect(page.locator('#endSpeechBtn')).toBeVisible();
  expect(f.errors).toEqual([]);
});

test('timed start, pause, resume and both turn handoffs retain explicit instructions',async({page})=>{
  const f=await visit(page);
  await page.locator('#roundReadyBtn').click();
  await expect(page.locator('#playPauseBtn')).toHaveText('▶ Start my speech');
  await expect(page.locator('#roundStartInstruction')).toContainText('before you speak');
  await page.locator('#playPauseBtn').click();
  await expect(page.locator('#roundStartInstruction')).toContainText('Click End speech');
  await page.locator('#playPauseBtn').click();
  await expect(page.locator('#roundStartInstruction')).toContainText('Resume before continuing');
  await page.locator('#playPauseBtn').click();
  await page.evaluate(()=>roomQA.nextTurn());
  await expect(page.locator('#playPauseBtn')).toBeDisabled();
  await expect(page.locator('#roundStartInstruction')).toContainText('Jordan');
  await page.evaluate(()=>roomQA.nextOwnTurn());
  await expect(page.locator('#playPauseBtn')).toBeEnabled();
  await expect(page.locator('#roundStartInstruction')).toContainText('Click Start my speech before you speak');
  await expect(page.locator('#roundPreparation')).toBeHidden();
  expect(f.errors).toEqual([]);
});

test('Against can choose and get ready but For owns the first timed start',async({page})=>{
  const f=await visit(page,'ready&format=quick&mySide=con');
  await page.locator('#roundReadyBtn').click();
  await expect(page.locator('#roundReadyStatus')).toContainText('Both ready');
  await expect(page.locator('#playPauseBtn')).toBeDisabled();
  await expect(page.locator('#roundStartInstruction')).toContainText('Sam speaks first');
  await page.locator('#startConvoBtn').click();
  await page.locator('#roundReadyBtn').click();
  await page.evaluate(()=>roomQA.peerReady());
  await expect(page.locator('#playPauseBtn')).toBeEnabled();
  expect(f.errors).toEqual([]);
});

test('changing timing after Ready invalidates agreement and withdrawing Ready locks start',async({page})=>{
  await visit(page);
  await page.locator('#roundReadyBtn').click();
  await expect(page.locator('#playPauseBtn')).toBeEnabled();
  await page.locator('#roundReadyBtn').click();
  await expect(page.locator('#playPauseBtn')).toBeDisabled();
  await page.locator('#roundReadyBtn').click();
  await page.locator('#roundTimingOptions>summary').click();
  await page.getByLabel('Opening time for each side').selectOption('60');
  await expect(page.locator('#roundReadyBtn')).toHaveText('Ready');
  await expect(page.locator('#playPauseBtn')).toBeDisabled();
});

test('disconnection and denied microphone explain the disabled start and recover',async({page})=>{
  await visit(page,'readyset&format=quick');
  for(const reason of ['Waiting for your opponent to connect.','Connected. Check your microphone before starting.']){
    await page.evaluate(text=>roomQA.connection(text),reason);
    await expect(page.locator('#roundReadiness')).toHaveText(reason);
    await expect(page.locator('#playPauseBtn')).toBeDisabled();
    await expect(page.locator('#playPauseBtn')).toHaveText('Waiting to start');
  }
  await page.evaluate(()=>roomQA.connection(''));
  await expect(page.locator('#playPauseBtn')).toBeEnabled();
});

test('failed Ready save remains unready and exposes retryable error',async({page})=>{
  await visit(page);
  await page.evaluate(()=>{window.realAct=DBRoundStart.act;DBRoundStart.act=()=>Promise.reject(new Error('Could not connect. Try again.'));});
  await page.locator('#roundReadyBtn').click();
  await expect(page.locator('#roundPreparationError')).toContainText('Try again');
  await expect(page.locator('#playPauseBtn')).toBeDisabled();
  await expect(page.locator('#roundReadyBtn')).toBeEnabled();
  await page.evaluate(()=>DBRoundStart.act=window.realAct);
  await page.locator('#roundReadyBtn').click();
  await expect(page.locator('#playPauseBtn')).toBeEnabled();
});

test('a refreshed timed speaker restores the saved clock instead of starting again',async({page})=>{
  const f=await visit(page);
  await page.evaluate(()=>{
    var d=Object.assign({},roomQA.doc(),{currentTimer:{speechIdx:0,state:'running',startMs:Date.now()-30000,
      accumulatedMs:0,totalSec:240,updatedAtMs:Date.now()},speechTiming:{version:1,seconds:[240,240,180,180,120,120]},speechTimingLocked:true});
    roomQA.snapshot(d,roomQA.state.room);
  });
  await expect(page.locator('#roundPreparation')).toBeHidden();
  await expect(page.locator('#playPauseBtn')).toHaveText('⏸ Pause');
  await expect(page.locator('#roundStartInstruction')).toContainText('Your speech is running');
  expect(f.errors).toEqual([]);
});

test('the initiating client uses its own clock until the server timestamp resolves',async({page})=>{
  await visit(page,'readyset&format=quick');
  await page.evaluate(()=>{DBRoomClock.localStart=()=>Date.now()+60000;});
  await page.locator('#playPauseBtn').click();
  await expect(page.locator('#playPauseBtn')).toHaveText('⏸ Pause');
  expect(await page.evaluate(()=>roomQA.state.timerStart<=Date.now())).toBe(true);
});

for(const width of [360,390,1360])test(`instructional controls stay readable and clickable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const f=await visit(page);
  await page.locator('#roundReadyBtn').scrollIntoViewIfNeeded();
  await page.locator('#roundReadyBtn').click();
  await page.locator('#playPauseBtn').scrollIntoViewIfNeeded();
  await expect(page.locator('#playPauseBtn')).toBeInViewport();
  if(width<=760)expect(await page.locator('#roundActionDock').evaluate(e=>getComputedStyle(e).zIndex)).toBe('auto');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`work/preparation-${width}.png`,fullPage:true});
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
  expect(await page.locator('#roundPreparation h3').first().evaluate(e=>getComputedStyle(e).color)).toBe('rgb(26, 26, 31)');
  await page.screenshot({path:`work/preparation-${width}-light.png`,fullPage:true});
  expect(f.errors).toEqual([]);
});
