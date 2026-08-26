// round-draft.mjs — the pre-round motion draft, run inside the ROOM.
//
// POST /api/round-draft
//   { action: 'open',   room }
//   { action: 'strike', room, strikes: ['m1','m4'] }
//   { action: 'motion', room, motionId: 'm3' }
//   { action: 'side',   room, side: 'pro' | 'con' }
//   { action: 'expire', room }
//
// WHY THIS MOVED. The draft shipped on the QUEUE docs (spar-pair), which
// meant it only ran when both docs carried draftOptIn, and only /spar set
// that: the background "Spar live" pill and /debate-chat could not render
// a board, so a pair that included one of them silently skipped the
// strike beat and ran on a motion nobody vetoed. Measured 2026-08-26,
// hours after the draft shipped: one round drafted, the next did not, and
// nothing on either screen said why. A per-surface rollout of a fairness
// step is a coin flip about whether the fairness step happens.
//
// Every entry path lands in /live-round. So the draft lives there now and
// the entry surface stops mattering. It also buys back the clock: both
// debaters are already seated, so no beat is racing a page navigation.
//
// THE STATE IS SPLIT, AND THE SPLIT IS THE BLINDNESS. On the queue model
// each doc held only its own owner's strikes, so blind was free. One
// shared round doc has no field-level read rules, so the full draft lives
// in round_drafts/{room} — an unlisted collection, which firestore.rules
// ends by denying, so no client can read it — and live_rounds/{room}.draft
// carries a REDACTED projection: during the strike beat, who has submitted
// but never what they struck. Strikes reach the round doc only when both
// are in and the reveal is the point.
//
// ELIGIBILITY IS SERVER-WRITTEN, NEVER CLAIMED. spar-pair stamps
// round_drafts/{room} at pair time. A round that arrives any other way
// (the /live challenge board, a direct link, a tournament) has no stamp
// and never drafts, because on those surfaces a human chose the motion on
// purpose and overruling it would be the machine taking the round off
// them. A client cannot forge the stamp: clients cannot write there.
//
// Every decision is still lib/motion-draft.mjs, which is pure and which
// this file does not second-guess. A client that could pick its own side
// would pick the winning one.

import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';
import {
  STRIKE_SEC, PICK_SEC, STRIKES_PER_SIDE,
  createDraft, sanitizeStrikes, advance, actorFor,
  applyMotionPick, applySidePick, autoResolve, autoStrikes,
  draftResult, survivorsOf, publicDraft,
} from './lib/motion-draft.mjs';

// Grace on the server's own clock check. The client runs the visible
// countdown, so its zero and ours are never the same instant; without slack
// an honest expire lands a second early and the round stalls on a beat both
// people already watched run out. Same value spar-pair used.
const EXPIRE_GRACE_MS = 1500;

// A draft nobody finished must not hold a room forever. Past this the next
// caller resolves it outright, which is what the phase clocks would have
// done anyway had a client been alive to say so.
const DRAFT_MAX_MS = 4 * 60 * 1000;

function roomName(value) {
  return String(value || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 120);
}

function phaseMs(phase) {
  return (phase === 'strike' ? STRIKE_SEC : PICK_SEC) * 1000;
}

function atMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds != null) return value.seconds * 1000;
  if (typeof value === 'number') return value;
  return 0;
}

