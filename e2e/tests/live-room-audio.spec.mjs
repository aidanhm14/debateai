import { test, expect } from '@playwright/test';
import { readApp } from '../helpers/offline-site.mjs';

test.use({ launchOptions: {
  args: ['--autoplay-policy=document-user-activation-required'],
  ignoreDefaultArgs: ['--autoplay-policy=no-user-gesture-required'],
} });

async function audience(page, nativePlayback = false) {
  const css = readApp('live-round.html').match(/\.cv-sound\{[^}]+\}/)[0];
  await page.route('https://debatable.test/**', route => route.fulfill({ contentType: 'text/html', body: `
    <style>#room{position:relative;width:300px;height:220px}.cv-btn{padding:10px}${css}</style>
    <div id="room"><div id="audio" hidden></div></div>
    <script>${readApp('js/live-room/media.js')}</script>
    <script>
      window.fixture = { room: { viewer: true, audios: {}, tiles: {}, networkReasons: [],
        wrap: document.querySelector('#room'), audioHost: document.querySelector('#audio') },
        allowed: false, stillBlocked: '', pending: [], defer: false, calls: [], streams: [] };
      const f = fixture;
      const ac = new AudioContext();
      f.ac = ac;
      function slot() {
        const destination = ac.createMediaStreamDestination();
        const oscillator = ac.createOscillator();
        const gain = ac.createGain(); gain.gain.value = 0;
        oscillator.connect(gain).connect(destination); oscillator.start();
        f.streams.push(destination.stream);
        return { state: 'playable', persistentTrack: destination.stream.getAudioTracks()[0] };
      }
      f.people = [
        { session_id: 'local', local: true, tracks: { audio: slot() } },
        { session_id: 'first', tracks: { audio: slot(), judge: slot() } },
        { session_id: 'second', tracks: { audio: slot() } },
      ];
      if (!${nativePlayback}) HTMLMediaElement.prototype.play = function() {
        const key = Object.keys(f.room.audios).find(key => f.room.audios[key] === this);
        f.calls.push({ key, gesture: navigator.userActivation.isActive });
        if (f.defer) return new Promise((resolve, reject) => f.pending.push({ resolve, reject }));
        if (!f.allowed || key === f.stillBlocked) return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
        return Promise.resolve();
      };
      document.addEventListener('click', () => ac.resume(), { capture: true });
      Object.assign(f, DBLiveMedia.create(f));
      f.paintAudio(f.people);
    </script>` }));
  await page.goto('https://debatable.test/audio');
}

test('real browser autoplay refusal can be recovered by an audience click', async ({ page }) => {
  await audience(page, true);
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(fixture.room.audios))).toEqual(['first', 'first:judge', 'second']);
  await page.getByRole('button', { name: 'Enable sound' }).click();
  await expect(page.getByRole('button', { name: 'Enable sound' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Object.values(fixture.room.audios).every(a => !a.paused && a.currentTime > 0))).toBe(true);
});

test('all remote voices retry in the gesture and one success cannot hide another failure', async ({ page }) => {
  await audience(page);
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible();
  await page.evaluate(() => { fixture.allowed = true; fixture.stillBlocked = 'second'; fixture.calls = []; });
  await page.getByRole('button', { name: 'Enable sound' }).click();
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible();
  expect(await page.evaluate(() => fixture.calls)).toEqual([
    { key: 'first', gesture: true }, { key: 'first:judge', gesture: true }, { key: 'second', gesture: true },
  ]);
  await page.evaluate(() => { fixture.stillBlocked = ''; });
  await page.getByRole('button', { name: 'Enable sound' }).click();
  await expect(page.getByRole('button', { name: 'Enable sound' })).toHaveCount(0);
});

test('leaving removes the recovery control and old play rejections cannot restore it', async ({ page }) => {
  await audience(page);
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible();
  await page.evaluate(() => { fixture.defer = true; });
  await page.getByRole('button', { name: 'Enable sound' }).click();
  await page.evaluate(async () => {
    fixture.paintAudio([]);
    fixture.pending.forEach(p => p.reject(new DOMException('Old play failed', 'NotAllowedError')));
    await Promise.resolve();
  });
  await expect(page.getByRole('button', { name: 'Enable sound' })).toHaveCount(0);
  expect(await page.locator('audio').count()).toBe(0);
  expect(await page.evaluate(() => fixture.streams.every(s => s.getTracks()[0].readyState === 'live'))).toBe(true);
});

test('replaced tracks ignore stale failures and uninterrupted playback keeps its stream', async ({ page }) => {
  await audience(page);
  await page.evaluate(() => { fixture.defer = true; });
  await page.getByRole('button', { name: 'Enable sound' }).click();
  await page.evaluate(() => {
    fixture.allowed = true; fixture.defer = false;
    fixture.people.forEach(p => Object.values(p.tracks).forEach(slot => { slot.persistentTrack = slot.persistentTrack.clone(); }));
    fixture.paintAudio(fixture.people);
    fixture.pending.forEach(p => p.reject(new DOMException('Old track', 'NotAllowedError')));
  });
  await expect(page.getByRole('button', { name: 'Enable sound' })).toHaveCount(0);
  expect(await page.evaluate(() => {
    const audio = fixture.room.audios.first, stream = audio.srcObject;
    fixture.people[1].tracks.audio.state = 'interrupted';
    fixture.paintAudio(fixture.people);
    return audio === fixture.room.audios.first && stream === audio.srcObject;
  })).toBe(true);
});
