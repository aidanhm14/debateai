import { test, expect } from '@playwright/test';
import { offlineSite, readApp, between } from '../helpers/offline-site.mjs';

for (const width of [360, 1360]) {
  test(`AI topic and side choices stay independent at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await offlineSite(page);
    await page.goto('https://debatable.test/newvoice');
    await page.locator('#wizProgress button').nth(1).click();
    await page.locator('#claimInput').fill('Employers should offer a four-day workweek.');
    const against = page.locator('#topicSideSeg [data-pick="against"]');
    await against.click();
    await expect(against).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#topicSideNote')).toContainText('You argue against');
    await expect(page.locator('.wiz-step[data-step="2"]')).toHaveClass(/on/);
    await page.locator('#topicSideSeg [data-pick="for"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#claimInput')).toHaveValue('Employers should offer a four-day workweek.');
    await against.click();
    await page.locator('#topicNextBtn').click();
    await expect(page.locator('.wiz-step[data-step="4"]')).toHaveClass(/on/);
    await page.locator('#wizProgress button').nth(2).click();
    await expect(page.locator('#sideSeg [data-pick="against"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#sideSeg [data-pick="for"]').click();
    await expect(page.locator('.wiz-step[data-step="3"]')).toHaveClass(/on/);
    await page.locator('#wizProgress button').nth(1).click();
    await expect(page.locator('#topicSideSeg [data-pick="for"]')).toHaveAttribute('aria-pressed', 'true');
    await against.click();
    await page.locator('#shuffleBtn').click();
    await expect(page.locator('#claimInput')).not.toHaveValue('Employers should offer a four-day workweek.');
    await expect(against).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#wizProgress button').nth(4).click();
    await expect(page.locator('#wizSummary')).toContainText('Against it');
    await page.reload();
    await page.locator('#wizProgress button').nth(1).click();
    await expect(against).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(fixture.requests.some(r => /realtime|live-voice|voice-preview/.test(r.path))).toBe(false);
    expect(fixture.errors).toEqual([]);
  });
}

async function liveFixture(page, side = 'pro', width = 390) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    const auth = { currentUser: null, onAuthStateChanged: () => () => {} };
    const firestore = () => null;
    firestore.FieldValue = { serverTimestamp: () => 1, delete: () => '__delete__', increment: n => n, arrayUnion: (...uids) => uids };
    window.firebase = { apps: [{}], auth: () => auth, firestore };
  });
  const writes = [];
  await page.exposeFunction('fixtureUpdate', async data => { writes.push(data); });
  const fixture = await offlineSite(page, { document: source => source
    .replace("getRoundDocRef = function(){ return null; };", 'getRoundDocRef = function(){ return {update:window.fixtureUpdate,set:window.fixtureUpdate}; };')
    .replace("state.proUid = ''; state.conUid = ''; state.proUid2 = ''; state.conUid2 = '';",
      "state.proUid = 'a'; state.conUid = 'b'; state.proUid2 = ''; state.conUid2 = ''; state.user={uid:prefill.mySide==='con'?'b':'a'}; window.fixtureState=state; window.fixtureSnapshot=onRoundSnapshot;")
  });
  await page.goto('https://debatable.test/live-round?design=ready&format=quick&mySide=' + side);
  return { ...fixture, writes };
}

test('live swaps require the peer, support declining, and update both sides', async ({ browser }) => {
  const a = await browser.newPage(), b = await browser.newPage();
  try {
    const fa = await liveFixture(a), fb = await liveFixture(b, 'con', 1360);
    let round = { proUid: 'a', conUid: 'b', proName: 'Sam', conName: 'Jordan' };
    async function deliver() {
      for (const f of [fa, fb]) for (const write of f.writes.splice(0)) {
        for (const [key, value] of Object.entries(write)) {
          if (value === '__delete__') delete round[key]; else round[key] = value;
        }
      }
      await a.evaluate(d => fixtureSnapshot(d), round);
      await b.evaluate(d => fixtureSnapshot(d), round);
    }
    await expect(a.locator('#roundSwitchSides')).toBeVisible();
    await expect(b.locator('#roundSwitchSides')).toBeVisible();
    await a.locator('#roundSwitchSides').click();
    await expect(a.locator('#roundSwitchSides')).toBeDisabled();
    await expect(a.locator('#roundOwnSide')).toContainText('FOR');
    await deliver();
    await expect(b.locator('#shMotion #swapPropose')).toBeVisible();
    await b.getByRole('button', { name: 'Keep my side', exact: true }).click();
    await deliver();
    await expect(a.locator('#swapPropose')).toBeHidden();
    await expect(a.locator('#roundOwnSide')).toContainText('FOR');
    await b.locator('#roundSwitchSides').click();
    await deliver();
    await a.locator('#swpActions').getByRole('button', { name: 'Switch sides', exact: true }).click();
    await deliver();
    await expect(a.locator('#roundOwnSide')).toContainText('AGAINST');
    await expect(b.locator('#roundOwnSide')).toContainText('FOR');
    await a.locator('#rosterOppDm').click();
    await expect(a.locator('#dmOppName')).toHaveText('Jordan');
    await expect(a.locator('#dmThreadLink')).toHaveAttribute('href', '/messages?dm=b&name=Jordan');
    await a.keyboard.press('Escape');
    await expect(a.locator('#rosterOppDm')).toBeFocused();
    await a.locator('#roundSwitchSides').click();
    await deliver();
    await a.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await deliver();
    await expect(b.locator('#swapPropose')).toBeHidden();
    for (const page of [a, b]) {
      await page.evaluate(() => { fixtureState.timerState = 'running'; __lrSyncSideSwap(); });
      await expect(page.locator('#roundSwitchSides')).toBeHidden();
      await expect(page.locator('#rosterOppDm')).toBeVisible();
    }
    expect(fa.errors).toEqual([]); expect(fb.errors).toEqual([]);
  } finally { await a.close(); await b.close(); }
});

test('message composer waits for Send, preserves failed drafts, and addresses only the opponent', async ({ page }) => {
  const fixture = await liveFixture(page);
  const dm = between(readApp('live-round.html'), '  function roundDmTarget(seat){', '  // Call card controls.');
  await page.evaluate(() => {
    window.dmWrites = []; window.failDm = false;
    window.mockDmDb = { collection: collection => ({ doc: thread => ({
      set: async data => { if (window.failDm) throw Error('offline'); window.dmWrites.push({ collection, thread, data }); },
      collection: sub => ({ doc: () => ({ id: 'message-1', set: async data => { window.dmWrites.push({ collection: sub, thread, data }); } }) })
    }) }) };
    for (const id of ['rosterOppDm', 'ballotOppDm', 'dmSend', 'dmModal']) {
      const node = document.getElementById(id), clone = node.cloneNode(true);
      delete clone._dmWired; node.replaceWith(clone);
    }
    fixtureState.user.getIdToken = async () => 'fixture';
  });
  await page.addScriptTag({ content: `(function(){var state=window.fixtureState, firebaseDb=window.mockDmDb, $=id=>document.getElementById(id);
    function mySide(){return state.user.uid===state.proUid?'pro':'con';}function isSpectator(){return ![state.proUid,state.conUid].includes(state.user.uid);}
    function publicNameOf(){return 'Sam';}function gtag(){} ${dm} })();` });
  await page.locator('#rosterOppDm').click();
  await expect(page.locator('#dmText')).toBeFocused();
  await page.locator('#dmText').fill('Good round. Want to debate again?');
  expect(await page.evaluate(() => dmWrites)).toEqual([]);
  await page.evaluate(() => { window.failDm = true; });
  await page.locator('#dmSend').click();
  await expect(page.locator('#dmStatus')).toContainText('Could not send');
  await expect(page.locator('#dmText')).toHaveValue('Good round. Want to debate again?');
  await page.evaluate(() => { window.failDm = false; });
  await page.locator('#dmSend').click();
  await expect(page.locator('#dmStatus')).toContainText('Sent.');
  const writes = await page.evaluate(() => dmWrites);
  expect(writes[0].thread).toBe('a_b');
  expect(writes[0].data.participants).toEqual(['a', 'b']);
  expect(writes[1].data).toMatchObject({ fromUid: 'a', fromName: 'Sam', text: 'Good round. Want to debate again?' });
  expect(fixture.errors).toEqual([]);
});

test('typed setup applies either side and retains the chosen default on skip', async ({ page }) => {
  await page.goto('about:blank');
  const flow = between(readApp('practice.html'), '  var startSetupFlow =', '  // The plan card,');
  await page.addScriptTag({ content: `var side='con', chosenSide='', motion='',
    judgeParadigm='hs_coach', judgeManner='plain', judgeDetail='medium',
    simpleJudgeCards=[{key:'hs_coach',title:'Balanced',desc:''}], JUDGE_MANNERS=[{key:'plain'}], JUDGE_DETAILS=[{key:'medium'}],
    SIMPLE_TOPIC_CATS=[], debateOfWeek={motion:'Employers should offer a four-day workweek.'};
    function chooseFormat(){}function setSide(s){chosenSide=s;}function setMotion(s){motion=s;}function setSimpleStartPending(){}
    function saveJudgeParadigm(){}function saveCustomParadigm(){}function setJudgeManner(){}function setJudgeDetail(){}
    window.ArcadeFlow={start:cfg=>window.fixtureFlow=cfg};${flow}startSetupFlow();` });
  expect(await page.evaluate(() => fixtureFlow.steps.find(s => s.key === 'side').default)).toBe('con');
  for (const side of ['pro', 'con']) {
    await page.evaluate(side => fixtureFlow.onDone({ topic: 'motd', side }), side);
    expect(await page.evaluate(() => chosenSide)).toBe(side);
  }
  await page.evaluate(() => fixtureFlow.onSkip(Object.fromEntries(fixtureFlow.steps.map(s => [s.key, s.default]))));
  expect(await page.evaluate(() => chosenSide)).toBe('con');
});
