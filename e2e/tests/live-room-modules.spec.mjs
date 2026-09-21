import { test, expect } from '@playwright/test';
import { readApp } from '../helpers/offline-site.mjs';

async function mediaRoom(page, viewer = false) {
  await page.setContent('<div id="note"></div><div id="quality"></div><div id="toast"></div>');
  for (const name of ['media', 'connection']) await page.addScriptTag({ content: readApp(`js/live-room/${name}.js`) });
  await page.evaluate(viewer => {
    const audio = { kind: 'audio', readyState: 'live', stop() { this.stopped = true; } };
    const video = { kind: 'video', readyState: 'live', stop() { this.stopped = true; } };
    const stream = { getAudioTracks: () => [audio], getVideoTracks: () => [video] };
    const noOp = () => {};
    window.fixture = {
      blocked: false, rendererFailed: false, joinFailed: false, captures: [], joins: [], layers: [],
      state: { dailyUrl: 'https://fixture.daily.co/room' }, camConv: {}, audio, video,
      room: { viewer, tiles: {}, audios: {}, networkReasons: [], note: document.querySelector('#note'), qualityEl: document.querySelector('#quality') },
      seatLabel: () => 'Sam', myRoomName: () => 'Sam', publishTrackFor: () => video,
      startGuard: noOp, liveJourney: noOp, paintTray: noOp, dropTile: noOp,
      toast: text => { document.querySelector('#toast').textContent = text; },
    };
    const f = window.fixture;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async options => {
        f.captures.push(options);
        if (f.blocked) throw new DOMException('Blocked', 'NotAllowedError');
        return stream;
      },
    } });
    window.DebateCam = { start: async srcStream => {
      if (f.rendererFailed) throw new Error('Renderer unavailable');
      return { srcStream };
    } };
    f.room.call = {
      join: async props => {
        f.joins.push(props);
        if (f.joinFailed) throw new Error('Connection unavailable');
        f.room.joined = true;
      },
      updateReceiveSettings: async value => { f.layers.push(value['*'].video.layer); },
    };
    Object.assign(f, DBLiveMedia.create(f), DBLiveConnection.create(f));
  }, viewer);
}

test('blocked microphone can retry and a failed renderer retains the acquired microphone', async ({ page }) => {
  await mediaRoom(page);
  await page.evaluate(async () => { fixture.blocked = true; await fixture.joinRoomCall(); });
  await expect(page.locator('#note')).toContainText('Your microphone did not start');
  expect(await page.evaluate(() => [fixture.captures.length, fixture.joins.length, fixture.room.joinPending])).toEqual([2, 0, false]);
  await page.evaluate(() => { fixture.blocked = false; });
  await page.getByRole('button', { name: 'Rejoin the room' }).click();
  await expect.poll(() => page.evaluate(() => fixture.room.joined)).toBe(true);
  expect(await page.evaluate(() => fixture.joins[0].audioSource === fixture.audio)).toBe(true);
  await page.evaluate(async () => {
    fixture.room.joined = false;
    fixture.camConv.camP = null;
    fixture.rendererFailed = true;
    await fixture.joinRoomCall();
  });
  await expect(page.locator('#toast')).toContainText('mic only');
  expect(await page.evaluate(() => ({ captures: fixture.captures.length, joins: fixture.joins.length,
    audio: fixture.joins[1].audioSource === fixture.audio, video: fixture.joins[1].videoSource,
    stopped: fixture.video.stopped, micStopped: !!fixture.audio.stopped }))).toEqual({ captures: 4, joins: 2, audio: true, video: false, stopped: true, micStopped: false });
});

test('call failure releases the join lock and retry uses the same capture', async ({ page }) => {
  await mediaRoom(page);
  await page.evaluate(async () => { fixture.joinFailed = true; await fixture.joinRoomCall(); });
  await expect(page.locator('#note')).toContainText('Could not join the video room');
  expect(await page.evaluate(() => fixture.room.joinPending)).toBe(false);
  await page.evaluate(() => { fixture.joinFailed = false; });
  await page.getByRole('button', { name: 'Rejoin the room' }).click();
  await expect.poll(() => page.evaluate(() => fixture.room.joined)).toBe(true);
  expect(await page.evaluate(() => [fixture.captures.length, fixture.joins.length])).toEqual([1, 2]);
});

