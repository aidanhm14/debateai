import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../app/' + path, import.meta.url), 'utf8');
const html = read('newvoice.html');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const setup = html.match(/<div data-voice-allowance="setup"[^>]*><\/div>/)[0];
const recap = html.match(/<div data-voice-allowance="recap"[^>]*><\/div>/)[0];
const free = { ok: true, resolved: true, unit: 'minutes', reason: 'free_minutes_left', remaining: 19, limit: 20, period: 'lifetime', hasPlan: false, tokenFunded: false, tokensLive: true, tokenCost: 50 };
async function boot(page, initial = free, options = {}) {
  let data = initial;
  const requests = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (route.request().url().includes('/api/voice-allowance')) {
      requests.push({ headers: route.request().headers(), body: route.request().postData() });
      return route.fulfill({ json: data });
    }
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: `<style>${css}</style><main style="padding:20px;max-width:650px;margin:auto"><input id="openaiVoiceKey" type="password"><button id="clearVoiceKey">Forget key</button>${setup}<article id="verdict">Your result: 78</article>${recap}<button id="startBtn">Start debating</button></main>` });
    return route.abort();
  });
  await page.goto('https://voice-allowance.test/newvoice');
  await page.evaluate(({ native, anonymous }) => {
    window.__DB_NATIVE = !!native;
    window.events = [];
    window.track = (...args) => events.push(args);
    window.current = { uid: 'alice', isAnonymous: !!anonymous, getIdToken: async () => 'alice-token' };
    window.firebase = { auth: () => ({ currentUser: window.current, onAuthStateChanged: cb => { window.authChanged = cb; cb(); } }) };
    document.getElementById('clearVoiceKey').onclick = () => { document.getElementById('openaiVoiceKey').value = ''; };
  }, options);
  await page.addScriptTag({ content: read('js/voice-allowance.js') });
  return { requests, errors, set: value => { data = value; } };
}

test('minute meter preserves the verdict, refreshes after use, and tracks the upgrade click', async ({ page }) => {
  const ctx = await boot(page);
  await expect(page.locator('[data-voice-allowance="setup"]')).toContainText('19 voice minutes left');
  await expect(page.locator('[data-voice-allowance="setup"] a')).toHaveCount(0);
  const upgrade = page.locator('[data-voice-allowance="recap"] a');
  await expect(upgrade).toHaveAttribute('href', '/pricing#plans');
  await upgrade.evaluate(el => el.addEventListener('click', e => e.preventDefault())); await upgrade.click();
  expect(await page.evaluate(() => events.some(e => e[0] === 'app_event' && e[1].name === 'voice_upgrade_click' && e[1].placement === 'recap'))).toBe(true);
  ctx.set({ ...free, remaining: 0, ok: false, reason: 'free_limit' });
  await page.evaluate(() => DBVoiceAllowance.refresh(true));
  await expect(page.locator('[data-voice-allowance="setup"]')).toContainText('Your free voice minutes are used');
  await expect(page.locator('[data-voice-allowance="setup"] a[href="/spar"]')).toBeVisible();
  await expect(page.locator('#verdict')).toHaveText('Your result: 78');
  await expect(page.locator('#startBtn')).toBeEnabled(); // Advisory reads never lock out BYOK or a newly funded account.
  expect(ctx.errors).toEqual([]);
});

test('paid monthly cap shows reset and tokens; existing tokens do not ask for another subscription', async ({ page }) => {
  const ctx = await boot(page, { ...free, hasPlan: true, ok: false, reason: 'month_limit', remaining: 0, limit: 120, period: 'month', resetsAt: '2026-10-01T00:00:00.000Z' });
  const meter = page.locator('[data-voice-allowance="recap"]');
  await expect(meter).toContainText('Refills Oct 1 (UTC)');
  await expect(meter.locator('a[href="/voice-tokens"]')).toBeVisible();
  await expect(page.locator('a[href="/pricing#plans"]')).toHaveCount(0);
  ctx.set({ ...free, remaining: 0, tokenFunded: true, reason: 'tokens' });
  await page.evaluate(() => DBVoiceAllowance.refresh(true));
  await expect(meter).toContainText('Starting a round uses 50 tokens');
  await expect(meter.locator('a')).toHaveCount(0); expect(ctx.errors).toEqual([]);
});

