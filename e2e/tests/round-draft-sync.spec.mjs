// Two browsers, the shipped draft UI, and the real transaction engine.
// Subscription snapshots are deliberately withheld to reproduce split screens.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { draftFixture } from '../../scripts/test-support/draft-fixture.mjs';

const source = readFileSync(new URL('../../app/live-round.html', import.meta.url), 'utf8');
const between = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const draft = between('    // ── MOTION DRAFT (', '    // ── Motion context (');
const snapshot = between('  function onRoundSnapshot(d){', '    // ── Snapshot repaint gating')
  + "if (window.testPaintFailure) throw new Error('fixture-decoration'); }";
const swap = between('    function applySeatSwap(){', '    function proposeSwap(){');
const daily = between("    call.on('app-message', function(ev){", "    call.on('participant-left', paintRoom);");
const speech = between('  function startSpeechTimer(){', "    if (state.phase === 'round' && state.speechIdx === 0 && !isSpectator() && !judgeLockKey()){")
  + 'window.speechesStarted++; }';
const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');

async function world(browser, { signals = true } = {}) {
  const f = draftFixture(), pages = {}, contexts = [], errors = [], reads = [], signalsSent = [];
  let blockRead = null;
  async function page(uid) {
    const context = await browser.newContext(); contexts.push(context);
    const p = await context.newPage(); pages[uid] = p;
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><head></head><body><main id="main"><h1 id="motionDisplay"></h1><button id="start">Start conversation</button></main></body></html>' }));
    await p.exposeFunction('testPost', body => f.action(uid, body.action, body));
    await p.exposeFunction('testRead', async options => {
      reads.push({ uid, options });
      const value = f.round();
      if (blockRead) { const pending = blockRead; blockRead = null; await pending(value); }
      return value;
    });
    await p.exposeFunction('testSignal', async data => {
      signalsSent.push(data);
      const peer = pages[uid === 'a' ? 'b' : 'a'];
      if (signals && peer) await peer.evaluate(({ data, uid }) => window.receiveDraftMessage({ data, fromId: uid }), { data, uid });
    });
    await p.goto('https://draft.test/live-round');
    await p.addStyleTag({ content: styles });
    await p.evaluate(({ uid, round }) => {
      window.roundState = { ...round, room: 'room', phase: 'round', formatKey: 'quick', timerState: 'ready', recordingRequired: false, log: [], user: { uid, getIdToken: async () => uid } };
      window.speechesStarted = 0;
      window.fetch = async (_url, opts) => ({ json: async () => testPost(JSON.parse(opts.body)) });
      window.testDocument = () => ({ get: async opts => { const data = await testRead(opts); return { exists: true, data: () => data }; } });
    }, { uid, round: f.round() });
    await p.addScriptTag({ content: `(function(){
      var state = window.roundState, prefill = {}, handlers = {};
      var $ = id => document.getElementById(id);
      var call = { on:(name, fn) => { handlers[name] = fn; }, participants:() => ({ a:{user_id:'a'}, b:{user_id:'b'}, outsider:{user_id:'outsider'} }) };
      state.dailyFrame = { sendAppMessage: data => { window.testSignal(data); } };
      function getRoundDocRef(){ return window.testDocument(); }
      function isSpectator(){ return ![state.proUid, state.conUid].includes(state.user.uid); }
      function mySide(){ return state.user.uid === state.proUid ? 'pro' : 'con'; }
      function escHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
      function toast(s){ window.lastToast = s; }
      function gtag(){} function renderHouseGloss(){} function renderRound(){}
      function updateRoomStage(){} function syncJudgeLock(){} function enterAudienceMode(){}
      function tournamentControlsLocked(){ return false; } function tournamentDraftMotion(){ return ''; }
      ${draft}
      ${snapshot}
      ${swap}
      ${daily}
      ${speech}
      window.deliverDraftSnapshot = onRoundSnapshot;
      window.receiveDraftMessage = handlers['app-message'];
      document.getElementById('start').onclick = startSpeechTimer;
      onRoundSnapshot(state);
    })();` });
    return p;
  }
  await page('a'); await page('b');
  return {
    f, pages, errors, reads, signalsSent,
    delayRead: fn => { blockRead = fn; },
    publish: async data => { for (const p of Object.values(pages)) await p.evaluate(d => deliverDraftSnapshot(d), data || f.round()); },
    open: async () => {
      await pages.a.evaluate(() => __lrOpenDraft());
      await expect(pages.a.locator('#draftBoard')).toBeVisible();
      const d = f.round().draft;
      return { offer: pages[d.offerUid], answer: pages[d.respondUid], offerUid: d.offerUid, answerUid: d.respondUid };
    },
    close: async () => { await Promise.all(contexts.map(c => c.close())); expect(errors).toEqual([]); },
  };
}

