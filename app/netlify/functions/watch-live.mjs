// /api/watch-live → GET. Public live rounds a visitor can watch right
// now. A round counts when a participant heartbeat (lastSeenAt) landed
// inside the last ~100s — the same liveness window /spar's watch list
// uses — its status is round/ballot, and the debaters left it Public
// (isPrivate !== true). Powers the /arena stage and the /tournaments
// watch window; the handoff URL is /live-round?room={id}&spectate=1
// (or &stage=1 for the chromeless broadcast view).
//
// Honesty: no floor, no padding. Empty list = nothing live. Cached 12s
// shared so the discovery pages together don't hammer Firestore.
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, setCached } from './lib/admin-cache.mjs';

const CACHE_KEY = 'watch-live';
const CACHE_TTL_MS = 12 * 1000;
const LIVE_WINDOW_MS = 100 * 1000;   // match spar.html roomIsLiveNow()
const SCAN_LIMIT = 40;               // heartbeat-fresh docs to inspect
const MAX_ROUNDS = 6;
const SHOT_FRESH_MS = 75 * 1000;     // match room-shot's serve window

// Rooms where a debater has a camera on publish a still every ~25s
// (/api/room-shot). Callers get only the timestamp; it versions the
// image URL so a card can show the room rather than a text tile. One
// batched read for the whole list, and only for rounds already cleared
// as public — a round with no fresh still just has no `shot` field.
async function attachShots(db, rounds) {
  if (!rounds.length) return;
  try {
    const refs = rounds.map((r) => db.collection('live_shots').doc(r.room));
    const docs = await withDeadline(db.getAll(...refs), 2000);
    docs.forEach((doc, i) => {
      if (!doc.exists) return;
      const s = doc.data() || {};
      if (s.public !== true) return;
      const at = Number(s.at || 0);
      if (Date.now() - at < SHOT_FRESH_MS) rounds[i].shot = at;
    });
  } catch (err) {
    // A still is decoration. Never let it cost the list.
    console.warn('[watch-live] shots failed', err && err.message);
  }
}

function payload(rounds, error) {
  const out = { count: rounds.length, rounds, at: Date.now() };
  if (error) out.error = String(error).slice(0, 200);
  return out;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const cached = await getCachedShared(CACHE_KEY);
  if (cached) return jsonResponse(cached, 200, request);

  let db;
  try { db = getDb(); }
  catch (err) { return jsonResponse(payload([], 'getDb: ' + err.message), 200, request); }

  try {
    // Single-field range on lastSeenAt → auto-indexed, no composite
    // console index needed. Status + privacy filter in memory over a
    // small recency window.
    const snap = await withDeadline(db.collection('live_rounds')
      .where('lastSeenAt', '>', new Date(Date.now() - LIVE_WINDOW_MS))
      .orderBy('lastSeenAt', 'desc')
      .limit(SCAN_LIMIT)
      .get(), 2500);

    const rounds = [];
    snap.forEach((doc) => {
      if (rounds.length >= MAX_ROUNDS) return;
      const d = doc.data() || {};
      if (d.status !== 'round' && d.status !== 'ballot') return;
      if (d.isPrivate === true) return;
      rounds.push({
        room: doc.id,
        motion: String(d.motion || 'Live debate').slice(0, 160),
        format: String(d.format || 'quick').slice(0, 24),
        status: d.status,
        proName: String(d.proName || '').slice(0, 40),
        conName: String(d.conName || '').slice(0, 40),
        speechIdx: typeof d.speechIdx === 'number' ? d.speechIdx : 0,
      });
    });

    await attachShots(db, rounds);

    const out = payload(rounds);
    await setCachedShared(CACHE_KEY, out, CACHE_TTL_MS);
    return jsonResponse(out, 200, request);
  } catch (err) {
    console.warn('[watch-live] query failed', err && err.message);
    const out = payload([], err && err.message);
    // Negative-cache 30s so pollers don't re-pay the failed read.
    setCached(CACHE_KEY, out, 30_000);
    return jsonResponse(out, 200, request);
  }
};

export const config = { path: '/api/watch-live' };
