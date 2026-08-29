// /api/watch-live → GET. Public live rounds a visitor can watch right
// now. A round counts when a participant heartbeat (lastSeenAt) landed
// inside the last ~100s — the same liveness window /spar's watch list
// uses — its status is round/ballot, and the debaters left it Public
// (isPrivate !== true). Powers the /arena stage and the /tournaments
// watch window; the handoff URL is /live-round?room={id}&spectate=1
// (or &stage=1 for the chromeless broadcast view). A round is listed
// only once BOTH debaters are present and the motion draft is settled —
// see roundIsWatchable below.
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

// A round is ANNOUNCED only when two people are actually in it. 2026-08-23,
// the founder: "its too early to announce a room thats actually empty."
//
// The rule that shipped that day had a second clause — a speech must have
// run — and that clause is REMOVED as of 2026-08-27, on the founder's call
// after a real round went unadvertised. Measured over the 300 most recent
// live_rounds: 122 had both seats present, and only 37 ever got past
// speech 0. So the speech clause was hiding roughly 85 rooms that had two
// real people, two live cameras, and nobody watching, while /spar's own
// list (looser rule, same collection) advertised them the whole time. A
// gate that answers "no" seven times out of eight is not protecting a
// spectator from an empty room, it is a dark discovery surface.
//
// What survives is the part that was actually about emptiness:
//   seatSeen  per-uid presence written by each seated debater's 30s
//             heartbeat. Two fresh entries means two people are here.
//             The doc-level lastSeenAt cannot answer this, because
//             either side writes it.
//   seatLeft  per-uid departure mark, written the moment a debater
//             actually walks out. Without it a walkout took the full
//             SEAT_FRESH_MS to age off, so someone who left their own
//             round still saw it advertised on the strip for a minute
//             and a half. The mark is only believed while it is NEWER
//             than that seat's own heartbeat, which makes it
//             self-healing: a debater who comes back, or one whose
//             opponent wrote the mark for them, clears it on their very
//             next beat. Absence of a mark proves nothing, so the
//             staleness rule above still carries a tab that just died.
//   draft     the motion draft runs inside the room, and while it is
//             open the two of them are still striking motions and have
//             not been told which side they are on. A spectator who
//             walks in then is watching a negotiation, and the motion on
//             the card is not the motion they will argue. Settled means
//             phase 'done', a draftResolvedAt stamp, or no draft at all.
//
// `started` is REPORTED, never gated on: the callers label the card off
// it ("Speech 2" vs "Getting started") so a room in prep is discoverable
// without anything on screen claiming a speech is under way.

// Firestore Timestamp, Date, or millis — every shape the client has
// written over the life of these fields.
function ms(v) {
  return v && typeof v.toMillis === 'function' ? v.toMillis()
    : v instanceof Date ? v.getTime()
    : typeof v === 'number' ? v
    : v && typeof v._seconds === 'number' ? v._seconds * 1000
    : v && typeof v.seconds === 'number' ? v.seconds * 1000
    : 0;
}

// A speech has actually run: the published currentTimer is running, or
// the round is past speech one, or it has reached the ballot.
function roundHasStarted(d) {
  const t = d.currentTimer || {};
  return t.state === 'running'
    || (typeof d.speechIdx === 'number' && d.speechIdx > 0)
    || d.status === 'ballot';
}

function draftSettled(d) {
  if (d.draftResolvedAt) return true;
  const draft = d.draft;
  if (!draft || typeof draft !== 'object') return true;   // never drafted
  return draft.phase === 'done';
}

function roundIsWatchable(d) {
  const now = Date.now();
  const seats = d.seatSeen && typeof d.seatSeen === 'object' ? d.seatSeen : null;
  const gone = d.seatLeft && typeof d.seatLeft === 'object' ? d.seatLeft : {};
  let present = 0;
  if (seats) {
    for (const k of Object.keys(seats)) {
      const seen = ms(seats[k]);
      if (!seen || now - seen >= SEAT_FRESH_MS) continue;
      const left = ms(gone[k]);
      if (left && left >= seen) continue;   // walked out since their last beat
      present++;
    }
  }
  if (present < 2) return false;
  return draftSettled(d);
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
        started: roundHasStarted(d),
        // Seated clients maintain this bounded aggregate on the round doc.
        // Exposing it here adds no watcher-collection fanout and keeps the
        // public wall honest about the audience actually in each room.
        watchCount: Math.max(0, Number(d.watchCount) || 0),
        watchCountCapped: d.watchCountCapped === true,
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
