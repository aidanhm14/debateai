import { test, expect } from '@playwright/test';
import { readApp, between } from '../helpers/offline-site.mjs';

const pageSource = readApp('live-round.html');
const tileSource = between(pageSource, '  function dropTile(key){', '  /* ── The round board is published');
const styles = [...pageSource.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');

async function playbackRoom(page, viewer = true) {
  await page.setContent(`<style>${styles}</style><div class="cv-stage" style="width:760px;height:440px;flex:none"></div><div class="cv-aud"></div><div id="audio"></div>`);
  await page.addScriptTag({ content: readApp('js/live-room/media.js') });
  await page.evaluate(({ viewer, tileSource }) => {
    document.body.classList.toggle('spectator-mode', viewer);
    const ac = new AudioContext();
    const microphone = ac.createMediaStreamDestination().stream.getAudioTracks()[0];
    const canvases = ['#b82424', '#2458b8'].map(color => {
      const c = document.createElement('canvas'); c.width = 160; c.height = 100;
      const ctx = c.getContext('2d'); let x = 0;
      const draw = () => { ctx.fillStyle = color; ctx.fillRect(0, 0, 160, 100); ctx.fillStyle = '#fff'; ctx.fillRect(x++ % 160, 0, 8, 100); };
      draw(); setInterval(draw, 50);
      return c;
    });
    const peers = {};
    ['a', 'b'].forEach((id, i) => {
      peers[id] = { session_id: id, user_id: id, user_name: id.toUpperCase(), audio: true,
        tracks: { video: { state: 'playable', persistentTrack: canvases[i].captureStream(20).getVideoTracks()[0] },
          audio: { state: 'playable', persistentTrack: microphone.clone() } } };
    });
    const noOp = () => {};
    const f = window.fixture = {
      ac, peers, state: {}, camConv: { mode: 'camera' },
      room: { viewer, joined: true, active: 'a', tiles: {}, audios: {}, stage: document.querySelector('.cv-stage'),
        aud: document.querySelector('.cv-aud'), audioHost: document.querySelector('#audio'), call: { participants: () => peers } },
      isSilentWatcher: () => false, isAudienceName: () => false, isAssignedRoundSeat: () => true,
      isBoardShare: () => false, paintTray: noOp, noteOppGone: noOp, clearOppGone: noOp,
      checkOpponentPresence: noOp, paintRoundQuiet: noOp, setRoomNote: noOp,
    };
    Object.assign(f, new Function('room', tileSource + ';return {ensureTile,dropTile};')(f.room));
    f.media = DBLiveMedia.create(f);
    f.media.paintRoom();
    f.sources = Object.fromEntries(Object.entries(f.room.tiles).map(([id, t]) => [id, t.video.srcObject]));
    f.audio = f.room.audios.a; f.audioSource = f.audio.srcObject;
    f.removals = 0;
    f.observer = new MutationObserver(records => { f.removals += records.reduce((n, r) => n + r.removedNodes.length, 0); });
    f.observer.observe(f.room.stage, { childList: true });
  }, { viewer, tileSource });
  await expect.poll(() => page.evaluate(() => fixture.room.tiles['seat:a'].video.readyState)).toBeGreaterThanOrEqual(2);
}

for (const viewer of [false, true]) {
  test(`${viewer ? 'audience' : 'participant'} playback survives transient track interruptions without restarting media`, async ({ page }) => {
    await playbackRoom(page, viewer);
    const result = await page.evaluate(() => {
      const f = fixture;
      let stable = true;
      for (const state of ['interrupted', 'loading', 'playable']) {
        f.peers.a.tracks.video.state = f.peers.a.tracks.audio.state = state;
        f.media.paintRoom();
        stable &&= f.room.tiles['seat:a'].video.srcObject === f.sources['seat:a']
          && f.room.audios.a === f.audio && f.audio.srcObject === f.audioSource;
      }
      return { stable, videoEnded: f.sources['seat:a'].getVideoTracks()[0].readyState === 'ended' };
    });
    expect(result).toEqual({ stable: true, videoEnded: false });
  });
}

test('routine audience updates and speaker changes never detach a playing video tile', async ({ page }) => {
  await playbackRoom(page);
  await page.evaluate(() => {
    for (let i = 0; i < 30; i++) {
      fixture.room.active = i % 2 ? 'a' : 'b';
      fixture.media.paintRoom();
    }
  });
  expect(await page.evaluate(() => fixture.removals)).toBe(0);
  expect(await page.evaluate(() => Object.values(fixture.room.tiles).every(t => t.video.srcObject && !t.video.paused))).toBe(true);
});

test('audience focus ignores a short interjection and follows a sustained speaker without moving media', async ({ page }) => {
  await playbackRoom(page);
  await page.clock.install();
  const widths = () => page.evaluate(() => ['a', 'b'].map(id => Math.round(fixture.room.tiles['seat:' + id].el.getBoundingClientRect().width)));
  expect((await widths())[0]).toBeGreaterThan((await widths())[1]);
  await page.evaluate(() => { fixture.room.active = 'b'; fixture.media.paintRoom(); });
  await page.clock.runFor(300);
  expect((await widths())[0]).toBeGreaterThan((await widths())[1]);
  await page.evaluate(() => { fixture.room.active = 'a'; fixture.media.paintRoom(); });
  await page.clock.runFor(900);
  expect((await widths())[0]).toBeGreaterThan((await widths())[1]);
  await page.evaluate(() => { fixture.room.active = 'b'; fixture.media.paintRoom(); });
  await page.clock.runFor(900);
  expect((await widths())[1]).toBeGreaterThan((await widths())[0]);
  expect(await page.evaluate(() => fixture.removals)).toBe(0);
});

test('phone audience seats keep their left/right positions while the speaker grows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await playbackRoom(page);
  await page.evaluate(() => { fixture.room.stage.style.width = '390px'; });
  await page.clock.install();
  const rects = () => page.evaluate(() => ['a', 'b'].map(id => {
    const r = fixture.room.tiles['seat:' + id].el.getBoundingClientRect();
    return { left: r.left, width: r.width };
  }));
  const before = await rects();
  expect(before[0].left).toBeLessThan(before[1].left);
  await page.evaluate(() => { fixture.room.active = 'b'; fixture.media.paintRoom(); });
  await page.clock.runFor(1000);
  const after = await rects();
  expect(after[0].left).toBeLessThan(after[1].left);
  await expect.poll(async () => { const r = await rects(); return r[1].width > r[0].width; }).toBe(true);
  expect(await page.evaluate(() => fixture.removals)).toBe(0);
});

