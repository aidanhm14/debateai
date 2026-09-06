// Entirely offline: real prompt code, synthetic accounts and a fake receipt API.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../app/js/corpus-nudge.js', import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-06T12:00:00Z');
const DAY = 86400000;
async function setup(page, options = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><body><button id="before">Continue</button></body></html>' }));
  await page.goto('https://corpus.test' + (options.path || '/'));
  await page.clock.install({ time: NOW });
  await page.evaluate(({ options, NOW, DAY }) => {
    window.testProfile = options.profile || {};
    window.testRequests = [];
    window.testFail = options.fail || false;
    window.testReadFail = options.readFail || false;
    window.testReads = 0;
    const u = { uid: 'person', isAnonymous: !!options.anonymous, getIdToken: async () => 'person-token' };
    window.testUser = options.signedOut ? null : u;
    window.testAuth = { get currentUser() { return window.testUser; }, onAuthStateChanged(fn) { window.testAuthChanged = fn; fn(window.testUser); } };
    window.testFirebase = {
      apps: [{}], auth: () => testAuth,
      firestore: () => ({ collection: () => ({ doc: () => ({ get: async () => {
        testReads++;
        if (testReadFail) throw new Error('offline');
        return { exists: true, data: () => testProfile };
      } }) }) }),
    };
    if (!options.lateAuth) window.firebase = testFirebase;
    localStorage.setItem('debateos-corpus-prompt-v2:person', JSON.stringify(options.activity || {
      firstSeen: NOW - 3 * DAY, lastSeen: NOW - DAY, visits: 2,
    }));
    if (options.oldConsent) localStorage.setItem('debateos-corpus-contribute', '1');
    if (options.rounds) localStorage.setItem('debateos-corpus-rounds-done', String(options.rounds));
    if (options.overlay) document.body.insertAdjacentHTML('beforeend', '<div id="other" role="dialog" aria-modal="true">Other question</div>');
    window.fetch = async (_url, opts) => {
      const data = JSON.parse(opts.body); testRequests.push(data);
      if (testFail) return { ok: false };
      if (data.event === 'corpus_opt_in') Object.assign(testProfile, { contributeToCorpus: true, corpusAgeAttested: true });
      if (data.event === 'corpus_opt_out') testProfile.contributeToCorpus = false;
      return { ok: true, json: async () => ({ ok: true }) };
    };
  }, { options, NOW, DAY });
  await page.addScriptTag({ content: source });
  if (!options.lateAuth && !options.signedOut && !options.anonymous) await expect.poll(() => page.evaluate(() => testReads)).toBeGreaterThan(0);
  return errors;
}
async function reveal(page) {
  await page.clock.runFor(21000);
  await expect(page.locator('#corpusNudgeCard')).toBeVisible();
}
test('return visit explains the purpose, defaults sharing on, and requires adult confirmation', async ({ page }) => {
  const errors = await setup(page);
  await page.clock.runFor(19000);
  await expect(page.locator('#corpusNudgeCard')).toHaveCount(0);
  await page.clock.runFor(2000);
  await expect(page.locator('#corpusNudgeCard')).toBeVisible();
  await expect(page.locator('#corpusNudgeSharing')).toBeChecked();
  await expect(page.locator('#corpusNudgeAge')).not.toBeChecked();
  await expect(page.locator('#corpusNudgeYes')).toBeDisabled();
  await expect(page.locator('#corpusNudgeBody')).toContainText('license to AI labs');
  expect(await page.evaluate(() => localStorage.getItem('debateos-corpus-contribute'))).toBe('0');
  await page.locator('#corpusNudgeAge').check();
  await page.locator('#corpusNudgeYes').click();
  await expect(page.locator('#corpusNudgeTitle')).toHaveText('Your choice is saved.');
  expect(await page.evaluate(() => localStorage.getItem('debateos-corpus-contribute'))).toBe('1');
  expect(await page.evaluate(() => testRequests[0])).toMatchObject({ event:'corpus_opt_in', ageAttested:true, applyCorpusChoice:true });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('#corpusNudgeCard')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('a first visit and quick reloads do not qualify', async ({ page }) => {
  await setup(page, { activity: {} });
  await page.clock.runFor(30000);
  await expect(page.locator('#corpusNudgeCard')).toHaveCount(0);
  await page.evaluate(() => { testUser = null; testAuthChanged(null); testUser = { uid:'person', getIdToken:async ()=>'token' }; testAuthChanged(testUser); });
  await page.clock.runFor(30000);
  await expect(page.locator('#corpusNudgeCard')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('debateos-corpus-prompt-v2:person')).visits)).toBe(1);
});
test('a next-day second visit qualifies', async ({ page }) => {
  await setup(page, { activity: { firstSeen: NOW - 2 * DAY, lastSeen: NOW - DAY, visits: 1 } });
  await reveal(page);
});
test('second completed round waits for the ballot and does not count repeated renders', async ({ page }) => {
  await setup(page, { path:'/live-round', activity:{}, rounds:1 });
  await page.clock.runFor(30000);
  await expect(page.locator('#corpusNudgeCard')).toHaveCount(0);
  await page.evaluate(() => { noteRoundComplete(); noteRoundComplete(); });
  await page.clock.runFor(3900);
  await expect(page.locator('#corpusNudgeCard')).toHaveCount(0);
  await page.clock.runFor(200);
  await expect(page.locator('#corpusNudgeCard')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('debateos-corpus-rounds-done'))).toBe('2');
});
for (const [name, options] of Object.entries({
  'explicit opt-out': { profile:{ contributeToCorpus:false, corpusAgeAttested:true }, oldConsent:true },
  'existing contribution': { profile:{ contributeToCorpus:true, corpusAgeAttested:true } },
  'anonymous account': { anonymous:true },
  'signed-out visitor': { signedOut:true },
  'failed profile read': { readFail:true, oldConsent:true },
  'active voice round': { path:'/newvoice' },
  'active typed round': { path:'/app' },
  'legal page': { path:'/privacy' },
  'account settings': { path:'/profile' },
  'remote snooze': { profile:{ corpusNudgeDismissedAt:NOW - DAY } },
})) {
  test(`${name} suppresses the question`, async ({ page }) => {
    await setup(page, options); await page.clock.runFor(30000);
    await expect(page.locator('#corpusNudgeCard')).toHaveCount(0);
    expect(await page.evaluate(() => testRequests)).toEqual([]);
  });
}
test('late Firebase initialization and another dialog defer without losing the question', async ({ page }) => {
  await setup(page, { lateAuth:true, overlay:true });
  await page.clock.runFor(1000);
  await page.evaluate(() => { window.firebase = testFirebase; });
  await page.clock.runFor(22000);
  await expect(page.locator('#corpusNudgeCard')).toHaveCount(0);
  await page.locator('#other').evaluate(el => el.remove());
  await page.clock.runFor(6000);
  await expect(page.locator('#corpusNudgeCard')).toBeVisible();
});
test('failed saves show an error and allow retry without claiming consent', async ({ page }) => {
  await setup(page, { fail:true }); await reveal(page);
  await page.locator('#corpusNudgeAge').check();
  await page.locator('#corpusNudgeYes').click();
  await expect(page.locator('#corpusNudgeStatus')).toContainText('Could not save');
  expect(await page.evaluate(() => localStorage.getItem('debateos-corpus-contribute'))).toBe('0');
  await page.evaluate(() => { testFail = false; });
  await page.locator('#corpusNudgeYes').click();
  await expect(page.locator('#corpusNudgeTitle')).toHaveText('Your choice is saved.');
});
test('turning sharing off needs no age attestation and saves the opt-out', async ({ page }) => {
  await setup(page); await reveal(page);
  await page.locator('#corpusNudgeSharing').uncheck();
  await expect(page.locator('#corpusNudgeSharingLabel')).toHaveText('Research sharing off');
  await expect(page.locator('#corpusNudgeYes')).toBeEnabled();
  await page.locator('#corpusNudgeYes').click();
  await expect(page.locator('#corpusNudgeBody')).toContainText('Research sharing is off');
  expect(await page.evaluate(() => testRequests[0])).toMatchObject({ event:'corpus_opt_out', contribute:false });
});
test('Not now snoozes and Escape restores focus', async ({ page }) => {
  await setup(page);
  await page.locator('#before').focus();
  await reveal(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#corpusNudgeCard')).toHaveCount(0);
  await expect(page.locator('#before')).toBeFocused();
  expect(await page.evaluate(() => testRequests[0].event)).toBe('corpus_nudge_dismissed');
  await page.clock.runFor(60000);
  await expect(page.locator('#corpusNudgeCard')).toHaveCount(0);
});
test('opening privacy details leaves the question available', async ({ page }) => {
  await setup(page); await reveal(page);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name:'Read the privacy details' }).click();
  const popup = await popupPromise; await popup.close();
  await expect(page.locator('#corpusNudgeCard')).toBeVisible();
  expect(await page.evaluate(() => testRequests)).toEqual([]);
});
test('account changes close the prompt and do not inherit someone else’s decision', async ({ page }) => {
  await setup(page); await reveal(page);
  await page.evaluate(() => { testUser = null; testAuthChanged(null); });
  await expect(page.locator('#corpusNudgeCard')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('debateos-corpus-contribute'))).toBe('0');
});
test('320px mobile and dark theme keep every control reachable', async ({ page }) => {
  await page.setViewportSize({ width:320, height:568 });
  const errors = await setup(page);
  await page.addStyleTag({ content: ':root{--bg:#181818;--text:#f6f3ec;--border:#555}' });
  await reveal(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.locator('#corpusNudgeAge').check();
  await expect(page.locator('#corpusNudgeYes')).toBeEnabled();
  await page.screenshot({ path:new URL('../../work/corpus-mobile.png', import.meta.url).pathname });
  await page.setViewportSize({ width:1280, height:900 });
  await page.addStyleTag({ content: ':root{--bg:#faf9f6;--text:#222;--border:#ccc}' });
  await page.screenshot({ path:new URL('../../work/corpus-desktop.png', import.meta.url).pathname });
  expect(errors).toEqual([]);
});
