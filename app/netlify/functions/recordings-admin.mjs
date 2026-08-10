// Recording pipeline, admin side (WS2 Phase 6). Daily cloud recordings
// land in Daily's storage; this endpoint pulls their index into the
// Firestore `recordings` collection, enriches each entry with round
// metadata from live_rounds/{roomName}, and manages publish state.
//
//   GET  /api/admin/recordings            → full list, newest first
//   POST /api/admin/recordings { action: 'sync' }
//        → pull Daily's recording list, upsert Firestore docs.
//          Finished recordings ≥ 45s auto-publish (tournament norm:
//          every round is recorded and published; unpublish is the
//          exception, not the default).
//   POST /api/admin/recordings { action: 'publish', id, published }
//        → toggle a recording's public visibility.
//   POST /api/admin/recordings { action: 'meta', id, title }
//        → set a display title (overrides the derived one).
//
// Doc shape (recordings/{dailyId}):
//   { roomName, startTs, duration, status, published, title,
//     motion, format, proName, conName, isStream, syncedAt }

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';

const DAILY_API = 'https://api.daily.co/v1';
const AUTO_PUBLISH_MIN_SEC = 45;

function dailyHeaders(){
  return { 'Authorization': 'Bearer ' + process.env.DAILY_API_KEY };
}

// Pull round metadata for a recording's room so the public card can say
// what the round was about, not just show a room slug.
async function roundMeta(db, roomName){
  try {
    const snap = await db.collection('live_rounds').doc(roomName).get();
    if (!snap.exists) return {};
    const d = snap.data() || {};
    return {
      motion: d.motion || '',
      format: d.formatKey || d.format || '',
      proName: d.proName || (d.teamNames && d.teamNames.og) || '',
      conName: d.conName || (d.teamNames && d.teamNames.oo) || '',
    };
  } catch {
    return {};
  }
}

async function syncFromDaily(db){
  const resp = await fetch(DAILY_API + '/recordings?limit=100', { headers: dailyHeaders() });
  if (!resp.ok){
    let detail = '';
    try { detail = await resp.text(); } catch {}
    throw new Error('Daily recordings list failed: ' + resp.status + ' ' + detail.slice(0, 300));
  }
  const data = await resp.json();
  const items = Array.isArray(data.data) ? data.data : [];
  let created = 0, updated = 0;
  for (const rec of items){
    if (!rec.id) continue;
    const ref = db.collection('recordings').doc(rec.id);
    const existing = await ref.get();
    const isStream = /^debatable-live-/.test(rec.room_name || '');
    const base = {
      roomName: rec.room_name || '',
      startTs: rec.start_ts || 0,          // unix seconds
      duration: rec.duration || 0,         // seconds
      status: rec.status || 'unknown',
      isStream,
      syncedAt: FieldValue.serverTimestamp(),
    };
    if (existing.exists){
      await ref.set(base, { merge: true });
      updated++;
      continue;
    }
    const meta = isStream ? {} : await roundMeta(db, rec.room_name || '');
    let title = '';
    if (isStream){
      // Recover the stream title from the site_stream history if this
      // was the most recent stream; otherwise a generic label.
      title = 'Tournament stream';
      try {
        const s = await db.collection('site_stream').doc('current').get();
        if (s.exists && (s.data() || {}).roomName === rec.room_name) title = (s.data() || {}).title || title;
      } catch {}
    } else if (meta.motion){
      title = meta.motion;
    } else {
      title = 'Round · ' + (rec.room_name || rec.id).slice(0, 40);
    }
    const finished = (rec.status === 'finished') && (rec.duration || 0) >= AUTO_PUBLISH_MIN_SEC;
    await ref.set({
      ...base,
      ...meta,
      title,
      published: finished,
      publishedAuto: finished,
      createdAt: FieldValue.serverTimestamp(),
    });
    created++;
  }
  return { total: items.length, created, updated };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
  const { db } = gate;

  if (req.method === 'GET'){
    const snap = await db.collection('recordings').orderBy('startTs', 'desc').limit(100).get();
    const list = snap.docs.map(d => ({ id: d.id, ...d.data(), syncedAt: undefined, createdAt: undefined }));
    return jsonResponse({ recordings: list }, 200, req);
  }

  if (req.method !== 'POST') return errorResponse('GET or POST', 405, req);
  if (!process.env.DAILY_API_KEY) return errorResponse('DAILY_API_KEY not configured', 503, req);

  let body;
  try { body = await req.json(); } catch { return errorResponse('Invalid JSON', 400, req); }

  if (body.action === 'sync'){
    try {
      const result = await syncFromDaily(db);
      return jsonResponse(result, 200, req);
    } catch (e) {
      return errorResponse(e.message, 502, req);
    }
  }

  if (body.action === 'publish'){
    const id = String(body.id || '');
    if (!id) return errorResponse('id required', 400, req);
    await db.collection('recordings').doc(id).set({
      published: body.published !== false,
      publishedAuto: false,
    }, { merge: true });
    return jsonResponse({ id, published: body.published !== false }, 200, req);
  }

  if (body.action === 'meta'){
    const id = String(body.id || '');
    if (!id) return errorResponse('id required', 400, req);
    await db.collection('recordings').doc(id).set({
      title: String(body.title || '').slice(0, 200),
    }, { merge: true });
    return jsonResponse({ id }, 200, req);
  }

  return errorResponse('Unknown action (sync | publish | meta)', 400, req);
};

export const config = {
  path: '/api/admin/recordings',
};
