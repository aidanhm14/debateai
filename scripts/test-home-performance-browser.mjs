import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('app');
const html = await readFile(root + '/landing.html', 'utf8');
const globeScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes("var canvas = document.getElementById('heroGlobeCanvas')"));
assert(globeScript);
const globe = globeScript.slice(globeScript.indexOf("  (function(){\n    var canvas = document.getElementById('heroGlobeCanvas')"));
const server = createServer(async (req, res) => {
  let name = new URL(req.url, 'http://localhost').pathname;
  if (name === '/__globe') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<html data-theme="light"><style>body{margin:0;height:4000px}canvas{display:block;width:384px;height:384px}</style><canvas id="heroGlobeCanvas"></canvas><script src="/js/world-data.js"></script><script>' + globe + '</script>'); return;
  }
  if (name === '/') name = '/landing.html';
  try { const body = await readFile(root + name);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' })[extname(name)] || 'application/octet-stream');
    res.end(body);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { channel: 'chrome' } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const errors = [], media = [];
await context.addInitScript(() => {
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  window.__globeDraws = 0;
  window.__homeShifts = [];
  new PerformanceObserver(list => list.getEntries().forEach(entry => {
    if (!entry.hadRecentInput) window.__homeShifts.push({ value: entry.value,
      hero: entry.sources.some(source => source.node?.classList?.contains('hero-founder-frame')) });
  })).observe({ type: 'layout-shift', buffered: true });
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (this.canvas.id === 'heroGlobeCanvas') window.__globeDraws++;
    return clear.apply(this, args);
  };
});
await context.route('**/*', async route => {
  const u = new URL(route.request().url());
  if (u.origin !== base) return route.abort();
  if (u.pathname === '/css/ui.css') await new Promise(r => setTimeout(r, 350));
  if (u.pathname.endsWith('.mp4')) media.push(u.pathname);
  if (u.pathname.startsWith('/api/')) return route.fulfill({ json: { rooms: [], entries: [], count: 0, online24: 0, pins: [], live: false, stream: null, challenges: [], messages: [] } });
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
const draws = () => page.evaluate(() => window.__globeDraws);
try {
  await page.goto(base + '/__globe'); await page.waitForTimeout(300);
  let before = await draws(); await page.waitForTimeout(1100);
  let frames = await draws() - before;
  assert(frames >= 15 && frames <= 36, 'Visible globe is capped near 30fps: ' + frames);
  await page.evaluate(() => scrollTo(0, 800)); await page.waitForTimeout(200);
  before = await draws(); await page.waitForTimeout(300);
  assert.equal(await draws(), before, 'Offscreen globe stops drawing');
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
  assert(await draws() > before, 'Globe resumes on return');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  before = await draws(); await page.waitForTimeout(200);
  assert.equal(await draws(), before, 'Pagehide stops the frame chain');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await page.waitForTimeout(200); assert(await draws() > before, 'Back-forward restore resumes');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload(); await page.waitForTimeout(300);
  before = await draws(); await page.waitForTimeout(200);
  assert.equal(await draws(), before, 'Reduced motion stays still');
  await page.setViewportSize({ width: 1200, height: 800 }); await page.waitForTimeout(250);
  assert(await draws() > before, 'Reduced-motion resize repaints the cleared canvas');
  before = await draws(); await page.mouse.move(160, 160); await page.mouse.down(); await page.mouse.move(210, 160); await page.mouse.up();
  assert(await draws() > before, 'Reduced-motion manual drag still works');
  await page.goto(base + '/'); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__homeShifts.some(s => s.hero && s.value > 0.1)), false,
    'Late shared CSS cannot move the whole hero after first paint');
  assert.equal(await page.locator('#fsVidA,#fsVidB').evaluateAll(vs => vs.some(v => v.hasAttribute('src'))), false, 'Reduced motion does not allocate clip decoders');
  assert.equal(media.length, 0, 'Reduced motion does not fetch face videos');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload(); await page.waitForFunction(() => [...document.querySelectorAll('#fsVidA,#fsVidB')].some(v => v.getAttribute('src')));
  const topic = await page.locator('#fsMotion').textContent();
  await page.locator('#fsNext').click();
  await page.waitForFunction(old => document.getElementById('fsMotion').textContent !== old, topic);
  await page.evaluate(() => document.getElementById('heroGlobeCanvas').scrollIntoView());
  await page.waitForTimeout(15600);
  assert.equal(await page.locator('#fsVidA,#fsVidB').evaluateAll(vs => vs.some(v => v.hasAttribute('src'))), false, 'Offscreen board releases video resources');
  await page.evaluate(() => document.getElementById('fsBoard').scrollIntoView());
  await page.waitForFunction(() => [...document.querySelectorAll('#fsVidA,#fsVidB')].some(v => v.getAttribute('src')));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal(await page.locator('#fsVidA,#fsVidB').evaluateAll(vs => vs.some(v => v.hasAttribute('src'))), false, 'Pagehide releases media immediately');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await page.waitForFunction(() => [...document.querySelectorAll('#fsVidA,#fsVidB')].some(v => v.getAttribute('src')));
  await page.locator('#landing-more-toggle').click();
  assert.equal(await page.locator('#landing-more-toggle').getAttribute('aria-expanded'), 'true');
  await page.locator('#landing-more-toggle').click();
  assert.equal(await page.locator('#landing-more-toggle').getAttribute('aria-expanded'), 'false');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await page.reload(); await page.waitForTimeout(500);
    assert(await page.locator('#fsBoard').isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No overflow at ' + width);
  }
  assert.deepEqual(errors, []);
  console.log('Chrome home performance: 30fps globe, offscreen pause, resize/drag under reduced motion, media release/resume, history, carousel and mobile passed.');
} finally { await browser.close(); server.close(); }
