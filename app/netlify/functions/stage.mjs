// ─────────────────────────────────────────────────────────────────────
// /api/stage — a viewer asks to join the live broadcast and argue on it.
//
// The stream room is created by stream-control.mjs with
// owner_only_broadcast, so a tokenless viewer is a hidden participant
// who physically cannot publish. This endpoint is the only door out of
// that state, and every step of the door is server-side:
//
//   request  (viewer)  raise a hand. Writes a RECORD, never a seat.
//   poll     (viewer)  my own status plus the server clock.
//   withdraw (viewer)  take the hand down.
//   claim    (seated)  mint the send token, once seated by the host.
//   turn     (seated)  append what this person's own microphone heard.
//
//   queue / admit / remove / sit / open / next / end / reset  (host)
//
// THE LOAD-BEARING PROPERTIES
//
// 1. A hand raise cannot seat anybody. The host admits, and the token is
//    minted against the verified uid of the person who asked, at claim
//    time, so no live credential is ever stored at rest and a leaked
//    queue row buys nothing.
// 2. A seated guest's SIDE and NAME come from the seat map keyed on
//    their verified uid, never from the request body. The text of a turn
//    necessarily comes from a participant's microphone; the attribution
//    on it does not.
// 3. An accountable sign-in (Google, phone, or Apple, the same set every
//    other live-video door takes) AND an adult age band. The age half is
//    the stricter one and it is deliberate: this is a public broadcast
//    that is recorded and restreamed off the site, which is a different
//    exposure from a private room with one stranger in it.
// 4. Stage rounds are NOT ranked and settle nothing. They produce a real
//    published ballot and an audit row and stop there. Wiring a
//    host-curated guest slot into the rating ladder would let whoever
//    runs the stream hand out rating changes.
//
// State lives in stream_stage/{roomName}, which has no firestore.rules
// entry, so the default deny makes it admin-SDK only. Clients read it
// through /api/stream-status (the public projection) and this endpoint.
// ─────────────────────────────────────────────────────────────────────

import { verifyIdToken, extractBearerToken, isAdminEmail, isOwnerEmail } from './lib/auth.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { getDb, FieldValue, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';
import {
  MAX_MOTION,
  STRUCTURED_SEQUENCE,
  buildRequest,
  buildTurn,
  cleanText,
  clockFor,
  emptyBoard,
  floorHolders,
  isStale,
  normalizeCasualMs,
  normalizeMode,
  normalizeSide,
  publicBoard,
  queueView,
  seatFor,
  seatOf,
  advanceStructured,
} from './lib/stage.mjs';

const DAILY_API = 'https://api.daily.co/v1';
const GUEST_TOKEN_TTL_SEC = 3 * 3600;

// The same accountable-identity set every other live-video door takes
// (AGENTS.md pins it in seven places). A stage seat is stricter than
// /spar in ONE way and it is age, not provider: this is a public
// broadcast that is recorded and restreamed off the site, so the adult
// band below is required on top. Narrowing the provider set here would
// just make the site disagree with itself.
const LIVE_VIDEO_PROVIDERS = new Set(['google.com', 'phone', 'apple.com']);
const HOST_ACTIONS = new Set(['queue', 'admit', 'remove', 'sit', 'open', 'end', 'reset']);
// `next` is host-OR-floor-holder. A debater who has finished early should
// not have to wait for the host to notice, and they can only ever advance
// past their own turn: the seat check below reads the board's current
// step, so nobody can skip somebody else's speech.
const SHARED_ACTIONS = new Set(['next']);

