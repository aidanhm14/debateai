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

const DAILY_API = 'https://api.daily.co/v1';

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
  };
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
      if (!process.env.DAILY_API_KEY) return errorResponse('Playback not configured', 503, req);
      const resp = await fetch(DAILY_API + '/recordings/' + encodeURIComponent(id) + '/access-link', {
        headers: { 'Authorization': 'Bearer ' + process.env.DAILY_API_KEY },
      });
      if (!resp.ok) return errorResponse('Playback link unavailable', 502, req);
      const data = await resp.json();
      return jsonResponse({ link: data.download_link || '', expires: data.expires || 0 }, 200, req);
    }

    return jsonResponse({ recording: publicShape(id, d) }, 200, req);
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
