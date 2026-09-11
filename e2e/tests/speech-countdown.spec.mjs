import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('../../app/' + name, import.meta.url), 'utf8');
const live = read('live-round.html');
const voice = read('voice-debate.html');
const school = read('high-school.html');
function between(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error('Missing source boundary: ' + start);
  return source.slice(from, to);
}

async function liveClock(page, open = false) {
  await page.clock.install({ time: new Date('2026-09-07T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-07T12:00:10Z'));
  await page.setContent('<section class="judge-overview">AI judge</section>' +
    '<span id="timerNum"></span><span id="rmbTimerNum"></span>' +
    '<div id="timerBar"></div><span id="timerTarget"></span><p id="overtimeNote" hidden></p>' +
    '<textarea id="speechText">The argument before the cutoff.</textarea>' +
    '<div id="rmbRec"><span id="rmbRecLabel"></span><span id="rmbRecElapsed"></span></div>');
  await page.addScriptTag({ content: `
    var $ = id => document.getElementById(id);
    var state = {phase:'round', log:[], formatKey:${JSON.stringify(open ? 'open' : 'quick')}, timerState:'running', timerElapsed:0,
      timerStart:Date.now(), timerTotalSec:60, speechIdx:0, overCut:{}, timeExt:{}, proUid:'', conUid:''};
    var FORMATS = {quick:{speeches:[{time:60}]},open:{open:true,speeches:[{time:0}]}};
    function isMyTurn(){return true;} function isSpectator(){return false;}
    ${between(live, '  function openMode(){', '\n')}
    ${between(live, '  function fmtTime(sec){', '  function toast(')}
    ${between(live, '  var judgeOverviewFadeTimer = 0;', '  function updateRoomStage(){')}
    ${between(live, '  function getElapsed(){', '  function prepareTimer(')}
    ${between(live, '  function fmtElapsed(ms){', '\n  function ')}
    ${between(live, '  function setRecUi(', '\n  // Ask for a display capture')}
    setInterval(drawTimer, 100); drawTimer();
  ` });
}

test('timed speech counts down, freezes paused, holds zero in overtime and accepts an extension', async ({ page }) => {
  await liveClock(page);
  await expect(page.locator('#timerNum')).toHaveText('1:00');
  await page.clock.runFor(1000);
  await expect(page.locator('#timerNum')).toHaveText('0:59');
  await expect(page.locator('#rmbTimerNum')).toHaveText('0:59');
  await page.evaluate(() => { state.timerElapsed = getElapsed(); state.timerState = 'paused'; drawTimer(); });
  await page.clock.runFor(10000);
  await expect(page.locator('#timerNum')).toHaveText('0:59');
  await page.evaluate(() => { state.timerStart = Date.now(); state.timerState = 'running'; });
  await page.clock.runFor(58500);
  await expect(page.locator('#timerNum')).toHaveText('0:01');
  await page.clock.runFor(500);
  await expect(page.locator('#timerNum')).toHaveText('0:00');
  await expect(page.locator('#overtimeNote')).toBeHidden();
  await page.clock.runFor(16000);
  await expect(page.locator('#timerNum')).toHaveText('0:00');
  await expect(page.locator('#rmbTimerNum')).toHaveText('0:00');
  await expect(page.locator('#overtimeNote')).toBeVisible();
  expect(await page.evaluate(() => getElapsed())).toBe(76);
  expect(await page.evaluate(() => state.overCut[0])).toBeGreaterThan(0);
  await page.evaluate(() => { state.timeExt[0] = {secs:60, accepts:{}}; applyTimeExt(); setRecUi(true, 76000); });
  await expect(page.locator('#timerNum')).toHaveText('0:44');
  await expect(page.locator('#overtimeNote')).toBeHidden();
  expect(await page.evaluate(() => state.overCut[0])).toBeUndefined();
  await expect(page.locator('#rmbRecElapsed')).toBeHidden();
});

test('conversation keeps counting up beyond a timed allotment without an overtime cutoff', async ({ page }) => {
  await liveClock(page, true);
  await expect(page.locator('#timerNum')).toHaveText('0:00');
  await page.clock.runFor(76000);
  await expect(page.locator('#timerNum')).toHaveText('1:16');
  await expect(page.locator('#rmbTimerNum')).toHaveText('1:16');
  await expect(page.locator('#overtimeNote')).toBeHidden();
  expect(await page.evaluate(() => state.overCut[0])).toBeUndefined();
  await page.evaluate(() => setRecUi(true, 76000));
  await expect(page.locator('#rmbRecElapsed')).toHaveText('1:16');
});

test('judge introduction fades after a minute of speech, excludes pauses and returns for the decision', async ({ page }) => {
  await liveClock(page, true);
  const introduction = page.locator('.judge-overview');
  await page.clock.runFor(59000);
  await expect(introduction).toBeVisible();
  await page.evaluate(() => { state.timerElapsed = getElapsed(); state.timerState = 'paused'; drawTimer(); });
  await page.clock.runFor(120000);
  await expect(introduction).toBeVisible();
  // The same minute may span multiple short speeches.
  await page.evaluate(() => {
    state.log = [{durationSec:20}]; state.timerElapsed = 39;
    state.timerStart = Date.now(); state.timerState = 'running'; drawTimer();
  });
  await page.clock.runFor(1000);
  await expect(introduction).toHaveClass(/is-dismissed/);
  await page.clock.runFor(300);
  await expect(introduction).toBeHidden();
  await page.evaluate(() => { state.phase = 'ballot'; drawTimer(); });
  await expect(introduction).toBeVisible();
  await page.evaluate(() => { state.phase = 'setup'; drawTimer(); });
  await page.clock.runFor(120000);
  await expect(introduction).toBeVisible();
});

test('voice speech clocks use their phase countdown and free conversation uses elapsed time', async ({ page }) => {
  await page.addScriptTag({ content: `
    var mode='apda', speechIdx=0, phase='speaking', phaseElapsed=41, elapsed=327, GRACE_SEC=30;
    var APDA_SEQUENCE=[{durSec:240}];
    ${between(voice, 'function fmtTime(sec) {', '// Per-session cap.')}
    ${between(voice, '  function activeClockText() {', '  function renderMinimized() {')}
  ` });
  expect(await page.evaluate(() => activeClockText())).toBe('3:19');
  expect(await page.evaluate(() => { phaseElapsed=241; return activeClockText(); })).toBe('0:00');
  expect(await page.evaluate(() => { phase='prep'; phaseElapsed=1; return activeClockText(); })).toBe('0:29');
  expect(await page.evaluate(() => { phase='done'; return activeClockText(); })).toBe('0:00');
  expect(await page.evaluate(() => { mode='quickclash'; return activeClockText(); })).toBe('5:27');
});

test('speech-reading drill displays remaining time and holds zero while retaining actual duration', async ({ page }) => {
  await page.clock.install();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ path: new URL('../../app/node_modules/react/umd/react.development.js', import.meta.url).pathname });
  await page.addScriptTag({ path: new URL('../../app/node_modules/react-dom/umd/react-dom.development.js', import.meta.url).pathname });
  await page.addScriptTag({ content: `
    var {useState,useRef,useEffect}=React;
    var SPEED_DRILL_KEY='test-drill';function loadDrillHistory(){return [];}function saveDrillHistory(){}
    ${between(school, 'function SpeedDrill() {', '\nfunction ')}
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(SpeedDrill));
  ` });
  await page.getByRole('button', { name: /Start/i }).click();
  const timer = page.getByLabel('Time remaining');
  const initial = await timer.textContent();
  const seconds = text => text.split(':').reduce((m, s) => m * 60 + Number(s), 0);
  expect(seconds(initial)).toBeGreaterThan(0);
  await page.clock.runFor(1000);
  expect(seconds(await timer.textContent())).toBe(seconds(initial) - 1);
  await page.clock.runFor((seconds(initial) + 10) * 1000);
  await expect(timer).toHaveText('0:00');
  await page.getByRole('button', { name: 'Done. Stop Timer.' }).click();
  await expect(page.getByText('Drill Results')).toBeVisible();
  await expect(page.getByText('0:00', {exact:true})).toHaveCount(0);
});

