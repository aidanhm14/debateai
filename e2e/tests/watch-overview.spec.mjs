import { test, expect } from '@playwright/test';
import { offlineSite } from '../helpers/offline-site.mjs';

const recording = { id: 'round-one', title: 'Should cities make public transport free?',
  motion: 'Should cities make public transport free?', proName: 'Alex', conName: 'Sam',
  duration: 4945, startTs: 1790719419, highlights: [] };
const ballot = { winner: 'pro', outcome: 'decided', proPoints: 81.5, conPoints: 72, scoreScale: 100,
  decidingIssue: 'Access and the cost of service',
  rfd: 'Alex wins on access. The case connects lower fares to the people who need transport most. Sam raises the cost of service, but does not answer the proposed funding source.',
  rfdDeep: 'The judge weighed the access benefit against the funding objection.\n\nThe final paragraph explains what decided the round.',
  dimensions: { reasoning: { pro: 9, con: 7 }, responsiveness: { pro: 8, con: 7 } } };

async function fixture(page, override) {
  await page.addInitScript(() => {
    window.firebase = { apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged: () => () => {} }) };
  });
  return offlineSite(page, { api: async (url, request) => {
    if (override) {
      const result = await override(url, request);
      if (result) return result;
    }
    if (url.pathname === '/api/recordings') {
      if (url.searchParams.has('link')) return { status: 401, json: { error: 'SIGN_IN_REQUIRED' } };
      if (url.searchParams.has('id')) return { json: { recording: { ...recording, overviewStatus: 'ready', ballot } } };
      return { json: { recordings: [recording] } };
    }
    if (url.pathname === '/api/clips') return { json: { clips: [] } };
  } });
}

