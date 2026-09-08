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

async function fixture(page, { user = null, routePath = '/leaderboard', native = false, holdWait = false, peers = [{ uid: 'test-peer', name: 'Test opponent' }], optedOut = false } = {}) {
  const reads = { wait: 0, watch: 0, completed: 0 };
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.clock.install();
  await page.addInitScript(({ user, optedOut }) => {
    if (optedOut) localStorage.setItem('da-spar-bg', '0');
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
    window.openAuthModal = (mode, opts) => { window.__authCalls += 1; window.__authMode = mode; window.__authOptions = opts; };
  }, { user, optedOut });
  page.on('pageerror', error => { throw error; });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://debatable.test') return route.fulfill({ status: 200, body: '' });
    if (url.pathname === '/api/live-now') {
      reads.wait++;
      if (holdWait) await held;
      await route.fulfill({ json: { debaters: peers } });
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
  test(`${label} visitors see the profile invitation and sign in only after Accept`, async ({ page }) => {
    const { reads } = await fixture(page, { user });
    await page.clock.runFor(3_000);
    await expect(page.getByRole('heading', { name: 'Test opponent wants to debate' })).toBeVisible();
    expect(reads.wait).toBe(1);
    expect(await page.evaluate(() => window.__authCalls)).toBe(0);
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(page.locator('.da-wait-invite')).toHaveCount(0);
    expect(await page.evaluate(() => ({ calls: window.__authCalls, mode: window.__authMode, ...window.__authOptions }))).toMatchObject({
      calls: 1, mode: 'signin', liveVideo: true, destination: '/spar', headline: 'Sign in to accept the debate',
    });
    await expect(page).toHaveURL('https://debatable.test/leaderboard');
    await page.evaluate(user => window.__authOptions.onDone(user), named);
    await expect(page).toHaveURL('https://debatable.test/spar');
  });
  test(`${label} visitors can dismiss without opening login or matching`, async ({ page }) => {
    await fixture(page, { user });
    await page.clock.runFor(3_000);
    await page.getByRole('button', { name: 'Not now', exact: true }).click();
    await page.clock.runFor(180_000);
    await expect(page.locator(noPopup)).toHaveCount(0);
    expect(await page.evaluate(() => window.__authCalls)).toBe(0);
    await expect(page).toHaveURL('https://debatable.test/leaderboard');
  });
}
test('signing out while an invitation is open requires login on Accept', async ({ page }) => {
  await fixture(page, { user: named });
  await page.clock.runFor(3_000);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Test opponent wants to debate' })).toBeVisible();
  await page.evaluate(() => window.__setTestUser(null));
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  expect(await page.evaluate(() => window.__authCalls)).toBe(1);
  await expect(page).toHaveURL('https://debatable.test/leaderboard');
  expect(await page.evaluate(() => window.__testAuthListeners())).toBe(0);
});
test('sign-out during a queue read still offers the invitation with login on Accept', async ({ page }) => {
  const { reads, release } = await fixture(page, { user: named, holdWait: true });
  await page.clock.runFor(3_000);
  await expect.poll(() => reads.wait).toBe(1);
  await page.evaluate(user => window.__setTestUser(user), guest);
  release();
  await expect.poll(() => reads.completed).toBe(1);
  await page.clock.runFor(1_000);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  expect(await page.evaluate(() => window.__authCalls)).toBe(1);
  await expect(page).toHaveURL('https://debatable.test/leaderboard');
});
test('sign-in while an invitation is open continues directly on Accept', async ({ page }) => {
  await fixture(page, { user: guest });
  await page.clock.runFor(3_000);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(user => window.__setTestUser(user), named);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page).toHaveURL('https://debatable.test/spar');
});
test('cancelling login keeps the visitor on the page and snoozes invitations', async ({ page }) => {
  await fixture(page, { user: guest });
  await page.clock.runFor(3_000);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await page.evaluate(() => window.__authOptions.onDone(null));
  await page.clock.runFor(180_000);
  await expect(page.locator(noPopup)).toHaveCount(0);
  await expect(page).toHaveURL('https://debatable.test/leaderboard');
});
test('Accept opens the real shared login chooser for an anonymous visitor', async ({ page }, testInfo) => {
  await fixture(page, { user: guest });
  await page.addScriptTag({ path: path.join(app, 'js/auth-modal.js') });
  await page.clock.runFor(3_000);
  await expect(page.getByRole('heading', { name: 'Test opponent wants to debate' })).toBeVisible();
  await expect(page.locator('#ditAuth')).toHaveCount(0);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to accept the debate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.locator('#daEmail')).toBeVisible();
  await expect(page.locator('.da-wait-invite')).toHaveCount(0);
  await expect(page).toHaveURL('https://debatable.test/leaderboard');
  await page.screenshot({ path: testInfo.outputPath('anonymous-accept-login-375.png') });
});
for (const [label, options] of [
  ['empty queue', { peers: [] }],
  ['self-only queue', { peers: [{ uid: guest.uid, name: 'Me' }] }],
  ['availability opt-out', { optedOut: true }],
  ['active human round', { routePath: '/live-round' }],
]) {
  test(`anonymous invitations stay quiet for ${label}`, async ({ page }) => {
    await fixture(page, { user: guest, ...options });
    await page.clock.runFor(3_000);
    await expect(page.locator(noPopup)).toHaveCount(0);
    expect(await page.evaluate(() => window.__authCalls)).toBe(0);
  });
}
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
