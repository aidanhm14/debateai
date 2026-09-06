// /api/room-shot — the still that lets a live strip show the room
// instead of a text card.
//
// POST (seated debater, signed in): publishes a small JPEG composed from
// the two assigned, published room tiles, names and current motion. The
// local Avatar tile is the mask, never the hidden camera. Public, live
// rounds only; both assigned participants must have fresh presence.
//
// GET ?room=<id>: serves the freshest composite, at most 75s old. Current
// privacy, status, motion draft and both seats are rechecked before bytes
// leave the server. Responses are not cached, so an old image URL cannot
// serve a room that has since become private or empty.
//
// Bytes live in live_shots/{room} rather than on the round doc: the round
// doc is under a realtime listener held by every participant and watcher,
// and a 20KB field rewritten twice a minute would push that payload to
// all of them for a picture none of them need.
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { verifyIdToken } from './lib/auth.mjs';
import { roomShotPublic } from './lib/room-shot-eligibility.mjs';

const MAX_B64 = 90_000;        // ~65KB of JPEG; client composes a 640x360 preview.
const MIN_GAP_MS = 12_000;     // per-seat write throttle
const SERVE_TTL_MS = 75_000;   // older than this is not "live" any more
const ROOM_RE = /^[A-Za-z0-9_-]{1,80}$/;
const B64_RE = /^[A-Za-z0-9+/=]+$/;

function stripDataUrl(s) {
  const i = s.indexOf('base64,');
  return i >= 0 ? s.slice(i + 7) : s;
}

async function post(request) {
  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Bad JSON', 400, request); }

  const room = String(body.room || '');
  if (!ROOM_RE.test(room)) return errorResponse('Bad room', 400, request);

  const b64 = stripDataUrl(String(body.image || '')).trim();
  if (!b64 || b64.length > MAX_B64 || !B64_RE.test(b64)) {
    return errorResponse('Bad image', 400, request);
  }

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  let uid;
  try {
    const claims = await verifyIdToken(token);
    uid = claims.user_id || claims.sub || claims.uid;
  } catch { return errorResponse('Sign in required', 401, request); }
  if (!uid) return errorResponse('Sign in required', 401, request);

  const db = getDb();
  const roundRef = db.collection('live_rounds').doc(room);
  const snap = await withDeadline(roundRef.get(), 2500);
  if (!snap.exists) return errorResponse('No such round', 404, request);
  const d = snap.data() || {};

  if (d.isPrivate === true) return errorResponse('Private round', 403, request);
  if (d.status !== 'round' && d.status !== 'ballot') return errorResponse('Round is not live', 409, request);

  // Only the two seated UIDs. Rounds that never locked a seat (legacy
  // direct-link flows) publish nothing: with no identified participants
  // there is nobody who can be said to have agreed to be on the page.
  const seat = d.proUid === uid ? 'pro' : (d.conUid === uid ? 'con' : '');
  if (!seat) return errorResponse('Not a debater in this round', 403, request);
  if (!roomShotPublic(d)) return errorResponse('Both debaters must be present', 409, request);

  const shotRef = db.collection('live_shots').doc(room);
  const now = Date.now();
  const prev = await withDeadline(shotRef.get(), 2500);
  if (prev.exists) {
    const at = ((prev.data() || {}).seats || {})[seat]?.at || 0;
    if (now - at < MIN_GAP_MS) return jsonResponse({ ok: true, skipped: 'throttled' }, 200, request);
  }

  await shotRef.set({
    room,
    // GET rechecks current privacy and presence before returning bytes.
    public: true,
    at: now,
    seats: { [seat]: { b64, at: now, name: String((seat === 'pro' ? d.proName : d.conName) || '').slice(0, 40) } },
  }, { merge: true });

  return jsonResponse({ ok: true, at: now }, 200, request);
}

async function get(request) {
  const room = new URL(request.url).searchParams.get('room') || '';
  if (!ROOM_RE.test(room)) return new Response('Bad room', { status: 400 });

  const db = getDb();
  const round = await withDeadline(db.collection('live_rounds').doc(room).get(), 2500);
  if (!round.exists || !roomShotPublic(round.data())) return new Response('No public live room', { status: 404 });
  const snap = await withDeadline(db.collection('live_shots').doc(room).get(), 2500);
  if (!snap.exists) return new Response('No still', { status: 404 });
  const d = snap.data() || {};
  if (d.public !== true) return new Response('No still', { status: 404 });

  const seats = d.seats || {};
  const fresh = Object.keys(seats)
    .map((k) => seats[k])
    .filter((s) => s && s.b64 && (Date.now() - (s.at || 0)) < SERVE_TTL_MS)
    .sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  if (!fresh) return new Response('No still', { status: 404 });

  const bytes = Buffer.from(fresh.b64, 'base64');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      // A timestamp alone cannot prove the room is still public.
      'Cache-Control': 'no-store',
    },
  });
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  try {
    if (request.method === 'GET') return await get(request);
    if (request.method === 'POST') return await post(request);
  } catch (err) {
    console.warn('[room-shot]', err && err.message);
    if (request.method === 'GET') return new Response('No still', { status: 404 });
    return errorResponse('Could not store the still', 500, request);
  }
  return errorResponse('Method not allowed', 405, request);
};

export const config = { path: '/api/room-shot' };
