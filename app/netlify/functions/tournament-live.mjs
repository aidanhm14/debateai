// ─────────────────────────────────────────────────────────────
// /api/tournament-live — the drop-in queue.
//
// GET  ?tid=          standings + pool size (public, shared-cached 10s)
// POST { action, tid }
//        queue        join the pool and try to pair immediately
//        poll         still waiting? try again, and report a pairing
//        unqueue      step out of the pool
//
// The Open runs all day with no round calls: people arrive when it suits
// them, get paired, play, and come back. There is never a moment when
// "the field" exists, so there is no draw to make. This pairs one pair
// at a time out of whoever is waiting right now.
//
// Pairing decisions are made by the PURE module (lib/tournament-live.mjs)
// and claimed transactionally by lib/tournament-ledger.mjs. This file
// only fetches the pool and hands it over, so the rule that decides who
// debates whom stays testable without a database.
// ─────────────────────────────────────────────────────────────
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, deleteCachedShared } from './lib/admin-cache.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';
import { pairNext, liveStandings, ledgerFor, roomScoreFor, MIN_ROUNDS } from './lib/tournament-live.mjs';
import { claimPairing } from './lib/tournament-ledger.mjs';

const BOARD_TTL_MS = 10 * 1000;
const POOL_LIMIT = 200;

// A waiting entrant whose tab died should not hold a seat in the pool
// forever. The client re-queues on every poll, so a live one never goes
// stale; anything older than this was closed.
const STALE_WAIT_MS = 3 * 60 * 1000;

const POLL_LAYERS = [
  { windowMs: 60 * 1000, max: 30 },
  { windowMs: 60 * 60 * 1000, max: 400 },
];

const boardKey = (tid) => `tlive-board-${tid}`;

async function readEntries(db, tid) {
  const snap = await withDeadline(
    db.collection('tournaments').doc(tid).collection('entries').limit(POOL_LIMIT).get(), 3000);
  return snap.docs.map((d) => ({ entryId: d.id, ...d.data() }));
}

// Shape a stored entry into what the pure pairing module reads. Kept in
// one place so the field mapping cannot drift between pairing and board.
function forPairing(e, now) {
  const waiting = Number(e.waitingSince) || 0;
  return {
    entryId: e.entryId,
    available: e.available === true
      && !e.pairedRoom
      && (e.status === 'checked_in' || e.status === 'registered')
      && waiting > 0 && (now - waiting) < STALE_WAIT_MS,
    waitingSince: waiting,
    points: Number(e.points) || 0,
    opponents: Array.isArray(e.opponents) ? e.opponents : [],
    govCount: e.sideCount?.gov || 0,
    oppCount: e.sideCount?.opp || 0,
  };
}

