#!/usr/bin/env node
// Re-encode a Daily replay to a streamable size and publish it to Firebase
// Storage, then stamp `mp4Url` on the recording doc so both playback paths
// serve it instead of the Daily original.
//
//   node scripts/rehost-replay.mjs <recordingId> [more ids...]
//   node scripts/rehost-replay.mjs --all          # every one not yet rehosted
//   node scripts/rehost-replay.mjs --all --force  # redo ones already done
//
// WHY THIS EXISTS (measured 2026-08-22, on a real round a user reported as
// "video is not loading"):
//
// Daily records in H.264 **Constrained Baseline** with no bitrate cap. On an
// 11:54 round that came out at 2906 kb/s video + 160 kb/s audio, so 277MB and
// 3.1 Mbps sustained. A viewer whose connection sits under that never gets
// past readyState 0, and the failure is silent: a media element that cannot
// keep up does NOT fire an error, it just shows the native spinner forever.
// Re-encoding to High profile at CRF 26 took the same round to 29MB / 328
// kb/s with no visible quality loss, because baseline has no CABAC and no
// B-frames and the frame is mostly flat black around two webcam tiles.
//
// It also cuts time-to-metadata by ~40x. Daily's file is a FRAGMENTED mp4
// whose moov carries duration 0, empty sample tables and no segment index, so
// a browser has to go looking before it knows the duration. Measured on the
// same round: 14155ms to loadedmetadata on the Daily original against 352ms
// on the faststart re-encode. Seeking itself DOES work on the original once
// metadata lands (a seek to 10:00 completed in 241ms), so this is a
// start-up-latency win, not a repair of a broken feature. Worth having
// anyway, because /watch opens the player as soon as a card is clicked and
// 14 seconds of nothing reads as a broken page.
//
// `round-recording.mjs` now caps NEW recordings at videoBitrate 1200, which
// measured SSIM 0.994 (quiet round) and 0.985 (both cameras live) against the
// uncapped original, so this script is for recordings made before that cap,
// or any that still come out too heavy.
//
// Requires: ffmpeg on PATH or at FFMPEG_BIN, a logged-in firebase CLI (its
// refresh token is exchanged for a GCP access token), and DAILY_API_KEY.

import { spawn } from 'node:child_process';
import { readFile, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const BUCKET = 'debateos-78ac5.firebasestorage.app';
const PROJECT = 'debateos-78ac5';
const DAILY_API = 'https://api.daily.co/v1';
// firebase-tools' own installed OAuth client. Public by construction: it ships
// inside the CLI, and it is only ever combined with the operator's own refresh
// token from ~/.config/configstore.
const FB_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FB_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function ffmpegBin(){
  if (process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN;
  // This Mac has no brew ffmpeg; Plaud ships a full arm64 build.
  const plaud = '/Applications/Plaud.app/Contents/Resources/ffmpeg';
  return existsSync(plaud) ? plaud : 'ffmpeg';
}

async function gcpToken(){
  const cfgPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  const refresh = cfg?.tokens?.refresh_token;
  if (!refresh) throw new Error('No firebase CLI refresh token. Run: firebase login');
  const body = new URLSearchParams({
    client_id: FB_CLIENT_ID, client_secret: FB_CLIENT_SECRET,
    refresh_token: refresh, grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  if (!r.ok) throw new Error('Token exchange failed: ' + r.status);
  return (await r.json()).access_token;
}

async function dailyLink(id){
  const key = process.env.DAILY_API_KEY;
  if (!key) throw new Error('DAILY_API_KEY is not set');
  const r = await fetch(`${DAILY_API}/recordings/${encodeURIComponent(id)}/access-link`, {
    headers: { Authorization: 'Bearer ' + key },
  });
  if (!r.ok) throw new Error('access-link failed: ' + r.status);
  return (await r.json()).download_link;
}

// Resumable, because these are hundreds of megabytes over a link that expires
// in about an hour, and a silently dead connection is routine.
async function download(id, dest){
  for (let attempt = 1; attempt <= 40; attempt++){
    const link = await dailyLink(id);
    const head = await fetch(link, { headers: { Range: 'bytes=0-1' } });
    const total = Number((head.headers.get('content-range') || '').split('/')[1] || 0);
    const have = existsSync(dest) ? (await stat(dest)).size : 0;
    if (total && have === total) return total;
    await new Promise((res, rej) => {
      const p = spawn('curl', ['-s', '-C', '-', '--speed-limit', '5000', '--speed-time', '30',
        '--max-time', '900', '-o', dest, link], { stdio: 'inherit' });
      p.on('exit', () => res());
      p.on('error', rej);
    });
    const now = existsSync(dest) ? (await stat(dest)).size : 0;
    console.log(`  attempt ${attempt}: ${now}/${total}`);
    if (total && now === total) return total;
  }
  throw new Error('download did not complete');
}

function run(bin, args){
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error(bin + ' exited ' + c))));
    p.on('error', rej);
  });
}

