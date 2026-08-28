#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ownerTokenProperties,
  streamerName,
  studioPath,
  STREAM_TOKEN_SECONDS,
} from '../app/netlify/functions/lib/stream-studio.mjs';

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
  rtmp: 'rtmp://private-key',
}));
check(cohostUrl.searchParams.get('t') === 'cohost-secret', 'cohost URL carries its meeting token');
check(cohostUrl.searchParams.get('role') === 'cohost', 'cohost URL declares its studio role');
check(cohostUrl.searchParams.get('name') === 'Friend', 'cohost URL carries its display name');
check(!cohostUrl.searchParams.has('rtmp'), 'cohost URL never carries the RTMP key');

const leadUrl = new URL('https://itsdebatable.com' + studioPath({
  url: 'https://example.daily.co/room-one',
  token: 'lead-secret',
  role: 'lead',
  rtmp: 'rtmp://private-key',
}));
check(leadUrl.searchParams.get('rtmp') === 'rtmp://private-key', 'lead URL receives the RTMP key');

const control = read('app/netlify/functions/stream-control.mjs');
const studio = read('app/studio.html');
const tournament = read('app/tournaments.html');
const admin = read('app/admin.html');
check(control.includes("if (action === 'cohost')"), 'stream control exposes the admin-only cohost action');
check(control.includes('enable_hidden_participants: true'), 'public viewers are hidden and receive-only');
check(studio.includes("call.on('participant-counts-updated', reportParticipants)"), 'studio tracks hidden public viewers');
check(tournament.includes("fetch('/api/stream-status'"), 'tournament page reads the public stream status');
check(tournament.includes('id="publicStreamFrame"'), 'tournament page contains the public player');
check(admin.includes("action: 'cohost'"), 'admin dashboard can mint a cohost invite');

console.log(`stream cohost guard: ${passed} assertions passed`);
