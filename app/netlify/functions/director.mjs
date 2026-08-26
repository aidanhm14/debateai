// ── /api/director — every room in the tournament, at once ──────────
//
// The control room in /tournament runs the DAY (pair, release, take
// results, break). Nothing has ever shown the ROOMS. On a broadcast day
// that is the whole job: which round is speaking, which one is stalled,
// which one has an empty chair, and which one is worth cutting to next.
//
// WHY NOT /api/watch-live. That endpoint exists and is deliberately the
// wrong tool here. It is public, caps at 6, and only lists a round once
// BOTH debaters are present and a speech has started — it hides exactly
// what a director needs to see. A room with one person in it is not
// worth advertising to a stranger and is the single most urgent thing
// on a director's screen.
//
// ── Cost ───────────────────────────────────────────────────────────
//
// The 2026-07-28 load audit is the standing rule: a live surface must
// not read per-spectator. This one is read by ONE person, so the shape
// that would be reckless on /tournaments is fine here — but it is still
// bounded on purpose. Per poll: one round doc (pairings ride inline),
// then a single getAll over that round's rooms for live state and
// another for the stills. Two batched reads regardless of room count,
// not two per room. At a dozen rooms and a 5s poll that is roughly
// 15k reads an hour for the whole broadcast desk.
//
// Nothing here writes. A director watching cannot change a round.

import { requireAdmin } from './lib/admin-auth.mjs';
import { withDeadline } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';

// A seat counts as present this long after its last heartbeat. Matches
// SEAT_FRESH_MS in watch-live so the two surfaces never disagree about
// who is in a room.
const SEAT_FRESH_MS = 100 * 1000;
const SHOT_FRESH_MS = 75 * 1000;
// How long a released room may sit with nobody speaking before it is
// called stalled. A round opens, both sides say hello, one takes prep:
// three minutes of that is normal, and past it somebody wants finding.
const STALL_MS = 3 * 60 * 1000;

function ms(v) {
  return v && typeof v.toMillis === 'function' ? v.toMillis()
    : v instanceof Date ? v.getTime()
    : typeof v === 'number' ? v
    : v && typeof v._seconds === 'number' ? v._seconds * 1000
    : v && typeof v.seconds === 'number' ? v.seconds * 1000
    : 0;
}

// Who is actually in the room right now, by uid. Same rule as
// watch-live: a heartbeat inside the window, and no departure mark
// newer than it.
function presentUids(d) {
  const seen = d.seatSeen && typeof d.seatSeen === 'object' ? d.seatSeen : {};
  const gone = d.seatLeft && typeof d.seatLeft === 'object' ? d.seatLeft : {};
  const now = Date.now();
  const out = [];
  for (const uid of Object.keys(seen)) {
    const at = ms(seen[uid]);
    if (!at || now - at >= SEAT_FRESH_MS) continue;
    const left = ms(gone[uid]);
    if (left && left >= at) continue;
    out.push(uid);
  }
  return out;
}

