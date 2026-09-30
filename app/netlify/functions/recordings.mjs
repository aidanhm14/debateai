// Public replay index + playback links (WS2 Phase 6).
//
//   GET /api/recordings              → published recordings, newest first
//   GET /api/recordings?id=<id>      → one published recording
//   GET /api/recordings?id=<id>&link=1
//        → { link, expires } — a short-lived Daily access link to the
//          mp4. Fetched lazily at play time because Daily links expire;
//          the client re-requests when a link goes stale.
//   POST /api/recordings { action: 'view', id }
//        → records one playback session after the media actually starts.
//
// Only published recordings are ever readable here; everything else
// 404s identically so the endpoint doesn't leak what exists.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { publicHighlights } from './lib/highlights.mjs';
import { publicRecordingOverview } from './lib/recording-overview.mjs';

const DAILY_API = 'https://api.daily.co/v1';
const RECORDING_ID = /^[a-z0-9][a-z0-9-]{7,79}$/i;

function publicShape(id, d){
  return {
    id,
    title: d.title || 'Round',
    roomName: d.roomName || '',
    startTs: d.startTs || 0,
    duration: d.duration || 0,
    motion: d.motion || '',
    format: d.format || '',
    proName: d.proName || '',
    conName: d.conName || '',
    isStream: !!d.isStream,
    // Names the frame the card should ask for. The served image is
    // cached immutable at the edge, so a thumbnail an owner changed on
    // /watch only reaches a card that carries the version with it.
    thumbV: Number(d.thumbV) || 0,
    // A teaser stays on the grid as a watermarked "Dropping soon" card:
    // thumbnail visible, playback refused below. It is how a redundant
    // round comes down without emptying the feed.
    teaser: d.teaser === true,
    viewCount: Math.max(0, Number(d.viewCount) || 0),
    // AI-cut key moments (recording-highlights.mjs). Whitelisted through
    // publicHighlights so a stray doc field never rides a public card.
    highlights: publicHighlights(d.highlights),
    // Video second the first speech starts. /watch opens full replays
    // here when the setup runs long; 0 means unknown, play from the top.
    firstWordSec: Math.max(0, Math.round(Number(d.firstWordSec) || 0)),
  };
}

// Playback requires a NAMED sign-in (2026-08-23, same conversion push as
// the /spar gate). An anonymous Firebase uid is "has a browser", not an
// account, so it does not pass. The metadata reads above stay open: the
// grid, titles and thumbnails are the pitch, the video is the product.
async function namedCaller(req){
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    const decoded = await verifyIdToken(token);
    return isNamedAccount(decoded) ? decoded : null;
  } catch { return null; }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  const db = getDb();

  if (req.method === 'POST'){
    let body;
    try { body = await req.json(); }
    catch { return errorResponse('Invalid JSON', 400, req); }

    const id = String(body && body.id || '');
    if (!body || body.action !== 'view' || !RECORDING_ID.test(id)){
      return errorResponse('Invalid view', 400, req);
    }
    // 2026-09-07: keyless counter, so it is metered per IP. A view count
    // that one script can inflate is a public number that means nothing.
    const gate = await checkLayers('recview', 'ip_' + callerIp(req), [
      { window: 60_000, max: 20, label: 'min' },
      { window: 3_600_000, max: 200, label: 'hour' },
    ]);
    if (!gate.ok) return errorResponse('Too many requests', 429, req);

    const ref = db.collection('recordings').doc(id);
    const snap = await ref.get();
    const d = snap.exists ? (snap.data() || {}) : {};
    if (!snap.exists || d.published !== true || d.teaser === true){
      return errorResponse('Not found', 404, req);
    }
    const viewCount = Math.max(0, Number(d.viewCount) || 0) + 1;
    await ref.update({ viewCount: FieldValue.increment(1) });
    return jsonResponse({ ok: true, viewCount }, 200, req);
  }

  if (req.method !== 'GET') return errorResponse('GET or POST only', 405, req);
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (id){
    const snap = await db.collection('recordings').doc(id).get();
    if (!snap.exists || !(snap.data() || {}).published){
      return errorResponse('Not found', 404, req);
    }
    const d = snap.data();

    if (url.searchParams.get('link')){
      // A teaser has no video to hand out yet. 404 rather than 403: there
      // is nothing being withheld from this caller that another caller
      // could get, so an auth error would send them to sign in for a file
      // that does not exist.
      if (d.teaser === true) return errorResponse('Not published yet', 404, req);
      // The gate. 401 SIGN_IN_REQUIRED, matching the brain endpoint's
      // wall, because waiting does not clear it: the client should open
      // the auth modal rather than render "try again later".
      if (!(await namedCaller(req))){
        return errorResponse('SIGN_IN_REQUIRED', 401, req);
      }
      // Prefer a rehosted transcode. The Daily original is encoded with no
      // bitrate cap, so a viewer whose connection sits under it buffers
      // forever with no error to show. A stored copy is capped and stable,
      // so it carries no expiry.
      if (typeof d.mp4Url === 'string' && d.mp4Url) {
        return jsonResponse({ link: d.mp4Url, expires: 0 }, 200, req);
      }
      if (!process.env.DAILY_API_KEY) return errorResponse('Playback not configured', 503, req);
      const resp = await fetch(DAILY_API + '/recordings/' + encodeURIComponent(id) + '/access-link', {
        headers: { 'Authorization': 'Bearer ' + process.env.DAILY_API_KEY },
      });
      if (!resp.ok) return errorResponse('Playback link unavailable', 502, req);
      const data = await resp.json();
      return jsonResponse({ link: data.download_link || '', expires: data.expires || 0 }, 200, req);
    }

    // The ballot rides along on a SINGLE recording read only. The recording
    // doc does not hold it, but it carries roomName, and the round doc does.
    // Deliberately not attached to the list response: that would be one
    // extra Firestore read per card for a verdict nobody has opened yet.
    const shape = { ...publicShape(id, d), overviewStatus: 'unavailable' };
    if (d.roomName){
      try {
        const rSnap = await db.collection('live_rounds').doc(String(d.roomName)).get();
        Object.assign(shape, publicRecordingOverview(rSnap.exists ? rSnap.data() || {} : {}));
      } catch (e){
        // Reading a decision is independent of fetching or playing the video.
        shape.overviewStatus = 'error';
        console.warn('[recordings] ballot join failed', e && e.message);
      }
    }
    return jsonResponse({ recording: shape }, 200, req);
  }

  // Single-field orderBy + in-code publish filter so no composite
  // index is required (published+startTs would need one).
  const snap = await db.collection('recordings')
    .orderBy('startTs', 'desc')
    .limit(150)
    .get();
  const list = snap.docs
    .filter(d => (d.data() || {}).published === true)
    .slice(0, 60)
    .map(d => publicShape(d.id, d.data() || {}));
  return new Response(JSON.stringify({ recordings: list }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

export const config = {
  path: '/api/recordings',
};