async function offerTopic(w, pair) {
  await expect(pair.offer.locator('[data-df-pool]').first()).toBeVisible();
  await pair.offer.locator('[data-df-pool]').first().click();
  await expect(pair.offer.locator('#dfTitle')).toHaveText(/Waiting for .* to answer/);
}

test('both screens advance and settle without waiting for subscription snapshots', async ({ browser }) => {
  const w = await world(browser);
  try {
    const pair = await w.open();
    await offerTopic(w, pair);
    await expect(pair.answer.locator('#dfTitle')).toHaveText('Want to debate this?');
    const old = w.f.round();
    await pair.answer.locator('[data-df-respond="take"]').click();
    await expect(pair.answer.locator('#dfTitle')).toHaveText('Pick your side.');
    await expect(pair.offer.locator('#dfTitle')).toHaveText(/is picking their side/);
    await pair.answer.evaluate(() => document.getElementById('start').click());
    expect(await pair.answer.evaluate(() => speechesStarted)).toBe(0);
    // Force a seat change as well as the motion change.
    await pair.answer.locator('[data-df-side="' + (pair.answerUid === 'a' ? 'con' : 'pro') + '"]').click();
    for (const p of Object.values(w.pages)) {
      await expect(p.locator('#draftBoard')).toBeHidden();
      await expect(p.locator('#motionDisplay')).toHaveText(w.f.round().motion);
      expect(await p.evaluate(() => [roundState.proUid, roundState.conUid])).toEqual(['b', 'a']);
    }
    // A delayed respond snapshot cannot restore the overlay or old seats.
    await w.publish(old);
    for (const p of Object.values(w.pages)) {
      await expect(p.locator('#draftBoard')).toBeHidden();
      expect(await p.evaluate(() => [roundState.proUid, roundState.conUid, roundState.motion])).toEqual(['b', 'a', w.f.round().motion]);
    }
    expect(w.reads.length).toBeGreaterThan(0);
    expect(w.reads.every(r => r.options.source === 'server')).toBe(true);
    expect(w.signalsSent.every(s => Object.keys(s).sort().join() === 'revision,room,t')).toBe(true);
  } finally { await w.close(); }
});

test('a pending board recovers when both the update stream and call hint are lost', async ({ browser }) => {
  const w = await world(browser, { signals: false });
  try {
    const pair = await w.open(); await w.publish();
    await offerTopic(w, pair);
    await expect(pair.answer.locator('#dfTitle')).toHaveText('Want to debate this?', { timeout: 3500 });
    await pair.answer.locator('[data-df-respond="take"]').click();
    await pair.answer.locator('[data-df-side="pro"]').click();
    await expect(pair.offer.locator('#draftBoard')).toBeHidden({ timeout: 3500 });
    const before = w.reads.length;
    await pair.offer.clock.install(); await pair.offer.clock.fastForward(5000);
    expect(w.reads.length).toBe(before); // No permanent room polling after settlement.
  } finally { await w.close(); }
});

test('an unrelated repaint failure cannot prevent receipt of the topic choice', async ({ browser }) => {
  const w = await world(browser);
  try {
    await w.pages.a.evaluate(() => { window.testPaintFailure = true; });
    const pair = await w.open();
    await offerTopic(w, pair);
    await expect(pair.answer.locator('#dfTitle')).toHaveText('Want to debate this?');
    await pair.answer.locator('[data-df-respond="take"]').click();
    await expect(pair.offer.locator('#dfTitle')).toHaveText(/is picking their side/);
  } finally { await w.close(); }
});