test('spectators never capture devices and connection recovery restores playback quality', async ({ page }) => {
  await mediaRoom(page, true);
  await page.evaluate(async () => {
    await fixture.joinRoomCall();
    fixture.onNetworkQuality({ networkState: 'bad' });
  });
  await expect(page.locator('#quality')).toContainText('Poor connection');
  expect(await page.evaluate(() => [fixture.captures.length, fixture.joins[0].audioSource, fixture.joins[0].videoSource])).toEqual([0, false, false]);
  await page.evaluate(() => {
    fixture.onNetworkQuality({ networkState: 'warning' });
    fixture.onNetworkQuality({ networkState: 'good' });
    fixture.onNetworkQuality({ networkState: 'good' });
  });
  await expect(page.locator('#quality')).toBeEmpty();
  expect(await page.evaluate(() => fixture.layers)).toEqual([0, 1, 'inherit']);
  await page.evaluate(() => fixture.teardownRoom());
  expect(await page.evaluate(() => fixture.room.joined)).toBe(false);
});

for (const action of ['participant leaves', 'call closes']) {
  test(`remote microphone and judge audio stop playing when ${action}`, async ({ page }) => {
    await mediaRoom(page);
    const result = await page.evaluate(action => {
      const nodes = ['peer', 'peer:judge'].map(key => {
        const audio = document.createElement('audio');
        audio.srcObject = new MediaStream();
        document.body.appendChild(audio);
        fixture.room.audios[key] = audio;
        return audio;
      });
      if (action === 'participant leaves') fixture.paintAudio([]);
      else fixture.teardownRoom();
      return { retained: Object.keys(fixture.room.audios),
        attached: nodes.map(node => node.isConnected), sources: nodes.map(node => node.srcObject) };
    }, action);
    expect(result).toEqual({ retained: [], attached: [false, false], sources: [null, null] });
  });
}

test('presence waits for initialized rooms, cannot revive a departed seat, and resumes after bfcache restore', async ({ page }) => {
  await page.clock.install();
  await page.setContent('<div id="roundQuiet" hidden></div>');
  await page.addScriptTag({ content: readApp('js/live-room/presence.js') });
  await page.evaluate(() => {
    const f = window.fixture = { writes: [], messages: [], stamp: 100,
      state: { user: { uid: 'a' }, proUid: 'a', conUid: 'b', phase: 'round', roundDocSeen: false, dailyMounted: false },
      room: { joined: true, remoteSeats: 0, call: { sendAppMessage: message => f.messages.push(message) } },
      audCam: {}, firebaseDb: {}, WATCH_STALE_MS: 60000, WATCH_COUNT_CAP: 100, SEAT_HB_MS: 1000, OPP_QUIET_MS: 60000,
      isSpectator: () => false, mySide: () => 'pro', paintPrivacyToggle() {},
    };
    window.firebase = { firestore: { FieldValue: { serverTimestamp: () => ++f.stamp } } };
    const query = { where: () => query, limit: () => query, get: () => new Promise(resolve => { f.releaseCount = resolve; }) };
    const round = { collection: () => query, set: async data => { f.writes.push(data); } };
    f.getRoundDocRef = () => round;
    Object.assign(f, DBLivePresence.create(f));
    f.startWatchPresence();
  });
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => fixture.writes)).toEqual([]);
  await page.evaluate(() => { fixture.state.roundDocSeen = fixture.state.dailyMounted = true; });
  await page.clock.runFor(1000);
  await page.evaluate(async () => {
    await fixture.markSeatLeft();
    fixture.releaseCount({ size: 2 });
  });
  expect(await page.evaluate(() => fixture.writes.map(w => Object.keys(w)))).toEqual([['seatLeft']]);
  expect(await page.evaluate(() => fixture.messages)).toEqual([{ t: 'seat-left', uid: 'a' }]);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(await page.evaluate(() => fixture.writes[1].seatSeen.a > fixture.writes[0].seatLeft.a)).toBe(true);
  expect(await page.evaluate(() => fixture.state.seatLeftMarked)).toBe(false);
  expect(await page.evaluate(() => {
    fixture.state.seatSeen = { a: 200, b: 150 };
    fixture.state.seatLeft = { b: 160 };
    const departed = fixture.opponentHasLeft();
    fixture.state.seatSeen.b = 170;
    return [departed, fixture.opponentHasLeft()];
  })).toEqual([true, false]);
});
