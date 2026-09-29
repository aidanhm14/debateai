import { test, expect } from '@playwright/test';
import { readApp, offlineSite } from '../helpers/offline-site.mjs';

const jurors = [
  { pinnedModel: 'claude-opus-5-5', available: true },
  { pinnedModel: 'gpt-6-astra', available: true },
  { pinnedModel: 'gemini-3.8-flash', available: true },
];
for (const width of [390, 1280]) test(`current council is readable on landing and setup at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await offlineSite(page, { api: url => url.pathname === '/api/judge/charter'
    ? { json: { running: { panelConstitutable: true, jurors } } } : null });
  for (const path of ['/', '/live-round']) {
    await page.goto('https://debatable.test' + path);
    const disclosure = page.locator('[data-judge-models]:visible').first();
    await expect(disclosure).toContainText('Claude Opus 5.5 · GPT-6 Astra · Gemini 3.8 Flash');
    await expect(disclosure).toBeVisible();
    await disclosure.scrollIntoViewIfNeeded();
    const box = await disclosure.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  }
});

test('saved ballot distinguishes actual voters, failed seats and historical model lists', async ({ page }) => {
  await page.setContent('<main id="ballot"></main>');
  await page.addScriptTag({ content: readApp('js/live-room/verdict.js') });
  const render = panel => page.evaluate(panel => {
    const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const verdict = window.DBLiveVerdict.create({ state: {}, escHtml: escape, judgeHtml: escape });
    document.querySelector('#ballot').innerHTML = verdict.ballotCouncilHtml({ panel });
  }, panel);
  const partial = { resolution: 'majority', votesCast: 2, jurorsWanted: 3, degraded: true,
    tally: { a: 2, b: 0 }, models: ['claude-opus-5-5', 'gpt-6-astra'], configuredModels: jurors.map(j => j.pinnedModel) };
  await render(partial);
  await expect(page.locator('#ballot')).toContainText('1 seat unavailable');
  await expect(page.locator('.bc-models')).toContainText('Judging models:');
  await expect(page.locator('.bc-models')).not.toContainText('gemini');
  await render({ ...partial, configuredModels: undefined });
  await expect(page.locator('.bc-models')).toContainText('Recorded panel models:');
  await render({ resolution: 'single', degraded: true, models: ['claude-opus-5-5'] });
  await expect(page.locator('#ballot')).toContainText('Single-model decision');
  await expect(page.locator('#ballot')).toContainText('fallback');
});
