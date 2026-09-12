import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../../app/', import.meta.url));
const source = fs.readFileSync(path.join(app, 'spar.html'), 'utf8');
const main = source.slice(source.indexOf('<script>\n(function(){\n  \'use strict\';')).split('</script>')[0].replace('<script>', '');
const markup = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

async function fixture(page, { anonymous = false, mobile = false } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://debatable.test') return route.fulfill({ body: '' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, stored: true, waiting: 0, rounds: [], users: [] } });
    if (/\.(css|jpg|svg|png|webp)$/.test(url.pathname) && fs.existsSync(path.join(app, url.pathname))) return route.fulfill({ path: path.join(app, url.pathname) });
    return route.fulfill({ contentType: 'text/html', body: markup });
  });
  await page.goto('https://debatable.test/spar');
  await page.evaluate(({ anonymous }) => {
    window.__writes = [];
    window.__deletes = [];
    window.__anonymousMints = 0;
    window.__authOptions = null;
    window.__holdToken = false;
    const empty = { exists: false, docs: [], forEach() {}, data: () => ({}) };
    function ref(collection, id) {
      const r = {
        id, get: async () => empty,
        set: async data => { if (collection === 'matchmaking_queue') window.__writes.push(data); },
        update: async () => {},
        delete: async () => { window.__deletes.push({ collection, id }); },
        where: () => r, orderBy: () => r, limit: () => r,
        onSnapshot: () => () => {}, doc: uid => ref(collection, uid),
      };
      return r;
    }
    const db = { collection: name => ref(name, ''), settings() {} };
    const listeners = [];
    const auth = {
      currentUser: anonymous ? { uid: 'fixture-guest', isAnonymous: true, providerData: [] } : null,
      onAuthStateChanged(fn) { listeners.push(fn); fn(auth.currentUser); return () => {}; },
      signInAnonymously() { window.__anonymousMints++; return Promise.reject(new Error('Guest creation forbidden')); },
    };
    window.__setUser = provider => {
      auth.currentUser = provider ? {
        uid: 'fixture-account', isAnonymous: false, providerData: [{ providerId: provider }],
        getIdToken: async () => 'fixture-token',
        getIdTokenResult: () => window.__holdToken ? new Promise(resolve => { window.__releaseToken = () => resolve({ signInProvider: provider }); }) : Promise.resolve({ signInProvider: window.__tokenProvider || provider }),
      } : null;
      listeners.forEach(fn => fn(auth.currentUser));
    };
    window.firebase = { apps: [{}], auth: () => auth, firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => Date.now() } }) };
    window.DBLiveJourney = { watch: () => () => {}, readDocument: async () => empty };
    window.daAgeBand = () => 'adult';
    window.openAuthModal = (mode, opts) => { window.__authOptions = opts; };
    window.gtag = () => {};
  }, { anonymous });
  await page.addScriptTag({ content: main });
  await expect(page.locator('#sparGateCard')).toBeVisible();
  return errors;
}

for (const anonymous of [false, true]) {
  test(`${anonymous ? 'anonymous' : 'signed-out'} visitor sees a labeled invite and never joins`, async ({ page }, testInfo) => {
    const errors = await fixture(page, { anonymous, mobile: anonymous });
    await expect(page.locator('.gate-invite')).toContainText('Example invite');
    await expect(page.locator('.gate-invite')).toContainText('This is a preview.');
    await expect(page.locator('.gate-invite img')).toBeVisible();
    await expect(page.locator('#globalDebateMap')).toHaveCount(0);
    await expect(page.getByText('Last free round as a guest.')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('signin-gate.png'), fullPage: true });
    await page.locator('#emailStartBtn').click();
    expect(await page.evaluate(() => window.__authOptions.liveVideo)).toBe(true);
    expect(await page.evaluate(() => ({ writes: __writes.length, mints: __anonymousMints }))).toEqual({ writes: 0, mints: 0 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const provider of ['google.com', 'apple.com', 'password']) {
  test(`${provider} resumes matching, then sign-out removes the search`, async ({ page }) => {
    const errors = await fixture(page);
    await page.evaluate(provider => window.__setUser(provider), provider);
    await expect.poll(() => page.evaluate(() => __writes.length)).toBe(1);
    await expect(page.locator('#sparGateCard')).toHaveCount(0);
    expect(await page.evaluate(() => __writes[0].authProvider)).toBe(provider);
    await page.evaluate(() => window.__setUser(null));
    await expect(page.locator('#sparGateCard')).toBeVisible();
    expect(await page.evaluate(() => __deletes.some(d => d.collection === 'matchmaking_queue'))).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('sign-out while a token is pending never writes or paints a new search', async ({ page }) => {
  const errors = await fixture(page);
  await page.evaluate(() => { __holdToken = true; __setUser('password'); });
  await expect.poll(() => page.evaluate(() => typeof __releaseToken)).toBe('function');
  await page.evaluate(() => { __setUser(null); __releaseToken(); });
  await expect(page.locator('#sparGateCard')).toBeVisible();
  expect(await page.evaluate(() => __writes.length)).toBe(0);
  expect(errors).toEqual([]);
});


test('a stale anonymous token cannot start a named account search', async ({ page }) => {
  const errors = await fixture(page);
  await page.evaluate(() => { __tokenProvider = 'anonymous'; __setUser('password'); });
  await expect.poll(() => page.evaluate(() => __deletes.length)).toBeGreaterThan(0);
  await expect(page.locator('#sparGateCard')).toBeVisible();
  expect(await page.evaluate(() => __writes.length)).toBe(0);
  expect(errors).toEqual([]);
});
