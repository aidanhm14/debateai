import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';

// ── 2v2 matchmaking: duo vs duo ────────────────────────────────────
//
// /api/partner-match turns two solo debaters into a `duo_teams` doc.
// This function takes two of those duos and turns them into one
// four-person round.
//
// The queue doc is keyed by TEAM, not by user: `duo_queue/{teamId}`.
// That one decision removes the whole class of bug that would
// otherwise dominate here — with per-user queue docs, a 2v2 match is
// a four-way atomic write where any half-commit strands a real person
// in a room their partner never entered. Keyed by team, the
// transaction touches exactly two documents, which is the same shape
// spar-pair already runs in production.
//
// Either member of a duo may queue it, and either may cancel. The
// partner does not have to be at their screen for the queue to
// advance; they get pulled in by the round link. That is deliberate.
// Requiring both partners live before a search even starts would make
// a 2v2 round need four simultaneous humans instead of two plus two,
// which at this traffic level means it never fires.
//
// Side assignment: the older-queued team takes the first bench (Gov /
// Pro), the newer takes the second. Deterministic beats random here,
// because both clients compute the same room URL from their own doc
// snapshot and any disagreement puts partners on opposite benches.

const VALID_FORMATS = new Set(['quick', 'apda', 'bp', 'worlds', 'asian']);

const MOTION_MAX = 280;
const PARADIGM_MAX = 240;

function cleanText(s, max) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function tsMs(t) {
  if (!t) return Date.now();
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t._seconds != null) return t._seconds * 1000;
  if (t.seconds != null) return t.seconds * 1000;
  return Date.now();
}

// A queued duo is one member sitting at a screen; the partner may be
// anywhere. Same 3-minute freshness bar as the 1v1 queue, refreshed
// by the client heartbeat.
const STALE_TEAM_MS = 3 * 60 * 1000;
const SKIP_TTL_MS = 5 * 60 * 1000;
const REAPER_MS = 6 * 60 * 1000;
const REAPER_THROTTLE_MS = 60 * 1000;

const attempts = new Map();
const THROTTLE_MS = 600;
function isThrottled(key) {
  const now = Date.now();
  const last = attempts.get(key) || 0;
  if (now - last < THROTTLE_MS) return true;
  attempts.set(key, now);
  return false;
}
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, t] of attempts) if (t < cutoff) attempts.delete(k);
}, 5 * 60 * 1000);

function skipActive(data, teamId) {
  const skips = Array.isArray(data?.skipTeams) ? data.skipTeams : [];
  if (!skips.includes(teamId)) return false;
  const at = data?.skipAt && data.skipAt[teamId];
  return (Date.now() - tsMs(at)) <= SKIP_TTL_MS;
}

let lastReaperAt = 0;
async function reapStaleQueue(db) {
  const now = Date.now();
  if (now - lastReaperAt < REAPER_THROTTLE_MS) return;
  lastReaperAt = now;
  try {
    const snap = await db.collection('duo_queue')
      .where('status', '==', 'waiting')
      .where('joinedAt', '<', new Date(now - REAPER_MS))
      .limit(40)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, {
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      cancelReason: 'stale_reaper',
    }));
    await batch.commit();
  } catch (err) {
    console.warn('[duo-pair] reaper failed (likely missing index status+joinedAt):', err?.message || err);
  }
}

// Motions a 2v2 can open on cold. Same editorial bar as the /spar
// bank: wide, accessible, no motion that needs a brief to argue.
const DUO_MOTIONS = [
  'This House would abolish standardized testing in university admissions',
  'This House believes that social media platforms should be liable for what they host',
  'This House would ban political advertising',
  'This House regrets the gig economy',
  'This House would give every citizen a basic income',
  'This House believes that developing nations should prioritize growth over climate targets',
  'This House would abolish private schooling',
  'This House would make voting compulsory',
  'This House believes that AI systems should be barred from making hiring decisions',
  'This House would break up the largest technology companies',
];

