#!/usr/bin/env node
// Read-only responsive audit. Defaults to source inventory; browser execution is
// explicit because Chromium process launch can be unavailable on managed hosts.
// node e2e/astra-mobile-audit.mjs --out /absolute/path
// node e2e/astra-mobile-audit.mjs --run-browser --mode mobile --out /absolute/path
// node e2e/astra-mobile-audit.mjs --run-browser --mode loading --out /absolute/path
// BASE_URL defaults to production. No accounts, queues, admin or write requests.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const output = path.resolve(option('--out', path.join(repo, 'e2e', 'astra-output')));
const base = process.env.BASE_URL || 'https://itsdebatable.com';
const mode = option('--mode', 'mobile');
const loadingRoutes = ['/', '/index', '/practice', '/spar', '/live-round', '/watch', '/leaderboard', '/pricing', '/profile'];
// Exposure proxy, explicitly NOT a traffic ranking. Update from an authorized
// GA4 export when available; source order is never represented as live traffic.
const priorityRoutes = ['/', '/debate-online', '/spar', '/newvoice', '/practice', '/voice-debate', '/live-round', '/watch', '/leaderboard', '/pricing', '/profile', '/messages', '/community', '/friends', '/predict', '/brain', '/rounds', '/settings', '/live', '/livedebates', '/topics', '/how-it-works', '/judge-integrity', '/open', '/tournaments', '/schools', '/story', '/support', '/learn', '/debate-strangers'];
const excluded = /^(?:admin[^/]*\.html|_more-preview\.html|og-image\.html|offline\.html|copy-edit\/|tools\/|extension\/|float-extension\/)/;
const safeName = s => s === '/' ? 'root' : s.replace(/^\//, '').replace(/[^a-zA-Z0-9-]/g, '_');
async function deadline(promise, milliseconds, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms`)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
await fs.mkdir(output, { recursive: true });

async function walk(dir) {
  const rows = await fs.readdir(dir, { withFileTypes: true });
  return (await Promise.all(rows.filter(x => !['node_modules', '.git'].includes(x.name)).map(async x => x.isDirectory() ? walk(path.join(dir, x.name)) : [path.join(dir, x.name)]))).flat();
}
const htmlFiles = (await walk(path.join(repo, 'app'))).filter(f => f.endsWith('.html')).sort();
const sources = [];
for (const file of htmlFiles) {
  const relative = path.relative(path.join(repo, 'app'), file);
  const source = await fs.readFile(file, 'utf8');
  const lines = source.split('\n');
  const locate = re => lines.flatMap((text, i) => re.test(text) ? [{ line: i + 1, text: text.trim().slice(0, 1200) }] : []);
  sources.push({ file: 'app/' + relative, excluded: excluded.test(relative),
    route: relative === 'landing.html' ? '/' : '/' + relative.replace(/\.html$/, '').replace(/\/index$/, ''),
    viewport: source.match(/<meta\b[^>]*name=["']viewport["'][^>]*>/i)?.[0] || null,
    safeArea: locate(/env\(safe-area-inset/), vh: locate(/\b100vh\b/),
    dynamicVh: locate(/\b100[ds]vh\b/), fixed: locate(/position\s*:\s*fixed/),
    controlRules: locate(/(?:input|textarea|select|\.composer)[^{}]*\{[^{}]*(?:font-size|font\s*:)/),
    restrictiveZoom: locate(/maximum-scale\s*=|user-scalable\s*=\s*(?:no|0)/),
    hiddenGuard: locate(/\[hidden\][^{]*\{[^}]*display\s*:\s*none/),
    animationCandidates: locate(/(?:animation[^;]*both|opacity\s*:\s*0)/),
    earlyTheme: locate(/da-theme|light-theme|data-theme/).slice(0, 8),
    fontLinks: locate(/fonts\.(?:googleapis|gstatic)|rel=["']preload["']/),
    reactRoot: locate(/id=["']root["']|react(?:-dom)?(?:\.production)?(?:\.min)?\.js/),
    firebaseScripts: locate(/<script[^>]*firebase.*compat|createElement\(['"]script['"]\)/),
  });
}
await fs.writeFile(path.join(output, 'source-inventory.json'), JSON.stringify({ generated: new Date().toISOString(), base, priorityMeaning: 'Exposure proxy, not traffic ranking', priorityRoutes, htmlFileCount: htmlFiles.length, sources }, null, 2));
console.log(`Inventoried ${sources.length} HTML files (${sources.filter(x => !x.excluded).length} public-source candidates).`);
if (!args.includes('--run-browser')) process.exit(0);
if (!['mobile', 'loading'].includes(mode)) throw new Error('--mode must be mobile or loading');

const { chromium, devices } = await import('@playwright/test');
const browser = await chromium.launch({ channel: 'chromium' });
const requested = option('--routes', '').split(',').filter(Boolean);
const desktopUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 DebatableE2E/1';

// CDP interception preserves the normal HTTP cache, unlike Playwright routing.
// Firebase Listen is read-only even though its transport is POST; permit only
// that specific endpoint. Auth token minting, telemetry and mutations are blocked.
async function protect(page) {
  const cdp = await page.context().newCDPSession(page);
  const blocked = [];
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  cdp.on('Fetch.requestPaused', async event => {
    const u = new URL(event.request.url);
    const readListen = u.hostname === 'firestore.googleapis.com' && /\/Listen\/channel$/.test(u.pathname);
    const forbidden = /\/api\/admin(?:[/-]|$)|\/.netlify\/functions\/admin/.test(u.pathname)
      || (/\/Write\/channel$/.test(u.pathname) && u.hostname === 'firestore.googleapis.com')
      || (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) && !readListen);
    try {
      if (forbidden) { blocked.push({ method: event.request.method, url: u.origin + u.pathname }); await cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }); }
      else await cdp.send('Fetch.continueRequest', { requestId: event.requestId });
    } catch { /* navigation or context already ended */ }
  });
  return { cdp, blocked };
}
function probe() {
  const visible = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const selector = e => e.id ? '#' + CSS.escape(e.id) : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).map(CSS.escape).join('.') : '');
  const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
  const exposure = e => {
    const r = e.getBoundingClientRect(), x = Math.min(innerWidth - 1, Math.max(0, r.x + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.y + r.height / 2));
    const inViewport = r.right > 0 && r.bottom > 0 && r.x < innerWidth && r.y < innerHeight;
    const hit = inViewport && document.elementFromPoint(x, y);
    return { inViewport, hitTested: !!hit, occluded: inViewport ? !(hit === e || e.contains(hit)) : null };
  };
  const all = [...document.querySelectorAll('body *')];
  const inputs = all.filter(e => e.matches('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=submit]):not([type=button]),select,textarea'));
  const ruleSources = e => {
    const found = [];
    const scan = (rules, href) => { for (const r of rules) {
      if (r.selectorText && r.style && (r.style.fontSize || r.style.font)) { try { if (e.matches(r.selectorText)) found.push({ href, selector: r.selectorText, fontSize: r.style.fontSize, font: r.style.font }); } catch {} }
      if (r.cssRules) { const active = r.type === CSSRule.MEDIA_RULE ? matchMedia(r.conditionText).matches : r.type === CSSRule.SUPPORTS_RULE ? CSS.supports(r.conditionText) : true; if (active) scan(r.cssRules, href); }
    } };
    for (const sheet of document.styleSheets) { try { scan(sheet.cssRules, sheet.href || 'inline'); } catch {} }
    if (e.style.font || e.style.fontSize) found.push({ href: 'style attribute', selector: selector(e), font: e.style.font, fontSize: e.style.fontSize });
    return found;
  };
  return {
    url: location.href, title: document.title, width: innerWidth, height: innerHeight,
    visualViewport: visualViewport && { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale, offsetTop: visualViewport.offsetTop },
    rootFont: getComputedStyle(document.documentElement).fontSize,
    viewport: document.querySelector('meta[name=viewport]')?.content,
    overflow: document.documentElement.scrollWidth > innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    edgeElements: [20, innerHeight / 2, innerHeight - 20].map(y => { const e = document.elementFromPoint(innerWidth - 1, y); return e && { y, selector: selector(e), box: box(e) }; }),
    overflowCandidates: all.filter(visible).map(e => ({ element: e, box: box(e) })).filter(x => x.box.right > innerWidth + 1 || x.box.x < -1).slice(0, 60).map(x => ({ selector: selector(x.element), text: x.element.textContent.trim().slice(0, 90), ...x.box, overflowX: getComputedStyle(x.element).overflowX })),
    controls: inputs.map(e => ({ selector: selector(e), visible: visible(e), ...exposure(e), fontSize: getComputedStyle(e).fontSize, zoomRisk: parseFloat(getComputedStyle(e).fontSize) < 16, box: box(e), sources: ruleSources(e) })),
    hiddenRendered: all.filter(e => e.hidden && visible(e)).map(e => ({ selector: selector(e), display: getComputedStyle(e).display, box: box(e) })),
    smallPrimaryActions: all.filter(e => e.matches('button,a,[role=button]') && visible(e) && /start|accept|strike|sign in|explore|send|continue|jump in/i.test((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || ''))).filter(e => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).map(e => ({ selector: selector(e), text: e.textContent.trim().slice(0, 90), box: box(e) })),
    fixedElements: all.filter(e => visible(e) && getComputedStyle(e).position === 'fixed').slice(0, 50).map(e => ({ selector: selector(e), box: box(e), zIndex: getComputedStyle(e).zIndex, paddingBottom: getComputedStyle(e).paddingBottom })),
    invisiblePaused: all.filter(e => { const s = getComputedStyle(e); return s.animationName !== 'none' && s.animationPlayState.includes('paused') && s.opacity === '0' && s.display !== 'none'; }).slice(0, 40).map(e => ({ selector: selector(e), animation: getComputedStyle(e).animation, box: box(e) })),
    firebaseScripts: [...document.scripts].map(s => s.src).filter(s => /firebase.*compat/.test(s)),
  };
}

const results = mode === 'loading' && args.includes('--resume')
  ? JSON.parse(await fs.readFile(path.join(output, 'loading-results.json'), 'utf8').catch(() => '[]')) : [];
try {
  if (mode === 'mobile') {
    const allRoutes = requested.length ? requested : [...new Set([...priorityRoutes, ...sources.filter(x => !x.excluded).map(x => x.route)])];
    const [partition, partitions] = option('--partition', '0/1').split('/').map(Number);
    if (!Number.isInteger(partition) || !Number.isInteger(partitions) || partitions < 1 || partition < 0 || partition >= partitions) throw new Error('--partition expects zero-based i/count');
    const routes = allRoutes.filter((_, i) => i % partitions === partition);
    const surfaces = [{ name: 'iphone14', ...devices['iPhone 14'], viewport: { width: 390, height: 844 } }, { name: 'iphoneSE', ...devices['iPhone SE'], viewport: { width: 375, height: 667 } }, { name: 'landscape', ...devices['iPhone 14'], viewport: { width: 844, height: 390 } }, { name: 'pixel7', ...devices['Pixel 7'] }];
    for (const route of routes) for (const surface of surfaces) {
      if (surface.name === 'landscape' && !['/spar', '/live-round', '/practice', '/voice-debate', '/watch', '/predict'].includes(route)) continue;
      if (surface.name === 'pixel7' && !priorityRoutes.includes(route)) continue;
      const { name, defaultBrowserType, ...contextOptions } = surface;
      const context = await browser.newContext({ ...contextOptions, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [], failed = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('requestfailed', r => failed.push({ url: new URL(r.url()).origin + new URL(r.url()).pathname, error: r.failure()?.errorText }));
      const { blocked } = await protect(page);
      const item = { route, device: name, errors, failed, blocked, screenshots: [] };
      try {
        const response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
        item.status = response?.status();
        await page.waitForTimeout(1800);
        item.top = await page.evaluate(probe);
        if (priorityRoutes.includes(route) || item.top.overflow || item.top.hiddenRendered.length) {
          const filename = `mobile-${safeName(route)}-${name}-top.png`; await page.screenshot({ path: path.join(output, filename) }); item.screenshots.push(filename);
        }
        await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); if (document.body.scrollHeight > document.body.clientHeight) document.body.scrollTop = document.body.scrollHeight; });
        await page.waitForTimeout(250);
        item.bottom = await page.evaluate(probe);
        if (item.bottom.overflow || item.bottom.hiddenRendered.length) { const filename = `mobile-${safeName(route)}-${name}-bottom.png`; await page.screenshot({ path: path.join(output, filename) }); item.screenshots.push(filename); }
      } catch (e) { item.error = e.message; }
      results.push(item);
      await fs.writeFile(path.join(output, 'mobile-results.json'), JSON.stringify(results, null, 2));
      console.log(`${route} ${name}: ${item.error || (item.top?.overflow ? 'overflow' : 'measured')}`);
      await context.close();
    }
  } else {
    // Each route gets one fresh context. Warm is the same context's next load;
    // it is labelled SW-active ONLY when controller was actually observed.
    for (const route of requested.length ? requested : loadingRoutes) {
      if (['cold', 'warm'].every(cache => results.some(r => r.route === route && r.cache === cache && !r.metrics?.error && r.settledScreenshot))) continue;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: desktopUA });
      const page = await context.newPage();
      const { cdp, blocked } = await protect(page);
      await page.addInitScript(() => {
        window.__astraCLS = 0; window.__astraShifts = [];
        let firstShift = 0, lastShift = 0, sessionValue = 0;
        new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) {
          if (!sessionValue || e.startTime - lastShift >= 1000 || e.startTime - firstShift >= 5000) { firstShift = e.startTime; sessionValue = 0; }
          lastShift = e.startTime; sessionValue += e.value;
          window.__astraCLS = Math.max(window.__astraCLS, sessionValue);
          window.__astraShifts.push({ at: e.startTime, value: e.value, sources: (e.sources || []).map(s => ({ node: s.node?.id || s.node?.tagName, before: s.previousRect, after: s.currentRect })) });
        } }).observe({ type: 'layout-shift', buffered: true });
      });
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000, downloadThroughput: 400000 / 8, uploadThroughput: 400000 / 8, connectionType: 'cellular3g' });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      for (const cache of ['cold', 'warm']) {
        if (results.some(r => r.route === route && r.cache === cache && !r.metrics?.error && r.settledScreenshot)) continue;
        let captureCdp = cdp, warmPreparation = null;
        if (cache === 'warm') {
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
          // A resumed warm pass needs a fresh unmeasured primer navigation: a
          // previous process's HTTP cache/context cannot be silently claimed.
          if (page.url() === 'about:blank') await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 90000 });
          warmPreparation = await page.evaluate(async () => {
            if (!navigator.serviceWorker) return { supported: false, controlled: false };
            try {
              const existing = await navigator.serviceWorker.getRegistration('/');
              if (!existing) await navigator.serviceWorker.register('/sw.js');
              await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 15000))]);
              if (!navigator.serviceWorker.controller) await Promise.race([new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })), new Promise(r => setTimeout(r, 5000))]);
              return { supported: true, registeredByHarness: !existing, controlled: !!navigator.serviceWorker.controller };
            } catch (e) { return { error: e.message, controlled: !!navigator.serviceWorker.controller }; }
          });
          // Main-frame replacement can briefly invalidate screenshot attachment.
          // Keep the original write guard, attach capture/throttling afresh.
          captureCdp = await context.newCDPSession(page);
          await captureCdp.send('Network.enable');
          await captureCdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000, downloadThroughput: 400000 / 8, uploadThroughput: 400000 / 8, connectionType: 'cellular3g' });
          await captureCdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        }
        const frames = [], start = performance.now();
        const nav = page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(e => e.message);
        // Best effort 100ms sampling. Never claim exact cadence: both request and
        // completion timestamps are persisted, so screenshot backpressure is visible.
        for (let targetMs = 0; targetMs <= 4000; targetMs += 100) {
          const delay = targetMs - (performance.now() - start); if (delay > 0) await new Promise(r => setTimeout(r, delay));
          if (performance.now() - start > 4400) break;
          const requestedMs = Math.round(performance.now() - start);
          try {
            const shot = await deadline(captureCdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 65, captureBeyondViewport: false }), 5000, 'Frame capture');
            const filename = `loading-${safeName(route)}-${cache}-${String(targetMs).padStart(4, '0')}.jpg`;
            await fs.writeFile(path.join(output, filename), Buffer.from(shot.data, 'base64'));
            frames.push({ targetMs, requestedMs, completedMs: Math.round(performance.now() - start), filename });
          } catch (e) {
            frames.push({ targetMs, requestedMs, completedMs: Math.round(performance.now() - start), error: e.message });
          }
        }
        const navigation = await nav;
        await page.waitForTimeout(1200);
        let settledScreenshot = `loading-${safeName(route)}-${cache}-settled.png`, settledScreenshotError = null;
        try { await page.screenshot({ path: path.join(output, settledScreenshot), timeout: 5000 }); }
        catch (e) { settledScreenshot = null; settledScreenshotError = e.message; }
        const settledAtMs = Math.round(performance.now() - start);
        const metrics = await deadline(page.evaluate(() => ({ url: location.href, cls: window.__astraCLS, shifts: window.__astraShifts, paints: performance.getEntriesByType('paint').map(e => ({ name: e.name, at: e.startTime })), swControlled: !!navigator.serviceWorker?.controller, resourceFailures: performance.getEntriesByType('resource').filter(x => !x.responseEnd).map(x => x.name), bodyText: document.body.innerText.slice(0, 1600), theme: { html: document.documentElement.className, body: document.body.className }, firebaseScripts: [...document.scripts].map(s => s.src).filter(s => /firebase.*compat/.test(s)) })), 10000, 'Metrics read').catch(e => ({ error: e.message }));
        const item = { route, cache, warmPreparation, navigation: typeof navigation === 'string' ? navigation : navigation?.status(), throttle: { latencyMs: 2000, downloadBitsPerSecond: 400000, uploadBitsPerSecond: 400000, cpuRate: 4 }, frames, settledScreenshot, settledScreenshotError, settledAtMs, metrics, blocked: [...blocked] };
        const previous = results.findIndex(r => r.route === route && r.cache === cache);
        if (previous < 0) results.push(item); else results[previous] = item;
        await fs.writeFile(path.join(output, 'loading-results.json'), JSON.stringify(results, null, 2));
        await fs.writeFile(path.join(output, `filmstrip-${safeName(route)}-${cache}.html`), `<!doctype html><meta charset="utf-8"><title>${route} ${cache} loading filmstrip</title><style>body{font:14px system-ui;background:#eee}main{display:flex;gap:8px;overflow:auto}figure{margin:0;flex:none}img,.missing{width:156px;height:338px}.missing{background:#ddd}figcaption{max-width:156px}</style><h1>${route} ${cache}</h1><p>Slow 3G 400kbps/2000ms, CPU 4×; actual screenshot request/completion times below. SW controlled after capture: ${metrics.swControlled}. CLS through observation: ${metrics.cls}.</p><main>${frames.map(f => `<figure>${f.filename ? `<img src="${f.filename}">` : '<div class="missing">Capture unavailable during navigation</div>'}<figcaption>target ${f.targetMs}ms; requested ${f.requestedMs}ms; completed ${f.completedMs}ms${f.error ? '; screenshot failed (see JSON)' : ''}</figcaption></figure>`).join('')}</main>`);
        console.log(`${route} ${cache}: ${frames.length} frames, CLS ${metrics.cls}, SW ${metrics.swControlled}`);
      }
      await context.close();
    }
  }
} finally { await browser.close(); }
