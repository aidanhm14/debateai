// Real video-frame thumbnails for published recordings.
//
//   GET /api/recording-thumb?id=<recordingId>[&v=<n>]  → image/jpeg
//
// The mp4s live behind short-lived Daily access links, so there is no
// stable image URL to point a card at. This endpoint makes one: the
// first request per recording mints a fresh Daily link, downloads the
// FIRST 16MB with a single range request, cuts one frame out of that
// chunk with ffmpeg, scales it to 640w, and keeps the JPEG in Netlify
// Blobs permanently. Every later request is a blob read behind a long
// CDN cache, so the extraction cost is paid once per recording ever.
//
// The one-range-then-local shape is load-bearing, not an optimization:
// Daily records fragmented mp4 (iso6, no usable seek index), so ffmpeg
// reading the URL directly walks it in dozens of serial range requests
// and took ~27s WHEREVER it ran — measured against a real 327MB
// recording, and it 502'd the first deploy of this function by blowing
// the ~26s execution wall. One ranged GET of the same file took 1.2s
// and the local decode 0.1s.
//
// The frame is seeked ~60% into whatever slice of the round the 16MB
// window covers (capped 45s) so it shows the round mid-argument rather
// than the connect screen; if that seek overshoots the chunk, it
// retries at the chunk's start.
//
// On success the public URL is also written back to the recording doc
// as `thumbnailUrl`, which /w/{id} (w.mjs) already prefers for
// VideoObject.thumbnailUrl and og:image — that closes the "valid
// VideoObject, not rich-result eligible" gap from the 2026-08-12
// spectator-search entry for any recording without a youtubeId.
// Docs that already carry a thumbnailUrl or a youtubeId are left
// alone: an explicit value or YouTube's own still wins.
//
// An owner can override the auto-cut with a frame they picked on
// /watch; that writes the same blob key through recordings-admin's
// `thumb` action and stamps `thumbV` on the doc. `v` in the URL is
// never read here, it only names a version to the caches: WITH one the
// image is immutable for a year, WITHOUT one it holds for ten minutes,
// so an unversioned link (a clip card, an old share) still catches up
// with a changed choice instead of serving last week's frame forever.
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

function imageResponse(bytes, versioned){
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      // A versioned URL names one exact frame and can never mean a
      // different one, so browsers and the edge keep it (the function is
      // not even invoked for repeat viewers). An unversioned one is a
      // standing request for "this recording's current frame", so it
      // gets a short life and revalidates in the background.
      'Cache-Control': versioned ? 'public, max-age=604800, immutable' : 'public, max-age=600',
      'Netlify-CDN-Cache-Control': versioned
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=600, stale-while-revalidate=86400',
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

const CHUNK_BYTES = 16 * 1024 * 1024;

function extractFrame(inPath, seekSec, outPath){
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-ss', String(seekSec),
      '-i', inPath,
      '-frames:v', '1',
      '-vf', 'scale=640:-2',
      '-q:v', '5',
      '-y', outPath,
    ];
    // Local decode of a 16MB chunk measured 0.1s; 8s is a generous
    // kill that still leaves room to answer with the soft 404 instead
    // of timing out into a 502.
    const proc = spawn(ffmpegPath, args, { signal: AbortSignal.timeout(8000) });
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
  const params = new URL(req.url).searchParams;
  const id = params.get('id') || '';
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return errorResponse('Bad id', 400, req);
  const versioned = !!params.get('v');

  const store = getStore('recording-thumbs');
  const cached = await store.get(id, { type: 'arrayBuffer' });
  if (cached && cached.byteLength) return imageResponse(cached, versioned);

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

  const inPath = path.join(os.tmpdir(), 'thumb-' + id + '.mp4');
  const out = path.join(os.tmpdir(), 'thumb-' + id + '.jpg');
  try {
    const vidResp = await fetch(link, {
      headers: { Range: 'bytes=0-' + (CHUNK_BYTES - 1) },
      signal: AbortSignal.timeout(15000),
    });
    if (!vidResp.ok) return softFail(req);
    const chunk = Buffer.from(await vidResp.arrayBuffer());
    if (!chunk.length) return softFail(req);
    await fs.writeFile(inPath, chunk);

    // Seek ~60% into the slice of the round the chunk covers, capped
    // at 45s. Content-Range carries the full size, so the covered
    // seconds are duration * (chunk / total); a short round fits in
    // the chunk entirely (206 short or plain 200) and covered =
    // duration.
    const duration = Number(d.duration) || 0;
    const range = vidResp.headers.get('content-range') || '';
    const total = Number((range.split('/')[1] || '').trim()) || chunk.length;
    const covered = total > 0 ? duration * (chunk.length / total) : 0;
    const seek = Math.max(0, Math.min(Math.round(covered * 0.6), 45));
    try {
      await extractFrame(inPath, seek, out);
    } catch (e) {
      // A seek past what the chunk actually decodes to fails; the
      // start of the chunk is always there.
      if (seek < 1) throw e;
      await extractFrame(inPath, 0, out);
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
    return imageResponse(bytes, versioned);
  } catch (e) {
    console.warn('[recording-thumb] extract failed for', id, e && e.message);
    return softFail(req);
  } finally {
    fs.unlink(out).catch(() => {});
    fs.unlink(inPath).catch(() => {});
  }
};