for (const width of [390, 1280]) {
  test(`overview reads before video loads at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(theme => localStorage.setItem('da-watch-theme', theme), width === 390 ? 'light' : 'crimson');
    let releaseVideo;
    const videoWait = new Promise(resolve => { releaseVideo = resolve; });
    const observed = await fixture(page, async url => {
      if (url.searchParams.has('link')) { await videoWait; return { status: 401, json: {} }; }
    });
    await page.goto('https://debatable.test/watch');
    await page.locator('.replay-card').click();
    await expect(page.locator('.overview-result')).toHaveText('Alex wins');
    await expect(page.locator('.overview-score b')).toHaveText(['81.5', '72']);
    await expect(page.locator('.overview-reason')).toContainText('proposed funding source');
    await expect.poll(() => page.locator('#playerCard').evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThan(width === 390 ? 55 : 115);
    if (process.env.OVERVIEW_SCREENSHOTS) {
      await page.locator('.round-overview').screenshot({ path: `${process.env.OVERVIEW_SCREENSHOTS}/overview-${width}.png` });
    }
    expect(await page.locator('#player').getAttribute('src')).toBeNull();
    await page.getByText('Score breakdown', { exact: true }).click();
    await expect(page.locator('.overview-table')).toContainText('Reasoning');
    await expect(page.locator('.overview-table')).toContainText('Alex · For');
    await page.getByText('Read the full reasoning', { exact: true }).click();
    await expect(page.locator('#roundOverview')).toContainText('The final paragraph');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const rects = await page.evaluate(() => ({ overview: document.querySelector('.round-overview').getBoundingClientRect().bottom,
      video: document.getElementById('playerWrap').getBoundingClientRect().top }));
    expect(rects.overview).toBeLessThanOrEqual(rects.video);
    releaseVideo();
    await expect(page.locator('#playGate')).toHaveClass(/on/);
    await expect(page.locator('.overview-result')).toBeVisible();
    expect(observed.requests.filter(r => r.path === '/api/recordings' && r.method === 'POST')).toEqual([]);
    expect(observed.errors).toEqual([]);
  });
}

test('missing decisions, failed reads and retries stay distinct', async ({ page }) => {
  let mode = 'missing';
  await fixture(page, async url => {
    if (url.pathname === '/api/recordings' && url.searchParams.has('id') && !url.searchParams.has('link')) {
      if (mode === 'fail') return { status: 503, json: {} };
      if (mode === 'missing') return { json: { recording: { ...recording, overviewStatus: 'unavailable' } } };
      if (mode === 'delayed') return { json: { recording: { ...recording, overviewStatus: 'delayed' } } };
    }
  });
  await page.goto('https://debatable.test/watch?r=round-one');
  await expect(page.locator('#roundOverview')).toContainText('No public judge');
  await expect(page.locator('.overview-scores')).toHaveCount(0);
  mode = 'fail';
  await page.locator('.replay-card').click();
  await expect(page.locator('#roundOverview')).toContainText('could not load');
  mode = 'delayed';
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.locator('#roundOverview')).toContainText('could not finish this decision');
  await expect(page.locator('.overview-scores')).toHaveCount(0);
  mode = 'ready';
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.locator('.overview-result')).toHaveText('Alex wins');
});

test('draws cannot turn into an Against win and missing scores stay unscored', async ({ page }) => {
  await fixture(page, async url => {
    if (url.pathname === '/api/recordings' && url.searchParams.has('id') && !url.searchParams.has('link')) {
      return { json: { recording: { ...recording, overviewStatus: 'ready', ballot: {
        ...ballot, winner: null, outcome: 'no_winner', proPoints: null, conPoints: 72,
        rfd: 'The panel split evenly. <img src=x onerror="window.injected=true">',
      } } } };
    }
  });
  await page.goto('https://debatable.test/watch?r=round-one');
  await expect(page.locator('.overview-result')).toHaveText('No winner');
  await expect(page.locator('.overview-score b')).toHaveText(['Not scored', '72']);
  await page.locator('#player').dispatchEvent('ended');
  await expect(page.locator('#verdictReveal')).not.toHaveClass(/on/);
  await expect(page.locator('#roundOverview img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test('long saved reasons stay complete behind a readable excerpt', async ({ page }) => {
  await fixture(page, async url => {
    if (url.pathname === '/api/recordings' && url.searchParams.has('id') && !url.searchParams.has('link')) {
      return { json: { recording: { ...recording, overviewStatus: 'ready', ballot: {
        ...ballot, rfd: 'The judge compared access and cost. '.repeat(30)
          + '\n\n**The final deciding point.** <img src=x onerror="window.injected=true">',
      } } } };
    }
  });
  await page.goto('https://debatable.test/watch?r=round-one');
  await expect(page.locator('.overview-reason h4')).toHaveText("Judge's reasoning");
  const full = page.locator('.overview-reason details');
  await expect(full.locator('strong')).toBeHidden();
  expect((await page.locator('.overview-reason > p').last().innerText()).length).toBeLessThanOrEqual(650);
  await full.locator('summary').click();
  await expect(full.locator('strong')).toHaveText('The final deciding point.');
  await expect(full.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test('switching or closing rounds ignores late metadata and playback links', async ({ page }) => {
  let releaseFirst;
  const firstWait = new Promise(resolve => { releaseFirst = resolve; });
  const second = { ...recording, id: 'round-two', title: 'Second round', proName: 'Jordan' };
  await fixture(page, async url => {
    if (url.pathname !== '/api/recordings') return;
    const id = url.searchParams.get('id');
    if (!id) return { json: { recordings: [recording, second] } };
    if (id === recording.id) await firstWait;
    if (url.searchParams.has('link')) return { json: { link: '/never-play.mp4' } };
    return { json: { recording: { ...(id === recording.id ? recording : second), overviewStatus: 'ready', ballot } } };
  });
  await page.goto('https://debatable.test/watch');
  await page.locator('.replay-card').first().click();
  await page.locator('.replay-card').nth(1).click();
  await expect(page.locator('.overview-result')).toHaveText('Jordan wins');
  await page.locator('#closePlayer').click();
  releaseFirst();
  await page.waitForTimeout(150);
  await expect(page.locator('#playerCard')).not.toHaveClass(/on/);
  expect(await page.locator('#player').getAttribute('src')).toBeNull();
  await expect(page.locator('#playGate')).not.toHaveClass(/on/);
});
