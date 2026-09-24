import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('app');
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const name = extname(path) ? path : path + '.html';
  try {
    const body = await readFile(root + name);
    res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.png':'image/png' })[extname(name)] || 'application/octet-stream');
    res.end(body);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{width:1440,height:1000}, serviceWorkers:'block', reducedMotion:'reduce' });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== base) return route.abort();
  if (url.pathname.startsWith('/api/')) return route.fulfill({ json:{rooms:[],entries:[],messages:[],live:false,changes:[]} });
  if (url.pathname === '/newvoice') return route.fulfill({ contentType:'text/html', body:'<!doctype html><title>Voice settings handoff</title>' });
  return route.continue();
});
const page = await context.newPage();
const pages = [['sales','sales-training'],['lawyer','lawyer-training'],['negotiation','negotiation-training'],['belief','belief-expression-training']];
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
const out = process.env.SCREENSHOT_DIR;
if (out) await mkdir(out, {recursive:true});
try {
  for (const [type, slug] of pages) {
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(base + '/' + slug);
    await page.locator('#trainingForm [type=submit]:enabled').waitFor();
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.locator('.cg-scenario').count(),3);
    assert.equal(await page.locator('.cg-hero-visual img').evaluate(img => img.complete && img.naturalWidth > 0),true,slug + ' hero loads');
    assert.equal(await overflow(),false);
    assert.equal(await page.locator('#trainingForm').evaluate(form => form.checkValidity()),false,'Blank setup cannot continue');
    if (out) await page.screenshot({path:out + '/' + type + '-desktop.png',fullPage:true});
    const second = page.locator('.cg-scenario').nth(1);
    const expected = JSON.parse(await second.getAttribute('data-training-example'));
    await second.focus(); await page.keyboard.press('Enter');
    assert.equal(await second.getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.cg-scenario[aria-pressed=true]').count(),1);
    for (const field of ['situation','counterpart','goal']) assert.equal(await page.locator('#training-' + field).inputValue(),expected[field]);
    assert.equal(await page.evaluate(() => document.activeElement.id),'training-situation');
    assert(await page.locator('#training-situation').evaluate(el => el.getBoundingClientRect().top > 50),'Focused field is below the header');
    const goal = 'Test my revised goal for ' + type;
    await page.locator('#training-goal').fill(goal);
    await page.locator('#trainingForm [type=submit]').click();
    await page.waitForURL(base + '/newvoice?training=' + type);
    assert.equal(new URL(page.url()).search,'?training=' + type,'Only the type travels in the URL');
    const saved = await page.evaluate(type => JSON.parse(sessionStorage.getItem('debatable-training-v1:' + type)),type);
    assert.equal(saved.goal,goal); assert.equal(saved.counterpart,expected.counterpart);
    await page.goto(base + '/' + slug);
    assert.equal(await page.locator('#training-goal').inputValue(),goal,'Returning from settings restores edits');
    assert.match(await page.locator('#trainingStatus').textContent(),/previous setup/);
    await page.setViewportSize({width:390,height:844});
    await page.reload();
    await page.locator('#trainingForm [type=submit]:enabled').waitFor();
    assert.equal(await overflow(),false,slug + ' fits a phone');
    if (out) {
      await page.screenshot({path:out + '/' + type + '-mobile.png',fullPage:true});
      if (type === 'sales') await page.screenshot({path:out + '/sales-phone-first-screen.png'});
    }
    await page.setViewportSize({width:320,height:740});
    assert.equal(await overflow(),false,slug + ' fits a narrow phone');
    await page.setViewportSize({width:1280,height:900});
    await page.evaluate(() => {document.documentElement.setAttribute('data-theme','grey');document.documentElement.setAttribute('data-lighting','dark');});
    assert.equal(await overflow(),false);
    assert.equal(await page.locator('.cg-hero-visual img').evaluate(img => img.naturalWidth),1200);
    if (out && type === 'sales') await page.screenshot({path:out + '/sales-dark.png',fullPage:true});
  }
  await page.goto(base + '/sales-training');
  await page.locator('.cg-scenario').first().click();
  await page.evaluate(() => {Storage.prototype.setItem = () => {throw new DOMException('Blocked','SecurityError');};});
  await page.locator('#trainingForm [type=submit]').click();
  assert.match(await page.locator('#trainingError').textContent(),/Allow storage/);
  assert.match(page.url(),/sales-training$/,'A storage failure keeps the editable scenario on screen');
  assert.ok(await page.locator('#training-situation').inputValue());
  console.log('Training pages: four illustrated responsive layouts, keyboard presets, clear focus, validation, edited private handoff, restored drafts, dark theme and storage failure passed.');
} finally {await browser.close();server.close();}