// The one word the director's eye lands on. Ordered by urgency rather
// than by lifecycle, because this string decides what they look at
// next: a stalled room and an empty chair are the two that need a
// human, so they outrank the ordinary running states.
//
// `complete` is read from the PAIRING, not the room, because a result
// is the tournament's fact about a round and the round doc is written
// by a participant's browser.
function roomState(pairing, live) {
  if (pairing.status === 'complete') return 'complete';
  if (!live) return 'unopened';

  const present = presentUids(live).length;
  const timer = live.currentTimer || {};
  const speaking = timer.state === 'running';
  const judging = live.status === 'ballot' || !!live.ballot;

  if (judging) return 'judging';
  if (speaking) return 'speaking';
  if (present === 0) return 'empty';
  if (present < 2) return 'one-seat';

  // Both here, nobody speaking. Fine for a few minutes (greetings,
  // prep, a resolution being agreed), a problem after that.
  //
  // Measured against production before trusting it: the first version
  // of this timed the stall from `openedAt`, WHICH DOES NOT EXIST on
  // live_rounds — 60 sampled docs, zero occurrences — and fell through
  // to `lastSeenAt`. That would have been worse than useless: lastSeenAt
  // is rewritten by the 30-second heartbeat, so on a room that IS being
  // sat in it is always a few seconds old and `stalled` could never
  // fire. The age of a room is `createdAt`, which every sampled doc had.
  const born = ms(live.createdAt) || ms(live.roundStartedAt);
  const started = (typeof live.speechIdx === 'number' && live.speechIdx > 0)
    || !!timer.updatedAtMs;
  if (!started && born && Date.now() - born > STALL_MS) return 'stalled';
  return 'between';
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const db = gate.db;

  const url = new URL(request.url);
  const tKey = String(url.searchParams.get('t') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!tKey) return errorResponse('Missing tournament', 400, request);

  // Slug or id, same resolution every other tournament endpoint uses.
  let tDoc = await db.collection('tournaments').doc(tKey).get();
  if (!tDoc.exists) {
    const bySlug = await db.collection('tournaments').where('slug', '==', tKey).limit(1).get();
    if (bySlug.empty) return errorResponse('Tournament not found', 404, request);
    tDoc = bySlug.docs[0];
  }
  const t = tDoc.data() || {};

  // Which draw is on the floor. An explicit ?round= lets the director
  // look back at a finished round while the next one runs.
  const askedKey = String(url.searchParams.get('round') || '').replace(/[^a-z0-9]/g, '').slice(0, 8);
  const liveKey = askedKey
    || ((t.currentKind === 'elim' ? 'e' : 'r') + (Number(t.currentRound) || 1));

  const roundSnap = await db.collection('tournaments').doc(tDoc.id)
    .collection('rounds').doc(liveKey).get();
  if (!roundSnap.exists) {
    return jsonResponse({
      ok: true, tournament: { name: t.name || '', status: t.status || '', dropIn: t.dropIn !== false },
      round: null, rooms: [], at: Date.now(),
    }, 200, request);
  }
  const round = roundSnap.data() || {};
  const pairings = Array.isArray(round.pairings) ? round.pairings : [];

  // Two batched reads for the whole board. getAll refuses an empty
  // list, so a paired-but-roomless draw short-circuits.
  const rooms = pairings.map((p) => String(p.room || '')).filter(Boolean);
  const liveById = new Map();
  const shotById = new Map();
  if (rooms.length) {
    try {
      const docs = await withDeadline(
        db.getAll(...rooms.map((r) => db.collection('live_rounds').doc(r))), 3000);
      docs.forEach((doc) => { if (doc.exists) liveById.set(doc.id, doc.data() || {}); });
    } catch (err) {
      console.warn('[director] live_rounds getAll failed', err && err.message);
    }
    try {
      const shots = await withDeadline(
        db.getAll(...rooms.map((r) => db.collection('live_shots').doc(r))), 2000);
      shots.forEach((doc) => {
        if (!doc.exists) return;
        const s = doc.data() || {};
        const at = Number(s.at || 0);
        if (Date.now() - at < SHOT_FRESH_MS) shotById.set(doc.id, at);
      });
    } catch (err) {
      // A still is decoration. Never let it cost the board.
      console.warn('[director] shots failed', err && err.message);
    }
  }

  const out = pairings.map((p, i) => {
    const room = String(p.room || '');
    const live = room ? liveById.get(room) : null;
    const timer = (live && live.currentTimer) || {};
    return {
      index: i + 1,
      pairingId: p.pairingId || '',
      room,
      bracket: p.bracket || '',
      gov: { entry: p.govEntry || '', name: p.govName || '' },
      opp: { entry: p.oppEntry || '', name: p.oppName || '' },
      result: p.status === 'complete' ? { winner: p.winner || '' } : null,
      state: roomState(p, live),
      present: live ? presentUids(live).length : 0,
      // Enough for the tile to run its own clock between polls rather
      // than showing a number that only moves every five seconds.
      speechIdx: live && typeof live.speechIdx === 'number' ? live.speechIdx : 0,
      timer: timer.updatedAtMs ? {
        state: timer.state || '',
        speechIdx: typeof timer.speechIdx === 'number' ? timer.speechIdx : 0,
        startMs: Number(timer.startMs || 0),
        accumulatedMs: Number(timer.accumulatedMs || 0),
        totalSec: Number(timer.totalSec || 0),
        updatedAtMs: Number(timer.updatedAtMs || 0),
      } : null,
      watching: live && typeof live.watchCount === 'number' ? live.watchCount : 0,
      recording: live ? String(live.recordingStatus || 'idle') : 'idle',
      shot: shotById.get(room) || 0,
    };
  });

  return jsonResponse({
    ok: true,
    tournament: {
      tid: tDoc.id,
      name: t.name || '',
      status: t.status || '',
      dropIn: t.dropIn !== false,
      currentRound: Number(t.currentRound) || 0,
      prelimRounds: Number(t.prelimRounds) || 0,
    },
    round: {
      key: liveKey,
      label: round.label || '',
      motion: round.motion || '',
      released: round.status === 'released',
      complete: out.filter((r) => r.state === 'complete').length,
      total: out.length,
    },
    rooms: out,
    // The clock the client rebases every tile's timer against, because
    // client clocks have been measured 22 seconds apart on this site
    // and a broadcast clock that disagrees with the room is worse than
    // no clock.
    serverNow: Date.now(),
    at: Date.now(),
  }, 200, request);
};

export const config = { path: '/api/director' };