function safeRoomName(s) {
  return String(s || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
}

async function sha16(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

// Same salted-IP derivation as create-daily-room / audience-cam, so a
// strike earned anywhere in the video system blocks the stage too.
async function ipKeyOf(request) {
  return 'ip:' + await sha16((process.env.MOD_IP_SALT || 'debatable-mod-1') + callerIp(request));
}

async function banFor(db, keys) {
  try {
    const reads = keys.filter(Boolean).map((k) =>
      db.collection('video_bans').doc(k).get().then((d) => (d.exists ? d.data() : null), () => null));
    const docs = await withDeadline(Promise.all(reads), 2000);
    const now = Date.now();
    for (const b of docs || []) if (b && b.until && b.until > now) return b;
  } catch (e) { /* fail open, matching create-daily-room's posture */ }
  return null;
}

async function currentStream(db) {
  const snap = await db.collection('site_stream').doc('current').get();
  if (!snap.exists) return null;
  const d = snap.data() || {};
  if (!d.live || !d.roomName || !d.url) return null;
  return d;
}

function stageRef(db, roomName) {
  return db.collection('stream_stage').doc(safeRoomName(roomName));
}

async function readBoard(db, roomName) {
  const snap = await stageRef(db, roomName).get();
  return snap.exists ? { ...emptyBoard(roomName), ...(snap.data() || {}) } : emptyBoard(roomName);
}

async function readRequests(db, roomName) {
  const snap = await stageRef(db, roomName).collection('requests').limit(120).get();
  const out = [];
  snap.forEach((d) => out.push({ uid: d.id, ...(d.data() || {}) }));
  return out;
}

function isHost(decoded) {
  const email = decoded && decoded.email;
  return !!email && (isAdminEmail(email) || isOwnerEmail(email));
}

// Every reply carries the server clock. Clients correct their own by it
// and report turn boundaries in server time, which is the only reason
// two browsers' transcripts can be interleaved at all.
function reply(payload, request, status = 200) {
  return jsonResponse({ serverNow: Date.now(), ...payload }, status, request);
}

async function mintStageToken(roomName, uid, name, owner) {
  const properties = {
    room_name: safeRoomName(roomName),
    user_id: String(uid).slice(0, 36),
    user_name: cleanText(name, 40) || 'Guest',
    // is_owner is what gets a publish past owner_only_broadcast. A guest
    // gets it for the length of one stage round and nothing more: the
    // token expires, ejects on expiry, and carries no recording control.
    is_owner: true,
    enable_recording_ui: false,
    start_video_off: false,
    start_audio_off: false,
    eject_at_token_exp: true,
    exp: Math.floor(Date.now() / 1000) + (owner ? GUEST_TOKEN_TTL_SEC * 2 : GUEST_TOKEN_TTL_SEC),
  };
  const resp = await fetch(DAILY_API + '/meeting-tokens', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.DAILY_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.warn('[stage] token mint failed', resp.status, detail.slice(0, 300));
    return null;
  }
  const data = await resp.json();
  return data.token || null;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const configured = !!(process.env.DAILY_API_KEY && process.env.DAILY_DOMAIN);

  // Public read. Deliberately thin: the full public projection rides
  // /api/stream-status, which every player already polls on a shared
  // cache. This exists for a page that wants the board without the
  // stream envelope around it.
  if (request.method === 'GET') {
    let db;
    try { db = getDb(); } catch (e) { return reply({ active: false, status: 'idle' }, request); }
    const stream = await currentStream(db).catch(() => null);
    if (!stream) return reply({ live: false, active: false, status: 'idle' }, request);
    const board = await readBoard(db, stream.roomName).catch(() => null);
    return new Response(JSON.stringify({
      live: true,
      requestsOpen: configured && stream.stageOpen !== false,
      ...publicBoard(board, Date.now()),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3, s-maxage=4, stale-while-revalidate=15',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  if (!configured) return errorResponse('Live video is not configured for this site', 503, request);

  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) {
    return jsonResponse({ error: 'App verification failed. Reload the page and try again.', code: 'APP_CHECK' }, 401, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to join the stage', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (e) { return errorResponse('Sign in to join the stage', 401, request); }
  const uid = decoded.sub;

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const action = String(body.action || '').toLowerCase();

  let db;
  try { db = getDb(); } catch (e) { return errorResponse('Service unavailable', 503, request); }

  const stream = await currentStream(db).catch(() => null);
  if (!stream) return jsonResponse({ error: 'Nothing is streaming right now.', code: 'no_stream' }, 409, request);
  const roomName = safeRoomName(stream.roomName);
  const ref = stageRef(db, roomName);

  const host = isHost(decoded);
  if (HOST_ACTIONS.has(action) && !host) return errorResponse('Host only', 403, request);

  if (SHARED_ACTIONS.has(action)) {
    const now = Date.now();
    const board = await readBoard(db, roomName);
    if (board.status !== 'debating') return jsonResponse({ error: 'No round is running.', code: 'idle' }, 409, request);
    if (board.mode !== 'structured') return jsonResponse({ error: 'The open floor has one clock.', code: 'mode' }, 409, request);
    const step = STRUCTURED_SEQUENCE[Math.max(0, Math.floor(Number(board.speechIdx) || 0))];
    const mine = seatOf(board, uid);
    if (!host && (!step || mine !== step.side)) {
      return errorResponse('Only the speaker on the clock can end their turn', 403, request);
    }
    const patch = { ...advanceStructured(board, now), updatedAt: now };
    await ref.set(patch, { merge: true });
    return reply({ ok: true, board: publicBoard({ ...board, ...patch }, now) }, request);
  }

  // ── Host actions ───────────────────────────────────────────────
  if (host && HOST_ACTIONS.has(action)) {
    const now = Date.now();

    if (action === 'queue') {
      const [board, requests] = await Promise.all([readBoard(db, roomName), readRequests(db, roomName)]);
      return reply({
        board: { ...publicBoard(board, now), roomName },
        seats: board.seats || { pro: null, con: null },
        queue: queueView(requests, now),
      }, request);
    }

    if (action === 'admit') {
      const target = String(body.uid || '').slice(0, 64);
      if (!target) return errorResponse('uid required', 400, request);
      const reqSnap = await ref.collection('requests').doc(target).get();
      if (!reqSnap.exists) return errorResponse('No such request', 404, request);
      const req = reqSnap.data() || {};
      if (isStale({ ...req, state: 'pending' }, now)) {
        return jsonResponse({ error: 'That viewer left the page.', code: 'stale' }, 409, request);
      }

      const seated = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const board = snap.exists ? { ...emptyBoard(roomName), ...(snap.data() || {}) } : emptyBoard(roomName, now);
        if (seatOf(board, target)) return { side: seatOf(board, target), already: true };
        const side = seatFor(board, normalizeSide(body.side) || req.side);
        if (!side) return { full: true };
        const seats = { ...(board.seats || {}), [side]: { uid: target, name: req.name || 'Guest', role: 'guest', seatedAt: now } };
        tx.set(ref, { ...board, seats, updatedAt: now }, { merge: true });
        tx.set(ref.collection('requests').doc(target), { state: 'admitted', side, admittedAt: now }, { merge: true });
        return { side };
      });

      if (seated.full) return jsonResponse({ error: 'Both seats are taken.', code: 'full' }, 409, request);
      return reply({ ok: true, uid: target, side: seated.side }, request);
    }

    if (action === 'sit') {
      // The host takes a seat. Their studio tab and this seat are two
      // publishes from one person into one room, which is an echo, so
      // /stage warns them to close the studio before going on mic.
      const side = normalizeSide(body.side);
      const name = cleanText(body.name || decoded.name || 'Host', 40) || 'Host';
      const seated = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const board = snap.exists ? { ...emptyBoard(roomName), ...(snap.data() || {}) } : emptyBoard(roomName, now);
        const existing = seatOf(board, uid);
        if (existing) return { side: existing, already: true };
        const target = seatFor(board, side);
        if (!target) return { full: true };
        const seats = { ...(board.seats || {}), [target]: { uid, name, role: 'host', seatedAt: now } };
        tx.set(ref, { ...board, seats, updatedAt: now }, { merge: true });
        return { side: target };
      });
      if (seated.full) return jsonResponse({ error: 'Both seats are taken.', code: 'full' }, 409, request);
      return reply({ ok: true, side: seated.side }, request);
    }

    if (action === 'remove') {
      const target = String(body.uid || '').slice(0, 64);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const board = { ...emptyBoard(roomName), ...(snap.data() || {}) };
        const side = seatOf(board, target);
        if (!side) return;
        tx.set(ref, { seats: { ...(board.seats || {}), [side]: null }, updatedAt: now }, { merge: true });
      });
      await ref.collection('requests').doc(target)
        .set({ state: 'removed', removedAt: now }, { merge: true }).catch(() => {});
      // The Daily-side eject is the host's own client call: their studio
      // token is an owner token, so it can do it directly and instantly.
      // Clearing the seat here is what stops the removed person claiming
      // a fresh token on their next poll.
      return reply({ ok: true }, request);
    }

    if (action === 'open') {
      const mode = normalizeMode(body.mode);
      if (!mode) return errorResponse('mode must be structured or casual', 400, request);
      const motion = cleanText(body.motion, MAX_MOTION);
      if (motion.length < 6) return errorResponse('Give the round a question to argue', 400, request);
      const board = await readBoard(db, roomName);
      if (!board.seats || !board.seats.pro || !board.seats.con) {
        return jsonResponse({ error: 'Both seats need someone in them first.', code: 'seats' }, 409, request);
      }
      const patch = {
        mode,
        motion,
        status: 'debating',
        openedAt: now,
        speechIdx: 0,
        turnStartedAt: mode === 'structured' ? now : null,
        casualMs: normalizeCasualMs(body.casualMs),
        endedAt: null,
        ballot: null,
        updatedAt: now,
      };
      await ref.set(patch, { merge: true });
      return reply({ ok: true, board: publicBoard({ ...board, ...patch }, now) }, request);
    }

    if (action === 'end') {
      await ref.set({ status: 'ended', endedAt: now, turnStartedAt: null, updatedAt: now }, { merge: true });
      return reply({ ok: true }, request);
    }

    if (action === 'reset') {
      // Clears the stage back to a host-only broadcast. Turns are left
      // where they are: a finished round's transcript is the evidence
      // behind its ballot and deleting it on the way to the next round
      // would make an appeal unanswerable.
      await ref.set({
        status: 'idle', mode: null, motion: '', seats: { pro: null, con: null },
        openedAt: null, turnStartedAt: null, speechIdx: 0, endedAt: null, updatedAt: now,
      }, { merge: true });
      const reqs = await ref.collection('requests').limit(200).get();
      await Promise.all(reqs.docs.map((d) => d.ref.delete().catch(() => {})));
      return reply({ ok: true }, request);
    }
  }

  // ── Viewer and guest actions ───────────────────────────────────
  //
  // Google sign-in, matching the live-video rule: the other person on
  // this stage is a real person on a public broadcast, so an
  // unaccountable counterpart is a cost paid by somebody other than the
  // person asking.
  const provider = decoded.firebase && decoded.firebase.sign_in_provider;
  if (!LIVE_VIDEO_PROVIDERS.has(provider)) {
    return jsonResponse({
      error: 'Joining a live broadcast needs a Google, phone, or Apple account.',
      code: 'need_live_account',
    }, 401, request);
  }

  const now = Date.now();
  const board = await readBoard(db, roomName);
  const mySeat = seatOf(board, uid);

  if (action === 'poll') {
    const reqSnap = await ref.collection('requests').doc(uid).get();
    const mine = reqSnap.exists ? reqSnap.data() || {} : null;
    if (mine && mine.state === 'pending') {
      // The heartbeat that keeps a hand raised. A request whose owner
      // stopped polling is dropped from the host's queue rather than
      // offered as somebody to admit, which is the empty-chair failure
      // one surface over.
      ref.collection('requests').doc(uid).set({ seenAt: now }, { merge: true }).catch(() => {});
    }
    return reply({
      state: mySeat ? 'seated' : (mine ? mine.state : 'none'),
      side: mySeat,
      board: publicBoard(board, now),
      floor: floorHolders(board),
      requestsOpen: stream.stageOpen !== false,
    }, request);
  }

  if (action === 'request') {
    if (stream.stageOpen === false) {
      return jsonResponse({ error: 'The host has closed hand raises for now.', code: 'closed' }, 409, request);
    }
    if (mySeat) return reply({ state: 'seated', side: mySeat }, request);

    const rl = await checkLayers('stage', 'uid_' + uid, [
      { window: 60 * 60 * 1000, max: 10, label: 'hour' },
      { window: 24 * 60 * 60 * 1000, max: 30, label: 'day' },
    ]);
    if (!rl.ok) return errorResponse('Too many requests. Try again in a bit.', 429, request);

    const ban = await banFor(db, ['uid:' + uid, await ipKeyOf(request)]);
    if (ban) {
      return jsonResponse({ error: 'Removed from video rooms for a safety violation.', code: 'banned' }, 403, request);
    }

    // Adults only, and this is stricter than /spar on purpose. A stage
    // round is broadcast, recorded, and restreamed off the site: that is
    // a permanent public exposure, not a private room with one stranger
    // in it.
    let bandDoc = null;
    try { bandDoc = await withDeadline(db.collection('age_bands').doc(uid).get(), 2500); } catch (e) { bandDoc = null; }
    const band = bandDoc && bandDoc.exists ? (bandDoc.data() || {}).band : null;
    if (!band) return jsonResponse({ error: 'Answer the age question first.', code: 'need_age' }, 403, request);
    if (band !== 'adult') {
      return jsonResponse({
        error: 'Going on a public broadcast is 18+. Live rounds away from the stream are still open to you.',
        code: 'minor',
      }, 403, request);
    }

    const built = buildRequest({
      uid,
      name: body.name || decoded.name,
      side: body.side,
      mode: body.mode,
      note: body.note,
    }, now);
    if (built.error) return errorResponse(built.error, 400, request);
    await ref.collection('requests').doc(uid).set(built.request);
    return reply({ ok: true, state: 'pending' }, request);
  }

  if (action === 'withdraw') {
    await ref.collection('requests').doc(uid).delete().catch(() => {});
    return reply({ ok: true, state: 'none' }, request);
  }

  if (action === 'claim') {
    if (!mySeat) return jsonResponse({ error: 'You are not on the stage.', code: 'not_seated' }, 403, request);
    const rl = await checkLayers('stageclaim', 'uid_' + uid, [
      { window: 60 * 60 * 1000, max: 12, label: 'hour' },
    ]);
    if (!rl.ok) return errorResponse('Too many reconnects. Wait a moment.', 429, request);
    const seat = board.seats[mySeat] || {};
    const minted = await mintStageToken(roomName, uid, seat.name, seat.role === 'host');
    if (!minted) return errorResponse('Could not set up your camera. Try again.', 502, request);
    await ref.set({
      seats: { ...(board.seats || {}), [mySeat]: { ...seat, claimedAt: now } },
      updatedAt: now,
    }, { merge: true }).catch(() => {});
    return reply({
      ok: true,
      side: mySeat,
      token: minted,
      url: stream.url,
      name: seat.name || 'Guest',
      role: seat.role || 'guest',
      board: publicBoard(board, now),
    }, request);
  }

  if (action === 'leave') {
    if (!mySeat) return reply({ ok: true }, request);
    await ref.set({ seats: { ...(board.seats || {}), [mySeat]: null }, updatedAt: now }, { merge: true });
    await ref.collection('requests').doc(uid).set({ state: 'left', leftAt: now }, { merge: true }).catch(() => {});
    return reply({ ok: true }, request);
  }

  if (action === 'turn') {
    if (!mySeat) return jsonResponse({ error: 'Not on the stage', code: 'not_seated' }, 403, request);
    if (board.status !== 'debating') return jsonResponse({ ok: false, code: 'not_running' }, 200, request);
    const built = buildTurn({
      uid,
      text: body.text,
      startedAt: body.startedAt,
      endedAt: body.endedAt,
    }, board, now);
    if (built.error) return jsonResponse({ ok: false, code: built.error }, 200, request);

    // Append-only, one document per turn, so two live microphones never
    // race each other over one array. A capped counter keeps a stuck
    // client from turning a stage round into an unbounded write loop.
    const count = Number(board.turnCount) || 0;
    if (count > 600) return jsonResponse({ ok: false, code: 'turn_cap' }, 200, request);
    await ref.collection('turns').add(built.turn);
    await ref.set({ turnCount: FieldValue.increment(1), updatedAt: now }, { merge: true }).catch(() => {});

    const clock = clockFor(board, now);
    return reply({ ok: true, clock }, request);
  }

  return errorResponse('Unknown action', 400, request);
};

export const config = { path: '/api/stage' };
