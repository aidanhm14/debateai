// Public replay index + playback links (WS2 Phase 6).
//
//   GET /api/recordings              → published recordings, newest first
//   GET /api/recordings?id=<id>      → one published recording
//   GET /api/recordings?id=<id>&link=1
//        → { link, expires } — a short-lived Daily access link to the
//          mp4. Fetched lazily at play time because Daily links expire;
//          the client re-requests when a link goes stale.
//
// Only published recordings are ever readable here; everything else
// 404s identically so the endpoint doesn't leak what exists.

import { getDb } from './lib/firestore.mjs';
import { jsonResponse, errorResponse } from './lib/response.mjs';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';

const DAILY_API = 'https://api.daily.co/v1';

// Trim to the last sentence end inside the limit, falling back to the last
// word break, so a long RFD ends on a full thought rather than mid-word.
function trimToSentence(text, max){
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (stop > max * 0.55) return cut.slice(0, stop + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[,;:]$/, '') + '...';
}

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
  if (req.method !== 'GET') return errorResponse('GET only', 405, req);
  const db = getDb();
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
    const shape = publicShape(id, d);
    if (d.roomName){
      try {
        const rSnap = await db.collection('live_rounds').doc(String(d.roomName)).get();
        const b = rSnap.exists ? (rSnap.data() || {}).ballot : null;
        if (b && (b.winner === 'pro' || b.winner === 'con')){
          shape.ballot = {
            winner: b.winner,
            proPoints: Number.isFinite(Number(b.proPoints)) ? Number(b.proPoints) : null,
            conPoints: Number.isFinite(Number(b.conPoints)) ? Number(b.conPoints) : null,
            // Bounded: this is a reveal card, not the full ballot page.
            // Cut at a SENTENCE boundary, not at 900 exactly, or the card
            // ends mid-word. The live Taiwan round hit the cap dead on.
            rfd: trimToSentence(String(b.rfd || ''), 900),
            dimensions: b.dimensions && typeof b.dimensions === 'object' ? b.dimensions : null,
          };
        }
      } catch (e){
        // A missing or unreadable round is not a reason to fail playback.
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