// Team membership is the authorization check for every action here:
// you may queue or cancel a team you are on, and no other.
async function loadMyTeam(db, teamId, uid) {
  const snap = await db.collection('duo_teams').doc(teamId).get();
  if (!snap.exists) return { error: 'That team no longer exists.' };
  const d = snap.data();
  const members = Array.isArray(d.members) ? d.members : [];
  if (!members.includes(uid)) return { error: 'You are not on that team.' };
  if (d.status === 'disbanded') return { error: 'That team has disbanded.' };
  if (members.length < 2) return { error: 'Your team still needs a second debater.' };
  return { doc: snap, data: d, members };
}

// The four-seat payload both clients read off their own queue doc to
// build the same /live-round URL. Bench 1 is Gov/Pro, bench 2 is
// Opp/Con; within a bench, seat 1 speaks first.
function seatPayload(firstTeam, secondTeam) {
  const info = (t, i) => {
    const uid = t.members[i];
    return {
      uid: uid || '',
      name: (t.memberInfo?.[uid]?.name) || (i === 0 ? 'Debater' : 'Partner'),
    };
  };
  const a1 = info(firstTeam, 0);
  const a2 = info(firstTeam, 1);
  const b1 = info(secondTeam, 0);
  const b2 = info(secondTeam, 1);
  return {
    proUid: a1.uid, proName: a1.name,
    proUid2: a2.uid, proName2: a2.name,
    conUid: b1.uid, conName: b1.name,
    conUid2: b2.uid, conName2: b2.name,
    proTeamId: firstTeam.teamId, proTeamName: firstTeam.name || 'Team A',
    conTeamId: secondTeam.teamId, conTeamName: secondTeam.name || 'Team B',
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('[duo-pair] auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }
  const myUid = decoded.sub;
  if (!myUid) return errorResponse('Invalid token subject', 401, request);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const action = String(body?.action || 'pair').trim();
  const teamId = String(body?.teamId || '').trim();
  if (!teamId) return errorResponse('Missing teamId', 400, request);
  if (isThrottled(myUid + ':' + action)) {
    return errorResponse('Slow down a moment and try again.', 429, request);
  }

  const db = getDb();
  const queue = db.collection('duo_queue');

  const mine = await loadMyTeam(db, teamId, myUid);
  if (mine.error) return errorResponse(mine.error, 403, request);

  // ── join ────────────────────────────────────────────────────────
  // Put the team in the 2v2 queue. Written server-side rather than by
  // the client so the doc's members list is the one the server
  // verified, not one the browser asserted: everything downstream
  // (seat assignment, who may cancel) trusts that list.
  if (action === 'join') {
    const format = String(body?.format || mine.data.format || 'quick').toLowerCase();
    if (!VALID_FORMATS.has(format)) return errorResponse('Invalid format', 400, request);
    await queue.doc(teamId).set({
      teamId,
      name: mine.data.name || 'Team',
      members: mine.members,
      memberInfo: mine.data.memberInfo || {},
      format,
      motion: cleanText(body?.motion, MOTION_MAX),
      paradigm: cleanText(body?.paradigm, PARADIGM_MAX),
      status: 'waiting',
      queuedBy: myUid,
      joinedAt: FieldValue.serverTimestamp(),
      // Clear anything left over from a previous match on this team.
      room: FieldValue.delete(),
      matchedWith: FieldValue.delete(),
      seats: FieldValue.delete(),
      cancelReason: FieldValue.delete(),
    }, { merge: true });
    return jsonResponse({ ok: true, status: 'waiting' }, 200, request);
  }

  // ── heartbeat ───────────────────────────────────────────────────
  // Refresh joinedAt so a long search isn't reaped out from under a
  // debater who is still watching the screen.
  if (action === 'heartbeat') {
    const ref = queue.doc(teamId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().status !== 'waiting') {
      return jsonResponse({ ok: true, status: snap.exists ? snap.data().status : 'gone' }, 200, request);
    }
    await ref.update({ joinedAt: FieldValue.serverTimestamp() });
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── cancel ──────────────────────────────────────────────────────
  if (action === 'cancel') {
    await queue.doc(teamId).set({
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      cancelReason: 'user_cancelled',
    }, { merge: true });
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── pair ────────────────────────────────────────────────────────
  if (action === 'pair') {
    const peerTeamId = String(body?.peerTeamId || '').trim();
    if (!peerTeamId || peerTeamId === teamId) return errorResponse('Invalid peerTeamId', 400, request);

    reapStaleQueue(db);
    const myRef = queue.doc(teamId);
    const peerRef = queue.doc(peerTeamId);
    const room = 'Debatable-2v2-' + Math.random().toString(36).slice(2, 10);

    try {
      const result = await db.runTransaction(async (tx) => {
        const [mineSnap, theirsSnap] = await Promise.all([tx.get(myRef), tx.get(peerRef)]);
        if (!mineSnap.exists || !theirsSnap.exists) return { ok: false, reason: 'queue_doc_missing' };
        const a = mineSnap.data();
        const b = theirsSnap.data();
        if (a.status !== 'waiting' || b.status !== 'waiting') return { ok: false, reason: 'lost_race' };

        // A duo whose members overlap ours is the same people on both
        // benches. Impossible through the UI (one live team per user),
        // but a stale doc plus a re-formed team can produce it, and
        // the failure mode is a person debating themselves.
        const aMembers = Array.isArray(a.members) ? a.members : [];
        const bMembers = Array.isArray(b.members) ? b.members : [];
        if (aMembers.length !== 2 || bMembers.length !== 2) return { ok: false, reason: 'incomplete_team' };
        if (aMembers.some((u) => bMembers.includes(u))) return { ok: false, reason: 'overlapping_members' };

        const peerAge = Date.now() - tsMs(b.joinedAt);
        if (peerAge > STALE_TEAM_MS) {
          tx.update(peerRef, {
            status: 'cancelled',
            cancelledAt: FieldValue.serverTimestamp(),
            cancelReason: 'stale_peer_skip',
          });
          return { ok: false, reason: 'stale_peer' };
        }
        if (skipActive(a, peerTeamId) || skipActive(b, teamId)) return { ok: false, reason: 'skipped_peer' };

        // Older queue entry takes the first bench and sets the format
        // and motion, same precedence rule spar-pair uses. Both sides
        // derive the identical seating from this, so no client has to
        // agree with another about who sits where.
        const aOlder = tsMs(a.joinedAt) <= tsMs(b.joinedAt);
        const first = aOlder ? { ...a, teamId } : { ...b, teamId: peerTeamId };
        const second = aOlder ? { ...b, teamId: peerTeamId } : { ...a, teamId };

        const pairedFormat = VALID_FORMATS.has(String(first.format || '')) ? first.format : 'quick';
        const pairedMotion = cleanText(first.motion || second.motion, MOTION_MAX)
          || DUO_MOTIONS[Math.floor(Math.random() * DUO_MOTIONS.length)];
        // Judge notes from both sides ride along name-attributed, the
        // same shape /live-round already parses. No consent gate here:
        // unlike /spar these two teams chose to enter a 2v2 queue
        // together, and the ballot guard on the live-round side
        // (a note may shift emphasis, never name a winner) is what
        // actually contains the instruction.
        const notes = [];
        const firstNote = cleanText(first.paradigm, PARADIGM_MAX);
        const secondNote = cleanText(second.paradigm, PARADIGM_MAX);
        if (firstNote) notes.push((first.name || 'Team A') + ': ' + firstNote);
        if (secondNote) notes.push((second.name || 'Team B') + ': ' + secondNote);

        const seats = seatPayload(first, second);
        const common = {
          status: 'matched',
          matchedAt: FieldValue.serverTimestamp(),
          room,
          pairedFormat,
          pairedMotion,
          pairedParadigm: notes.join(' | '),
          seats,
        };
        tx.update(myRef, { ...common, matchedWith: peerTeamId, matchedWithName: b.name || 'Team' });
        tx.update(peerRef, { ...common, matchedWith: teamId, matchedWithName: a.name || 'Team' });
        return { ok: true, room, seats, pairedFormat, pairedMotion };
      });
      return jsonResponse(result, 200, request);
    } catch (err) {
      console.error('[duo-pair] transaction error:', err?.message || err);
      return errorResponse('Pair transaction failed: ' + (err?.message || 'unknown'), 500, request);
    }
  }

  return errorResponse('Unknown action', 400, request);
};

export const config = { path: '/api/duo-pair' };
