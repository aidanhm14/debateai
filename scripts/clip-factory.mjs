#!/usr/bin/env node
// Clip factory. Turns consented round recordings into promo assets.
//
// The pipeline that feeds this already exists and is consent-gated end to
// end: /api/round-recording only starts Daily's cloud recorder after every
// seated participant opts in, recordings-admin syncs finished files, and
// /api/recordings serves ONLY docs with published:true. This script reads
// that public index, so there is no path here that touches a round nobody
// agreed to publish. No credentials required, by design.
//
//   node scripts/clip-factory.mjs                     # every published recording
//   node scripts/clip-factory.mjs --id <recordingId>  # just one
//   node scripts/clip-factory.mjs --file round.mp4    # local footage, no API
//   node scripts/clip-factory.mjs --clip 90:120       # cut one window
//   node scripts/clip-factory.mjs --list              # what is available, no work
//
// Per source it writes, into --out (default work/clips/<id>/):
//   source.mp4     the download, kept so re-runs never re-fetch
//   poster.jpg     1280w still for tiles and og:image
//   preview.mp4    6s muted loop, 640w, for hover-to-play thumbnails
//   vertical.mp4   1080x1920 for TikTok / Reels / Shorts
//   master.mov     ProRes 422, only with --prores, for cutting in Resolve
//   meta.json      motion, format, names, duration, what got written
//
// and a manifest.json at the root of --out collecting every meta.json.
//
// Everything is idempotent: an output that already exists is skipped unless
// --force. Downloads are the expensive step and are cached hardest.

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, rm, readdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

// Plaud ships a full arm64 build; this Mac has no brew or system ffmpeg.
// FFMPEG=/path/to/ffmpeg overrides it on a machine that does.
const FFMPEG = process.env.FFMPEG || '/Applications/Plaud.app/Contents/Resources/ffmpeg';
const API = process.env.CLIP_API_ORIGIN || 'https://itsdebatable.com';

const VERTICAL_W = 1080;
const VERTICAL_H = 1920;
const PREVIEW_W = 640;
const PREVIEW_SEC = 6;
const POSTER_W = 1280;

function parseArgs(argv){
  const args = { out: 'work/clips', limit: 0, force: false, list: false, dryRun: false, prores: false };
  for (let i = 0; i < argv.length; i++){
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--id') args.id = next();
    else if (a === '--file') args.file = next();
    else if (a === '--out') args.out = next();
    else if (a === '--limit') args.limit = parseInt(next(), 10) || 0;
    else if (a === '--clip') args.clip = next();
    else if (a === '--force') args.force = true;
    else if (a === '--list') args.list = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--prores') args.prores = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a.startsWith('--')) throw new Error('Unknown flag: ' + a);
  }
  return args;
}

const HELP = `clip-factory - consented round recordings to promo assets

  --id <recordingId>   one recording instead of the whole published index
  --file <path>        skip the API, process local footage
  --clip <a:b>         cut one window, seconds or mm:ss (e.g. 90:120, 1:30:2:00)
  --out <dir>          output root (default work/clips)
  --limit <n>          stop after n recordings
  --prores             also write master.mov (ProRes 422) for Resolve
  --list               show what the API has, write nothing
  --dry-run            print the plan, run no ffmpeg
  --force              rebuild outputs that already exist

Env: FFMPEG to point at another binary, CLIP_API_ORIGIN for a non-prod API.`;

// ── time helpers ────────────────────────────────────────────────────────

// Accepts 90, 1:30, or 1:02:03. Returns seconds.
function toSeconds(value){
  const parts = String(value).trim().split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n) || n < 0)) return NaN;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
}

// --clip takes two of the above joined by a colon, which is ambiguous the
// moment either side is itself colon-separated. Split on the midpoint of the
// colon count instead of the first colon.
function parseClip(spec){
  const raw = String(spec).trim();
  const colons = (raw.match(/:/g) || []).length;
  if (colons === 0) throw new Error('--clip needs a start and an end, e.g. 90:120');
  const per = colons % 2 === 1 ? (colons - 1) / 2 : null;
  if (per === null) throw new Error('--clip could not be split into a start and an end: ' + raw);
  let seen = 0, cut = -1;
  for (let i = 0; i < raw.length; i++){
    if (raw[i] !== ':') continue;
    if (seen === per){ cut = i; break; }
    seen++;
  }
  const start = toSeconds(raw.slice(0, cut));
  const end = toSeconds(raw.slice(cut + 1));
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('--clip is not a time range: ' + raw);
  if (end <= start) throw new Error('--clip end must be after its start');
  return { start, end };
}

function fmtDur(sec){
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  return m + 'm' + String(s % 60).padStart(2, '0') + 's';
}

// ── ffmpeg ──────────────────────────────────────────────────────────────

function runFfmpeg(args){
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', err => reject(new Error('ffmpeg failed to start (' + FFMPEG + '): ' + err.message)));
    proc.on('close', code => {
      if (code === 0) return resolve();
      reject(new Error('ffmpeg exited ' + code + '\n' + stderr.trim().slice(0, 800)));
    });
  });
}

