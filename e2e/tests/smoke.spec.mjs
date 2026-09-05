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
  // 2026-09-05: the first screen runs first_screen_claim_v1, a sticky 50/50.
  // A cold browser lands in either arm, and the 'claim' arm keeps the doors
  // hidden until a side is picked, so the door test pins the 'doors' arm
  // and the claim arm gets its own test below. ?fsclaim= is the QA force.
  test('landing serves the first screen and the Debate door', async ({ page }) => {
    const errors = trackErrors(page);
    const res = await page.goto('/?fsclaim=doors');
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

  test('landing claim arm: a pick reveals the Debate door and prefills the AI door', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?fsclaim=claim');
    await expect(page.locator('#fsClaim')).toBeVisible();
    await expect(page.locator('.fs-cta--primary:visible')).toHaveCount(0);
    await page.locator('.fs-claim-row').first().locator('[data-pick="against"]').click();
    const cta = page.locator('.fs-cta--primary:visible').first();
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute('href')).toBe('/spar');
    const ai = page.locator('.fs-actions .fs-cta--ai');
    expect(await ai.getAttribute('href')).toMatch(/^\/newvoice\?motion=.+&side=against&handoff=first-screen-claim$/);
    expect(errors, 'uncaught exceptions on the landing').toEqual([]);
  });

  // /spar is a LIVE queue with humans in it, so these two tests stop one
  // step short of writing a queue doc. The first-timer path (2026-09-04,
  // 8231f5ab: one anonymous round before the Google door) mints a guest
  // session and then asks the one-time age question; answering it is what
  // queues, so neither test ever touches the age dialog. A CI browser that
  // reaches the searching screen is an empty chair a real person can be
  // paired with, which is the 2026-08-11 finding all over again.
  test('/spar first-timer: the Match Desk opens first, and closing it lands on a door, never the queue', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/spar');
    // 2026-09-04 (41ac4f86, 9ba3e8c7): a sessionless visitor meets the
    // Match Desk dialog first, opening on the face question. Its buttons
    // carry no ids, so select by role and accessible name.
    const desk = page.getByRole('dialog', { name: /matchmaker profile/i });
    await expect(desk).toBeVisible({ timeout: 25_000 });
    await expect(desk.getByText(/step 1 of \d/i).first()).toBeVisible();
    // The desk comes BEFORE any account ask: no Google card under it.
    await expect(page.locator('#signInBtn')).toHaveCount(0);
    // Closing the desk is the shortest path a real person takes past it.
    // What follows is data-dependent by design (41ac4f86: the free guest
    // round only runs into a queue with someone in it): either the
    // one-time age question, or the Google gate saying the queue is
    // empty. Both are doors. The searching screen is not, because a CI
    // browser in the live queue is an empty chair a real person can be
    // paired with (the 2026-08-11 finding).
    await desk.getByRole('button', { name: /^close$/i }).first().click();
    const age = page.getByRole('dialog', { name: /how old are you/i });
    const gate = page.locator('#signInBtn');
    await expect(age.or(gate).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#globalDebateMap')).toHaveCount(0);
    await expect(page.getByText(/keep this tab open/i)).toHaveCount(0);
    if (await age.isVisible().catch(() => false)) {
      // STOP HERE. Answering the age question is what writes the queue doc.
      await expect(age.getByRole('button', { name: /18 or older/i })).toBeVisible();
      await expect(gate).toHaveCount(0);
    } else {
      await expect(gate).toContainText(/with Google/i);
      await expect(page.locator('.gate-guest:visible, .gate-email:visible')).toHaveCount(0);
    }
    // 2026-09-03 (f06ddddf): nothing pops over the page on a timer. This
    // pop has been added and removed four times; the founder's last word
    // is out. The window is the old auto-pop delay plus slack.
    const chooser = page.locator('#ditAuth');
    await page.waitForTimeout(6_500);
    await expect(chooser).toBeHidden();
    expect(errors, 'uncaught exceptions on /spar').toEqual([]);
  });

  test('/spar without anonymous auth falls to the Google gate, and the chooser is Google-only', async ({ page }) => {
    const errors = trackErrors(page);
    // Refuse the anonymous sign-up at the network, which is the state of a
    // browser where Firebase anonymous auth is blocked. The page's own
    // fallback is the honest ask: the Google gate, not a boot state that
    // never resolves. This is also the only way to reach the gate without
    // spending the guest allowance of a real uid.
    await page.route(/identitytoolkit\.googleapis\.com\/v1\/accounts:signUp/, (route) => route.abort());
    await page.goto('/spar');
    // The mint runs on load, before the desk; when it fails the page goes
    // straight to the gate, so there is no Match Desk to skip on this path.
    // One action, Google, no email or guest door, and the founder-called
    // live count beside it (2026-08-27, kept for the post-trial gate).
    const google = page.locator('#signInBtn');
    await expect(google).toBeVisible({ timeout: 20_000 });
    await expect(google).toContainText(/with Google/i);
    await expect(page.locator('.gate-guest:visible, .gate-email:visible')).toHaveCount(0);
    await expect(page.getByText(/live now/i).first()).toBeVisible();
    // The chooser still exists behind an explicit tap (topbar Sign in), and
    // there it must be Google-only: no email, phone, or guest door, because
    // the live queue refuses all three (178be072).
    const chooser = page.locator('#ditAuth');
    await expect(chooser).toBeHidden();
    await page.locator('#barSignIn').click();
    await expect(chooser).toBeVisible({ timeout: 10_000 });
    await expect(chooser).toContainText(/with Google/i);
    await expect(chooser).not.toContainText(/email|phone|guest/i);
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