test('director clocks hold zero after a timed speech expires', async ({ page }) => {
  const director = read('director.html');
  await page.setContent('<span data-clock="round"></span>');
  await page.addScriptTag({content:`
    var state={serverSkew:0, rooms:[{room:'round',timer:{updatedAtMs:Date.now(),state:'paused',accumulatedMs:61000,totalSec:60}}]};
    ${between(director, '  function tickClocks(){', '\n})();')}
    tickClocks();
  `});
  await expect(page.locator('[data-clock]')).toHaveText('0:00');
  await page.evaluate(() => {state.rooms[0].timer.accumulatedMs=1000;tickClocks();});
  await expect(page.locator('[data-clock]')).toHaveText('0:59');
});

test('judge microphone capture counts down to its recording limit', async ({ page }) => {
  const judge = read('judge.html');
  await page.clock.install({ time: new Date('2026-09-07T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-07T12:00:10Z'));
  await page.setContent('<span id="recTime"></span>');
  await page.addScriptTag({content:`
    var $=id=>document.getElementById(id), startedAt=Date.now(), MAX_MS=120000, tickTimer, finished=false;
    function finish(){finished=true;clearInterval(tickTimer);}
    ${between(judge, '  function fmtTime(ms){', '  function pickMime(){')}
    ${between(judge, '      tickTimer = setInterval(function(){', '      // Phones lock')}
  `});
  await page.clock.runFor(1000);
  await expect(page.locator('#recTime')).toHaveText('1:59');
  await page.clock.runFor(120000);
  await expect(page.locator('#recTime')).toHaveText('0:00');
  expect(await page.evaluate(() => finished)).toBe(true);
});

test('flow recording starts at its full limit and counts down to zero', async ({ page }) => {
  const flow = read('flow.html');
  await page.clock.install({ time: new Date('2026-09-07T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-07T12:00:10Z'));
  await page.setContent('<span id="recordTime"></span>');
  await page.addScriptTag({content:`
    var $=id=>document.getElementById(id), recordStarted=Date.now(), MAX_RECORD_MS=720000, finished=false, timer;
    function stopRecording(){finished=true;clearInterval(timer);}
    ${between(flow, 'function tickRecording(){', 'tickRecording();timer=')}
    tickRecording();timer=setInterval(tickRecording,250);
  `});
  await expect(page.locator('#recordTime')).toHaveText('12:00');
  await page.clock.runFor(1000);
  await expect(page.locator('#recordTime')).toHaveText('11:59');
  await page.clock.runFor(720000);
  await expect(page.locator('#recordTime')).toHaveText('0:00');
  expect(await page.evaluate(() => finished)).toBe(true);
});
