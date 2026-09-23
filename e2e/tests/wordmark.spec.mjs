import { test, expect } from '@playwright/test';
import { offlineSite, readApp } from '../helpers/offline-site.mjs';

// Different header owners must still display the same artwork with webfonts
// unavailable. All traffic (including auth/round APIs) stays in the fixture.
const routes = ['/', '/profile', '/watch', '/spar', '/practice', '/newvoice',
  '/live-round', '/native', '/index.html', '/debate-online', '/masterclass',
  '/get-paid-to-debate', '/everyone-has-an-opinion', '/omegle-alternative',
  '/bet-on-your-words', '/float-extension/popup.html'];

for (const width of [320, 1280]) for (const route of routes) {
  test(`shared wordmark on ${route} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(theme => localStorage.setItem('da-theme', theme), width === 320 ? 'light' : 'dark');
    const artwork = [];
    page.on('response', response => {
      if (/\/(?:debatable-wordmark|wordmark)\.svg$/.test(response.url())) artwork.push(response);
    });
    const fixture = await offlineSite(page);
    await page.goto('https://debatable.test' + route);
    const logo = page.locator('.db-wordmark:visible').first();
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('aria-label', 'Debatable');
    await expect.poll(() => artwork.length).toBeGreaterThan(0);
    expect(artwork.every(response => response.ok())).toBe(true);
    const box = await logo.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.height).toBeGreaterThan(8);
    expect(box.width / box.height).toBeCloseTo(4658.2 / 749, 1);
    // A page-specific selector must not reveal the legacy text over the SVG.
    await expect(logo.locator('.db-wordmark-base')).toHaveCSS('clip-path', 'inset(50%)');
    await expect(logo).toHaveCSS('background-size', 'contain');
    expect(fixture.errors).toEqual([]);
  });
}

test('high contrast and printing retain readable logo text', async ({ page }) => {
  await offlineSite(page);
  await page.goto('https://debatable.test/debate-online');
  const logo = page.getByRole('img', { name: 'Debatable', exact: true });
  for (const media of [{ forcedColors: 'active' }, { forcedColors: 'none', media: 'print' }]) {
    await page.emulateMedia(media);
    await expect(logo).toHaveCSS('background-image', 'none');
    await expect(logo.locator('.db-wordmark-base')).toHaveCSS('clip-path', 'none');
    await expect(logo).toHaveText('Debatable');
  }
});

test('download and extension artwork use the same outlined letters', () => {
  const header = readApp('assets/logo/debatable-wordmark.svg');
  const square = readApp('assets/logo/debatable-logo.svg');
  const path = header.match(/<path[^>]+>/)[0];
  expect(square).toContain(path);
  expect(readApp('float-extension/wordmark.svg')).toBe(header);
  expect(header).not.toMatch(/<text|font-family/);
});
