// /api/room-shot — the still that lets a live strip show the room
// instead of a text card.
//
// POST (seated debater, signed in): publishes a small JPEG of the canvas
//   the room is ALREADY receiving. Nothing new leaves the device: in
//   Camera mode that canvas is the camera feed the other side sees, in
//   Avatar mode it is the mask, and in Off mode nothing is posted at all.
//   Refused unless the round is public (isPrivate !== true) and still
//   running, and unless the poster is one of the two seated UIDs.
//
// GET ?room=<id>: serves the freshest seat frame as image/jpeg.
//
// Why a 75s serve window: a still is only honest while the round it came
// from is still live and still public. Debaters re-post every ~25s, so a
// round that ends, empties, or flips to Private stops refreshing and the
// image 404s inside a minute rather than lingering on the front page.
//
// Bytes live in live_shots/{room} rather than on the round doc: the round
// doc is under a realtime listener held by every participant and watcher,
// and a 20KB field rewritten twice a minute would push that payload to
// all of them for a picture none of them need.
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { verifyIdToken } from './lib/auth.mjs';

const MAX_B64 = 90_000;        // ~65KB of JPEG. A 320x180 q0.55 frame is ~12KB.
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

  const shotRef = db.collection('live_shots').doc(room);
  const now = Date.now();
  const prev = await withDeadline(shotRef.get(), 2500);
  if (prev.exists) {
    const at = ((prev.data() || {}).seats || {})[seat]?.at || 0;
    if (now - at < MIN_GAP_MS) return jsonResponse({ ok: true, skipped: 'throttled' }, 200, request);
  }

  await shotRef.set({
    room,
    // Stamped at write time so GET never has to re-read the round doc,
    // and so a flip to Private simply stops the refresh.
    public: true,
    at: now,
    seats: { [seat]: { b64, at, name: String((seat === 'pro' ? d.proName : d.conName) || '').slice(0, 40) } },
  }, { merge: true });

  return jsonResponse({ ok: true, at: now }, 200, request);
}

async function get(request) {
  const room = new URL(request.url).searchParams.get('room') || '';
  if (!ROOM_RE.test(room)) return new Response('Bad room', { status: 400 });

  const db = getDb();
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
      // The caller versions the URL with the shot timestamp, so a long
      // cache on the bytes is safe and a new still is a new URL.
      'Cache-Control': 'public, max-age=60',
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
