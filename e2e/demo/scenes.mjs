// Scene survey: screenshot every candidate surface (real pages + the room's
// design fixtures) so the flow scripts are written against what actually
// renders, not against the docs.
import { launch, UA, BASE_URL, sleep } from './lib.mjs';
import fs from 'node:fs';
const SCENES = [
  ['spar-mpdemo', '/spar?mpdemo=1'],
  ['spar-searchdemo', '/spar?searchdemo=1'],
  ['lr-ready', '/live-round?design=ready'],
  ['lr-ready-open', '/live-round?design=ready&format=open'],
  ['lr-speaking', '/live-round?design=speaking'],
  ['lr-speaking-open', '/live-round?design=speaking&format=open'],
  ['lr-deciding', '/live-round?design=deciding'],
  ['lr-ballot', '/live-round?design=ballot'],
  ['lr-finish', '/live-round?design=finish'],
  ['newvoice', '/newvoice'],
  ['leaderboard', '/leaderboard'],
  ['watch', '/watch'],
];
const frame = process.argv[2] === 'phone' ? { w: 432, h: 768, dsf: 2, mobile: true } : { w: 1440, h: 810, dsf: 1, mobile: false };
const browser = await launch();
const context = await browser.newContext({ userAgent: UA, viewport: { width: frame.w, height: frame.h }, deviceScaleFactor: frame.dsf, isMobile: frame.mobile, hasTouch: frame.mobile });
await context.route(/\/api\/(log-event|presence-live|live-now|visitor-tick)|posthog|googletagmanager|google-analytics/, (r) => r.abort());
fs.mkdirSync('demo/out/scenes', { recursive: true });
for (const [name, path] of SCENES) {
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  try {
    await page.goto(BASE_URL + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4500);
    const info = await page.evaluate(() => {
      const vids = [...document.querySelectorAll('video')].map((v) => { const r = v.getBoundingClientRect(); return `${v.id || v.className.toString().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`; });
      const btns = [...document.querySelectorAll('button, a[href]')].filter((b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return r.width > 20 && r.height > 14 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.top < innerHeight && r.bottom > 0; }).map((b) => `${(b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}${b.id ? '#' + b.id : ''}`).filter(Boolean);
      return { title: document.title, vids, btns: btns.slice(0, 30), h: document.documentElement.scrollHeight };
    });
    console.log(`\n=== ${name} ${path} | ${info.title} | h=${info.h} | vids: ${info.vids.join(' ; ') || 'none'}\n  btns: ${info.btns.join(' | ')}${errs.length ? '\n  ERR: ' + errs.join(' || ') : ''}`);
    await page.screenshot({ path: `demo/out/scenes/${frame.mobile ? 'p-' : ''}${name}.png` });
  } catch (e) { console.log(`\n=== ${name} FAILED ${String(e).slice(0, 160)}`); }
  await page.close();
}
await browser.close();
