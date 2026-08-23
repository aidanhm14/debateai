// /api/watch-live → GET. Public live rounds a visitor can watch right
// now. A round counts when a participant heartbeat (lastSeenAt) landed
// inside the last ~100s — the same liveness window /spar's watch list
// uses — its status is round/ballot, and the debaters left it Public
// (isPrivate !== true). Powers the /arena stage and the /tournaments
// watch window; the handoff URL is /live-round?room={id}&spectate=1
// (or &stage=1 for the chromeless broadcast view). A round is listed
// only once BOTH debaters are present and a speech has run — see
// roundIsWatchable below.
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
const SEAT_FRESH_MS = 100 * 1000;    // a debater counts as in the room this long

// A round is ANNOUNCED only when two people are in it and the round has
// actually begun. 2026-08-23, the founder: "its too early to announce a
// room thats actually empty."
//
// The old rule was any round doc with a fresh heartbeat and a status of
// round/ballot, and a round doc exists from the moment ONE person opens
// the page. So a debater who arrived first, alone, waiting, was
// advertised sitewide as a live round to watch, and a spectator who took
// the invitation walked into one person sitting in silence. That is the
// same class as the 411-rounds finding: a record written at intent time
// read as evidence of the thing happening.
//
// Two conditions, both off fields the round doc already carries:
//   seatSeen  per-uid presence written by each seated debater's 30s
//             heartbeat. Two fresh entries means two people are here.
//             The doc-level lastSeenAt cannot answer this, because
//             either side writes it.
//   started   a speech has actually run: the published currentTimer is
//             running, or the round is past speech one, or it has
//             reached the ballot. Prep time and two people staring at
//             each other are not yet a round worth watching.
function roundIsWatchable(d) {
  const now = Date.now();
  const seats = d.seatSeen && typeof d.seatSeen === 'object' ? d.seatSeen : null;
  let present = 0;
  if (seats) {
    for (const k of Object.keys(seats)) {
      const v = seats[k];
      // Firestore Timestamp, Date, or millis — every shape the client
      // has written over the life of this field.
      const ms = v && typeof v.toMillis === 'function' ? v.toMillis()
        : v instanceof Date ? v.getTime()
        : typeof v === 'number' ? v
        : v && typeof v._seconds === 'number' ? v._seconds * 1000
        : 0;
      if (ms && now - ms < SEAT_FRESH_MS) present++;
    }
  }
  if (present < 2) return false;
  const t = d.currentTimer || {};
  const started = t.state === 'running'
    || (typeof d.speechIdx === 'number' && d.speechIdx > 0)
    || d.status === 'ballot';
  return !!started;
}

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
      if (!roundIsWatchable(d)) return;
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
