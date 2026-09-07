import { getDb } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { roomShotPublic } from './lib/room-shot-eligibility.mjs';
import { roundStillsAllowed, STILL_COUNT, STILL_GAP_MS } from './lib/round-stills.mjs';

const ROOM_RE = /^[A-Za-z0-9_-]{1,80}$/;
function jpeg(value) {
  if (typeof value !== 'string' || value.length > 350000) return null;
  const b64 = value.replace(/^data:image\/jpeg;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length < 200 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255
    || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) return null;
  return b64;
}

async function post(req) {
  let claims;
  try { claims = await verifyIdToken(extractBearerToken(req)); }
  catch { return errorResponse('Sign in required', 401, req); }
  const uid = claims.sub || claims.uid;
  if (!uid) return errorResponse('Sign in required', 401, req);
  let body;
  try { body = await req.json(); } catch { return errorResponse('Bad JSON', 400, req); }
  const room = String(body.room || '');
  const thumbnail = jpeg(body.thumbnail), clean = jpeg(body.clean);
  if (!ROOM_RE.test(room) || !thumbnail || !clean) return errorResponse('Bad screenshot', 400, req);
  const db = getDb();
  const result = await db.runTransaction(async tx => {
    const roundRef = db.collection('live_rounds').doc(room);
    const setRef = db.collection('round_still_sets').doc(room);
    const [snap, permission, previous] = await Promise.all([
      tx.get(roundRef), tx.get(db.collection('round_still_permissions').doc(room)), tx.get(setRef),
    ]);
    const d = snap.data(), now = Date.now();
    if (!d || ![d.proUid, d.conUid].includes(uid)) return { error: 'Only seated participants can save screenshots', status: 403 };
    if (!roomShotPublic(d, now) || !roundStillsAllowed(d, permission.data())) return { error: 'Screenshot permission is required from both people', status: 403 };
    if (!['starting', 'recording'].includes(d.recordingStatus)) return { error: 'Recording is not active', status: 409 };
    const old = previous.data() || {}, frames = old.frames || [];
    if (frames.length >= STILL_COUNT) return { ok: true, skipped: 'complete' };
    if (now - (old.updatedAt || 0) < STILL_GAP_MS) return { ok: true, skipped: 'throttled' };
    const id = room + '_' + frames.length;
    const meta = { id, at: now, visibleSeats: body.visibleSeats === 2 ? 2 : 1,
      phase: d.status, speechIdx: Number(d.speechIdx) || 0, motion: String(d.motion || '').slice(0, 500) };
    const uids = [d.proUid, d.conUid];
    tx.set(db.collection('round_stills').doc(id), { ...meta, room, uids, thumbnail, clean });
    tx.set(setRef, { room, uids, frames: [...frames, meta], updatedAt: now,
      createdAt: old.createdAt || now, motion: meta.motion,
      proName: String(d.proName || '').slice(0, 60), conName: String(d.conName || '').slice(0, 60),
      frontPageApproved: false });
    return { ok: true, id, at: now, count: frames.length + 1 };
  });
  return result.error ? errorResponse(result.error, result.status, req) : jsonResponse(result, 200, req);
}

async function get(req) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;
  const { db } = admin, params = new URL(req.url).searchParams;
  const room = params.get('room');
  if (!room) {
    let query = db.collection('round_still_sets').orderBy('createdAt', 'desc');
    const before = Number(params.get('before'));
    if (Number.isFinite(before) && before > 0) query = query.startAfter(before);
    const rows = await query.limit(30).get();
    return jsonResponse({ rounds: rows.docs.map(d => d.data()), next: rows.size === 30 ? rows.docs[29].data().createdAt : null }, 200, req);
  }
  if (!ROOM_RE.test(room)) return errorResponse('Bad room', 400, req);
  const [round, permission, set] = await Promise.all([
    db.collection('live_rounds').doc(room).get(), db.collection('round_still_permissions').doc(room).get(),
    db.collection('round_still_sets').doc(room).get(),
  ]);
  if (!set.exists || !roundStillsAllowed(round.data(), permission.data())) return errorResponse('Screenshots unavailable', 404, req);
  const frame = params.get('frame');
  if (frame === null) return jsonResponse(set.data(), 200, req);
  if (!/^[0-7]$/.test(frame)) return errorResponse('Bad frame', 400, req);
  const shot = await db.collection('round_stills').doc(room + '_' + frame).get();
  if (!shot.exists) return errorResponse('No screenshot', 404, req);
  return new Response(Buffer.from(shot.data()[params.get('kind') === 'clean' ? 'clean' : 'thumbnail'], 'base64'), {
    headers: { 'Content-Type': 'image/jpeg' },
  });
}

export default async req => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  let response;
  try {
    response = req.method === 'GET' ? await get(req) : req.method === 'POST' ? await post(req)
      : errorResponse('Method not allowed', 405, req);
  } catch (e) {
    console.warn('[round-stills]', e.message);
    response = errorResponse('Could not load or save screenshots', 503, req);
  }
  response.headers.set('Cache-Control', 'no-store');
  return response;
};
export const config = { path: '/api/round-stills' };
