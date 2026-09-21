import { test, expect } from '@playwright/test';
import { roomDesign } from '../helpers/room-design.mjs';

for (const width of [360, 768, 1360]) {
  test(`resolution, controls and disclosures work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await roomDesign(page);
    await page.goto('https://debatable.test/live-round?design=ready');
    await expect(page.locator('#rmbMotion')).toContainText('Cities should ban');
    await expect(page.locator('#roundOwnSide')).toContainText('FOR');
    await expect(page.locator('#privacyToggleLabel')).toHaveText('Public round');
    await expect(page.locator('#privacyToggle')).toHaveText('Make private');
    await expect(page.locator('#playPauseBtn')).toBeVisible();
    if (width >= 1000) {
      const button = await page.locator('#playPauseBtn').boundingBox();
      expect(button.y + button.height).toBeLessThan(900);
      await expect(page.locator('#roundDetails>summary')).toBeInViewport();
    }
    const details = await page.locator('#roundDetails').boundingBox();
    expect(details.x + details.width).toBeLessThanOrEqual(width);
    if (width <= 760) {
      await expect(page.locator('#roomChatBtn')).toBeVisible();
      await page.locator('#roomChatBtn').click();
      await expect(page.locator('#audPanel')).toBeVisible();
      await page.locator('#audClose').click();
    }
    await page.locator('#roundDetails>summary').click();
    await expect(page.locator('#roundPlan')).toContainText('16 minutes');
    await expect(page.locator('#roundPlan li')).toHaveCount(4);
    await page.locator('#rmbToolsLabel').click();
    await expect(page.locator('#rmbTools button:visible')).toHaveCount(2);
    await expect(page.locator('#rmbRollBtn')).toContainText('Spin another topic');
    await page.locator('#rmbChangeBtn').click();
    await expect(page.getByRole('dialog', { name: 'Propose a topic' })).toBeVisible();
    await expect(page.locator('#motionModalText')).toBeFocused();
    await page.locator('#motionModalText').fill('Cities should make public transport free.');
    await page.locator('#motionModalCancel').click();
    await expect(page.locator('#rmbMotion')).toContainText('Cities should ban');
    await page.locator('#roomTranscript>summary').click();
    await expect(page.locator('#speechText')).toBeVisible();
    await expect(page.locator('#speechText')).toHaveAttribute('readonly', '');
    await page.locator('.room-resources [data-round-flow]').click();
    await expect(page.getByRole('dialog', { name: 'Round map' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(fixture.errors).toEqual([]);
  });
}

test('waiting speaker keeps locked controls and clear side assignment', async ({ page }) => {
  const fixture = await roomDesign(page);
  await page.goto('https://debatable.test/live-round?design=ready&mySide=con');
  await expect(page.locator('#roundOwnSide')).toContainText('AGAINST');
  await expect(page.locator('#playPauseBtn')).toBeDisabled();
  await expect(page.locator('#roundSidePair')).toContainText('Jordan');
  expect(fixture.errors).toEqual([]);
});

test('audience transcript opens from the existing menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await roomDesign(page);
  await page.goto('https://debatable.test/live-round?design=spectator');
  await page.locator('[data-sm="transcript"]').click();
  await expect(page.locator('#roomTranscript')).toHaveAttribute('open', '');
  await expect(page.locator('.transcript-title')).toBeVisible();
  expect(fixture.errors).toEqual([]);
});

test('conversation transcript uses one disclosure and keeps the combined flow', async ({ page }) => {
  const fixture = await roomDesign(page);
  await page.goto('https://debatable.test/live-round?design=finish');
  await page.locator('#roomTranscript>summary').click();
  await expect(page.locator('#conversationFlow')).toBeVisible();
  await expect(page.locator('#speechText')).toBeHidden();
  await expect(page.locator('#roomTranscript details')).toHaveCount(0);
  expect(fixture.errors).toEqual([]);
});