// No ffprobe in the Plaud bundle, so read the duration off ffmpeg's own
// header dump. `-i` with no output exits 1 by design; that is not an error.
function probeDuration(file){
  return new Promise(resolve => {
    const proc = spawn(FFMPEG, ['-hide_banner', '-i', file]);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', () => resolve(0));
    proc.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/);
      if (!m) return resolve(0);
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}

async function exists(file){
  try { await stat(file); return true; } catch { return false; }
}

// ── api ─────────────────────────────────────────────────────────────────

async function fetchJson(url){
  const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) throw new Error('GET ' + url + ' → ' + resp.status);
  return resp.json();
}

async function listRecordings(id){
  if (id){
    const { recording } = await fetchJson(API + '/api/recordings?id=' + encodeURIComponent(id));
    return recording ? [recording] : [];
  }
  const { recordings } = await fetchJson(API + '/api/recordings');
  return Array.isArray(recordings) ? recordings : [];
}

// Daily's access links are short-lived, so this is fetched at download time
// and never cached to disk.
async function playbackLink(id){
  const data = await fetchJson(API + '/api/recordings?id=' + encodeURIComponent(id) + '&link=1');
  if (!data.link) throw new Error('no playback link for ' + id);
  return data.link;
}

async function download(url, dest){
  const resp = await fetch(url);
  if (!resp.ok || !resp.body) throw new Error('download failed: ' + resp.status);
  const tmp = dest + '.part';
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(tmp));
  // Rename only once the body is fully on disk, so an interrupted run never
  // leaves a truncated source.mp4 that later runs would treat as cached.
  const { rename } = await import('node:fs/promises');
  await rename(tmp, dest);
}

// ── renders ─────────────────────────────────────────────────────────────

// A round opens with people settling in, so the first frames are usually a
// half-empty room. Sample ~12% in, clamped so short clips still land inside.
function posterOffset(duration){
  if (!duration) return 3;
  return Math.min(Math.max(duration * 0.12, 2), Math.max(duration - 1, 1));
}

function trimArgs(window){
  return window ? ['-ss', String(window.start), '-t', String(window.end - window.start)] : [];
}

async function renderPoster(src, dest, duration, window){
  const at = window ? window.start + Math.min(2, (window.end - window.start) / 4) : posterOffset(duration);
  await runFfmpeg([
    '-ss', String(at), '-i', src, '-frames:v', '1',
    '-vf', `scale=${POSTER_W}:-2:flags=lanczos`,
    '-q:v', '3', dest,
  ]);
}

async function renderPreview(src, dest, duration, window){
  const at = window ? window.start : posterOffset(duration);
  await runFfmpeg([
    '-ss', String(at), '-t', String(PREVIEW_SEC), '-i', src,
    '-an',
    '-vf', `scale=${PREVIEW_W}:-2:flags=lanczos,fps=24`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    dest,
  ]);
}

// Fill 1080x1920 from a 16:9 source: cover-scale, then centre-crop. Daily's
// default layout puts the speakers mid-frame, so a centre crop keeps faces.
// This is the handoff to Resolve, where Smart Reframe can track the active
// speaker properly; this is the good-enough version for a same-day post.
async function renderVertical(src, dest, window){
  await runFfmpeg([
    ...trimArgs(window), '-i', src,
    '-vf', `scale=${VERTICAL_W}:${VERTICAL_H}:force_original_aspect_ratio=increase,crop=${VERTICAL_W}:${VERTICAL_H},setsar=1`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart',
    dest,
  ]);
}

async function renderProres(src, dest, window){
  await runFfmpeg([
    ...trimArgs(window), '-i', src,
    '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le',
    '-c:a', 'pcm_s16le',
    dest,
  ]);
}

// ── per-source work ─────────────────────────────────────────────────────

async function processSource({ id, meta, sourcePath, outDir, args, window }){
  const files = {};
  const label = window ? `${id} [${fmtDur(window.start)}→${fmtDur(window.end)}]` : id;

  const duration = await probeDuration(sourcePath);
  if (window && duration && window.start >= duration){
    throw new Error(`--clip starts at ${fmtDur(window.start)} but the source is ${fmtDur(duration)} long`);
  }

  const jobs = [
    ['poster.jpg', dest => renderPoster(sourcePath, dest, duration, window)],
    ['preview.mp4', dest => renderPreview(sourcePath, dest, duration, window)],
    ['vertical.mp4', dest => renderVertical(sourcePath, dest, window)],
  ];
  if (args.prores) jobs.push(['master.mov', dest => renderProres(sourcePath, dest, window)]);

  for (const [name, render] of jobs){
    const dest = path.join(outDir, name);
    if (!args.force && await exists(dest)){
      console.log(`  = ${name} (cached)`);
      files[name] = dest;
      continue;
    }
    if (args.dryRun){
      console.log(`  · ${name} (dry run)`);
      continue;
    }
    process.stdout.write(`  → ${name} ... `);
    const started = Date.now();
    try {
      await render(dest);
    } catch (err){
      // A failed render leaves a zero-byte file that would read as cached.
      await rm(dest, { force: true });
      console.log('failed');
      throw err;
    }
    console.log(`${((Date.now() - started) / 1000).toFixed(1)}s`);
    files[name] = dest;
  }

  const record = {
    id,
    label,
    sourceDuration: Math.round(duration),
    window: window ? { start: window.start, end: window.end } : null,
    motion: meta.motion || '',
    format: meta.format || '',
    title: meta.title || '',
    pro: meta.proName || '',
    con: meta.conName || '',
    startTs: meta.startTs || 0,
    isStream: !!meta.isStream,
    watchUrl: meta.local ? '' : `${API}/watch?r=${encodeURIComponent(id)}`,
    files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, path.relative(args.out, v)])),
    builtAt: new Date().toISOString(),
  };
  if (!args.dryRun) await writeFile(path.join(outDir, 'meta.json'), JSON.stringify(record, null, 2));
  return record;
}

