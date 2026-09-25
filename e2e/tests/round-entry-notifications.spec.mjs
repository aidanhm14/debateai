import { test, expect } from '@playwright/test';
import { roomDesign } from '../helpers/room-design.mjs';
import { readApp, offlineSite } from '../helpers/offline-site.mjs';

for (const width of [360, 1280]) {
  test(`topic dialog preserves failed proposals, prevents duplicate sends and stays usable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 });
    const fixture = await roomDesign(page, { document: html => html.replace(
      'function proposalRef(){ return getRoundDocRef(); }',
      'function proposalRef(){ return window.__proposalRef || getRoundDocRef(); }').replace(
      "state.proUid = ''; state.conUid = ''; state.proUid2 = ''; state.conUid2 = '';",
      "state.proUid = 'a'; state.conUid = 'b'; state.proUid2 = ''; state.conUid2 = ''; state.user = {uid:'a'};") });
    await page.goto('https://debatable.test/live-round?design=ready&format=quick');
    await page.evaluate(() => {
      window.__writes = 0;
      window.__proposalRef = { update: () => { window.__writes++; return new Promise((resolve, reject) => { window.__save = { resolve, reject }; }); } };
      window.firebase.firestore.FieldValue = { serverTimestamp: () => 1 };
    });
    await page.locator('#rmbToolsLabel').click();
    await page.locator('#rmbChangeBtn').click();
    const dialog = page.getByRole('dialog', { name: 'Propose a topic' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#motionModalText')).toBeFocused();
    await page.locator('#motionModalText').fill('Couples should keep separate bank accounts.');
    await page.locator('#motionModalSubmit').click();
    await expect(page.locator('#motionModalSubmit')).toBeDisabled();
    await expect(page.locator('#motionModalStatus')).toHaveText('Sending topic…');
    await page.evaluate(() => window.__save.reject(new Error('offline')));
    await expect(page.locator('#motionModalStatus')).toContainText('Could not send');
    await expect(page.locator('#motionModalText')).toHaveValue('Couples should keep separate bank accounts.');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#rmbMotion')).toContainText('Cities should ban');
    await page.setViewportSize({ width, height: 480 });
    await page.locator('#motionModalSubmit').scrollIntoViewIfNeeded();
    await expect(page.locator('#motionModalSubmit')).toBeInViewport();
    await page.screenshot({ path: info.outputPath('topic-retry.png') });
    await page.locator('#motionModalSubmit').click();
    await page.evaluate(() => window.__save.resolve());
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.__writes)).toBe(2);
    await expect(page.locator('#rmbMotion')).toContainText('Cities should ban');
    await page.locator('#rmbToolsLabel').click();
    await page.locator('#rmbChangeBtn').click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(fixture.errors).toEqual([]);
  });
}

async function settings(page, { ios = false, denied = false, fail = false } = {}) {
  const fixture = await offlineSite(page, { document: () => '<main><div data-notification-setup></div></main>' });
  await page.goto('https://debatable.test/notifications');
  await page.setContent('<main><div data-notification-setup></div></main>');
  await page.evaluate(({ ios, denied, fail }) => {
    window.__permissionCalls = 0; window.__registrations = 0; window.__notices = []; window.__prefs = []; window.__pushTests = 0;
    if (ios) Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' });
    function N(){ throw new Error('Mobile Notification constructor is unavailable'); }
    N.permission = denied ? 'denied' : 'default';
    N.requestPermission = async () => { window.__permissionCalls++; N.permission = 'granted'; return 'granted'; };
    window.Notification = N; window.PushManager = function(){};
    const reg = {
      showNotification: async (title, options) => { window.__notices.push({ title, options }); },
      pushManager: { getSubscription: async () => null, subscribe: async () => ({ toJSON: () => ({ endpoint: 'https://example.invalid/push' }) }) }
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => reg, ready: Promise.resolve(reg) } });
    const user = { uid: 'test-person', isAnonymous: false, getIdToken: async () => 'test-token' };
    window.firebase = { auth: () => ({ currentUser: user }) };
    window.fetch = async (url, options = {}) => {
      const post = options.method === 'POST';
      if (url.includes('push-test')) { window.__pushTests++; return {ok:true,json:async()=>({sent:2,web:1,native:1})}; }
      if (post && url.includes('push-subscribe')) window.__registrations++;
      if (post && url.includes('notify-prefs')) window.__prefs.push(JSON.parse(options.body));
      return { ok: !(fail && post), json: async () => ({ configured: true, publicKey: 'BA' }) };
    };
  }, { ios, denied, fail });
  const source = readApp('js/notifications.js');
  await page.addScriptTag({ content: source.slice(0, source.indexOf('  // Cross-platform attention signal:')) + '\n})();' });
  await page.addStyleTag({ content: readApp('css/notification-setup.css') });
  await page.addScriptTag({ content: readApp('js/sfx.js') });
  await page.addScriptTag({ content: readApp('js/notification-setup.js') });
  return fixture;
}

test('notification setup waits for a click, registers the device and tests mobile delivery without opting into broadcasts', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await settings(page);
  expect(await page.evaluate(() => window.__permissionCalls)).toBe(0);
  await page.getByRole('button', { name: 'Turn on notifications' }).click();
  await expect(page.locator('[data-notify-help]')).toContainText('on for this device');
  expect(await page.evaluate(() => [window.__permissionCalls, window.__registrations, window.__prefs.length])).toEqual([1, 1, 0]);
  await page.getByRole('button', { name: 'Test my registered devices' }).click();
  await expect(page.locator('[data-notify-status]')).toContainText('accepted the test for 2 devices');
  expect(await page.evaluate(() => window.__pushTests)).toBe(1);
  expect(await page.evaluate(() => window.__notices.length)).toBe(0);
  await page.locator('[data-notify-live]').check();
  await expect(page.locator('[data-notify-status]')).toHaveText('New-round alerts are on.');
  await page.locator('[data-notify-live]').uncheck();
  await expect(page.locator('[data-notify-status]')).toContainText('New-round alerts are off');
  await page.getByRole('button', { name: 'Test notification sound' }).click();
  await expect(page.locator('[data-notify-status]')).toContainText('Test sound played');
  await page.getByRole('button', { name: 'Mute sounds', exact: true }).click();
  await page.getByRole('button', { name: 'Test notification sound' }).click();
  await expect(page.locator('[data-notify-status]')).toContainText('Sounds are muted');
  await page.screenshot({ path: info.outputPath('phone-notifications.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('iPhone browser offers Home Screen steps without a permission request', async ({ page }) => {
  await settings(page, { ios: true });
  await page.getByRole('button', { name: 'Show phone setup' }).click();
  await expect(page.locator('.notification-setup details')).toHaveAttribute('open', '');
  await expect(page.locator('.notification-setup details')).toContainText('Add to Home Screen');
  expect(await page.evaluate(() => window.__permissionCalls)).toBe(0);
});

test('denied permissions and failed registration never claim notifications are on', async ({ page }) => {
  await settings(page, { denied: true });
  await expect(page.locator('[data-notify-enable]')).toBeDisabled();
  await expect(page.locator('[data-notify-help]')).toContainText('browser site settings');
  await page.reload();
  await settings(page, { fail: true });
  await page.getByRole('button', { name: 'Turn on notifications' }).click();
  await expect(page.locator('[data-notify-status]')).toContainText('Could not register');
  await expect(page.locator('[data-notify-test]')).toBeHidden();
});
