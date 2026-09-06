import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../../app/', import.meta.url));
const active = { room: 'actual-room', started: true, status: 'round', proName: 'Alex', conName: 'Sam', motion: 'Cities should have more parks' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2s5kAAAAASUVORK5CYII=', 'base64');

async function fixture(page, { signedIn = false, rounds = [active], broken = false, width = 1280 } = {}) {
  const state = { rounds, broken, shots: [] };
  await page.setViewportSize({ width, height: 812 });
  await page.clock.install();
  await page.addInitScript(signedIn => {
    const user = signedIn ? { uid: 'viewer', isAnonymous: false, providerData: [{ providerId: 'google.com' }] } : null;
    window.firebase = { apps: [{}], auth: () => ({ currentUser: user }) };
  }, signedIn);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/css/ui.css') return route.fulfill({ path: path.join(app, 'css/ui.css'), contentType: 'text/css' });
    if (url.pathname === '/api/watch-live') return route.fulfill({ json: { rounds: state.rounds } });
    if (url.pathname === '/api/room-shot') {
      state.shots.push(url.searchParams.get('room'));
      return route.fulfill({ status: state.broken ? 404 : 200, body: state.broken ? '' : png, contentType: 'image/png' });
    }
    if (route.request().resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-theme="light"><head><link rel="stylesheet" href="/css/ui.css"></head><body style="background:#f7f5ef"></body></html>' });
    return route.fulfill({ json: { debaters: [] } });
  });
  await page.goto('https://debatable.test/profile?livepop=now');
  await page.addScriptTag({ path: path.join(app, 'js/live-popup.js') });
  await page.clock.runFor(1000);
  await expect(page.locator('.da-livepop')).toBeVisible();
  return state;
}

for (const signedIn of [false, true]) {
  test(`actual room image for ${signedIn ? 'Google account' : 'signed-out visitor'}`, async ({ page }) => {
    const state = await fixture(page, { signedIn, rounds: [{ ...active, shot: 123 }] });
    await expect(page.locator('.da-livepop__thumb img')).toHaveAttribute('src', /room=actual-room&v=123/);
    await expect.poll(() => page.locator('.da-livepop__thumb img').evaluate(img => img.naturalWidth)).toBe(1);
    expect(state.shots).toEqual(['actual-room']);
    await expect(page.getByText('Real people in the room')).toBeVisible();
    await expect(page.locator('.da-livepop__illustration')).toHaveCount(0);
    await expect(page.locator('.da-livepop__go')).toHaveText(signedIn ? 'Watch this round →' : 'Sign in to watch →');
  });
}

test('illustration upgrades to the live image and disappears when the room ends', async ({ page }, testInfo) => {
  const state = await fixture(page, { width: 375 });
  await expect(page.getByRole('img', { name: 'Illustration of two people debating' })).toBeVisible();
  await expect(page.getByText('Illustration', { exact: true })).toBeVisible();
  await expect(page.locator('.da-debate-person')).toHaveCount(2);
  await expect(page.locator('.da-livepop')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('illustration-mobile.png') });
  const box = await page.locator('.da-livepop').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(375);
  state.rounds = [{ ...active, shot: 456 }];
  await page.clock.runFor(16000);
  await expect(page.locator('.da-livepop__thumb img')).toHaveAttribute('src', /v=456/);
  await expect(page.locator('.da-livepop__illustration')).toHaveCount(0);
  state.rounds = [];
  await page.clock.runFor(16000);
  await expect(page.locator('.da-livepop')).toHaveCount(0);
});

test('unavailable image falls back to animation; reduced motion freezes it', async ({ page }) => {
  await fixture(page, { broken: true, rounds: [{ ...active, shot: 123 }] });
  await expect(page.locator('.da-livepop__illustration')).toBeVisible();
  await expect(page.locator('.da-livepop__thumb img')).toHaveCount(0);
  expect(await page.locator('.da-debate-head').first().evaluate(el => getComputedStyle(el).animationName)).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.da-debate-head').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});

test('a debate already started outranks a room still getting ready', async ({ page }) => {
  await fixture(page, { rounds: [{ ...active, room: 'preparing', started: false, shot: 123 }, active] });
  await expect(page.locator('.da-livepop')).toHaveAttribute('href', /room=actual-room/);
  await expect(page.locator('.da-livepop__illustration')).toBeVisible();
});

test('snapshot contains both published tiles and no media permission request', async ({ page }) => {
  await page.goto('about:blank');
  await page.addScriptTag({ path: path.join(app, 'js/room-snapshot.js') });
  const result = await page.evaluate(async () => {
    const tile = color => { const c = document.createElement('canvas'); c.width = c.height = 300; const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 300, 300); return c; };
    let mediaCalls = 0;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { mediaCalls++; throw new Error('No media permission should be requested'); };
    const data = window.DBRoomSnapshot.capture([{ name: 'Alex', source: tile('#ff0000') }, { name: 'Sam', source: tile('#0000ff') }], 'Cities should have more parks');
    const img = new Image(); img.src = data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    return { width: img.width, height: img.height, left: [...ctx.getImageData(150, 160, 1, 1).data], right: [...ctx.getImageData(470, 160, 1, 1).data], mediaCalls, empty: window.DBRoomSnapshot.capture([{ name: 'A' }, { name: 'B' }], 'Topic') };
  });
  expect(result.width).toBe(640); expect(result.height).toBe(360);
  expect(result.left[0]).toBeGreaterThan(245); expect(result.left[2]).toBeLessThan(10);
  expect(result.right[2]).toBeGreaterThan(245); expect(result.right[0]).toBeLessThan(10);
  expect(result.empty).toBeNull(); expect(result.mediaCalls).toBe(0);
});
