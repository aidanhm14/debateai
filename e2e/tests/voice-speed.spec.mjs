import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../app/' + path, import.meta.url), 'utf8');
const html = read('newvoice.html');
const between = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));

async function boot(page, live = true) {
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (route.request().isNavigationRequest()) return route.fulfill({contentType:'text/html',body:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')});
    requests.push(route.request().url()); return route.abort();
  });
  await page.goto('https://voice-speed.test/newvoice');
  await page.clock.install();
  await page.addScriptTag({content:read('js/live-voice.js')});
  await page.addScriptTag({content:`
    var $=id=>document.getElementById(id);
    var status='live',liveVoice=null,paceKey='natural',paceUpdatePending=false;
    ${between('const PACE =', 'let difficulty =')}
    var sent=[],closed={peer:0,channel:0,mic:0},turns=[];
    var pc={close:()=>closed.peer++},dc={readyState:'open',send:s=>sent.push(JSON.parse(s)),close:()=>closed.channel++};
    var micStream={getTracks:()=>[{stop:()=>closed.mic++}]},audioEl={playbackRate:1,muted:false};
    var originalPeer=pc,originalChannel=dc,originalMic=micStream,originalAudio=audioEl;
    var startedAt=12345,roundToken='same-round',voiceSessionId='same-session',currentVoice='echo';
    var capYouText=$('capYouText'),capAiText=$('capAiText');
    var aiTalking=false,awaitingResponse=false,bargeMs=0,aiHold=0,aiTurnAt=0,lastAiDoneAt=0,openingAiTurns=1;
    var afterResponseDone=null,previewRound=false,vadFallbackSent=false,sessionTools=[],negotiatedReasoningEffort=null,roundLang='en';
    function turnWaitMs(){return 1200;} function setSpeaking(){} function maybeLiveJudge(){}
    ${between('function paintSeg(', "paintSeg($('diffSeg')")}
    ${between('function paceLabel(', 'function prepareConnectingStage(')}
    ${between('function sendSessionConfig(', '/* Spoken floor-handoff')}
    ${between('function handleEvent(e){', 'function setSpeaking(who, on){')}
    ${between("$('paceBtn').addEventListener('click'", '// Tell the server')}
    ${between("$('paceSeg').addEventListener('click'", '/* Live judge opt-in.')}
    document.querySelectorAll('.view').forEach(el=>el.classList.toggle('on',el.id==='stage'));
    window.snapshot=()=>({same:pc===originalPeer&&dc===originalChannel&&micStream===originalMic&&audioEl===originalAudio,closed,startedAt,roundToken,voiceSessionId,status,rate:audioEl.playbackRate,muted:audioEl.muted});
    window.bootLive=async()=>{
      liveVoice=DBLiveVoice.create({send:event=>sent.push(event),onReady:()=>{},onRow:row=>turns.push(row),onTranscript:row=>{(row.who==='you'?capYouText:capAiText).textContent=row.text;}});
      await liveVoice.handle({type:'session.started'});
      await liveVoice.handle({type:'session.output_transcript.delta',event_id:'speech1',delta:'Taxing soda helps',start_ms:10,end_ms:100});
    };
  `});
  if (live) await page.evaluate(() => bootLive());
  requests.length = 0;
  return { errors, requests, initial: await page.evaluate(() => snapshot()) };
}

test('speed clicks during Live speech keep the engine and transcript, with no new opening', async ({page}) => {
  const ctx = await boot(page);
  await page.locator('#paceBtn').click();
  await expect(page.locator('#paceBtn')).toHaveText('Speed: Fast');
  await page.clock.fastForward(300);
  expect(await page.evaluate(() => sent.map(e=>e.type))).toEqual(['session.thinking.append']);
  expect(await page.evaluate(() => sent[0].content)).toContain('Fast (brisk pace)');
  await page.evaluate(async () => {
    await liveVoice.handle({type:'session.thinking.appended',client_event_id:sent[0].event_id});
    await liveVoice.handle({type:'session.output_transcript.delta',event_id:'speech2',delta:' cut consumption.',start_ms:100,end_ms:200});
  });
  await expect(page.locator('#capAiText')).toHaveText('Taxing soda helps cut consumption.');
  expect(await page.evaluate(() => turns.length)).toBe(1);
  expect(await page.evaluate(() => snapshot())).toEqual(ctx.initial);
  expect(ctx.requests).toEqual([]); expect(ctx.errors).toEqual([]);
});

test('rapid changes send only the final speed and ending discards a queued change', async ({page}) => {
  const ctx = await boot(page);
  await page.evaluate(() => { $('paceBtn').click(); $('paceBtn').click(); $('paceBtn').click(); });
  await expect(page.locator('#paceBtn')).toHaveText('Speed: Normal');
  await page.clock.fastForward(300);
  expect(await page.evaluate(() => sent)).toHaveLength(1);
  expect(await page.evaluate(() => sent[0].content)).toContain('Normal (natural pace)');
  await page.locator('#paceBtn').click();
  await page.evaluate(() => { liveVoice.close(); });
  await page.clock.fastForward(300);
  expect(await page.evaluate(() => sent.map(e=>e.type))).toEqual(['session.thinking.append','session.close']);
  expect(ctx.errors).toEqual([]);
});

test('Realtime waits for response completion and patches only the latest speed', async ({page}) => {
  const ctx = await boot(page, false);
  await page.evaluate(() => { awaitingResponse=true; });
  await page.locator('#paceBtn').click();
  await page.evaluate(() => { handleEvent({type:'response.created'}); });
  await page.locator('#paceBtn').click();
  expect(await page.evaluate(() => sent)).toEqual([]);
  await page.evaluate(() => { handleEvent({type:'response.done'}); });
  expect(await page.evaluate(() => sent)).toEqual([{type:'session.update',session:{type:'realtime',audio:{output:{speed:0.95}}}}]);
  expect(await page.evaluate(() => snapshot())).toEqual(ctx.initial);
  expect(ctx.requests).toEqual([]); expect(ctx.errors).toEqual([]);
});

test('setup and disconnected speed choices persist without contacting an engine', async ({page}) => {
  const ctx = await boot(page, false);
  await page.evaluate(() => { status='idle';dc=null;setPace('calm'); });
  await expect(page.locator('#paceSeg [data-pace="calm"]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(() => localStorage.getItem('debateos-newvoice-pace'))).toBe('calm');
  await page.evaluate(() => { dc={readyState:'closed',send:()=>{throw Error('closed engine contacted');}};setPace('quick');setPace('invalid'); });
  await expect(page.locator('#paceBtn')).toHaveText('Speed: Fast');
  expect(await page.evaluate(() => sent)).toEqual([]);
  expect(ctx.errors).toEqual([]);
});