test('a newer hint during an in-flight refresh triggers another read', async ({ browser }) => {
  const w = await world(browser, { signals: false });
  try {
    const pair = await w.open(); await w.publish();
    await offerTopic(w, pair);
    let started, release;
    const reading = new Promise(resolve => { started = resolve; });
    w.delayRead(() => { started(); return new Promise(resolve => { release = resolve; }); });
    await pair.answer.evaluate(() => receiveDraftMessage({ fromId: roundState.draft.offerUid, data: { t:'draft-changed', room:'room', revision:2 } }));
    await reading;
    await w.f.action(pair.answerUid, 'respond', { choice: 'take', draftRevision: 2 });
    await pair.answer.evaluate(() => receiveDraftMessage({ fromId: roundState.draft.offerUid, data: { t:'draft-changed', room:'room', revision:3 } }));
    release();
    await expect(pair.answer.locator('#dfTitle')).toHaveText('Pick your side.');
  } finally { await w.close(); }
});

test('spectators cannot forge draft state or trigger control reads', async ({ browser }) => {
  const w = await world(browser);
  try {
    await w.pages.a.evaluate(() => {
      receiveDraftMessage({ fromId:'outsider', data:{ t:'draft-changed', room:'room', revision:1000, draft:{phase:'done'} } });
      receiveDraftMessage({ fromId:'b', data:{ t:'draft-changed', room:'other-room', revision:1000 } });
    });
    expect(w.reads.length).toBe(0);
    expect(await w.pages.a.evaluate(() => __lrDraftPending())).toBe('');
    await expect(w.pages.a.locator('#draftBoard')).toBeHidden();
  } finally { await w.close(); }
});

test('server rejection leaves the current choice actionable', async ({ browser }) => {
  const w = await world(browser);
  try {
    const pair = await w.open();
    await pair.offer.evaluate(() => { window.fetch = async () => ({ json:async () => ({ ok:false, reason:'blocked' }) }); });
    await pair.offer.locator('[data-df-pool]').first().click();
    await expect(pair.offer.locator('[role="alert"]')).toHaveText(/off limits/);
    await expect(pair.offer.locator('[data-df-pool]').first()).toBeEnabled();
    expect(w.f.round().draft.phase).toBe('offer');
  } finally { await w.close(); }
});

test('an expired beat updates both screens and clears the sending state', async ({ browser }) => {
  const w = await world(browser);
  try {
    const pair = await w.open();
    const old = Date.now() - 20000;
    const st = w.f.rows.get('round_drafts/room'); st.phaseAt = old;
    const round = w.f.rows.get('live_rounds/room'); round.draft.phaseAt = old; round.draftPhaseAt = old;
    await w.publish();
    await expect(pair.offer.locator('#dfTitle')).toHaveText(/Waiting for .* to answer/);
    await expect(pair.answer.locator('#dfTitle')).toHaveText('Want to debate this?');
    await expect(pair.offer.locator('#draftBoard')).toHaveAttribute('aria-busy', 'false');
    await expect(pair.offer.locator('.df-status[role="status"]')).toHaveCount(0);
    expect(w.f.round().draftRevision).toBe(2);
  } finally { await w.close(); }
});

test('the incoming topic remains readable and actionable on a phone', async ({ browser }, testInfo) => {
  const w = await world(browser);
  try {
    await w.pages.a.setViewportSize({ width:390, height:844 });
    await w.pages.b.setViewportSize({ width:390, height:844 });
    const pair = await w.open(); await offerTopic(w, pair);
    await expect(pair.answer.locator('#dfTitle')).toHaveText('Want to debate this?');
    await expect(pair.answer.locator('[data-df-respond="take"]')).toBeInViewport();
    expect(await pair.answer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await pair.answer.screenshot({ path:testInfo.outputPath('incoming-topic-mobile.png') });
    await pair.answer.locator('[data-df-respond="take"]').click();
    await expect(pair.answer.locator('[data-df-side="pro"]')).toBeInViewport();
  } finally { await w.close(); }
});
