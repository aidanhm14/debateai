// Post-deploy smoke. Every assertion here is a promise the site makes to a
// stranger, checked in a real browser against the live deploy. Keep each
// test independent and cheap; the suite is meant to finish in under a
// minute so it can run after every push to main.
import { test, expect } from '@playwright/test';
import vm from 'node:vm';

// Uncaught exceptions that are KNOWN and open, not accepted. Each entry
// is a bug someone should fix; it lives here so the smoke does not flake
// on it while it is open, and it is surfaced as an annotation on every
// run it appears in. Delete the entry when the bug is fixed.
const KNOWN_OPEN = [
  // 2026-09-03: intermittent on /. Six shared modules each lazily inject
  // firebase-app-compat; whichever lands last owns window.firebase and a
  // module that already grabbed the old namespace calls firebase.auth()
  // before initializeApp. Seen once in a 3-worker suite run; 0 of 4 serial
  // loads reproduced it, so it is timing-dependent and still open.
  /No Firebase App '\[DEFAULT\]' has been created/,
];

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => {
    const msg = String((e && e.message) || e);
    if (KNOWN_OPEN.some((re) => re.test(msg))) {
      test.info().annotations.push({ type: 'known-open-bug', description: msg });
      return;
    }
    errors.push(msg);
  });
  return errors;
}

test.describe('public pages', () => {
  test('landing serves the first screen and the Debate door', async ({ page }) => {
    const errors = trackErrors(page);
    const res = await page.goto('/');
    // A 204 here means the edge filter classified the test browser as a bot
    // and served nothing; see the userAgent note in playwright.config.mjs.
    expect(res.status(), 'edge filter must serve the test browser').toBe(200);
    await expect(page.locator('#first-screen')).toBeVisible();
    await expect(page.locator('.fs-board-debate, .fb-floating')).toHaveCount(0);
    const cta = page.locator('.fs-cta--primary:visible').first();
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute('href')).toBe('/spar');
    expect(errors, 'uncaught exceptions on the landing').toEqual([]);
  });

  test('/spar signed out opens the Match Desk, then the Google gate', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/spar');
    // 2026-09-02: a sessionless visitor meets the six-step Match Desk first.
    // Its buttons carry no ids, so select by accessible name.
    const skip = page.getByRole('button', { name: /meet someone asap/i }).first();
    await expect(skip).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/step 1 of \d/i).first()).toBeVisible();
    await skip.click();
    // Skip lands on the gate (2026-08-27): one action, Google, no email or
    // guest door, and the founder-called live count beside it.
    const google = page.locator('#signInBtn');
    await expect(google).toBeVisible({ timeout: 15_000 });
    await expect(google).toContainText(/with Google/i);
    await expect(page.locator('.gate-guest:visible, .gate-email:visible')).toHaveCount(0);
    await expect(page.getByText(/live now/i).first()).toBeVisible();
    // 2026-08-31: the shared chooser opens over the gate, Google-only
    // (liveVideo). It must never offer an email, phone, or guest door here,
    // because the live queue refuses all three.
    const chooser = page.locator('#ditAuth');
    await expect(chooser).toBeVisible({ timeout: 10_000 });
    await expect(chooser).toContainText(/with Google/i);
    await expect(chooser).not.toContainText(/email|phone|guest/i);
    expect(errors, 'uncaught exceptions on /spar').toEqual([]);
  });

  test('/watch renders its static copy without JavaScript help', async ({ page, request }) => {
    const errors = trackErrors(page);
    await page.goto('/watch');
    await expect(page.locator('h1.page-title')).toContainText(/Watch/);
    const sm = await request.get('/sitemap-recordings.xml');
    expect(sm.status()).toBe(200);
    expect(await sm.text()).toMatch(/<(urlset|sitemapindex)/);
    expect(errors, 'uncaught exceptions on /watch').toEqual([]);
  });

  test('/practice mounts the React app', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/practice');
    await expect(page.locator('#root > *').first()).toBeVisible({ timeout: 25_000 });
    expect(errors, 'uncaught exceptions on /practice').toEqual([]);
  });

  test('retired routes redirect into the casual product', async ({ request }) => {
    const r = await request.get('/partners', { maxRedirects: 0 });
    expect(r.status()).toBe(301);
    expect(r.headers()['location'] || '').toMatch(/\/spar$/);
  });
});

test.describe('service worker', () => {
  test('sw.js parses and carries a CACHE_NAME', async ({ request }) => {
    const r = await request.get('/sw.js');
    expect(r.status()).toBe(200);
    const text = await r.text();
    // A 0-byte sw.js reached production twice; unresolved conflict markers once.
    expect(text.length).toBeGreaterThan(2000);
    expect(text).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m);
    expect(text).toMatch(/CACHE_NAME\s*=\s*'debateos-v\d+'/);
    expect(() => new vm.Script(text, { filename: 'sw.js' })).not.toThrow();
  });
});

test.describe('api gates and public reads', () => {
  test('/api/claude refuses a tokenless call before spending anything', async ({ request }) => {
    const r = await request.post('/api/claude', {
      headers: { 'content-type': 'application/json' },
      data: { model: 'claude-sonnet-5', max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] },
    });
    expect([401, 403], 'App Check must stay hard-enforced').toContain(r.status());
  });

  test('public read endpoints answer with their documented shapes', async ({ request }) => {
    const live = await request.get('/api/watch-live');
    expect(live.status()).toBe(200);
    const liveBody = await live.json();
    expect(typeof liveBody.count).toBe('number');
    expect(Array.isArray(liveBody.rounds)).toBe(true);

    const queue = await request.get('/api/spar-queue');
    expect(queue.status()).toBe(200);
    expect(typeof (await queue.json()).waiting).toBe('number');
  });

  test('the judge charter is served and its season calendar has not expired', async ({ request }) => {
    const r = await request.get('/api/judge/charter');
    expect(r.status()).toBe(200);
    const charter = await r.json();
    expect(charter && typeof charter).toBe('object');
    // AGENTS.md: extend the calendar before the last `to` passes. A true
    // here means rounds are being judged under no declared configuration.
    expect(charter.calendarExpired, 'judge season calendar expired').not.toBe(true);
  });
});