// The only fields a resolved draft changes on the round. Sides stop being
// whatever the pairing assigned and become the thing one debater chose, so
// the uids and the names are rewritten together or not at all.
function finalPatch(draft, uids, names) {
  const res = draftResult(draft, uids[0], uids[1]);
  if (!res) return null;
  const nameOf = (uid) => String(names[uid] || '').slice(0, 60);
  return {
    motion: res.motion,
    proUid: res.proUid,
    conUid: res.conUid,
    proName: nameOf(res.proUid),
    conName: nameOf(res.conUid),
    draftResolvedAt: FieldValue.serverTimestamp(),
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let body;
  try { body = await request.json(); } catch (e) { return errorResponse('Bad JSON', 400, request); }

  const room = roomName(body && body.room);
  const action = String((body && body.action) || '').toLowerCase();
  if (!room) return errorResponse('Missing room', 400, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to draft.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); } catch (e) { decoded = null; }
  if (!decoded || !decoded.uid) return errorResponse('Sign in to draft.', 401, request);
  // Anonymous uids are free and unlimited to mint, and both powers in this
  // draft belong to an identified person on the other side of a real round.
  if (!isNamedAccount(decoded)) return errorResponse('Sign in to draft.', 401, request);
  const uid = String(decoded.uid);

  const db = getDb();
  const stateRef = db.collection('round_drafts').doc(room);
  const roundRef = db.collection('live_rounds').doc(room);

  try {
    const out = await db.runTransaction(async (tx) => {
      const [stateSnap, roundSnap] = await Promise.all([tx.get(stateRef), tx.get(roundRef)]);
      // No stamp, no draft. This is the eligibility gate and it is the
      // reason a /live challenge round keeps the motion its poster chose.
      if (!stateSnap.exists) return { ok: false, reason: 'not_eligible' };
      const st = stateSnap.data() || {};
      if (st.eligible !== true) return { ok: false, reason: 'not_eligible' };

      const uids = (Array.isArray(st.uids) ? st.uids : []).map(String);
      if (uids.length !== 2 || uids.indexOf(uid) === -1) return { ok: false, reason: 'not_a_debater' };
      const round = roundSnap.exists ? (roundSnap.data() || {}) : {};

      // A round that already started is past the point where the motion is
      // still up for grabs. Nothing here may rewrite a round in progress.
      const started = (round.speechIdx || 0) > 0
        || (Array.isArray(round.speeches) && round.speeches.length > 0)
        || round.status === 'ballot' || round.status === 'complete';
      if (started) return { ok: false, reason: 'round_started' };

      let draft = st.draft || null;
      let phaseAt = atMs(st.phaseAt);
      const names = st.names || {};

      if (!draft) {
        if (action !== 'open') return { ok: false, reason: 'no_draft' };
        draft = createDraft(String(st.seed || room), String(st.format || ''), uids[0], uids[1]);
        phaseAt = Date.now();
        tx.set(stateRef, {
          draft,
          phaseAt: FieldValue.serverTimestamp(),
          openedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.set(roundRef, {
          draft: publicDraft(draft, phaseAt),
          draftPhaseAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { ok: true, opened: true, draft: publicDraft(draft, phaseAt) };
      }

      // Already settled. Idempotent so a duplicate click, a retry, or the
      // second debater's client arriving late all get the same answer.
      if (draft.phase === 'done') return { ok: true, done: true, draft: publicDraft(draft, phaseAt) };
      if (action === 'open') return { ok: true, opened: false, draft: publicDraft(draft, phaseAt) };

      const before = draft.phase;
      const openedAt = atMs(st.openedAt) || phaseAt;
      const stale = openedAt && (Date.now() - openedAt) > DRAFT_MAX_MS;

      if (action === 'strike') {
        if (draft.phase !== 'strike') return { ok: false, reason: 'wrong_phase' };
        // Your own strikes only, once. Re-striking after committing would
        // let someone watch the phase flip and then change their mind.
        if ((draft.strikes[uid] || []).length >= STRIKES_PER_SIDE) {
          return { ok: true, draft: publicDraft(draft, phaseAt) };
        }
        const mine = sanitizeStrikes(draft, body && body.strikes);
        if (mine.length < STRIKES_PER_SIDE) return { ok: false, reason: 'need_two' };
        draft = Object.assign({}, draft, {
          strikes: Object.assign({}, draft.strikes, { [uid]: mine }),
        });
        draft = advance(draft, uids[0], uids[1]);
      } else if (action === 'motion') {
        const res = applyMotionPick(draft, uid, body && body.motionId);
        if (!res.ok) return { ok: false, reason: res.reason };
        draft = advance(res.draft, uids[0], uids[1]);
      } else if (action === 'side') {
        const res = applySidePick(draft, uid, body && body.side);
        if (!res.ok) return { ok: false, reason: res.reason };
        draft = advance(res.draft, uids[0], uids[1]);
      } else if (action === 'expire') {
        const elapsed = Date.now() - (phaseAt || 0);
        if (!stale && phaseAt && elapsed < (phaseMs(draft.phase) - EXPIRE_GRACE_MS)) {
          return { ok: false, reason: 'too_early' };
        }
        if (draft.phase === 'strike') {
          // Fill only the callers who ARE here. A silent peer's strikes are
          // never invented: striking for an absent person is how a room
          // opens onto an empty chair, and on a stale draft filling both is
          // still better than a room stuck forever on a dead beat.
          const fill = stale ? uids : [uid];
          const next = Object.assign({}, draft.strikes);
          // A caller whose clock ran out with one card selected keeps that
          // card; the fill only covers what they did not spend. Losing a
          // deliberate strike to a timer would be the clock overruling the
          // one choice the beat exists to give them.
          const partial = sanitizeStrikes(draft, body && body.strikes);
          fill.forEach((u) => {
            if ((next[u] || []).length >= STRIKES_PER_SIDE) return;
            next[u] = autoStrikes(draft, u, u === uid ? partial : next[u]);
          });
          draft = advance(Object.assign({}, draft, { strikes: next }), uids[0], uids[1]);
        } else {
          // Either side may expire a pick clock. Past the strike beat both
          // people have proven they are there, so a slow click should not
          // cost the round; the resolution is seeded, so both sides and the
          // server land on the same motion and the same side whichever POST
          // arrives first.
          draft = advance(autoResolve(draft), uids[0], uids[1]);
        }
      } else {
        return { ok: false, reason: 'bad_action' };
      }

      const phaseMoved = draft.phase !== before;
      if (phaseMoved) phaseAt = Date.now();

      const statePatch = { draft };
      if (phaseMoved) statePatch.phaseAt = FieldValue.serverTimestamp();
      tx.set(stateRef, statePatch, { merge: true });

      const roundPatch = { draft: publicDraft(draft, phaseAt) };
      if (phaseMoved) roundPatch.draftPhaseAt = FieldValue.serverTimestamp();
      if (draft.phase === 'done') {
        const final = finalPatch(draft, uids, names);
        // A draft that reaches 'done' without a usable result would open a
        // room on no motion at all. Leave the round as it was instead.
        if (final) Object.assign(roundPatch, final);
      }
      tx.set(roundRef, roundPatch, { merge: true });

      return { ok: true, draft: publicDraft(draft, phaseAt), survivors: survivorsOf(draft) };
    });

    if (!out.ok) return jsonResponse(out, out.reason === 'not_a_debater' ? 403 : 200, request);
    return jsonResponse(out, 200, request);
  } catch (err) {
    console.error('[round-draft]', err && err.message);
    return errorResponse('Could not advance the draft.', 500, request);
  }
};

export const config = { path: '/api/round-draft' };

export { phaseMs, actorFor };
