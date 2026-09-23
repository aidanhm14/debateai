import { test, expect } from '@playwright/test';
import { readApp } from '../helpers/offline-site.mjs';

async function cameraRoom(page, failure = '') {
  await page.setContent('<button id="cvFlip">Switch camera</button><p id="toast"></p>');
  await page.addScriptTag({ content: readApp('js/live-room/media.js') });
  await page.evaluate(failure => {
    const makeVideo = () => document.createElement('canvas').captureStream(1).getVideoTracks()[0];
    const ac = new AudioContext();
    const mic = ac.createMediaStreamDestination().stream.getAudioTracks()[0];
    const oldVideo = makeVideo();
    const makeCam = srcStream => ({ srcStream, videoTrack: srcStream.getVideoTracks()[0],
      stop() { this.srcStream.getTracks().forEach(t => t.stop()); } });
    const old = makeCam(new MediaStream([oldVideo, mic]));
    const f = window.fixture = {
      ac, mic, old, oldVideo, failure, captures: [], published: [], guards: [], cameraEnabled: [],
      CUSTOM_TRACK_OK: true,
      room: { facing: 'user', joined: true },
      camConv: { mode: 'camera', cam: old, camP: Promise.resolve(old) },
      state: {}, seatLabel: () => 'You',
      publishTrackFor: c => c.videoTrack,
      startGuard: c => f.guards.push(c),
      toast: text => { document.querySelector('#toast').textContent = text; },
    };
    f.state.dailyFrame = {
      async setInputDevicesAsync(input) {
        f.published.push(input);
        if (f.failure === 'publish') throw new Error('Device rejected');
        if (f.failure === 'left') f.camConv.cam = null;
      },
      setLocalVideo: enabled => f.cameraEnabled.push(enabled),
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      async getUserMedia(options) {
        f.captures.push(options);
        f.newVideo = makeVideo();
        return new MediaStream([f.newVideo]);
      },
    } });
    window.DebateCam = { async start(srcStream) {
      if (f.failure === 'renderer') throw new Error('Renderer failed');
      return makeCam(srcStream);
    } };
    f.media = DBLiveMedia.create(f);
  }, failure);
}

for (const muted of [false, true]) {
  test(`switching cameras preserves the published ${muted ? 'muted' : 'live'} microphone`, async ({ page }) => {
    await cameraRoom(page);
    const result = await page.evaluate(async muted => {
      const f = fixture;
      f.mic.enabled = !muted;
      const pending = f.media.flipCamera();
      f.media.flipCamera(); // A second gesture while opening devices cannot duplicate capture.
      await pending;
      return {
        captures: f.captures.length, audioRequested: f.captures[0].audio,
        microphone: f.mic.readyState, enabled: f.mic.enabled,
        sameMic: f.camConv.cam.srcStream.getAudioTracks()[0] === f.mic,
        oldVideo: f.oldVideo.readyState, newVideo: f.newVideo.readyState,
        videoPublished: f.published[0].videoSource === f.newVideo,
        audioPublished: 'audioSource' in f.published[0],
        guarded: f.guards[0] === f.camConv.cam,
        facing: f.room.facing, pending: f.room.cameraFlipPending,
      };
    }, muted);
    expect(result).toEqual({ captures: 1, audioRequested: false, microphone: 'live', enabled: !muted,
      sameMic: true, oldVideo: 'ended', newVideo: 'live', videoPublished: true, audioPublished: false,
      guarded: true, facing: 'environment', pending: false });
    await expect(page.locator('#cvFlip')).toBeEnabled();
    await expect(page.locator('#toast')).toBeEmpty();
  });
}

for (const failure of ['renderer', 'publish']) {
  test(`failed camera ${failure} keeps the original microphone and camera`, async ({ page }) => {
    await cameraRoom(page, failure);
    const result = await page.evaluate(async () => {
      const f = fixture;
      await f.media.flipCamera();
      return { microphone: f.mic.readyState, camera: f.oldVideo.readyState, replacement: f.newVideo.readyState,
        sameCamera: f.camConv.cam === f.old, retainedMic: f.old.srcStream.getAudioTracks()[0] === f.mic,
        facing: f.room.facing, pending: f.room.cameraFlipPending, guardChanges: f.guards.length };
    });
    expect(result).toEqual({ microphone: 'live', camera: 'live', replacement: 'ended', sameCamera: true,
      retainedMic: true, facing: 'user', pending: false, guardChanges: 0 });
    await expect(page.locator('#toast')).toHaveText('Could not switch cameras');
    await expect(page.locator('#cvFlip')).toBeEnabled();
  });
}

test('a camera switch completed after leaving cannot restore the obsolete pipeline', async ({ page }) => {
  await cameraRoom(page, 'left');
  await page.evaluate(() => fixture.media.flipCamera());
  expect(await page.evaluate(() => ({ camera: fixture.camConv.cam, replacement: fixture.newVideo.readyState,
    facing: fixture.room.facing, guardChanges: fixture.guards.length }))).toEqual({
    camera: null, replacement: 'ended', facing: 'user', guardChanges: 0,
  });
});
