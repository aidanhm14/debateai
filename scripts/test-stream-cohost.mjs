#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  ownerTokenProperties,
  streamerName,
  studioPath,
  STREAM_TOKEN_SECONDS,
} from '../app/netlify/functions/lib/stream-studio.mjs';
import {
  dailyEndpointPayload,
  publicRestreamLinks,
  safeStudioTargets,
  streamTargets,
} from '../app/netlify/functions/lib/stream-targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

let passed = 0;
function check(value, message) {
  assert.ok(value, message);
  passed += 1;
}

const lead = ownerTokenProperties('room-one', {
  role: 'lead',
  userName: 'Lead',
  withRecording: true,
  nowSec: 1000,
});
check(lead.is_owner === true, 'lead is an owner and may publish');
check(lead.start_cloud_recording === true, 'lead may auto-start cloud recording');
check(lead.eject_at_token_exp === true, 'lead is ejected when the token expires');
check(lead.exp === 1000 + STREAM_TOKEN_SECONDS, 'lead token has the bounded stream lifetime');

const cohost = ownerTokenProperties('room-one', {
  role: 'cohost',
  userName: 'Friend',
  withRecording: true,
  nowSec: 1000,
});
check(cohost.is_owner === true, 'cohost is an owner and may publish');
check(!('start_cloud_recording' in cohost), 'cohost cannot auto-start a second recording');
check(cohost.enable_recording_ui === false, 'cohost recording control is hidden');
check(streamerName('  Friend\u0000  ') === 'Friend', 'streamer names remove control characters');

const cohostUrl = new URL('https://itsdebatable.com' + studioPath({
  url: 'https://example.daily.co/room-one',
  token: 'cohost-secret',
  title: 'The final',
  userName: 'Friend',
  role: 'cohost',
  roomName: 'room-one',
  restreamToken: 'restream-secret',
  restreams: [{ platform:'twitch', endpoint:'rtmp_twitch' }],
}));
check(cohostUrl.searchParams.get('t') === 'cohost-secret', 'cohost URL carries its meeting token');
check(cohostUrl.searchParams.get('role') === 'cohost', 'cohost URL declares its studio role');
check(cohostUrl.searchParams.get('name') === 'Friend', 'cohost URL carries its display name');
check(!cohostUrl.searchParams.has('rtmp'), 'cohost URL never carries the RTMP key');
check(!cohostUrl.searchParams.has('rs'), 'cohost URL never carries the simulcast start token');
check(!cohostUrl.searchParams.has('out'), 'cohost URL never carries simulcast controls');

const leadUrl = new URL('https://itsdebatable.com' + studioPath({
  url: 'https://example.daily.co/room-one',
  token: 'lead-secret',
  role: 'lead',
  roomName: 'room-one',
  restreamToken: 'restream-secret',
  restreams: [
    { platform:'twitch', endpoint:'rtmp_twitch' },
    { platform:'youtube', endpoint:'rtmp_youtube' },
    { platform:'tiktok', endpoint:'rtmp_tiktok' },
  ],
}));
check(!leadUrl.searchParams.has('rtmp'), 'lead URL never carries an RTMP key');
check(leadUrl.searchParams.get('room') === 'room-one', 'lead URL identifies the room it may simulcast');
check(leadUrl.searchParams.get('rs') === 'restream-secret', 'lead URL receives the one-time simulcast token');
check(leadUrl.searchParams.getAll('out').length === 3, 'lead URL names all safe simulcast destinations');

const targets = streamTargets({
  STREAM_RTMP_URL: 'rtmps://twitch.example/app/legacy-secret',
  STREAM_TWITCH_CHANNEL: 'trydebatable',
  STREAM_YOUTUBE_RTMP_URL: 'rtmps://youtube.example/live2/youtube-secret',
  STREAM_TIKTOK_RTMP_URL: 'rtmp://tiktok.example/live/tiktok-secret',
  STREAM_YOUTUBE_CHANNEL_ID: 'UC1234567890',
  STREAM_TIKTOK_USERNAME: '@trydebatable',
});
check(targets.map(x => x.platform).join(',') === 'twitch,youtube,tiktok', 'legacy Twitch plus explicit YouTube and TikTok resolve to three targets');
check(dailyEndpointPayload(targets).length === 3, 'Daily receives all three RTMP destinations');
check(safeStudioTargets(targets).every(x => !('rtmpUrl' in x)), 'Studio target descriptors contain no stream keys');
const watchLinks = publicRestreamLinks(targets, {
  STREAM_TWITCH_CHANNEL: 'trydebatable',
  STREAM_YOUTUBE_CHANNEL_ID: 'UC1234567890',
  STREAM_TIKTOK_USERNAME: '@trydebatable',
});
check(watchLinks.map(x => x.platform).join(',') === 'twitch,youtube,tiktok', 'public links cover every configured channel');
check(!JSON.stringify(watchLinks).includes('secret'), 'public links contain no ingest credential');
check(streamTargets({ STREAM_TIKTOK_RTMP_URL:'javascript:bad' }).length === 0, 'invalid ingest schemes fail closed');

