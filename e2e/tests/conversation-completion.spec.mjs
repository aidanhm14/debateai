import { test, expect } from '@playwright/test';
import { changeConversationFinish } from '../../app/netlify/functions/lib/conversation-finish.mjs';
import { readApp, between } from '../helpers/offline-site.mjs';

const source = readApp('live-round.html');
const markup = between(source, '        <div class="conversation-finish"', '        <!-- The primary action');
const paint = between(source, '  function paintConversationFinish(', '  function syncConversationFinish(');

async function room(browser, { failedUpload = false } = {}) {
  const data = new Map([['live_rounds/room', {
    proUid: 'a', conUid: 'b', proName: 'Sam', conName: 'Jordan', format: 'open', speechIdx: 0,
    currentTimer: { state: 'running', startMs: Date.now() - 120000, accumulatedMs: 0 },
  }]]);
  let queue = Promise.resolve();
  const db = {
    collection: name => ({ doc: id => ({ path: name + '/' + id }) }),
    runTransaction(fn) {
      const task = queue.then(async () => {
        const writes = [];
        const result = await fn({ get: async r => ({ exists: data.has(r.path), data: () => structuredClone(data.get(r.path)) }),
          set: (r, value) => writes.push([r.path, value, false]), update: (r, value) => writes.push([r.path, value, true]) });
        for (const [key, value, merge] of writes) data.set(key, merge ? { ...data.get(key), ...value } : value);
        return result;
      });
      queue = task.catch(() => {}); return task;
    },
  };
  const pages = {}, contexts = [], errors = [], completed = [];
  let fail = failedUpload, release;
  for (const uid of ['a', 'b']) {
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage(); pages[uid] = page;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
      `<main>${markup}<button id="endSpeechBtn">Ask to finish →</button><button id="playPauseBtn">Pause</button><button id="micBtn">Mic</button><textarea id="speechText"></textarea><div id="roundPlan"></div><p id="completion" hidden>Ready for the decision</p></main>` }));
    await page.exposeFunction('postFinish', async body => {
      try {
        const result = await changeConversationFinish(db, 'room', uid, body, Date.now());
        // Deliver the server projection to both clients, never the private receipts.
        await Promise.all(Object.values(pages).map(p => p.evaluate(value => window.controller && controller.sync(value), result.finish)));
        return { status: 200, data: result };
      } catch (error) { return { status: error.status || 500, data: { error: error.message } }; }
    });
    await page.exposeFunction('flushWords', async () => {
      if (uid === 'b' && fail) throw new Error('The final transcript could not be saved.');
      if (uid === 'b') await new Promise(resolve => { release = resolve; });
      const round = data.get('live_rounds/room'), side = uid === 'a' ? 'pro' : 'con';
      round.openSegs = { ...round.openSegs, [side]: [{ at: uid === 'a' ? 10 : 20, speakerUid: uid, text: uid + ' final words', clock: 'server' }] };
    });
    await page.exposeFunction('finished', () => { completed.push(uid); });
    await page.goto('https://finish.test/live-round');
    await page.addScriptTag({ content: readApp('js/conversation-finish.js') });
    await page.addScriptTag({ content: `
      var state = {phase:'round',user:{uid:${JSON.stringify(uid)},getIdToken:async()=>${JSON.stringify(uid)}}};
      var $=id=>document.getElementById(id);
      function mySide(){return ${JSON.stringify(uid === 'a' ? 'pro' : 'con')};}
      function sharedConversationFinish(){return true;} function isSpectator(){return false;}
      ${paint}
      window.fetch=async(_url,options)=>{
        var result=await postFinish(JSON.parse(options.body));
        return {ok:result.status===200,json:async()=>result.data};
      };
      window.controller=DBConversationFinish.attach({room:()=> 'room',user:()=>state.user,side:mySide,seated:()=>true,
        paint:paintConversationFinish,flush:()=>flushWords(),hold:()=>{},complete:async()=>{
          await finished();$('completion').hidden=false;
        }});
      $('endSpeechBtn').onclick=()=>controller.act('request');
      $('conversationFinishAccept').onclick=()=>controller.act('accept');
      $('conversationFinishCancel').onclick=()=>controller.act('cancel');
      $('conversationFinishRetry').onclick=()=>controller.act('retry');
    ` });
  }
  return { pages, completed, errors, data, allowRetry() { fail = false; }, release: () => release && release(),
    hasUpload: () => !!release, close: () => Promise.all(contexts.map(c => c.close())) };
}

test('both people agree and both final uploads finish before either screen can judge', async ({ browser }) => {
  const f = await room(browser, { failedUpload: true });
  try {
    const a = f.pages.a, b = f.pages.b;
    await a.locator('#endSpeechBtn').click();
    await expect(a.locator('#conversationFinishText')).toContainText('You can both keep talking');
    await expect(b.locator('#conversationFinishAccept')).toBeVisible();
    expect(f.completed).toEqual([]);
    await b.locator('#conversationFinishAccept').click();
    await expect(b.locator('#conversationFinishRetry')).toBeVisible();
    await expect(a.locator('#conversationFinishText')).toContainText('No decision yet');
    expect(f.data.get('live_rounds/room').ballotPending).toBeUndefined();
    f.allowRetry(); await b.locator('#conversationFinishRetry').click();
    await expect.poll(f.hasUpload).toBe(true);
    await expect(a.locator('#completion')).toBeHidden();
    await expect(b.locator('#completion')).toBeHidden();
    f.release();
    await expect(a.locator('#completion')).toBeVisible();
    await expect(b.locator('#completion')).toBeVisible();
    expect(f.completed.sort()).toEqual(['a', 'b']);
    expect(f.data.get('live_rounds/room').speeches[0].text).toMatch(/a final words[\s\S]*b final words/);
    expect(f.errors).toEqual([]);
  } finally { await f.close(); }
});

test('declining a finish request leaves both speakers able to continue', async ({ browser }) => {
  const f = await room(browser);
  try {
    await f.pages.a.locator('#endSpeechBtn').click();
    await f.pages.b.locator('#conversationFinishCancel').click();
    for (const page of Object.values(f.pages)) {
      await expect(page.locator('#endSpeechBtn')).toBeEnabled();
      await expect(page.locator('#micBtn')).toBeEnabled();
      await expect(page.locator('#completion')).toBeHidden();
    }
    expect(f.completed).toEqual([]);
    expect(f.data.get('live_rounds/room').ballotPending).toBeUndefined();
    expect(f.errors).toEqual([]);
  } finally { await f.close(); }
});
