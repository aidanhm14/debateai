import { test, expect } from '@playwright/test';
import { offlineSite } from '../helpers/offline-site.mjs';

for (const width of [390, 1280]) {
  test(`the complete room displays its decision at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await offlineSite(page);
    await page.goto('https://debatable.test/live-round?design=ballot');
    await expect(page.locator('#ballotResult')).toBeVisible();
    await expect(page.locator('#ballotResult .verdict-headline')).toHaveText('Jordan wins');
    await expect(page.locator('#ballotResult .pts')).toHaveText(['76', '79']);
    await expect(page.locator('#ballotReadBlock')).toContainText('funding gap');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(fixture.errors).toEqual([]);
    expect(fixture.requests.filter(request => request.path === '/api/async-submit')).toEqual([]);
  });
}