const control = read('app/netlify/functions/stream-control.mjs');
const restream = read('app/netlify/functions/stream-restream.mjs');
const liveRoomControl = read('app/netlify/functions/create-daily-room.mjs');
const studio = read('app/studio.html');
const liveRound = read('app/live-round.html');
const loader = read('app/js/daily-loader.js');
const tournament = read('app/tournaments.html');
const open = read('app/open.html');
const watch = read('app/watch.html');
const landing = read('app/landing.html');
const viewer = read('app/js/broadcast-viewer.js');
const status = read('app/netlify/functions/stream-status.mjs');
const admin = read('app/admin.html');
const fallbackStart = liveRound.indexOf('function mountAudienceIframe');
const fallbackEnd = liveRound.indexOf('function destroyViewerMount');
const fallbackBlock = liveRound.slice(fallbackStart, fallbackEnd);
const audienceCamStart = liveRound.indexOf('function mountAudCamFrame');
const audienceCamEnd = liveRound.indexOf('function audCamCleanupMedia');
const audienceCamBlock = liveRound.slice(audienceCamStart, audienceCamEnd);
check(control.includes("if (action === 'cohost')"), 'stream control exposes the admin-only cohost action');
check(control.includes('enable_hidden_participants: true'), 'public viewers are hidden and receive-only');
check(control.includes('enable_multiparty_adaptive_simulcast: true'), 'broadcast room keeps adaptive simulcast for direct viewers');
check(liveRoomControl.includes('enable_multiparty_adaptive_simulcast: true'), 'live rounds keep adaptive simulcast after hidden viewers join');
check(studio.includes("call.on('participant-counts-updated', reportParticipants)"), 'studio tracks hidden public viewers');
check(studio.includes("call.on('network-quality-change'"), 'studio reacts to network pressure');
check(studio.includes("call.on('cpu-load-change'"), 'studio reacts to device pressure');
check(studio.includes("fetch('/api/stream-restream'"), 'lead Studio starts simulcasting through the server');
check(!studio.includes("q.get('rtmp')"), 'Studio never reads an RTMP key from its URL');
check(!studio.includes('call.startLiveStreaming({'), 'Studio never transmits platform keys itself');
check(restream.includes('dailyEndpointPayload(targets)'), 'server fans out to every configured Daily endpoint');
check(restream.includes('timingSafeEqual'), 'simulcast start token uses timing-safe verification');
check(control.includes('restreamTokenHash: simulcastToken ? restreamTokenHash(simulcastToken) : null'), 'only the simulcast token hash is stored');
check(control.includes('stopRoomRestream(cur.roomName)'), 'ending the stream also stops every external destination');
check(liveRound.includes("call.on('network-quality-change', onNetworkQuality)"), 'live round reacts to network pressure');
check(liveRound.includes("call.on('cpu-load-change', onCpuLoad)"), 'live round reacts to device pressure');
check(liveRound.includes("var settings = { '*': { video: { layer: cap } } }"), 'watchers can step down camera video without blurring screen shares');
check(fallbackBlock.includes("iframe.className = 'daily-frame daily-frame--broadcast-crop'"), 'last-resort spectator iframe crops the Daily meeting interface');
check(fallbackBlock.includes("shell.classList.add('is-daily-crop')"), 'spectator fallback activates the branded crop shell');
check(liveRound.includes(".call-shell.is-daily-crop::after"), 'cropped fallback covers the remaining Daily menu with a live badge');
check(!audienceCamBlock.includes('daily-frame--broadcast-crop'), 'camera-on audience members retain their required call controls');
check(loader.includes("var VERSION = '0.92.2'"), 'Daily SDK loader is pinned to an exact release');
check(!/https:\/\/unpkg\.com\/@daily-co\/daily-js["']/.test(studio + liveRound), 'stream pages do not load Daily latest');
const dailyBundle = fs.readFileSync(path.join(root, 'app/vendor/daily-iframe-0.92.2.js'));
check(crypto.createHash('sha256').update(dailyBundle).digest('hex') === '4199d9996bafaa500d97362eb109c2a300ffbead41ce5c4df7132517f7ad5636', 'vendored Daily SDK matches the reviewed npm bundle');
check(tournament.includes("fetch('/api/stream-status'"), 'tournament page reads the public stream status');
check(tournament.includes('id="publicStreamFrame"'), 'tournament page contains the public player');
check(admin.includes("action: 'cohost'"), 'admin dashboard can mint a cohost invite');
check(viewer.includes('Daily.createCallObject({ videoSource: false, audioSource: false'), 'public player is a receive-only call object');
check(viewer.includes("playable(person, 'screenVideo')"), 'public player promotes the host screen share');
check(viewer.includes("playable(person, 'screenAudio')"), 'public player carries shared system audio');
check(viewer.includes("root.requestFullscreen()"), 'public player owns its fullscreen control');
check(!tournament.includes('<iframe id="publicStreamFrame"'), 'tournament page never exposes Daily Prebuilt');
check(!open.includes('<iframe class="main-broadcast-frame"'), 'Open lobby never exposes Daily Prebuilt');
check(!watch.includes('<iframe class="live-frame"'), 'Watch never exposes Daily Prebuilt');
check(tournament.includes('DebatableBroadcast.mount(frame'), 'tournament page mounts the native player');
check(open.includes("DebatableBroadcast.mount($('mainBroadcastFrame')"), 'Open lobby mounts the native player');
check(watch.includes("DebatableBroadcast.mount($('liveFrame')"), 'Watch mounts the native player');
check(control.includes("const SITE_PLAYER = process.env.STREAM_SITE_PLAYER === 'embed' ? 'embed' : 'native'"), 'native site player is the default with an embed escape hatch');
check(control.includes('publicRestreamLinks(TARGETS, process.env)'), 'stream control builds only safe public channel links');
check(status.includes('externalWatchUrl: d.externalWatchUrl || null'), 'public status keeps the safe single-link compatibility field');
check(status.includes('externalWatchLinks: Array.isArray(d.externalWatchLinks)'), 'public status exposes safe multi-platform links');
check(viewer.includes('status.externalWatchLinks'), 'native player links to all active simulcast channels');
check(landing.includes("var preferEmbed = s.sitePlayer === 'embed' || !s.url"), 'homepage keeps the native player while Twitch runs outward');

console.log(`stream cohost guard: ${passed} assertions passed`);