function publicRow(e) {
  const led = ledgerFor(e.results || []);
  return {
    entryId: e.entryId,
    name: String(e.name || 'A debater').slice(0, 60),
    affiliation: String(e.affiliation || '').slice(0, 60),
    points: led.points,
    played: led.played,
    wins: led.wins,
    losses: led.losses,
    avgSpeaks: led.avgSpeaks,
    rankable: led.rankable,
    // Reported beside the board, never inside it. Watchability is its own
    // award; see the fence in lib/tournament-live.mjs.
    room: roomScoreFor(e.results || []).room,
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  const db = getDb();
  const url = new URL(request.url);

  // ── BOARD ─────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const tid = (url.searchParams.get('tid') || '').slice(0, 60);
    if (!tid) return errorResponse('Missing tid', 400, request);

    const hit = await getCachedShared(boardKey(tid));
    if (hit) return jsonResponse(hit, 200, request);

    let entries;
    try { entries = await readEntries(db, tid); }
    catch (err) {
      console.error('[tournament-live] board read failed', tid, err.message);
      return jsonResponse({ tid, standings: [], waiting: 0, degraded: true, at: Date.now() }, 200, request);
    }

    const now = Date.now();
    const ranked = liveStandings(entries.map((e) => ({ ...e, rounds: e.results || [] })));
    const payload = {
      tid,
      minRounds: MIN_ROUNDS,
      waiting: entries.filter((e) => forPairing(e, now).available).length,
      inRound: entries.filter((e) => !!e.pairedRoom).length,
      standings: ranked.map(publicRow),
      at: now,
    };
    await setCachedShared(boardKey(tid), payload, BOARD_TTL_MS);
    return jsonResponse(payload, 200, request);
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to enter the queue.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Sign in again.', 401, request); }
  const uid = decoded.sub;

  let body = {};
  try { body = await request.json(); } catch {}
  const tid = String(body.tid || '').slice(0, 60);
  const action = String(body.action || '');
  if (!tid) return errorResponse('Missing tid', 400, request);

  const gate = await checkLayers('tlive', uid || callerIp(request), POLL_LAYERS);
  if (!gate.ok) return errorResponse('Slow down a moment.', 429, request);

  const tRef = db.collection('tournaments').doc(tid);
  // Entries carry auto-ids and a `members` array (a 2v2 entry holds two
  // uids), so an entry is found the same way registration finds it. Do
  // NOT key entries by uid here: `lib/tournament-round.mjs` verifies a
  // room by reading `members`, and a uid-keyed entry would pass this
  // lookup while failing that verification, which silently unrates every
  // drop-in round.
  const mineQ = await withDeadline(
    tRef.collection('entries').where('members', 'array-contains', uid).limit(1).get(), 2500);
  if (mineQ.empty) {
    return errorResponse('Register for the tournament first.', 404, request);
  }
  const mineRef = mineQ.docs[0].ref;
  const myEntryId = mineQ.docs[0].id;
  const mine = mineQ.docs[0].data();
  if (mine.status === 'withdrawn' || mine.status === 'dropped') {
    return errorResponse('Your entry is withdrawn.', 409, request);
  }

  if (action === 'unqueue') {
    await mineRef.update({ available: false, waitingSince: 0, updatedAt: Date.now() });
    await deleteCachedShared(boardKey(tid)).catch(() => {});
    return jsonResponse({ ok: true, state: 'out' }, 200, request);
  }

  if (action !== 'queue' && action !== 'poll') {
    return errorResponse('Unknown action', 400, request);
  }

  // Already seated: hand back the room rather than re-pairing. A client
  // that reloads mid-round has to be able to find its way back in.
  if (mine.pairedRoom) {
    return jsonResponse({
      ok: true, state: 'paired', room: mine.pairedRoom, side: mine.currentSide || null,
    }, 200, request);
  }

  const now = Date.now();
  // `queue` stamps a fresh wait; `poll` refreshes the heartbeat without
  // moving the entrant's place, so waiting longest keeps meaning waiting
  // longest rather than resetting on every poll.
  const waitingSince = (action === 'queue' || !mine.waitingSince) ? now : Number(mine.waitingSince);
  if (mine.available !== true || mine.waitingSince !== waitingSince) {
    await mineRef.update({
      available: true, waitingSince, status: mine.status === 'registered' ? 'checked_in' : mine.status,
      updatedAt: now,
    });
  } else {
    await mineRef.update({ updatedAt: now });
  }

  let entries;
  try { entries = await readEntries(db, tid); }
  catch (err) {
    console.error('[tournament-live] pool read failed', tid, err.message);
    return jsonResponse({ ok: true, state: 'waiting', degraded: true }, 200, request);
  }

  const pool = entries.map((e) => forPairing(e, now));
  // Reflect this caller's just-written state without a second read.
  const me = pool.find((p) => p.entryId === myEntryId);
  if (me) { me.available = true; me.waitingSince = waitingSince; }

  const pairing = pairNext(pool, now);
  if (!pairing) {
    return jsonResponse({
      ok: true, state: 'waiting',
      waiting: pool.filter((p) => p.available).length,
    }, 200, request);
  }

  let claimed;
  try { claimed = await claimPairing(db, { tid, pairing, now }); }
  catch (err) {
    console.error('[tournament-live] claim failed', tid, err.message);
    return jsonResponse({ ok: true, state: 'waiting' }, 200, request);
  }
  await deleteCachedShared(boardKey(tid)).catch(() => {});

  if (!claimed.ok) {
    // Lost the race to another poller. Not an error: poll again.
    return jsonResponse({ ok: true, state: 'waiting', raced: claimed.reason }, 200, request);
  }

  // The pairing may be between two OTHER people; this caller only gets a
  // room if they are in it. Reporting someone else's room would send them
  // into a round they are not seated in.
  const iAmGov = claimed.gov.entryId === myEntryId;
  const iAmOpp = claimed.opp.entryId === myEntryId;
  if (!iAmGov && !iAmOpp) {
    return jsonResponse({ ok: true, state: 'waiting', pairedOthers: true }, 200, request);
  }
  return jsonResponse({
    ok: true, state: 'paired',
    room: claimed.room,
    side: iAmGov ? 'gov' : 'opp',
    opponent: iAmGov ? claimed.opp.name : claimed.gov.name,
    rematch: claimed.rematch,
  }, 200, request);
};

export const config = { path: '/api/tournament-live' };
