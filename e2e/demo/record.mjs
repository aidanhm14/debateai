// Records the product demo segments against the real site.
//
//   node demo/record.mjs desktop            # every segment, desktop framing
//   node demo/record.mjs phone landing,room-live
//
// Each segment is one fresh browser context and one webm under demo/out/raw.
// Real, signed-out surfaces are driven for real (landing, the Match Desk,
// /newvoice setup, /leaderboard, /watch). The room beats use the page's own
// ?design= fixtures (a synthetic round on consented stills, nothing reaches
// the network), because a live room needs two signed-in humans. Nothing here
// joins a queue, mints a session, or writes a document.
import { launch, openContext, finish, glide, scrollBy, sleep, BASE_URL, stamp } from './lib.mjs';

// The design fixtures print a synthetic watching count in the top bar. A
// number that measures nothing must not appear in a public video, so it is
// hidden inline (an author !important on the pill beats a style tag).
const hideWatch = async (page) => {
  await page.addStyleTag({ content: '#watchCountPill{display:none!important}' }).catch(() => {});
  await page.evaluate(() => {
    const kill = (el) => { if (!el) return; el.style.setProperty('display', 'none', 'important'); el.style.setProperty('visibility', 'hidden', 'important'); };
    kill(document.getElementById('watchCountPill'));
    for (const el of document.querySelectorAll('span, div, a, button')) {
      if (el.children.length <= 2 && /^\s*\d+\+?\s+watching\s*$/i.test(el.textContent || '')) kill(el);
    }
  }).catch(() => {});
};
// The Match Desk keeps every step in one scroll-snap track, so ".afl-next"
// matches a button on every step; take the one that is actually on screen.
async function onScreen(page, selector) {
  const vh = page.viewportSize().height;
  for (const loc of await page.locator(selector).all()) {
    const b = await loc.boundingBox().catch(() => null);
    if (b && b.y >= 0 && b.y + b.height <= vh + 4) return loc;
  }
  return null;
}
const settle = (ms) => sleep(ms);

