import { test, expect } from '@playwright/test';
import { roomDesign } from '../helpers/room-design.mjs';

async function visit(page, { api, arm = 'exposed' } = {}) {
  const calls = [];
  const fixture = await roomDesign(page, {
    document: html => html.replace('    function silence(){', `    function silence(){
      window.voteQA = {
        init: function(arm){
          window.getAppCheckToken = function(){ return Promise.resolve('fixture-app-check'); };
          state.room = 'room-vote-fixture'; state.forceSpectate = true;
          var uid;
          for(var i=0;i<100;i++){
            uid='viewer-'+i;
            if(((svHash32(state.room+':'+uid)%1000)<250) === (arm==='holdout'))break;
          }
          state.user = {uid:uid,getIdToken:function(){return Promise.resolve('fixture-token');}};
          document.body.classList.add('spectator-mode');
          svInitSpectator();
        },
        finish: function(unresolved){
          document.body.classList.remove('spec-show-audience');
          $('roundView').classList.add('hidden');
          $('ballotView').classList.remove('hidden');
          $('ballotLoading').classList.add('hidden');
          state.formatKey='quick';
          state.log=[logEntry(0,P1,60),logEntry(1,C1,60),logEntry(2,P2,45)];
          state.phase='ballot-rendered'; state.ballotRevealMode='instant';
          if(unresolved)renderUnresolvedBallot({outcome:'no_contest',reason:'Too little speech was captured.'});
          else renderBallot(BALLOT);
        },
        submit: svRestate,
        aggregate: loadRoomShift,
        repeat: svOnBallot
      };
    `),
    api: async (url, request) => {
      if (url.pathname !== '/api/log-opinion-delta') return;
      const body = request.postDataJSON(); calls.push(body);
      const result = api && await api(body, calls);
      return result || { json: body.action === 'create' ? { ok: true, id: 'saved-vote', arm } : { ok: true } };
    },
  });
  await page.goto('https://debatable.test/live-round?design=spectator');
  await page.evaluate(arm => voteQA.init(arm), arm);
  await page.locator('[data-sm="audience"]').click();
  await expect(page.locator('#svPanel')).toBeVisible();
  return { ...fixture, calls };
}
async function openAnswer(page) {
  await page.locator('#svSides [data-svside="pro"]').click();
  await page.locator('#svLockIn').click();
  await expect(page.locator('#svTap')).toBeVisible();
}
async function finish(page, unresolved = false) {
  await page.evaluate(unresolved => voteQA.finish(unresolved), unresolved);
  await expect(page.locator('#roundView')).toBeHidden();
  await expect(page.locator('#ballotAudienceHost #svRestate')).toBeVisible();
}

