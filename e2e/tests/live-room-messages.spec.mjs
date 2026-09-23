import { test, expect } from '@playwright/test';
import { offlineSite } from '../helpers/offline-site.mjs';

async function room(page, { viewer = true, width = 1360 } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    window.dmWrites = []; window.dmThreads = {}; window.failDm = false;
    let nextId = 0;
    window.mockDmDb = { collection: collection => ({ doc: thread => ({
      set: async data => {
        if (window.failDm) throw Error('offline');
        const old = window.dmThreads[thread];
        const incoming = data.participants.union;
        const participants = [...new Set([...(old?.participants || []), ...incoming])];
        if (old && JSON.stringify(participants) !== JSON.stringify(old.participants)) throw Error('frozen participants');
        window.dmThreads[thread] = { ...data, participants };
        window.dmWrites.push({ collection, thread, data: window.dmThreads[thread] });
      },
      collection: sub => ({ doc: () => ({ id: 'msg-' + (++nextId), set: async data => {
        window.dmWrites.push({ collection: sub, thread, data });
      } }) })
    }) }) };
    const auth = { currentUser: null, onAuthStateChanged: () => () => {} };
    const firestore = () => null;
    firestore.FieldValue = { serverTimestamp: () => 1, delete: () => '__delete__', increment: n => n, arrayUnion: (...uids) => ({ union: uids }) };
    window.firebase = { apps: [{}], auth: () => auth, firestore };
  });
  const fixture = await offlineSite(page, { document: source => source.replace(
    "state.proUid = ''; state.conUid = ''; state.proUid2 = ''; state.conUid2 = '';",
    `state.proUid = 'a'; state.conUid = 'b'; state.proUid2 = ''; state.conUid2 = '';
    state.user={uid:'${viewer ? 'viewer' : 'a'}',displayName:'Audience member',getIdToken:async function(){return 'fixture';}};
    firebaseDb=window.mockDmDb; window.fixtureState=state; window.fixturePaint=paintRoundPlan; window.fixtureSnapshot=onRoundSnapshot;`
  ) });
  await page.goto('https://debatable.test/live-round?design=' + (viewer ? 'spectator' : 'ready') + '&format=quick&mySide=pro');
  return fixture;
}

for (const width of [390, 1360]) {
  test(`audience privately messages either person at ${width}px`, async ({ page }) => {
    const fixture = await room(page, { width });
    const sam = page.locator('#roundSidePair').getByRole('button', { name: 'Message Sam', exact: true });
    const jordan = page.locator('#roundSidePair').getByRole('button', { name: 'Message Jordan', exact: true });
    await expect(sam).toBeVisible(); await expect(jordan).toBeVisible();
    if (width === 390) await page.locator('#roundSidePair').screenshot({ path: 'test-results/audience-message-cards.png' });
    await expect(page.locator('#rosterOppDm')).toBeHidden();
    await sam.click();
    await expect(page.getByRole('dialog', { name: 'Message Sam', exact: true })).toBeVisible();
    await page.locator('#dmText').fill('A question for Sam.');
    expect(await page.evaluate(() => dmWrites)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sam).toBeFocused();
    await jordan.click();
    await expect(page.locator('#dmText')).toHaveValue('');
    await page.locator('#dmText').fill('A question for Jordan.');
    await page.keyboard.press('Escape');
    await sam.click();
    await expect(page.locator('#dmText')).toHaveValue('A question for Sam.');
    await page.evaluate(() => { dmThreads.a_viewer = { participants: ['a', 'viewer'] }; failDm = true; });
    await page.locator('#dmSend').click();
    await expect(page.locator('#dmStatus')).toContainText('Could not send');
    await expect(page.locator('#dmText')).toHaveValue('A question for Sam.');
    await page.evaluate(() => { failDm = false; });
    await page.locator('#dmSend').click();
    await expect(page.locator('#dmStatus')).toContainText('Sent.');
    await page.keyboard.press('Escape');
    await jordan.click();
    await expect(page.locator('#dmThreadLink')).toHaveAttribute('href', '/messages?dm=b&name=Jordan');
    await expect(page.locator('#dmText')).toHaveValue('A question for Jordan.');
    await page.locator('#dmSend').click();
    await expect(page.locator('#dmStatus')).toContainText('Sent.');
    const writes = await page.evaluate(() => dmWrites);
    expect(writes.find(w => w.collection === 'messages').data.fromName).not.toBe('Sam');
    expect(writes[0].data.participants).toEqual(['a', 'viewer']);
    expect(writes.filter(w => w.collection === 'messages').map(w => [w.thread, w.data.text])).toEqual([
      ['a_viewer', 'A question for Sam.'], ['b_viewer', 'A question for Jordan.']
    ]);
    await expect.poll(() => fixture.requests.filter(r => r.path === '/api/notify-dm').length).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(fixture.errors).toEqual([]);
    if (width === 390) await page.screenshot({ path: 'test-results/audience-message-phone.png' });
  });
}