export const SEGMENTS = {
  // Landing first screen -> Meet someone -> the Match Desk (real, signed out).
  async landing(page, frame, mark) {
    // The example board deals a random card per load. A walkthrough should
    // not open on the heaviest cards in the rotation, so reload until the
    // dealt motion is an everyday one (six tries, then take what comes).
    for (let tries = 0; tries < 6; tries++) {
      await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
      await settle(3400);
      const motion = await page.evaluate(() => { const b = document.querySelector('.fs-board, #mhome'); return b ? b.innerText : ''; }).catch(() => '');
      if (!/israel|palestin|gaza|trump|biden|abortion|immigra|gun|police/i.test(motion)) break;
    }
    mark('first-screen');
    const vw = page.viewportSize();
    await page.mouse.move(vw.width * 0.55, vw.height * 0.45, { steps: 18 });
    await settle(900);
    const cta = page.locator('a[href="/spar"]:visible').filter({ hasText: /meet someone/i }).first();
    await glide(page, cta, { steps: 34, settle: 500, click: false });
    mark('click');
    await page.mouse.down(); await settle(70); await page.mouse.up();
    await page.waitForURL(/\/spar/, { timeout: 20000 });
    await page.locator('.afl-opt').first().waitFor({ state: 'visible', timeout: 20000 });
    mark('desk');
    await settle(2200);
    for (const label of [/Tech and AI/i, /Money and economy/i]) {
      const opt = page.locator('.afl-opt').filter({ hasText: label }).first();
      if (await opt.count()) await glide(page, opt, { steps: 24 });
      await settle(650);
    }
    await settle(700);
    let next = await onScreen(page, '.afl-next');
    if (next) await glide(page, next, { steps: 26 });
    await settle(2000);
    // Step 2 (people): the pinned None answer, then advance to step 3.
    const none = await onScreen(page, '.mp-opt--skip');
    if (none) { await glide(page, none, { steps: 24 }); await settle(800); }
    next = await onScreen(page, '.afl-next');
    if (next) await glide(page, next, { steps: 22 });
    await settle(2600);
    mark('end');
  },

  // The queue screen, painted without joining anything.
  async searching(page) {
    await page.goto(BASE_URL + '/spar?searchdemo=1', { waitUntil: 'domcontentloaded' });
    // The wait rail is the live Commons chat, which is real people's posts;
    // hide the rail and let the search column sit centred.
    await page.addStyleTag({ content: '#waitRail,#wlFab{display:none!important}.spar-search-layout{display:flex!important;justify-content:center!important}' }).catch(() => {});
    await settle(1500);
    const vw = page.viewportSize();
    await page.mouse.move(vw.width * 0.5, vw.height * 0.62, { steps: 30 });
    await settle(5500);
  },

  // The room, both seated, before the first word.
  async 'room-ready'(page) {
    await page.goto(BASE_URL + '/live-round?design=ready&format=open', { waitUntil: 'domcontentloaded' });
    await settle(2600);
    await hideWatch(page);
    await settle(1800);
    await glide(page, '#startConvoBtn', { steps: 34, settle: 600 });
    await settle(1400);
  },

  // Mid-conversation: the clock runs, shared notes fill in, then Finish.
  async 'room-live'(page) {
    await page.goto(BASE_URL + '/live-round?design=speaking&format=open', { waitUntil: 'domcontentloaded' });
    await settle(2400);
    await hideWatch(page);
    await page.evaluate(() => {
      const el = document.getElementById('timerNum'); if (!el) return;
      let m = 1, s = 2;
      window.__tick = setInterval(() => { s++; if (s >= 60) { s = 0; m++; } el.textContent = m + ':' + String(s).padStart(2, '0'); }, 1000);
    });
    const vw = page.viewportSize();
    await page.mouse.move(vw.width * 0.3, vw.height * 0.5, { steps: 24 });
    await settle(3800);
    const notes = page.locator('#roundNotes');
    if (await notes.count()) { await notes.scrollIntoViewIfNeeded().catch(() => {}); await glide(page, notes, { click: false, steps: 30 }); }
    await settle(4200);
    await glide(page, '#endSpeechBtn', { steps: 34, settle: 600 });
    await settle(1500);
  },

  // The other person asked to finish.
  async 'room-finish'(page) {
    await page.goto(BASE_URL + '/live-round?design=finish', { waitUntil: 'domcontentloaded' });
    await settle(2600);
    await hideWatch(page);
    await settle(1200);
    await glide(page, '#conversationFinishAccept', { steps: 30, settle: 700 });
    await settle(1400);
  },

  async 'room-deciding'(page) {
    await page.goto(BASE_URL + '/live-round?design=deciding', { waitUntil: 'domcontentloaded' });
    await settle(1200);
    await hideWatch(page);
    await settle(4200);
  },

  // The decision: winner, both scores, then the written reasoning.
  async 'room-ballot'(page) {
    await page.goto(BASE_URL + '/live-round?design=ballot', { waitUntil: 'domcontentloaded' });
    await settle(1200);
    await hideWatch(page);
    await settle(3600);
    const tab = page.getByRole('button', { name: /^Decision$/ }).first();
    if (await tab.count()) { await glide(page, tab, { steps: 28, settle: 500 }); await settle(1600); }
    const panel = page.locator('#ballotView');
    const box = (await panel.count()) ? await panel.boundingBox() : null;
    const vw = page.viewportSize();
    await page.mouse.move(box ? box.x + box.width / 2 : vw.width * 0.7, box ? Math.min(box.y + box.height / 2, vw.height * 0.6) : vw.height * 0.6, { steps: 20 });
    await scrollBy(page, 520, { step: 40, pause: 40 });
    await settle(3000);
  },

  async leaderboard(page) {
    await page.goto(BASE_URL + '/leaderboard', { waitUntil: 'domcontentloaded' });
    await settle(3200);
    const vw = page.viewportSize();
    await page.mouse.move(vw.width * 0.5, vw.height * 0.55, { steps: 20 });
    await scrollBy(page, 460, { step: 40, pause: 40 });
    await settle(2600);
  },

  async watch(page) {
    await page.goto(BASE_URL + '/watch', { waitUntil: 'domcontentloaded' });
    await settle(3000);
    const vw = page.viewportSize();
    await page.mouse.move(vw.width * 0.5, vw.height * 0.6, { steps: 20 });
    await scrollBy(page, 560, { step: 40, pause: 40 });
    await settle(2600);
  },

  // /newvoice setup, signed out, up to the Test it out button.
  async 'ai-setup'(page) {
    await page.goto(BASE_URL + '/newvoice', { waitUntil: 'domcontentloaded' });
    await settle(3000);
    await glide(page, page.locator('.guide-chip').first(), { steps: 30, settle: 500 });
    await settle(1500);
    await glide(page, page.locator('.topic-cat').filter({ hasText: /^Money$/ }).first(), { steps: 26 });
    await settle(1300);
    await glide(page, page.locator('.claim-opt').nth(1), { steps: 24 });
    await settle(900);
    await glide(page, page.locator('.side-btn.for').first(), { steps: 22 });
    await settle(800);
    await glide(page, '#topicNextBtn', { steps: 26, settle: 450 });
    await settle(1500);
    // Picking a voice advances to the Go screen on its own.
    await glide(page, page.locator('.voice-opt').filter({ hasText: /Cedar/ }).first(), { steps: 26 });
    await settle(2000);
    const sb = page.locator('#startBtn').first();
    const bb = await sb.boundingBox().catch(() => null);
    if (bb) await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 30 });
    await settle(2200);
  },
};

const frame = process.argv[2] || 'desktop';
const names = (process.argv[3] ? process.argv[3].split(',') : Object.keys(SEGMENTS)).filter((n) => SEGMENTS[n]);
const browser = await launch();
for (const name of names) {
  const tag = `${name}-${frame}`;
  const { context, page, mark } = await openContext(browser, frame, tag);
  stamp(`${tag}: start`);
  try { await SEGMENTS[name](page, frame, mark); }
  catch (e) { console.error(`[${tag}] FAILED`, String(e).split('\n')[0]); await page.screenshot({ path: `demo/out/fail-${tag}.png` }).catch(() => {}); }
  const out = await finish(context, page, tag);
  stamp(`${tag}: saved ${out.replace(process.cwd() + '/', '')}`);
}
await browser.close();
