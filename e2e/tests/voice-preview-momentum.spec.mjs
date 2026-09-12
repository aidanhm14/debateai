import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../../app/' + name, import.meta.url), 'utf8');
const html = read('newvoice.html');
const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
const preview = between('let previewRound = false', '\n\nfunction show(name)');
const opening = between('function sendVoiceEvent(event){', '/* ── audio plumbing');
const handler = between('function handleEvent(e){', 'function setSpeaking(who, on){');
const cleanup = between('function cleanup(){', 'async function endRound(){');
async function boot(page) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().isNavigationRequest()
    ? r.fulfill({ contentType: 'text/html', body: html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '') }) : r.abort());
  await page.goto('https://voice-preview.test/newvoice');
  await page.addScriptTag({ content: read('js/voice-preview-momentum.js') });
  await page.addScriptTag({ content: `
    var $=id=>document.getElementById(id);
    var liveVoice=null;
    var status='live', currentMotion='Public transport should be free', scopingRound=false, autoStartPending=false;
    var turns=[{who:'you',text:'Buses help everyone reach work.'},{who:'ai',text:'But who should pay for the service?'}];
    var startBtn=$('startBtn'),startLabel=$('startLabel'),statusText=$('statusText'),capYouText=$('capYouText'),capAiText=$('capAiText');
    var timerIv=null,bargeIv=null,bargeMs=0,aiTalking=false,aiHold=0,aiTurnAt=0,openingAiTurns=0;
    var pendingTurn=false,vadSpeechActive=false,responseRequestedAt=0,awaitingResponse=false,nudgeFired=false;
    var userAnalyser=null,aiAnalyser=null,muted=false,pttOpen=false,pttMode=false,spokeOnFloor=false,noiseFloor=0;
    var lastActiveAt=0,lastAiDoneAt=0,afterResponseDone=null,vadFallbackSent=false,aiLive='';
    var events=[],sent=[],previewClosed={peer:0,channel:0,mic:0};
    var pc={close:()=>previewClosed.peer++},dc={readyState:'open',send:s=>sent.push(JSON.parse(s)),close:()=>previewClosed.channel++};
    var micStream={getTracks:()=>[{stop:()=>previewClosed.mic++}]},audioEl=null;
    var HANDOFF_RE=/^never$/;
    function reportSessionEnd(){} function stopArena(){} function paintMic(){} function setSpeaking(){}
    function vtPush(){} function renderTs(){} function maybeLiveJudge(){} function requestAiTurn(){} function sendSessionConfig(){}
    function trackVoiceEvent(name,data){events.push({name,...data});}
    function show(name){document.querySelectorAll('.view').forEach(el=>el.classList.toggle('on',el.id===name));}
    function goStep(){} function fail(message){throw Error(message);}
    window.signedIn=false;window.firebase={auth:()=>({currentUser:{isAnonymous:!signedIn}})};
    window.requireDebatableAccount=opts=>{
      window.accountAsk=opts;
      var modal=document.getElementById('testAuth');
      if(!modal){modal=document.createElement('dialog');modal.id='testAuth';document.body.appendChild(modal);}
      modal.replaceChildren();var h=document.createElement('h2');h.textContent=opts.headline;modal.appendChild(h);
      var p=document.createElement('p');p.textContent=opts.sub;modal.appendChild(p);modal.showModal();
    };
    function start(){status='live';dc={readyState:'open',send:s=>sent.push(JSON.parse(s))};requestOpeningTurn();}
    ${preview}
    ${opening}
    ${cleanup}
    ${handler}
    previewRound=true;previewConnectedAt=Date.now()-20000;previewMomentum=DBVoicePreviewMomentum.create(previewConnectedAt);show('stage');
    window.feed=(type,data={})=>handleEvent({type,...data});
    feed('response.created',{response:{id:'opener'}});feed('response.done',{response:{id:'opener',status:'completed'}});feed('output_audio_buffer.stopped',{response_id:'opener'});
    window.say=(id,text)=>{
      feed('input_audio_buffer.speech_started');feed('input_audio_buffer.speech_stopped',{item_id:id});
      feed('conversation.item.input_audio_transcription.completed',{item_id:id,transcript:text});
    };
    window.reply=id=>{
      feed('response.created',{response:{id}});feed('output_audio_buffer.started',{response_id:id});
      feed('response.output_audio_transcript.done',{transcript:'Public services still need funding. What would you cut?'});
      feed('response.done',{response:{id,status:'completed'}});
    };
  ` });
  return errors;
}

