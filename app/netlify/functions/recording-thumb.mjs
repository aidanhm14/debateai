// Real video-frame thumbnails for published recordings.
//
//   GET /api/recording-thumb?id=<recordingId>  → image/jpeg
//
// The mp4s live behind short-lived Daily access links, so there is no
// stable image URL to point a card at. This endpoint makes one: the
// first request per recording mints a fresh Daily link, pulls a single
// frame out of the video with ffmpeg over HTTP range requests (the
// file is never downloaded in full), scales it to 640w, and keeps the
// JPEG in Netlify Blobs permanently. Every later request is a blob
// read behind a long CDN cache, so the ffmpeg cost is paid once per
// recording ever, not per view.
//
// The frame is taken a quarter of the way in (clamped 4s..600s) so it
// shows the round mid-argument rather than the black connect screen;
// if that seek fails (bad duration on the doc), it retries at 2s.
//
// On success the public URL is also written back to the recording doc
// as `thumbnailUrl`, which /w/{id} (w.mjs) already prefers for
// VideoObject.thumbnailUrl and og:image — that closes the "valid
// VideoObject, not rich-result eligible" gap from the 2026-08-12
// spectator-search entry for any recording without a youtubeId.
// Docs that already carry a thumbnailUrl or a youtubeId are left
// alone: an explicit value or YouTube's own still wins.
//
// Only published recordings are served; everything else 404s
// identically, same posture as recordings.mjs. Failures return a
// short-lived 404 so a broken recording cannot stampede ffmpeg runs.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getStore } from '@netlify/blobs';
import ffmpegPath from 'ffmpeg-static';
import { getDb } from './lib/firestore.mjs';
import { errorResponse } from './lib/response.mjs';

export const config = { path: '/api/recording-thumb' };

const DAILY_API = 'https://api.daily.co/v1';
const SITE = 'https://itsdebatable.com';

function imageResponse(bytes){
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      // The frame never changes once cut; let browsers and the CDN
      // keep it. Netlify-CDN-Cache-Control makes the edge copy stick
      // so the function is not even invoked for repeat viewers.
      'Cache-Control': 'public, max-age=604800, immutable',
      'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

function softFail(req){
  // 404 with a short public cache: a recording ffmpeg cannot read
  // should not be retried by every card render on every page view.
  const r = errorResponse('No thumbnail', 404, req);
  r.headers.set('Cache-Control', 'public, max-age=300');
  return r;
}

function extractFrame(link, seekSec, outPath){
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-ss', String(seekSec),
      '-i', link,
      '-frames:v', '1',
      '-vf', 'scale=640:-2',
      '-q:v', '5',
      '-y', outPath,
    ];
    // 18s kill: the function dies at ~26s of execution, and a failed
    // grab must leave room to answer with the soft 404 instead of
    // timing out into a 502.
    const proc = spawn(ffmpegPath, args, { signal: AbortSignal.timeout(18000) });
    let err = '';
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('ffmpeg exit ' + code + ': ' + err.slice(0, 300)));
    });
  });
}

export default async (req) => {
  if (req.method !== 'GET') return errorResponse('GET only', 405, req);
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return errorResponse('Bad id', 400, req);

  const store = getStore('recording-thumbs');
  const cached = await store.get(id, { type: 'arrayBuffer' });
  if (cached && cached.byteLength) return imageResponse(cached);

  const db = getDb();
  const snap = await db.collection('recordings').doc(id).get();
  const d = snap.exists ? (snap.data() || {}) : null;
  if (!d || !d.published) return errorResponse('Not found', 404, req);
  if (!process.env.DAILY_API_KEY) return softFail(req);

  const linkResp = await fetch(DAILY_API + '/recordings/' + encodeURIComponent(id) + '/access-link', {
    headers: { 'Authorization': 'Bearer ' + process.env.DAILY_API_KEY },
  });
  if (!linkResp.ok) return softFail(req);
  const link = ((await linkResp.json()) || {}).download_link;
  if (!link) return softFail(req);

  const duration = Number(d.duration) || 0;
  const seek = Math.min(Math.max(Math.round(duration * 0.25), 4), 600);
  const out = path.join(os.tmpdir(), 'thumb-' + id + '.jpg');
  try {
    try {
      await extractFrame(link, seek, out);
    } catch (e) {
      // A seek past the real end of a mis-durationed file fails; the
      // very start of the recording is always there.
      if (seek <= 2) throw e;
      await extractFrame(link, 2, out);
    }
    const buf = await fs.readFile(out);
    if (!buf.length) return softFail(req);
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    await store.set(id, bytes);
    if (!d.thumbnailUrl && !d.youtubeId){
      // Fire-and-forget would be frozen with the isolate; await it.
      await db.collection('recordings').doc(id)
        .set({ thumbnailUrl: SITE + '/api/recording-thumb?id=' + encodeURIComponent(id) }, { merge: true })
        .catch(() => {});
    }
    return imageResponse(bytes);
  } catch (e) {
    console.warn('[recording-thumb] extract failed for', id, e && e.message);
    return softFail(req);
  } finally {
    fs.unlink(out).catch(() => {});
  }
};
