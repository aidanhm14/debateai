// ─────────────────────────────────────────────────────────────
// /api/round-vote — the audience verdict on an elimination final.
//
// GET  ?room=<room>   public tally + window state (shared-cached 5s)
// POST { room, side } cast or change a vote. Named accounts only.
//
// Only rounds a host flagged `crowdVerdict:true` accept votes at all, so
// prelims and every casual round keep the published rubric untouched.
// The decision rule (floor, tie margin, panel fallback) lives in
// lib/crowd-verdict.mjs and is stated in the tournament rules BEFORE the
// event, because a rule invented after a close result is a thumb on the
// scale.
//
// The tally is mirrored onto the round document rather than counted from
// the subcollection on read: every client in the room is already
// listening to that doc, so distributing the number costs nothing and
// scales with the audience instead of squaring against it. Same fix the
// watcher count took on 2026-07-28.
// ─────────────────────────────────────────────────────────────
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared } from './lib/admin-cache.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';
import {
  voteWindow, canVote, tallyCrowd, VOTE_WINDOW_MS,
} from './lib/crowd-verdict.mjs';

const TALLY_TTL_MS = 5 * 1000;   // a live count, but not one read per viewer per second
const ROOM_MAX = 120;

// Generous, because a viewer changing their mind twice is normal and the
// real abuse gate is the named-account requirement plus one row per uid.
const VOTE_LAYERS = [
  { windowMs: 60 * 1000, max: 10 },
  { windowMs: 60 * 60 * 1000, max: 60 },
];

function publicView(round, now) {
  const win = voteWindow(round, now);
  const panelWinner = round && round.ballot ? round.ballot.winner : null;
  const t = tallyCrowd(round || {}, panelWinner);
  return {
    room: round && round.room ? round.room : '',
    crowdVerdict: !!(round && round.crowdVerdict === true),
    state: win.state,
    open: win.open,
    closesAt: win.closesAt || 0,
    votes: { pro: t.pro, con: t.con, total: t.total },
    pctPro: t.pctPro,
    // The decision and the RULE that produced it travel together. A
    // result that hides whether the crowd or the panel decided it is
    // exactly what this layer exists to prevent.
    winner: win.state === 'closed' ? t.winner : null,
    decidedBy: win.state === 'closed' ? t.decidedBy : null,
    reason: win.state === 'closed' ? t.reason : null,
    panelWinner: panelWinner || null,
    at: now,
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  const db = getDb();
  const url = new URL(request.url);

  // ── READ ──────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const room = (url.searchParams.get('room') || '').slice(0, ROOM_MAX);
    if (!room) return errorResponse('Missing room', 400, request);

    const key = `round-vote-${room}`;
    const hit = await getCachedShared(key);
    if (hit) return jsonResponse(hit, 200, request);

    let snap;
    try {
      snap = await withDeadline(db.collection('live_rounds').doc(room).get(), 2500);
    } catch (err) {
      console.error('[round-vote] read failed', room, err.message);
      return errorResponse('Could not read the vote. Try again.', 503, request);
    }
    if (!snap.exists) return errorResponse('Round not found', 404, request);

    const payload = publicView({ room, ...snap.data() }, Date.now());
    await setCachedShared(key, payload, TALLY_TTL_MS);
    return jsonResponse(payload, 200, request);
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  // ── WRITE ─────────────────────────────────────────────────────────
  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to vote.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Sign in again to vote.', 401, request); }

  // Mirrors isNamedAccount() in firestore.rules. A missing claim fails
  // closed: anonymous accounts are free to mint, so an unnamed vote is
  // not one person.
  const provider = decoded.firebase && decoded.firebase.sign_in_provider;
  if (!provider || provider === 'anonymous') {
    return errorResponse('Voting on a final needs a real account. Sign in with Google or email.', 403, request);
  }
  const uid = decoded.sub;

  let body = {};
  try { body = await request.json(); } catch {}
  const room = String(body.room || '').slice(0, ROOM_MAX);
  const side = body.side === 'pro' || body.side === 'con' ? body.side : null;
  if (!room) return errorResponse('Missing room', 400, request);
  if (!side) return errorResponse('Pick a side', 400, request);

  const gate = await checkLayers('rv', uid || callerIp(request), VOTE_LAYERS);
  if (!gate.ok) return errorResponse('Slow down a moment.', 429, request);

  const ref = db.collection('live_rounds').doc(room);
  const voteRef = ref.collection('crowd_votes').doc(uid);

  try {
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw Object.assign(new Error('Round not found.'), { code: 404 });
      const d = snap.data();
      const now = Date.now();

      const allowed = canVote({ room, ...d }, { uid, named: true }, now);
      if (!allowed.ok) {
        const msg = allowed.reason === 'debater'
          ? 'Debaters do not vote on their own round.'
          : allowed.reason === 'round_in_progress'
            ? 'Voting opens when the last speech ends.'
            : allowed.reason === 'not_a_crowd_round'
              ? 'This round is decided by the judge panel, not by vote.'
              : 'Voting is closed.';
        throw Object.assign(new Error(msg), { code: 409 });
      }

      const prior = await tx.get(voteRef);
      const had = prior.exists ? prior.data().side : null;
      if (had === side) {
        // Idempotent re-tap. Not an error; a double-click is not a
        // second voter and must not read like a failure.
        return { pro: (d.crowdVotes && d.crowdVotes.pro) || 0, con: (d.crowdVotes && d.crowdVotes.con) || 0, changed: false };
      }

      const patch = { updatedAt: now };
      patch['crowdVotes.' + side] = FieldValue.increment(1);
      if (had) patch['crowdVotes.' + had] = FieldValue.increment(-1);

      // The window is stamped by the FIRST vote rather than by whichever
      // browser flipped the round to `ballot`, so the clock everyone is
      // voting against was written by the server exactly once.
      if (!d.crowdVoteClosesAt) {
        patch.crowdVoteClosesAt = now + VOTE_WINDOW_MS;
        patch.crowdVoteOpenedAt = now;
        patch.crowdVoteState = 'open';
      }

      tx.set(voteRef, { side, at: now, changedFrom: had || null }, { merge: true });
      tx.update(ref, patch);

      const pro = ((d.crowdVotes && d.crowdVotes.pro) || 0) + (side === 'pro' ? 1 : 0) - (had === 'pro' ? 1 : 0);
      const con = ((d.crowdVotes && d.crowdVotes.con) || 0) + (side === 'con' ? 1 : 0) - (had === 'con' ? 1 : 0);
      return { pro, con, changed: true, closesAt: d.crowdVoteClosesAt || (now + VOTE_WINDOW_MS) };
    });

    // The 5s tally cache would otherwise show the voter their own vote
    // missing, which reads as a dropped tap.
    try { await setCachedShared(`round-vote-${room}`, null, 1); } catch {}

    return jsonResponse({
      ok: true, side, votes: { pro: out.pro, con: out.con }, closesAt: out.closesAt || 0,
    }, 200, request);
  } catch (err) {
    const code = err && err.code === 404 ? 404 : (err && err.code === 409 ? 409 : 500);
    if (code === 500) console.error('[round-vote] vote failed', room, err && err.message);
    return errorResponse(err.message || 'Could not record your vote.', code, request);
  }
};

export const config = { path: '/api/round-vote' };