test('an open message keeps its recipient through a side swap', async ({ page }) => {
  const fixture = await room(page);
  await page.locator('[data-dm-seat="pro"]').click();
  await page.locator('#dmText').fill('Still for Sam.');
  await page.evaluate(() => fixtureSnapshot({ proUid: 'b', proName: 'Jordan', conUid: 'a', conName: 'Sam' }));
  await expect(page.locator('#dmOppName')).toHaveText('Sam');
  await page.locator('#dmSend').click();
  await expect(page.locator('#dmStatus')).toContainText('Sent.');
  expect(await page.evaluate(() => dmWrites.find(w => w.collection === 'messages').thread)).toBe('a_viewer');
  expect(fixture.errors).toEqual([]);
});

test('participant has a message action only for the other account', async ({ page }) => {
  const fixture = await room(page, { viewer: false });
  await expect(page.locator('[data-dm-seat="pro"]')).toHaveCount(0);
  await page.locator('[data-dm-seat="con"]').click();
  await expect(page.locator('#dmOppName')).toHaveText('Jordan');
  await page.keyboard.press('Escape');
  await page.locator('#rosterOppDm').click();
  await expect(page.locator('#dmThreadLink')).toHaveAttribute('href', '/messages?dm=b&name=Jordan');
  expect(await page.evaluate(() => dmWrites)).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test('missing accounts and sign-out cannot send, including an open draft', async ({ page }) => {
  const fixture = await room(page);
  await page.evaluate(() => { fixtureState.proUid = ''; fixturePaint(); });
  await expect(page.locator('[data-dm-seat="pro"]')).toHaveCount(0);
  await page.locator('[data-dm-seat="con"]').click();
  await page.locator('#dmText').fill('Unsent draft.');
  await page.evaluate(() => { fixtureState.user = null; fixturePaint(); });
  await page.locator('#dmSend').click();
  await expect(page.locator('#dmStatus')).toContainText('Sign in');
  await expect(page.locator('[data-dm-seat]')).toHaveCount(0);
  expect(await page.evaluate(() => dmWrites)).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test('existing team rooms address each person separately', async ({ page }) => {
  const fixture = await room(page);
  await page.evaluate(() => {
    Object.assign(fixtureState, { isDuo: true, proUid2: 'c', proName2: 'Taylor', conUid2: 'd', conName2: 'Alex' });
    fixturePaint();
  });
  await expect(page.locator('[data-dm-seat]')).toHaveCount(4);
  await page.getByRole('button', { name: 'Message Taylor', exact: true }).click();
  await expect(page.locator('#dmThreadLink')).toHaveAttribute('href', '/messages?dm=c&name=Taylor');
  expect(await page.evaluate(() => dmWrites)).toEqual([]);
  expect(fixture.errors).toEqual([]);
});
