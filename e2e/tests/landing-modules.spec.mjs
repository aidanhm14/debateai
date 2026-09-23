import { test, expect } from '@playwright/test';
import { offlineSite } from '../helpers/offline-site.mjs';

for (const width of [390, 1280]) for (const count of [0, 1, 2]) {
  test(`landing sections work at ${width}px with ${count} public live rounds`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      let seed = 314159;
      Math.random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
      localStorage.setItem('da-theme', 'light');
    });
    const missing = [];
    page.on('response', response => {
      if (/\/(?:css|js)\/landing\//.test(response.url()) && !response.ok()) missing.push(response.url());
    });
    const fixture = await offlineSite(page, { api: url => url.pathname === '/api/watch-live'
      ? { json: { count, rounds: count ? [{ room: 'fixture-room' }, ...(count > 1 ? [{ room: 'second-room' }] : [])] : [] } }
      : undefined });
    await page.goto('https://debatable.test/');
    const home = page.locator(width < 720 ? '#mhome' : '#first-screen');
    await expect(home.getByRole('link', { name: 'Meet someone', exact: true })).toHaveAttribute('href', '/spar');
    const meetBox = await home.getByRole('link', { name: 'Meet someone', exact: true }).boundingBox();
    const boardBox = await page.locator('#fsBoard').boundingBox();
    // The original action stays compact: no oversized SVG can stretch it.
    expect(meetBox.height).toBeLessThan(width < 720 ? 220 : 120);
    expect(meetBox.x + meetBox.width).toBeLessThanOrEqual(width);
    if (width < 720) expect(meetBox.y + meetBox.height).toBeLessThanOrEqual(boardBox.y);
    else expect(boardBox.y + boardBox.height).toBeLessThanOrEqual(meetBox.y);
    await expect(home.getByRole('link', { name: /^Debate the AI/ })).toHaveAttribute('href', '/newvoice?handoff=landing-' + (width < 720 ? 'mobile' : 'quick') + '-ai');
    await expect.poll(() => fixture.requests.some(r => r.path === '/api/watch-live')).toBe(true);
    const spectate = home.locator('[data-fs-watch-live]');
    if (!count) await expect(spectate).toBeHidden();
    else {
      await expect(spectate).toBeVisible();
      await expect(spectate).toHaveAttribute('href', count === 1 ? '/live-round?room=fixture-room&spectate=1' : '/spectate');
    }
    const motion = page.locator('#fsMotion');
    await expect(motion).not.toBeEmpty();
    const first = await motion.innerText();
    await page.getByRole('button', { name: 'Next example round', exact: true }).click();
    await expect(motion).not.toHaveText(first);
    await page.getByRole('button', { name: 'Previous example round', exact: true }).click();
    await expect(motion).toHaveText(first);
    if (width > 720) {
      const toggle = page.locator('#landing-more-toggle');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#faq')).toBeVisible();
    }
    expect(missing).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}