async function publish(id, file, token){
  const objectPath = `replays/${id}.mp4`;
  const enc = encodeURIComponent(objectPath);
  const bytes = await readFile(file);
  const up = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${enc}`,
    { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'video/mp4' }, body: bytes });
  if (!up.ok) throw new Error('upload failed: ' + up.status + ' ' + (await up.text()).slice(0, 200));

  // A Firebase download token makes the object publicly readable by URL
  // WITHOUT opening a public path in storage.rules. The content is a replay
  // somebody already chose to publish, so a bearer link is the right shape.
  const dl = randomUUID();
  const patch = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${enc}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      metadata: { firebaseStorageDownloadTokens: dl },
      // The object is immutable once written: a new encode gets a new token.
      cacheControl: 'public, max-age=31536000, immutable',
    }),
  });
  if (!patch.ok) throw new Error('metadata patch failed: ' + patch.status);

  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${enc}?alt=media&token=${dl}`;
  const fs = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/recordings/${id}`
           + '?updateMask.fieldPaths=mp4Url&updateMask.fieldPaths=mp4Bytes';
  const doc = await fetch(fs, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {
      mp4Url: { stringValue: url },
      mp4Bytes: { integerValue: String(bytes.length) },
    }}),
  });
  if (!doc.ok) throw new Error('doc stamp failed: ' + doc.status);
  return url;
}

async function rehost(id, token){
  const src = join(tmpdir(), `rehost-${id}.src.mp4`);
  const out = join(tmpdir(), `rehost-${id}.out.mp4`);
  console.log(`\n${id}`);
  console.log('  downloading the original');
  const srcBytes = await download(id, src);
  console.log('  encoding');
  await run(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-i', src,
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '26',
    '-maxrate', '1400k', '-bufsize', '2800k', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-y', out]);
  const outBytes = (await stat(out)).size;
  console.log(`  ${(srcBytes/1048576).toFixed(1)}MB -> ${(outBytes/1048576).toFixed(1)}MB`);
  const url = await publish(id, out, token);
  console.log('  published ' + url);
  await Promise.all([unlink(src).catch(()=>{}), unlink(out).catch(()=>{})]);
}

// --all skips anything already carrying an mp4Url, because a re-encode means
// downloading the whole original again. --force redoes them.
async function allPublishedIds(force){
  const r = await fetch('https://itsdebatable.com/api/recordings');
  if (!r.ok) throw new Error('recordings index failed: ' + r.status);
  const ids = (await r.json()).recordings.map((x) => x.id);
  if (force) return ids;
  const keep = [];
  for (const id of ids){
    const one = await fetch(`https://itsdebatable.com/api/recordings?id=${encodeURIComponent(id)}&link=1`);
    const link = one.ok ? ((await one.json()).link || '') : '';
    if (link.includes('firebasestorage.googleapis.com')) console.log(`  skipping ${id}, already rehosted`);
    else keep.push(id);
  }
  return keep;
}

const args = process.argv.slice(2);
if (!args.length){
  console.error('usage: node scripts/rehost-replay.mjs <recordingId>... | --all');
  process.exit(1);
}
const force = args.includes('--force');
const ids = args[0] === '--all'
  ? await allPublishedIds(force)
  : args.filter((a) => !a.startsWith('--'));
if (!ids.length){ console.log('nothing to do'); process.exit(0); }
const token = await gcpToken();
let failed = 0;
for (const id of ids){
  try { await rehost(id, token); }
  catch (err){ failed++; console.error(`  FAILED ${id}: ${err.message}`); }
}
console.log(`\n${ids.length - failed}/${ids.length} rehosted`);
process.exit(failed ? 1 : 0);
