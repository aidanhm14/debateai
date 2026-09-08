// Offline two-person browser regression. Firebase and the consent endpoint
// share an in-memory ledger; no real accounts, queues, or AI calls are used.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../app/js/notifications.js', import.meta.url), 'utf8');
const matcher = source.slice(source.indexOf('  function sparLive()'), source.indexOf('  function bootSparLive()'));
const styles = source.slice(source.indexOf('  function injectStyles()'), source.indexOf('  function createBell()'));
const presence = readFileSync(new URL('../../app/js/round-presence.js', import.meta.url), 'utf8');
const popup = readFileSync(new URL('../../app/js/live-popup.js', import.meta.url), 'utf8');

async function world(browser, background = true) {
  const contexts = [], pages = [], docs = new Map(), writes = [], errors = [];
  let version = 0, releaseDecline, failAccept = false, race = null;
  const stamp = () => ({ seconds: Date.now() / 1000 });
  const pair = () => {
    for (const [uid, peer] of [['a', 'b'], ['b', 'a']]) docs.set('matchmaking_queue/' + uid, {
      uid, background, status: 'consent', room: 'test-room', matchedWith: peer,
      matchedWithName: peer === 'a' ? 'Alex' : 'Otto', consents: { a: false, b: false },
      proposedAt: stamp(), joinedAt: stamp(), authProvider: 'google.com',
    });
    version++;
  };
  const publish = async () => Promise.all(pages.map(p => p.evaluate(rows => window.testNotify?.(rows), Object.fromEntries(docs))));
  async function page(uid, path = '/', { loadMatcher = true, loadPopup = false } = {}) {
    const context = await browser.newContext(); contexts.push(context);
    const p = await context.newPage(); pages.push(p);
    p.on('pageerror', error => errors.push(error.message));
    await p.route('**/*', r => r.fulfill({ contentType: 'text/html', body: '<html><head></head><body><div class="ui-topbar-right"></div><button id="audio">Start AI audio fixture</button></body></html>' }));
    await p.exposeFunction('testRead', async key => ({ data: docs.get(key) || null, version }));
    await p.exposeFunction('testCommit', async ({ expected, operations }) => {
      if (race) { race(); race = null; }
      if (expected !== version) return false;
      for (const op of operations) {
        writes.push(op);
        if (op.kind === 'delete') docs.delete(op.key);
        else docs.set(op.key, op.kind === 'update' ? { ...docs.get(op.key), ...op.data } : op.data);
      }
      if (operations.length) { version++; await publish(); }
      return true;
    });
    await p.exposeFunction('testConsent', async body => {
      if (body.action !== 'consent') return { ok: true };
      if (body.accept && failAccept) return { ok: false, reason: 'temporary_failure' };
      if (!body.accept && releaseDecline) await new Promise(resolve => { releaseDecline = resolve; });
      const mine = docs.get('matchmaking_queue/' + uid), peer = docs.get('matchmaking_queue/' + body.peerUid);
      if (!mine || !peer) return { ok: false, reason: 'consent_state_gone' };
      if (!body.accept) {
        for (const d of [mine, peer]) { d.status = 'waiting'; delete d.room; delete d.matchedWith; }
      } else {
        for (const d of [mine, peer]) d.consents[uid] = true;
        if (mine.consents.a && mine.consents.b) for (const d of [mine, peer]) d.status = 'matched';
      }
      version++; await publish(); return { ok: true };
    });
    await p.goto('https://match.test' + path);
    await p.evaluate(({ uid }) => {
      localStorage.setItem('da-spar-bg', '1'); localStorage.setItem('da-age-band', 'adult');
      const listeners = new Map();
      const snapshot = data => ({ exists: !!data, data: () => data });
      window.testNotify = rows => { for (const [key, list] of listeners) for (const cb of list) cb(snapshot(rows[key])); };
      const ref = key => ({
        key,
        get: async () => snapshot((await testRead(key)).data),
        onSnapshot(cb) {
          if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(cb);
          testRead(key).then(r => { if (listeners.get(key).has(cb)) cb(snapshot(r.data)); });
          return () => listeners.get(key).delete(cb);
        },
        set: data => db.runTransaction(async tx => { await tx.get(ref(key)); tx.set(ref(key), data); }),
        update: data => db.runTransaction(async tx => { await tx.get(ref(key)); tx.update(ref(key), data); }),
        delete: () => db.runTransaction(async tx => { await tx.get(ref(key)); tx.delete(ref(key)); }),
      });
      const db = {
        collection(name) { const q = { doc: id => ref(name + '/' + id), where: () => q, orderBy: () => q, limit: () => q, get: async () => ({ forEach() {} }) }; return q; },
        async runTransaction(fn) {
          for (let n = 0; n < 10; n++) {
            const operations = []; let expected;
            const result = await fn({
              get: async r => { const v = await testRead(r.key); expected = v.version; return snapshot(v.data); },
              set: (r, data) => operations.push({ key: r.key, kind: 'set', data }),
              update: (r, data) => operations.push({ key: r.key, kind: 'update', data }),
              delete: r => operations.push({ key: r.key, kind: 'delete' }),
            });
            if (await testCommit({ expected, operations })) return result;
          }
          throw new Error('transaction retries exhausted');
        },
      };
      const user = { uid, isAnonymous: false, providerData: [{ providerId: 'google.com' }], getIdToken: async () => 'test-token',
        getIdTokenResult: async () => ({ signInProvider: 'google.com', claims: { firebase: { sign_in_provider: 'google.com' } } }) };
      window.firebase = { apps: [{}], firestore: () => db, auth: () => ({ currentUser: user, onAuthStateChanged: cb => { const timer = setTimeout(() => cb(user), 0); return () => clearTimeout(timer); } }) };
      firebase.firestore.FieldValue = { serverTimestamp: () => ({ seconds: Date.now() / 1000 }) };
      window.DBIdentity = { forUser: () => ({ name: uid === 'a' ? 'Alex' : 'Otto', username: uid }) };
      window.DBPfp = {};
      window.DBAvatarAccount = { hydrate: () => dispatchEvent(new Event('debatable-avatar-account-ready')), publicIdentity: () => null };
      window.ensureFirestore = window.whenFirebaseReady = cb => cb();
      window.daEnsureSfx = window.daAlert = window.daFlashTitle = window.daStopFlashTitle = window.daAskNotify = window.daBroadcastGoLive = () => {};
      window.daAway = window.daCanOsNotify = () => false;
      window.daPresenceKind = () => { const d = JSON.parse(localStorage.getItem('da-round-presence') || 'null'); return d && Date.now() - d.at < 150000 ? d.kind : ''; };
      window.escHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
      window.fetch = async (url, options) => ({ ok: true, json: async () => options?.body ? testConsent(JSON.parse(options.body)) : { debaters: [{ uid: 'b', name: 'Otto' }], rounds: [] } });
      document.querySelector('#audio').onclick = async () => {
        window.aiAudio = new AudioContext(); const osc = aiAudio.createOscillator(), gain = aiAudio.createGain();
        gain.gain.value = 0; osc.connect(gain).connect(aiAudio.destination); osc.start(); await aiAudio.resume();
      };
    }, { uid });
    await p.click('#audio');
    await p.addScriptTag({ content: presence });
    if (loadMatcher) await p.addScriptTag({ content: styles + matcher + '\ninjectStyles(); sparLive();' });
    if (loadPopup) await p.addScriptTag({ content: popup });
    return p;
  }
  return { docs, writes, pair, page, publish, race: fn => { race = fn; }, failAccept: () => { failAccept = true; },
    holdDecline: () => { releaseDecline = true; }, release: () => releaseDecline(),
    declinePending: () => typeof releaseDecline === 'function', close: async () => { await Promise.all(contexts.map(c => c.close())); expect(errors).toEqual([]); } };
}

