// The one segment that talks to a model: /newvoice's signed-out preview
// ("Test it out"), driven with a fake microphone. Chromium's fake audio
// capture plays demo/out/mic.wav (9s of silence so the AI opener lands, then
// one spoken argument, then silence) as the mic. The screencast has no audio
// track; the recording shows what the page shows. Spends one bounded
// preview session (the server hangs it up itself inside ~50s).
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openContext, finish, glide, sleep, BASE_URL, stamp } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIC = path.join(HERE, 'out', 'mic.wav');
if (!fs.existsSync(MIC)) throw new Error('missing ' + MIC);
const frame = process.argv[2] || 'desktop';
const tag = `ai-live-${frame}`;

const HEADED = !!process.env.HEADED;
const browser = await chromium.launch({
  channel: HEADED ? 'chrome' : 'chromium',
  headless: !HEADED,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${MIC}`, '--autoplay-policy=no-user-gesture-required', ...(HEADED ? ['--disable-blink-features=AutomationControlled'] : [])],
});
const { context, page } = await openContext(browser, frame, tag);
await context.grantPermissions(['microphone'], { origin: BASE_URL });
page.on('response', (r) => { const u = r.url(); if (u.includes('/api/')) console.log('  [api]', r.status(), u.replace(BASE_URL, '').slice(0, 70)); });
page.on('console', (m) => { const t = m.text(); if (/realtime|session|mic|error|SDP|preview/i.test(t)) console.log('  [console]', t.slice(0, 140)); });
stamp(`${tag}: start`);
try {
  await page.goto(BASE_URL + '/newvoice', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  await glide(page, page.locator('.guide-chip').first(), { steps: 30, settle: 500 });
  await sleep(1500);
  await glide(page, page.locator('.topic-cat').filter({ hasText: /Relationships/ }).first(), { steps: 26 });
  await sleep(1300);
  await glide(page, page.locator('.claim-opt').filter({ hasText: /split bills/i }).first(), { steps: 24 });
  await sleep(900);
  await glide(page, page.locator('.side-btn.for').first(), { steps: 22 });
  await sleep(800);
  await glide(page, '#topicNextBtn', { steps: 26, settle: 450 });
  await sleep(1500);
  await glide(page, page.locator('.voice-opt').filter({ hasText: /Cedar/ }).first(), { steps: 26 });
  await sleep(800);
  await glide(page, page.locator('.wiz-next:visible').first(), { steps: 26, settle: 450 });
  await sleep(1600);
  const sb = page.locator('#startBtn').first();
  const bb = await sb.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 30 });
  await sleep(700);
  await page.mouse.down(); await sleep(70); await page.mouse.up();
  // Watch the round for up to 48s, logging what the stage says.
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < 48000) {
    await sleep(3000);
    const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)).catch(() => '');
    if (txt !== last) { console.log(`  [stage +${Math.round((Date.now() - t0) / 1000)}s]`, txt.slice(0, 260)); last = txt; }
    if (/Keep talking|sign in to keep/i.test(txt)) { await sleep(2500); break; }
  }
  await page.screenshot({ path: `demo/out/${tag}-end.png` }).catch(() => {});
} catch (e) {
  console.error(`[${tag}] FAILED`, String(e).split('\n')[0]);
  await page.screenshot({ path: `demo/out/fail-${tag}.png` }).catch(() => {});
}
const out = await finish(context, page, tag);
stamp(`${tag}: saved ${out}`);
await browser.close();
