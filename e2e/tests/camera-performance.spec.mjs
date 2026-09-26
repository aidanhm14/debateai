import { test, expect } from '@playwright/test';
import { readApp } from '../helpers/offline-site.mjs';

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera', 'microphone'],
});

test.describe('browser camera capture', () => {
  test('CPU pressure changes the existing camera resolution and frame rate without interrupting the mic', async ({ page }) => {
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('https://debatable.test');
    await page.addScriptTag({ content: readApp('js/live-room/media.js') });
    const result = await page.evaluate(async () => {
      const room = { call: { updateSendSettings: async () => {} } };
      const camConv = { mode: 'camera' };
      const media = DBLiveMedia.create({ room, camConv });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: media.captureConstraints('camera') });
      const track = stream.getVideoTracks()[0];
      const mic = stream.getAudioTracks()[0];
      camConv.cam = { srcStream: stream };
      const read = () => {
        const { width, height, frameRate } = track.getSettings();
        return { width, height, frameRate };
      };
      const before = read();
      room.cpuHigh = true;
      media.tuneSendQuality();
      await media.applyCaptureProfile(camConv.cam, 'camera');
      const busy = read();
      room.cpuHigh = false;
      media.tuneSendQuality();
      await media.applyCaptureProfile(camConv.cam, 'camera');
      const after = read();
      const sameTracks = stream.getVideoTracks()[0] === track && stream.getAudioTracks()[0] === mic;
      const liveTracks = stream.getTracks().every(t => t.readyState === 'live');
      stream.getTracks().forEach(t => t.stop());
      return { before, busy, after, sameTracks, liveTracks };
    });
    expect(result).toEqual({
      before: { width: 1280, height: 720, frameRate: expect.any(Number) },
      busy: { width: 640, height: 360, frameRate: 15 },
      after: { width: 1280, height: 720, frameRate: result.before.frameRate },
      sameTracks: true, liveTracks: true,
    });
    // A 24 fps ceiling must also accept cameras whose native rate is lower.
    expect(result.before.frameRate).toBeGreaterThan(15);
    expect(result.before.frameRate).toBeLessThanOrEqual(24);
  });
});

test('camera passthrough stays quiet and avatar switches paint before publishing', async ({ page }) => {
  const modelRequests = [];
  await page.route('**/*', route => {
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<html></html>' });
    modelRequests.push(route.request().url()); return route.abort();
  });
  await page.goto('https://debatable.test');
  await page.setContent('<canvas id="source" width="320" height="180"></canvas>');
  await page.addScriptTag({ content: readApp('js/avatar.js') });
  await page.addScriptTag({ content: readApp('js/cam-avatar.js') });
  await page.evaluate(async () => {
    localStorage.setItem('debatable-live-avatar-v1', JSON.stringify({ style: 'face2d' }));
    const ctx = document.querySelector('#source').getContext('2d');
    ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 320, 180);
    const source = document.querySelector('#source').captureStream(24);
    const audio = new AudioContext();
    source.addTrack(audio.createMediaStreamDestination().stream.getAudioTracks()[0]);
    const NativeAudio = window.AudioContext;
    window.__meters = 0; window.__ticks = 0;
    window.AudioContext = class extends NativeAudio { constructor(...args) { super(...args); window.__meters++; } };
    const interval = window.setInterval;
    window.setInterval = (fn, ms) => interval(() => { window.__ticks++; fn(); }, ms);
    window.camera = await DebateCam.start(source, { mode: 'camera' });
    camera.setPassthrough(true);
    window.__source = source; window.__audio = audio;
  });
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__meters)).toBe(0);
  expect(await page.evaluate(() => window.__ticks)).toBeLessThanOrEqual(2);
  expect(modelRequests).toEqual([]);
  const cameraPixel = await page.evaluate(() => [...camera.canvas.getContext('2d').getImageData(480, 270, 1, 1).data]);
  expect(cameraPixel[1]).toBeGreaterThan(250);
  expect(cameraPixel[0] + cameraPixel[2]).toBeLessThan(5);
  const modes = await page.evaluate(() => {
    camera.debugFace(DebateCam._zeroFace());
    camera.setMode('avatar');
    const masked = [...camera.canvas.getContext('2d').getImageData(480, 270, 1, 1).data];
    camera.setPassthrough(false);
    return { masked, meters: window.__meters, mic: __source.getAudioTracks()[0].readyState };
  });
  expect(modes.masked).not.toEqual(cameraPixel);
  expect(modes.meters).toBe(1);
  expect(modes.mic).toBe('live');
  await page.evaluate(() => { camera.setPerformanceMode(true); window.__ticks = 0; });
  await page.waitForTimeout(1100);
  expect(await page.evaluate(() => window.__ticks)).toBeGreaterThan(5);
  expect(await page.evaluate(() => window.__ticks)).toBeLessThanOrEqual(15);
  await page.evaluate(() => { camera.setMode('off'); window.__ticks = 0; });
  await page.waitForTimeout(1100);
  expect(await page.evaluate(() => window.__ticks)).toBeLessThanOrEqual(2);
  await page.evaluate(() => { camera.stop(); window.__ticks = 0; });
  await page.waitForTimeout(1100);
  expect(await page.evaluate(() => window.__ticks)).toBe(0);
  expect(await page.evaluate(() => __source.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
});
