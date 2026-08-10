// Clips (WS2 Phase 6). A clip is a timestamped window into a published
// recording — no transcoding, just {recordingId, start, end} that the
// player seeks and clamps to. Anyone signed in can clip; the source
// recording must be published.
//
//   POST /api/clips  (Authorization: Bearer <firebase token>)
//        { recordingId, start, end, title }        → { id }
//   GET  /api/clips?id=<clipId>                    → one clip
//   GET  /api/clips?recording=<recordingId>        → clips of a recording
//   GET  /api/clips                                → recent clips feed
//
// Limits: 3s ≤ length ≤ 10min, title ≤ 120 chars, 30 clips/user/day.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';

const MIN_LEN_SEC = 3;
const MAX_LEN_SEC = 600;
const DAILY_CAP = 30;

function shape(id, d){
  return {
    id,
    recordingId: d.recordingId,
    start: d.start,
    end: d.end,
    title: d.title || 'Clip',
    name: d.name || 'Someone',
    recordingTitle: d.recordingTitle || '',
    createdAt: d.createdAtMs || 0,
  };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  const db = getDb();

  if (req.method === 'GET'){
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const recording = url.searchParams.get('recording');

    if (id){
      const snap = await db.collection('clips').doc(id).get();
      if (!snap.exists) return errorResponse('Not found', 404, req);
      return jsonResponse({ clip: shape(id, snap.data() || {}) }, 200, req);
    }

    let q = db.collection('clips').orderBy('createdAtMs', 'desc').limit(recording ? 100 : 40);
    const snap = await q.get();
    let list = snap.docs.map(d => shape(d.id, d.data() || {}));
    if (recording) list = list.filter(c => c.recordingId === recording).slice(0, 40);
    return new Response(JSON.stringify({ clips: list }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  if (req.method !== 'POST') return errorResponse('GET or POST', 405, req);

  const bearer = extractBearerToken(req);
  if (!bearer) return errorResponse('Sign in to make clips', 401, req);
  let decoded;
  try { decoded = await verifyIdToken(bearer); }
  catch { return errorResponse('Sign in again to make clips', 401, req); }
  const uid = decoded.sub;

  let body;
  try { body = await req.json(); } catch { return errorResponse('Invalid JSON', 400, req); }
  const recordingId = String(body.recordingId || '');
  const start = Math.max(0, Math.floor(Number(body.start) || 0));
  const end = Math.floor(Number(body.end) || 0);
  const title = String(body.title || '').slice(0, 120).trim();
  if (!recordingId) return errorResponse('recordingId required', 400, req);
  const len = end - start;
  if (!(len >= MIN_LEN_SEC && len <= MAX_LEN_SEC)){
    return errorResponse('Clip must be between ' + MIN_LEN_SEC + 's and 10 minutes', 400, req);
  }

  const recSnap = await db.collection('recordings').doc(recordingId).get();
  if (!recSnap.exists || !(recSnap.data() || {}).published){
    return errorResponse('Recording not available', 404, req);
  }
  const rec = recSnap.data();
  if (rec.duration && start > rec.duration){
    return errorResponse('Clip starts past the end of the recording', 400, req);
  }

  // Cheap per-user day cap. Equality-only query (auto-indexed), the
  // 24h window filtered in code so no composite index is needed.
  const since = Date.now() - 24 * 3600 * 1000;
  const mine = await db.collection('clips')
    .where('uid', '==', uid)
    .select('createdAtMs')
    .limit(200)
    .get();
  const today = mine.docs.filter(d => ((d.data() || {}).createdAtMs || 0) > since).length;
  if (today >= DAILY_CAP) return errorResponse('Clip limit reached for today', 429, req);

  const doc = {
    recordingId,
    start,
    end,
    title: title || ('Clip from ' + (rec.title || 'a round')).slice(0, 120),
    recordingTitle: rec.title || '',
    uid,
    name: String(body.name || decoded.name || 'Someone').slice(0, 60),
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
  };
  const ref = await db.collection('clips').add(doc);
  return jsonResponse({ id: ref.id, clip: shape(ref.id, doc) }, 200, req);
};

export const config = {
  path: '/api/clips',
};
