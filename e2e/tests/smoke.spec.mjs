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
  test.beforeEach(async ({ page }) => {
    // A real waiting-person invitation must not cover navigation controls
    // during these signed-out checks. Queue entry is never exercised here.
    await page.route('**/api/live-now', route => route.fulfill({
      json: { count: 0, debaters: [], windowSec: 360, at: Date.now() },
    }));
  });

  // 517173c5 retired first_screen_claim_v1 on 2026-09-05. The doors now
  // appear on arrival; test the ordinary URL without a retired QA override.
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

  test('landing keeps all three doors visible for a returning claim-arm visitor', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => localStorage.setItem('da-fsclaim-ab', 'claim'));
    await page.goto('/?fsclaim=claim');
    await expect(page.locator('#first-screen')).toBeVisible();
    const actions = page.locator('#first-screen .fs-actions');
    for (const [selector, href] of [
      ['.fs-cta--primary', '/spar'],
      ['.fs-cta--watch', '/watch'],
      ['.fs-cta--ai', '/newvoice?handoff=landing-quick-ai'],
    ]) {
      const cta = actions.locator(selector);
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', href);
    }
    expect(errors, 'uncaught exceptions on the landing').toEqual([]);
  });

  // /spar is a LIVE queue with humans in it. Keep these browsers signed
  // out: the questionnaire comes first, then Google/Apple before any queue
  // entry. Neither test authenticates or writes a queue document.
  test('/spar first-timer: AI MATCHMAKING opens first, and closing it requires sign-in', async ({ page }) => {
    const errors = trackErrors(page);
    // A deterministic empty queue keeps the waiting-person invitation
    // from covering Close while this test checks the dismissal path.
    await page.route('**/api/spar-queue', route => route.fulfill({ json: { waiting: 0 } }));
    await page.goto('/spar');
    const desk = page.getByRole('dialog', { name: /AI MATCHMAKING/i });
    await expect(desk).toBeVisible({ timeout: 25_000 });
    await expect(desk.getByText(/step 1 of \d/i).first()).toBeVisible();
    await expect(page.locator('#signInBtn')).toHaveCount(0);
    await desk.getByRole('button', { name: /^close$/i }).first().click();
    await expect(page.locator('#signInBtn')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#signInBtn')).toContainText(/with Google/i);
    await expect(page.locator('#appleInBtn')).toBeVisible();
    await expect(page.getByRole('dialog', { name: /how old are you/i })).toHaveCount(0);
    await expect(page.locator('.gate-guest:visible, .gate-email:visible')).toHaveCount(0);
    await expect(page.locator('#globalDebateMap')).toHaveCount(0);
    await expect(page.getByText(/keep this tab open/i)).toHaveCount(0);
    // The inline sign-in gate owns this step. The cumulative timed wall
    // runs during the questionnaire, never over an existing account gate.
    await page.waitForTimeout(6_500);
    await expect(page.locator('#ditAuth')).toBeHidden();
    expect(errors, 'uncaught exceptions on /spar').toEqual([]);
  });

  test('/spar with anonymous auth blocked requires sign-in before meeting someone waiting', async ({ page }) => {
    const errors = trackErrors(page);
    let anonymousAttempts = 0;
    await page.route(/identitytoolkit\.googleapis\.com\/v1\/accounts:signUp/, (route) => {
      anonymousAttempts++;
      return route.abort();
    });
    // Only the queue READ is synthetic. Joining remains impossible here.
    await page.route('**/api/spar-queue', route => route.fulfill({ json: { waiting: 1 } }));
    await page.goto('/spar');
    const desk = page.getByRole('dialog', { name: /AI MATCHMAKING/i });
    await expect(desk).toBeVisible({ timeout: 25_000 });
    await expect(desk.locator('.mp-wait')).toBeVisible();
    await desk.getByRole('button', { name: /^sign in to meet$/i }).click();
    await expect(page.locator('#signInBtn')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#signInBtn')).toContainText(/with Google/i);
    await expect(page.locator('#appleInBtn')).toContainText(/with Apple/i);
    await expect(page.locator('.gate-guest:visible, .gate-email:visible')).toHaveCount(0);
    await expect(page.locator('#globalDebateMap')).toHaveCount(0);
    await expect(page.locator('#ditAuth')).toBeHidden();
    expect(anonymousAttempts, 'live onboarding must not mint a guest session').toBe(0);
    expect(errors, 'uncaught exceptions on /spar').toEqual([]);
  });

  test('/watch renders its static copy without JavaScript help', async ({ page, request }) => {
    const errors = trackErrors(page);
    await page.goto('/watch');
    // 14696eef put three <h1 class="page-title"> in the markup (home plus
    // the two gallery mastheads, which CSS hides until JS stamps
    // data-watch-gallery), so a class locator resolves three nodes and
    // strict mode throws. The promise to a stranger is about what RENDERS:
    // exactly one level-1 heading, and it says Watch. getByRole reads the
    // accessibility tree, so display:none headings do not count, and the
    // count guard fails the day a second one becomes visible.
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(/Watch/);
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