test('two heard exchanges pause the actual page and stop its mic before the account ask', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { say('u1','Everyone should be able to get to work'); reply('r1'); feed('output_audio_buffer.stopped',{response_id:'r1'}); });
  await expect(page.locator('#testAuth')).toHaveCount(0);
  await page.evaluate(() => { say('u2','General taxes can pay for the buses'); reply('r2'); });
  await expect(page.locator('#testAuth')).toHaveCount(0);
  await page.evaluate(() => feed('output_audio_buffer.stopped',{response_id:'r2'}));
  await expect(page.locator('#testAuth h2')).toHaveText('Keep talking');
  expect(await page.evaluate(() => previewClosed)).toEqual({ peer:1,channel:1,mic:1 });
  await page.evaluate(() => document.getElementById('testAuth').close());
  await expect(page.locator('#previewContinue')).toBeVisible();
  await expect(page.locator('#stage .controls')).toBeHidden();
  await expect(page.locator('#capYouText')).toHaveText('General taxes can pay for the buses');
  await expect(page.locator('#statusText')).toHaveText('PAUSED');
  expect(await page.evaluate(() => events.filter(e=>e.name==='voice_preview_finished').length)).toBe(1);
  await page.locator('#previewContinueBtn').click();
  await expect(page.locator('#testAuth')).toBeVisible(); expect(errors).toEqual([]);
});

test('sign-in resumes with the prior idea and no repeated greeting', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { finishPreview('time_limit'); document.getElementById('testAuth').close(); signedIn=true; accountAsk.onDone({uid:'named'}); });
  const resume = await page.evaluate(() => sent.at(-1));
  expect(resume.type).toBe('response.create');
  expect(resume.response.instructions).toContain('Buses help everyone reach work.');
  expect(resume.response.instructions).toContain('Do not greet them again');
  expect(resume.response.instructions).toContain('context only, not scored speeches');
  expect(await page.evaluate(() => previewResume)).toBeNull(); expect(errors).toEqual([]);
});

test('interruption lets the person finish instead of opening sign-in over their speech', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    say('u1','Work should be easy to reach');reply('r1');feed('output_audio_buffer.stopped',{response_id:'r1'});
    say('u2','Taxes can pay for public transport');reply('r2');
    feed('input_audio_buffer.speech_started');feed('output_audio_buffer.stopped',{response_id:'r2'});
  });
  await expect(page.locator('#testAuth')).toHaveCount(0);
  await page.evaluate(() => {
    feed('input_audio_buffer.speech_stopped',{item_id:'u3'});
    feed('conversation.item.input_audio_transcription.completed',{item_id:'u3',transcript:'Employers also benefit from reliable buses'});
    reply('r3');feed('output_audio_buffer.stopped',{response_id:'r3'});
  });
  await expect(page.locator('#testAuth')).toBeVisible();
});

test('the topic-free opening asks for an idea and the paused phone surface fits', async ({ page }, testInfo) => {
  await page.setViewportSize({width:390,height:844});
  const errors = await boot(page);
  await page.evaluate(() => { currentMotion='';requestOpeningTurn(); });
  expect(await page.evaluate(() => sent.at(-1).response.instructions)).toContain('What is one thing you think most people get wrong?');
  await page.evaluate(() => { finishPreview('time_limit');document.getElementById('testAuth').close(); });
  await expect(page.locator('#previewContinueBtn')).toBeVisible();
  await expect(page.locator('#stage .stage-bottom')).toHaveCSS('opacity','1');
  await expect(page.locator('#capYouText')).toHaveText('Your microphone is off.');
  expect(await page.locator('#previewContinueBtn').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.locator('#previewContinue').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('preview-paused-phone.png')});
  expect(errors).toEqual([]);
});
