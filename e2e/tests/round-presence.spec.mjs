import { test, expect } from '@playwright/test';
import { readApp, between } from '../helpers/offline-site.mjs';

test('a stale Ready nudge cannot announce an empty call, and reconnect clears the exit prompt', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.setContent(`<div id="callShell"></div><div id="roundReadiness"></div>
    <div id="roundAudioHelp"></div><div id="roundMobileSide"></div>
    <div id="roundMobileTopic"></div><div id="roundMobileStatus"></div>
    <div id="readyHint"></div><button id="startConvoBtn">Start conversation</button>
    <button id="startFormalBtn">Start timed speeches</button><button id="playPauseBtn">Start speech</button>`);
  await page.addScriptTag({content:readApp('js/live-room/presence.js')});
  const html=readApp('live-round.html');
  await page.addScriptTag({content:`
    var $=id=>document.getElementById(id), qs=new URLSearchParams(), prefill={source:'spar'};
    var state={room:'test',phase:'round',speechIdx:0,timerState:'ready',formatKey:'casual',user:{uid:'a'},
      proUid:'a',conUid:'b',proName:'You',conName:'Jordan',seatSeen:{a:Date.now(),b:Date.now()},
      arrivedAtMs:Date.now(),openerNudge:{uid:'b',name:'Jordan',atMs:Date.now()},motion:'Cities should be car-free.'};
    var participants={local:{local:true,user_id:'a',tracks:{audio:{persistentTrack:{readyState:'live'}}}}};
    var room={joined:true,call:{participants:()=>participants}}, mediaController={paintRoom(){}};
    var FORMATS={casual:{speeches:[{name:'Opening',time:120}]}};
    function mySide(){return 'pro';} function isSpectator(){return false;}
    function isMyTurn(){return true;} function conversationIsFinishing(){return false;}
    function prepClockRunning(){return false;} function judgeLockKey(){return 'chair';}
    function modeDoorsVisible(){return false;} function openMode(){return false;}
    function callGuidance(host){return host;} function escHtml(s){return s;}
    function noShowOpponentUid(){return 'b';} function opponentHasLeft(){return false;}
    function getRoundDocRef(){return null;}
    ${between(html,'  function roundConnectionState(){','  var roundMicTestUntil')}
    ${between(html,'  function paintRoom(){','  function flipCamera(){')}
    ${between(html,'  function nsBtn(','  // ── Speech-1 kickoff strip')}
    ${between(html,'  var OPEN_BEAT_ESCALATE_MS','  // `?openbeatdemo=')}
    var presence=DBLivePresence.create({state,room,mySide,isSpectator,roundConnectionState,
      hideNoShow,showNoShow,NOSHOW_GRACE_MS:28000});
    function refresh(){paintRoom();presence.checkOpponentPresence();}
    refresh();
  `});
  // Jordan's seat heartbeat is fresh, so the line says they are on the page.
  await expect(page.locator('#roundReadiness')).toHaveText('Jordan is here and connecting to the call.');
  await page.evaluate(()=>{ delete state.seatSeen.b; refresh(); });
  await expect(page.locator('#roundReadiness')).toHaveText('Waiting for your opponent to connect.');
  await page.evaluate(()=>{ state.seatSeen.b=Date.now(); refresh(); });
  await expect(page.locator('#openBeatCard')).toHaveCount(0);
  await expect(page.locator('#playPauseBtn')).toBeDisabled();
  await expect(page.locator('#startConvoBtn')).toBeDisabled();
  await page.clock.runFor(29000);
  await page.evaluate(()=>{ state.seatSeen.b=Date.now(); refresh(); });
  await expect(page.locator('#noShowPrompt')).toContainText('Jordan is not connected to the call.');
  await expect(page.getByRole('button',{name:'Find another',exact:true})).toBeVisible();
  // Their browser reports a denied microphone: both surfaces say so, in place.
  await page.evaluate(()=>{ state.seatCall={b:{s:'mic_blocked'}}; refresh(); });
  await expect(page.locator('#roundReadiness')).toHaveText('Jordan is here, but their browser blocked their microphone. They need to allow it and rejoin.');
  await expect(page.locator('#noShowPrompt')).toContainText('microphone is blocked in their browser');
  await page.evaluate(()=>{ state.seatCall=null; refresh(); });
  await expect(page.locator('#noShowPrompt')).toContainText('Jordan is not connected to the call.');
  await page.evaluate(()=>{ participants.peer={local:false,user_id:'b'}; refresh(); });
  await expect(page.locator('#noShowPrompt')).toBeHidden();
  await expect(page.locator('#openBeatCard')).toHaveText('Jordan is ready. You speak first.');
  await expect(page.locator('#playPauseBtn')).toBeEnabled();
  expect(await page.evaluate(()=>state.timerState)).toBe('ready');
  await page.evaluate(()=>{ delete participants.peer; refresh(); });
  await expect(page.locator('#openBeatCard')).toHaveCount(0);
  await expect(page.locator('#playPauseBtn')).toBeDisabled();
  await expect(page.locator('#noShowPrompt')).toBeHidden();
  await page.clock.runFor(29000);
  await page.evaluate(()=>refresh());
  await expect(page.locator('#noShowPrompt')).toBeVisible();
  await page.getByRole('button',{name:'Keep waiting',exact:true}).click();
  await page.evaluate(()=>refresh());
  await expect(page.locator('#noShowPrompt')).toBeHidden();
  expect(errors).toEqual([]);
});