for (const width of [390, 1280]) {
  test(`audience closing vote stays visible with results and saves at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const f = await visit(page);
    await openAnswer(page);
    await page.locator('#svTap').click();
    await finish(page);
    await expect(page.locator('#ballotResult .verdict-headline')).toHaveText('Jordan wins');
    if (width < 1000) await expect.poll(() => page.evaluate(() =>
      document.getElementById('svTitle').getBoundingClientRect().top >= document.getElementById('jitsiPane').getBoundingClientRect().bottom
    )).toBe(true);
    if (process.env.VOTE_SCREENSHOT_DIR) await page.locator('#ballotAudienceHost').screenshot({ path: process.env.VOTE_SCREENSHOT_DIR + '/audience-vote-form-' + width + '.png' });
    await expect(page.locator('#svPanel')).toContainText('The AI judge decides the round winner.');
    await page.locator('#svSidesAfter [data-svside="con"]').click();
    await page.locator('#svRestate').click();
    await expect(page.locator('#svTitle')).toHaveText('Your answer is saved.');
    await expect(page.locator('#svDone')).toContainText('ended Jordan');
    await page.evaluate(() => voteQA.repeat());
    await expect(page.locator('#svRestate')).toBeHidden();
    const saved = f.calls.find(c => c.sideAfter);
    expect(saved.sideAfter).toBe('con'); expect(saved.movedAt).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(f.errors).toEqual([]);
    if (process.env.VOTE_SCREENSHOT_DIR) await page.locator('#ballotAudienceHost').screenshot({ path: process.env.VOTE_SCREENSHOT_DIR + '/audience-vote-' + width + '.png' });
  });
}

test('slow closing save blocks duplicates and never shows success early', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = await visit(page, { api: body => body.sideAfter && gate });
  await openAnswer(page); await finish(page);
  await page.locator('#svRestate').click();
  await expect(page.locator('#svRestate')).toHaveText('Saving…');
  await expect(page.locator('#svRestate')).toBeDisabled();
  await expect(page.locator('#svDone')).toBeHidden();
  await page.evaluate(() => voteQA.aggregate());
  expect(f.requests.filter(r => r.path === '/api/persuasion-index')).toHaveLength(0);
  await page.evaluate(() => { voteQA.submit(); voteQA.submit(); voteQA.repeat(); });
  expect(f.calls.filter(c => c.sideAfter)).toHaveLength(1);
  release({ json: { ok: true } });
  await expect(page.locator('#svTitle')).toHaveText('Your answer is saved.');
  await page.evaluate(() => voteQA.aggregate());
  await expect.poll(() => f.requests.filter(r => r.path === '/api/persuasion-index').length).toBe(1);
  expect(f.errors).toEqual([]);
});

for (const bad of [{ status: 503, json: { error: 'offline' } }, { json: { ok: false } }, { contentType: 'application/json', body: '{' }]) {
  test(`failed closing response ${JSON.stringify(bad)} retains answer for retry`, async ({ page }) => {
    let failed = false;
    const f = await visit(page, { api: body => {
      if (body.sideAfter && !failed) { failed = true; return bad; }
    } });
    await openAnswer(page); await finish(page);
    await page.locator('#svSidesAfter [data-svside="con"]').click();
    await page.locator('#svConfAfter').fill('80');
    await page.locator('#svRestate').click();
    await expect(page.locator('#svRestate')).toHaveText('Retry saving');
    await expect(page.locator('[data-sv-phase="after"] [role="status"]')).toContainText('could not confirm');
    await expect(page.locator('#svDone')).toBeHidden();
    await expect(page.locator('#svConfAfter')).toHaveValue('80');
    await page.locator('#svRestate').click();
    await expect(page.locator('#svTitle')).toHaveText('Your answer is saved.');
    const writes = f.calls.filter(c => c.sideAfter);
    expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]);
    expect(f.errors).toEqual([]);
  });
}

test('opening retry keeps the same identity and a decision during save cannot return to the live panel', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = await visit(page, { api: (body, calls) => {
    if (body.action === 'create') return calls.length === 1 ? { status: 503, json: { error: 'unavailable' } } : gate;
  } });
  await page.locator('#svLockIn').click();
  await expect(page.locator('#svLockIn')).toHaveText('Retry saving');
  await expect(page.locator('#svTap')).toBeHidden();
  await page.locator('#svLockIn').click();
  await expect(page.locator('#svLockIn')).toHaveText('Saving…');
  await finish(page);
  await page.locator('#svRestate').click();
  await expect(page.locator('#svRestate')).toHaveText('Saving…');
  expect(f.calls).toHaveLength(2); expect(f.calls[1]).toEqual(f.calls[0]);
  release({ json: { ok: true, id: 'recovered-vote' } });
  await expect(page.locator('#svTitle')).toHaveText('Your answer is saved.');
  expect(f.calls.at(-1).id).toBe('recovered-vote');
  await expect(page.locator('#svTap')).toBeHidden();
  expect(f.errors).toEqual([]);
});

test('holdout final answer survives failed silent create and unresolved result', async ({ page }) => {
  let first = true;
  const f = await visit(page, { arm: 'holdout', api: body => {
    if (body.action === 'create' && first) { first = false; return { status: 500, json: {} }; }
  } });
  await expect(page.locator('#svLockIn')).toBeHidden();
  await finish(page, true);
  await page.locator('#svRestate').click();
  await expect(page.locator('#svTitle')).toHaveText('Your answer is saved.');
  expect(f.calls.filter(c => c.action === 'create')).toHaveLength(2);
  expect(f.calls[1].requestId).toBe(f.calls[0].requestId);
  expect(f.errors).toEqual([]);
});

test('timed out save becomes retryable and preserves the submitted answer', async ({ page }) => {
  await page.clock.install();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let first = true;
  const f = await visit(page, { api: body => {
    if (body.sideAfter && first) { first = false; return gate; }
  } });
  await openAnswer(page); await finish(page);
  await page.locator('#svRestate').click();
  await expect(page.locator('#svRestate')).toHaveText('Saving…');
  await page.clock.fastForward(16000);
  await expect(page.locator('#svRestate')).toHaveText('Retry saving');
  release({ json: { ok: true } });
  await page.locator('#svRestate').click();
  await expect(page.locator('#svTitle')).toHaveText('Your answer is saved.');
  expect(f.calls.filter(c => c.sideAfter)).toHaveLength(2);
  expect(f.errors).toEqual([]);
});
