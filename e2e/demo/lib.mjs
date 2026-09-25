// Shared recorder setup for the product demo clips.
//
// Records the REAL site (production by default) through Playwright's
// screencast, with the same edge-filter posture as the smoke tests: a plain
// Chrome UA plus channel 'chromium', or every navigation dies at the edge
// with a 204. A synthetic pointer (cursor.js) is injected because the
// screencast never paints the OS cursor.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASE_URL = process.env.BASE_URL || 'https://itsdebatable.com';
export const OUT_DIR = process.env.DEMO_OUT || path.join(HERE, 'out');
export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 DebatableDemo/1';
const CURSOR = fs.readFileSync(path.join(HERE, 'cursor.js'), 'utf8');

// Screencasts use CSS pixels, regardless of deviceScaleFactor. Capture at
// the viewport size; the assembler scales to the final export dimensions.
export const FRAMES = {
  desktop: { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, size: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false },
  phone:   { viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, size: { width: 1080, height: 1920 }, isMobile: true, hasTouch: true },
};

export async function launch(opts = {}) {
  return chromium.launch({
    channel: 'chromium',
    headless: opts.headless !== false,
    args: opts.args || [],
  });
}

export async function openContext(browser, frame, name, extra = {}) {
  const f = FRAMES[frame];
  const dir = path.join(OUT_DIR, 'raw', name);
  fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: f.viewport,
    deviceScaleFactor: f.deviceScaleFactor,
    isMobile: f.isMobile,
    hasTouch: f.hasTouch,
    colorScheme: extra.colorScheme || 'light',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    recordVideo: { dir, size: f.viewport },
    ...(extra.context || {}),
  });
  await context.addInitScript(`window.__demoTouch = ${f.hasTouch ? 'true' : 'false'};`);
  await context.addInitScript(CURSOR);
  await context.route(/\/api\/(log-event|presence-live|live-now|visitor-tick|spar-queue)|posthog|googletagmanager|google-analytics|clarity/, (r) => r.abort());
  // Never let a stale pick or a dismissed prompt from a previous run leak
  // into a recording: every context starts with empty storage anyway, but
  // theme and the first-screen arm are set explicitly so runs are identical.
  await context.addInitScript(() => {
    try { localStorage.setItem('debatable-theme', 'light'); } catch (e) {}
  });
  const page = await context.newPage();
  const t0 = Date.now();
  page.on('pageerror', (e) => console.warn('[pageerror]', name, String(e).slice(0, 200)));
  // mark(label) prints seconds since the recording started, so a segment can
  // report where its cuts belong instead of anyone measuring frames.
  const mark = (label) => console.log(`  MARK ${name} ${label} ${((Date.now() - t0) / 1000).toFixed(2)}`);
  return { context, page, dir, t0, mark };
}

// Close the context (which finalizes the webm) and move it to a stable name.
export async function finish(context, page, name) {
  const video = page.video();
  await context.close();
  const src = await video.path();
  const dest = path.join(OUT_DIR, 'raw', `${name}.webm`);
  fs.renameSync(src, dest);
  return dest;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Smooth pointer travel to an element's centre, then an optional click.
export async function glide(page, target, { steps = 28, click = true, offset = null, settle = 350 } = {}) {
  const loc = typeof target === 'string' ? page.locator(target).first() : target;
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (!box) throw new Error('no box for ' + target);
  const x = box.x + (offset ? offset.x : box.width / 2);
  const y = box.y + (offset ? offset.y : box.height / 2);
  await page.mouse.move(x, y, { steps });
  await sleep(settle);
  if (click) { await page.mouse.down(); await sleep(70); await page.mouse.up(); }
  return { x, y };
}

// Typing that reads like a person, not a paste.
export async function humanType(page, text, { min = 28, max = 70 } = {}) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(min + Math.random() * (max - min));
  }
}

// Wheel scroll in small steps so the recording shows motion, not a jump.
export async function scrollBy(page, dy, { step = 80, pause = 26 } = {}) {
  const dir = dy < 0 ? -1 : 1;
  let left = Math.abs(dy);
  while (left > 0) {
    const d = Math.min(step, left);
    await page.mouse.wheel(0, dir * d);
    left -= d;
    await sleep(pause);
  }
}

export function stamp(label) {
  const t = new Date().toISOString().slice(11, 23);
  console.log(`[${t}] ${label}`);
}