for (const background of [true, false]) test(`both sides receive an existing ${background ? 'background' : 'foreground'} request`, async ({ browser }) => {
  const w = await world(browser, background);
  try {
    w.pair();
    const a = await w.page('a'), b = await w.page('b');
    await expect(a.getByText('Otto wants to debate')).toBeVisible();
    await expect(b.getByText('Alex wants to debate')).toBeVisible();
    expect(w.writes.filter(w => w.kind === 'set')).toEqual([]);
    await a.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(a.getByText('Waiting for Otto')).toBeVisible();
    await expect(b.getByText('Waiting on you')).toBeVisible();
    await expect(b.getByText('Alex already accepted')).toBeVisible();
    await b.getByRole('button', { name: 'Join them' }).click();
    await expect(a).toHaveURL(/live-round\.html\?.*room=test-room/);
    await expect(b).toHaveURL(/live-round\.html\?.*room=test-room/);
  } finally { await w.close(); }
});

test('a pairing that races a new queue write survives the transaction retry', async ({ browser }) => {
  const w = await world(browser);
  try {
    w.race(w.pair);
    const p = await w.page('a');
    await expect(p.getByText('Otto wants to debate')).toBeVisible();
    expect(w.docs.get('matchmaking_queue/a').status).toBe('consent');
    expect(w.writes.filter(w => w.kind === 'set')).toEqual([]);
  } finally { await w.close(); }
});