test('the shipped session-end callback refreshes only after server settlement returns', async ({ page }) => {
  const ctx = await boot(page);
  await expect(page.locator('[data-voice-allowance="recap"]')).toContainText('19 voice minutes left');
  const start = html.indexOf('function reportSessionEnd(){');
  const end = html.indexOf("window.addEventListener('pagehide', reportSessionEnd);", start);
  await page.addScriptTag({ content: "var voiceSessionId='test-session';\n" + html.slice(start, end) });
  await page.evaluate(() => {
    var realFetch = window.fetch;
    window.fetch = (url, options) => url === '/api/voice-session-end' ? new Promise(resolve => {
      window.endBody = JSON.parse(options.body);
      window.settleRound = () => resolve(new Response(JSON.stringify({ ok: true })));
    }) : realFetch(url, options);
    reportSessionEnd();
  });
  await expect.poll(() => page.evaluate(() => typeof settleRound)).toBe('function');
  expect(await page.evaluate(() => endBody)).toEqual({ sessionId: 'test-session' });
  await expect(page.locator('[data-voice-allowance="recap"]')).toContainText('19 voice minutes left');
  ctx.set({ ...free, remaining: 16 });
  await page.evaluate(() => settleRound());
  await expect(page.locator('[data-voice-allowance="recap"]')).toContainText('16 voice minutes left');
  expect(ctx.errors).toEqual([]);
});

test('unknown allowance never displays a made-up zero or payment demand', async ({ page }) => {
  await boot(page, { ok: true, resolved: false, remaining: null, limit: null });
  const meter = page.locator('[data-voice-allowance="recap"]');
  await expect(meter).toContainText('Allowance unavailable');
  await expect(meter.locator('a')).toHaveCount(0);
});

test('native exhausted state retains the human option without external purchase steering', async ({ page }) => {
  await boot(page, { ...free, remaining: 0, ok: false, reason: 'free_limit' }, { native: true });
  await expect(page.locator('[data-voice-allowance="recap"] a')).toHaveText('Debate a real person');
  await expect(page.locator('a[href="/pricing#plans"],a[href="/voice-tokens"]')).toHaveCount(0);
});

test('BYOK updates locally and never sends the entered key to allowance or analytics', async ({ page }) => {
  const ctx = await boot(page, { ...free, hasPlan: true, remaining: 0, ok: false, reason: 'month_limit', limit: 120 });
  await expect(page.locator('[data-voice-allowance="setup"]')).toBeVisible();
  const before = ctx.requests.length;
  await page.locator('#openaiVoiceKey').fill('sk-test-private-not-a-real-key');
  await expect(page.locator('[data-voice-allowance="setup"]')).toContainText('Using your OpenAI key');
  expect(ctx.requests.length).toBe(before);
  expect(JSON.stringify(ctx.requests)).not.toContain('sk-test-private');
  expect(await page.evaluate(() => JSON.stringify(events))).not.toContain('sk-test-private');
  await page.locator('#clearVoiceKey').click();
  await expect(page.locator('[data-voice-allowance="setup"]')).toContainText('This month’s voice minutes are used');
});

test('guest preview has no account meter or allowance request', async ({ page }) => {
  const ctx = await boot(page, free, { anonymous: true });
  await expect(page.locator('[data-voice-allowance="setup"]')).toBeHidden();
  expect(ctx.requests).toHaveLength(0);
});

test('a late allowance response cannot overwrite the next account or sign-out', async ({ page }) => {
  await boot(page);
  await expect(page.locator('[data-voice-allowance="setup"]')).toContainText('19 voice minutes left');
  await page.evaluate(() => {
    window.fetch = () => new Promise(resolve => { window.releaseOld = () => resolve(new Response(JSON.stringify({ resolved: true, remaining: 999, limit: 999 }))); });
    window.oldRead = DBVoiceAllowance.refresh(true);
  });
  await expect.poll(() => page.evaluate(() => typeof releaseOld)).toBe('function');
  await page.evaluate(async () => {
    current = null; authChanged(); releaseOld(); await oldRead;
  });
  await expect(page.locator('[data-voice-allowance="setup"]')).toBeHidden();
  await page.evaluate(async () => {
    window.fetch = async () => new Response(JSON.stringify({ ok: true, resolved: true, remaining: 5, limit: 20 }));
    current = { uid: 'bob', isAnonymous: false, getIdToken: async () => 'bob-token' }; authChanged();
  });
  await expect(page.locator('[data-voice-allowance="setup"]')).toContainText('5 voice minutes left');
});

test('meter fits a phone and uses readable light-theme colors', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, { ...free, remaining: 0, ok: false, reason: 'free_limit' });
  const meter = page.locator('[data-voice-allowance="setup"]');
  await expect(meter).toBeVisible();
  expect(await meter.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await meter.locator('a').first().evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: '/private/tmp/debatable-allowance-mobile.png' });
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  expect(await meter.locator('.va-detail').evaluate(el => getComputedStyle(el).color)).toBe('rgba(22, 22, 26, 0.58)');
});