test('a shared screen survives a transient interruption and stays ahead of camera tiles', async ({ page }) => {
  await playbackRoom(page);
  const result = await page.evaluate(() => {
    const f = fixture;
    f.peers.a.tracks.screenVideo = { state: 'playable', persistentTrack: f.peers.a.tracks.video.persistentTrack.clone() };
    f.media.paintRoom();
    const tile = f.room.tiles['screen:a'];
    const src = tile.video.srcObject;
    f.peers.a.tracks.screenVideo.state = 'interrupted';
    f.media.paintRoom();
    return { sameTile: f.room.tiles['screen:a'] === tile, sameSource: tile.video.srcObject === src,
      screenAboveCamera: tile.el.getBoundingClientRect().top <= f.room.tiles['seat:a'].el.getBoundingClientRect().top };
  });
  expect(result).toEqual({ sameTile: true, sameSource: true, screenAboveCamera: true });
});

for (const state of ['off', 'blocked', 'unsubscribed', 'ended']) {
  test(`explicitly ${state} media is removed and departed people leave no playing audio`, async ({ page }) => {
    await playbackRoom(page);
    const result = await page.evaluate(state => {
      if (state === 'unsubscribed') fixture.peers.a.tracks.video.subscribed = fixture.peers.a.tracks.audio.subscribed = false;
      else if (state === 'ended') {
        fixture.peers.a.tracks.video.persistentTrack.stop(); fixture.peers.a.tracks.audio.persistentTrack.stop();
      } else fixture.peers.a.tracks.video.state = fixture.peers.a.tracks.audio.state = state;
      fixture.media.paintRoom();
      const hidden = fixture.room.tiles['seat:a'].el.classList.contains('is-dark');
      const videoCleared = fixture.room.tiles['seat:a'].video.srcObject === null;
      const audioRemoved = !fixture.room.audios.a && !fixture.audio.isConnected;
      delete fixture.peers.b;
      fixture.media.paintRoom();
      return { hidden, videoCleared, audioRemoved, departedRemoved: !fixture.room.tiles['seat:b'] && !fixture.room.audios.b };
    }, state);
    expect(result).toEqual({ hidden: true, videoCleared: true, audioRemoved: true, departedRemoved: true });
  });
}