// ── manifest ────────────────────────────────────────────────────────────

// Rebuilt from every meta.json on disk rather than from this run's results,
// so a run over one --id does not drop the other entries.
async function writeManifest(outRoot){
  let entries;
  try { entries = await readdir(outRoot, { withFileTypes: true }); }
  catch { return 0; }
  const records = [];
  for (const entry of entries){
    if (!entry.isDirectory()) continue;
    try {
      records.push(JSON.parse(await readFile(path.join(outRoot, entry.name, 'meta.json'), 'utf8')));
    } catch { /* directory without a finished meta.json */ }
  }
  records.sort((a, b) => (b.startTs || 0) - (a.startTs || 0));
  await writeFile(path.join(outRoot, 'manifest.json'), JSON.stringify({
    builtAt: new Date().toISOString(),
    count: records.length,
    clips: records,
  }, null, 2));
  return records.length;
}

// ── main ────────────────────────────────────────────────────────────────

async function main(){
  const args = parseArgs(process.argv.slice(2));
  if (args.help){ console.log(HELP); return; }

  const window = args.clip ? parseClip(args.clip) : null;

  if (!await exists(FFMPEG)){
    throw new Error(`no ffmpeg at ${FFMPEG}. Set FFMPEG=/path/to/ffmpeg.`);
  }

  // Local-file mode: the same renders, no API, for footage that never went
  // through a round (tournament capture, a phone recording, an old export).
  if (args.file){
    const id = path.basename(args.file).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
    const outDir = path.join(args.out, id);
    await mkdir(outDir, { recursive: true });
    console.log(`${id}  (local file)`);
    await processSource({
      id, meta: { title: id, local: true }, sourcePath: args.file, outDir, args, window,
    });
    const n = await writeManifest(args.out);
    console.log(`\nmanifest.json → ${n} entr${n === 1 ? 'y' : 'ies'} in ${args.out}`);
    return;
  }

  const recordings = await listRecordings(args.id);

  if (args.list || recordings.length === 0){
    if (recordings.length === 0){
      console.log('No published recordings at ' + API + '/api/recordings.');
      console.log('Rounds only land there once every seated debater has opted in');
      console.log('and the sync cron has picked the file up. Use --file to work on');
      console.log('footage you already have.');
      return;
    }
    for (const r of recordings){
      console.log([
        r.id,
        fmtDur(r.duration).padStart(7),
        r.isStream ? 'stream' : 'round  ',
        (r.format || '-').padEnd(12),
        r.motion || r.title || '',
      ].join('  '));
    }
    if (args.list) return;
  }

  const queue = args.limit ? recordings.slice(0, args.limit) : recordings;
  const failures = [];

  for (const rec of queue){
    const outDir = path.join(args.out, rec.id);
    await mkdir(outDir, { recursive: true });
    const sourcePath = path.join(outDir, 'source.mp4');
    console.log(`\n${rec.id}  ${fmtDur(rec.duration)}  ${rec.motion || rec.title || ''}`);

    try {
      if (await exists(sourcePath)){
        console.log('  = source.mp4 (cached)');
      } else if (args.dryRun){
        console.log('  · source.mp4 (dry run, nothing downloaded)');
        continue;
      } else {
        process.stdout.write('  ↓ source.mp4 ... ');
        const started = Date.now();
        await download(await playbackLink(rec.id), sourcePath);
        console.log(`${((Date.now() - started) / 1000).toFixed(1)}s`);
      }
      await processSource({ id: rec.id, meta: rec, sourcePath, outDir, args, window });
    } catch (err){
      // One bad recording should not cost the whole batch.
      console.error(`  ! ${err.message}`);
      failures.push(rec.id);
    }
  }

  const n = await writeManifest(args.out);
  console.log(`\nmanifest.json → ${n} entr${n === 1 ? 'y' : 'ies'} in ${args.out}`);
  if (failures.length){
    console.error(`failed: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
