import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Actual leaderboard markup/styles, bridge and popup. Other scripts are
// excluded; fixture accounts/inventory never join a real queue or sign in.
const app = fileURLToPath(new URL('../../app/', import.meta.url));
const markup = fs.readFileSync(path.join(app, 'leaderboard.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const named = { uid: 'test-self', isAnonymous: false, providerData: [{ providerId: 'google.com' }] };
const guest = { uid: 'test-guest', isAnonymous: true, providerData: [] };
const noPopup = '.da-wait-invite, .da-livepop';

async function fixture(page, { user = null, routePath = '/leaderboard', native = false, holdWait = false } = {}) {
  const reads = { wait: 0, watch: 0, completed: 0 };
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.clock.install();
  await page.addInitScript(user => {
    const listeners = new Set();
    const auth = {
      currentUser: user,
      onAuthStateChanged(fn) {
        listeners.add(fn);
        Promise.resolve().then(() => { if (listeners.has(fn)) fn(auth.currentUser); });
        return () => listeners.delete(fn);
      },
    };
    window.firebase = { apps: [{}], auth: () => auth };
    window.__setTestUser = next => { auth.currentUser = next; [...listeners].forEach(fn => fn(next)); };
    window.__testAuthListeners = () => listeners.size;
    window.__authCalls = 0;
    window.openAuthModal = () => { window.__authCalls += 1; };
  }, user);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://debatable.test') return route.fulfill({ status: 200, body: '' });
    if (url.pathname === '/api/live-now') {
      reads.wait++;
      if (holdWait) await held;
      await route.fulfill({ json: { debaters: [{ uid: 'test-peer', name: 'Test opponent' }] } });
      reads.completed++;
      return;
    }
    if (url.pathname === '/api/watch-live') { reads.watch++; return route.fulfill({ json: { rounds: [] } }); }
    if (url.pathname === '/js/native-bridge.js') return route.fulfill({ path: path.join(app, 'js/native-bridge.js'), contentType: 'text/javascript' });
    if (/\.(css|svg|png|jpg|webp|ico)$/.test(url.pathname)) {
      const asset = path.join(app, url.pathname);
      if (fs.existsSync(asset)) return route.fulfill({ path: asset });
    }
    if (route.request().resourceType() === 'document') return route.fulfill({ body: markup, contentType: 'text/html' });
    return route.fulfill({ status: 200, body: '', contentType: 'text/javascript' });
  });
  await page.goto('https://debatable.test' + routePath);
  if (native) {
    // The exact responsive QA recipe from CODEX_APP_HANDOVER.md section 3.
    await page.evaluate(async () => {
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
      const source = await fetch('/js/native-bridge.js').then(r => r.text());
      (0, eval)(source);
    });
    await expect(page.locator('html')).toHaveClass(/dbnative/);
    await expect(page.locator('.db-native-tabs')).toBeVisible();
  }
  await page.addScriptTag({ path: path.join(app, 'js/live-popup.js') });
  return { reads, release };
}

for (const [label, user] of [['signed out', null], ['anonymous', guest], ['named', named]]) {
  test(`native Board stays quiet for ${label} at 375px`, async ({ page }, testInfo) => {
    const { reads } = await fixture(page, { user, native: true });
    await page.clock.runFor(180_000);
    await expect(page.locator(noPopup)).toHaveCount(0);
    expect(reads).toEqual({ wait: 0, watch: 0, completed: 0 });
    expect(await page.evaluate(() => window.__authCalls)).toBe(0);
    await expect(page.getByRole('heading', { name: 'The leaderboard.' })).toBeVisible();
    if (!user) await page.screenshot({ path: testInfo.outputPath('native-board-375.png') });
  });
}
for (const [label, user] of [['signed out', null], ['anonymous', guest]]) {
  test(`no named-person challenge for ${label} on web`, async ({ page }) => {
    const { reads } = await fixture(page, { user });
    await page.clock.runFor(3_000);
    await expect.poll(() => reads.watch).toBe(1);
    await expect(page.locator('.da-wait-invite')).toHaveCount(0);
    expect(reads.wait).toBe(0);
    expect(await page.evaluate(() => window.__authCalls)).toBe(0);
  });
}
test('named web accounts get invitations; sign-out removes the invitation and listener', async ({ page }) => {
  await fixture(page, { user: named });
  await page.clock.runFor(3_000);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Test opponent wants to debate' })).toBeVisible();
  await page.evaluate(() => window.__setTestUser(null));
  await expect(page.locator('.da-wait-invite')).toHaveCount(0);
  expect(await page.evaluate(() => window.__testAuthListeners())).toBe(0);
});
test('sign-out during a queue read cannot open a challenge', async ({ page }) => {
  const { reads, release } = await fixture(page, { user: named, holdWait: true });
  await page.clock.runFor(3_000);
  await expect.poll(() => reads.wait).toBe(1);
  await page.evaluate(user => window.__setTestUser(user), guest);
  release();
  await expect.poll(() => reads.completed).toBe(1);
  await page.clock.runFor(1_000);
  await expect(page.locator('.da-wait-invite')).toHaveCount(0);
});
test('a late native class suppresses an in-flight Board invitation', async ({ page }) => {
  const { reads, release } = await fixture(page, { user: named, holdWait: true });
  await page.clock.runFor(3_000);
  await expect.poll(() => reads.wait).toBe(1);
  await page.evaluate(() => { window.__DB_NATIVE = false; document.documentElement.classList.add('dbnative'); });
  release();
  await expect.poll(() => reads.completed).toBe(1);
  await page.clock.runFor(1_000);
  await expect(page.locator(noPopup)).toHaveCount(0);
});
test('named accounts on another native screen keep invitations', async ({ page }) => {
  await fixture(page, { user: named, native: true, routePath: '/profile' });
  await page.clock.runFor(3_000);
  await expect(page.getByRole('dialog')).toBeVisible();
});