test('a fresh background queue carries the held provider', async ({ browser }) => {
  const w = await world(browser);
  try {
    await w.page('a');
    await expect.poll(() => w.docs.get('matchmaking_queue/a')?.authProvider).toBe('google.com');
    expect(w.docs.get('matchmaking_queue/a').status).toBe('waiting');
  } finally { await w.close(); }
});

test('another tab yields an invitation to the Voice AI tab without declining it', async ({ browser }) => {
  const w = await world(browser);
  try {
    w.pair(); const p = await w.page('a');
    await expect(p.getByText('Otto wants to debate')).toBeVisible();
    await p.clock.install();
    await p.evaluate(() => localStorage.setItem('da-round-presence', JSON.stringify({ kind: 'voice-ai', at: Date.now() })));
    await p.clock.fastForward(11000);
    await expect(p.locator('.da-match-overlay')).toHaveCount(0);
    expect(w.docs.get('matchmaking_queue/a').status).toBe('consent');
    expect(w.docs.get('matchmaking_queue/b').status).toBe('consent');
  } finally { await w.close(); }
});

for (const path of ['/newvoice', '/voice-debate']) test(`${path}: rejecting releases the waiting peer and keeps AI audio running`, async ({ browser }) => {
  const w = await world(browser);
  try {
    w.pair(); const a = await w.page('a'), b = await w.page('b', path);
    await a.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(b.getByText('Waiting on you')).toBeVisible();
    if (path === '/newvoice') await b.setViewportSize({ width: 390, height: 844 });
    await expect(b.getByRole('button', { name: 'Keep talking to AI' })).toBeInViewport();
    await expect(b.getByRole('button', { name: 'Join them' })).toBeInViewport();
    await b.screenshot({ path: test.info().outputPath('voice-invitation.png') });
    w.holdDecline();
    await b.getByRole('button', { name: 'Keep talking to AI' }).click();
    await expect(b.locator('.da-match-overlay')).toHaveCount(0);
    expect(w.docs.has('matchmaking_queue/b')).toBe(true);
    await expect(a.getByText('Waiting for Otto')).toBeVisible();
    await expect.poll(w.declinePending).toBe(true);
    w.release();
    await expect(a.locator('.da-match-overlay')).toHaveCount(0);
    await expect.poll(() => w.docs.has('matchmaking_queue/b')).toBe(false);
    await expect(b).toHaveURL('https://match.test' + path);
    expect(await b.evaluate(() => aiAudio.state)).toBe('running');
    await b.clock.install(); await b.clock.fastForward(180000);
    expect(await b.evaluate(() => DASparLive.voiceInvitesPaused())).toBe(true);
    expect(w.docs.has('matchmaking_queue/b')).toBe(false);
  } finally { await w.close(); }
});

test('failed acceptance restores an actionable request', async ({ browser }) => {
  const w = await world(browser);
  try {
    w.pair(); w.failAccept(); const a = await w.page('a');
    await a.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
    await expect(a.getByText('Your acceptance did not reach us. Check your connection and press Accept again.')).toBeVisible();
  } finally { await w.close(); }
});

test('Voice AI also receives open-seat invitations without an existing match', async ({ browser }) => {
  const w = await world(browser);
  try {
    const p = await w.page('a', '/newvoice', { loadMatcher: false, loadPopup: true });
    await expect(p.getByText('Otto wants to debate')).toBeVisible();
    await p.getByRole('button', { name: 'Keep talking to AI' }).click();
    await expect(p.locator('.da-wait-invite')).toHaveCount(0);
    expect(await p.evaluate(() => aiAudio.state)).toBe('running');
    expect(await p.evaluate(() => window.__daVoiceInvitesPaused)).toBe(true);
    await expect(p).toHaveURL('https://match.test/newvoice');
  } finally { await w.close(); }
});

test('human rounds remain unavailable for another invitation', async ({ browser }) => {
  const w = await world(browser);
  try {
    const p = await w.page('a', '/live-round');
    expect(await p.evaluate(() => DARoundPresence.mine())).toBe('round');
    await expect(p.locator('.da-match-overlay')).toHaveCount(0);
    expect(w.writes.filter(w => w.kind === 'set')).toEqual([]);
  } finally { await w.close(); }
});
