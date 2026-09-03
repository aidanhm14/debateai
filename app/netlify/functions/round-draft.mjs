// round-draft.mjs — the pre-round motion draft, run inside the ROOM.
//
// POST /api/round-draft
//   { action: 'open',     room }
//   { action: 'offer',    room, poolId: 'p2' }                  offer / counter beat
//   { action: 'offer',    room, text: 'This house would ...' }  same, written by hand
//   { action: 'respond',  room, choice: 'take'|'back'|'counter' }
//   { action: 'motion',   room, motionId: 't1' }                the choose beat
//   { action: 'side',     room, side: 'pro' | 'con' }
//   { action: 'expire',   room }
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
// THE STATE IS STILL SPLIT, but no longer for blindness. Blind strikes are
// gone (2026-09-02); the negotiation is sequential and public, so there is
// nothing on the draft one debater must not see. round_drafts/{room} stays
// authoritative because it also holds the ELIGIBILITY STAMP — uids, seed,
// format, the tournament pool — and that is server-written in an unlisted
// collection that firestore.rules ends by denying, so a client cannot forge
// its way into a draft or swap the motions it draws from. The round doc
// gets publicDraft(), which is now a whole-draft copy.
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

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';
import {
  secondsFor, createDraft, advance, actorFor, eitherMayExpire,
  applyOffer, applyResponse, applyMotionPick, applySidePick, autoResolve,
  draftResult, publicDraft, MOTION_MAX,
} from './lib/motion-draft.mjs';
import { checkContent } from './lib/content-guard.mjs';

// Grace on the server's own clock check. The client runs the visible
// countdown, so its zero and ours are never the same instant; without slack
// an honest expire lands a second early and the round stalls on a beat both
// people already watched run out. Same value spar-pair used.
const EXPIRE_GRACE_MS = 1500;

// A draft nobody finished must not hold a room forever. Past this the next
// caller resolves it outright, which is what the phase clocks would have
// done anyway had a client been alive to say so.
const DRAFT_MAX_MS = 4 * 60 * 1000;

// Enough passes to walk offer → respond → counter → choose → side from any
// starting beat, with slack. A bound rather than a while(true), because an
// autoResolve that ever failed to move the phase would otherwise spin the
// transaction until the function times out.
const PHASES_MAX = 8;

function roomName(value) {
  return String(value || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 120);
}

function phaseMs(phase) {
  return secondsFor(phase) * 1000;
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
  // Deliberately NOT gated on a named account. /spar gives guests two live
  // rounds (2026-08-19) and spar-pair stamps those pairs like any other, so
  // refusing an anonymous uid here would open their room with no strike beat
  // at all: exactly the silent skip this whole move was made to delete, just
  // keyed on account type instead of entry surface. Found by tracing a real
  // stamped pair on 2026-08-26 where one side was an anonymous guest.
  //
  // Minting anonymous uids is free, so the authorisation is not WHO you are,
  // it is whether you are one of the two uids the SERVER wrote into the
  // stamp. That check is below and it is per-round, which is stronger here
  // than an account-type test: a named stranger has no more claim on this
  // draft than an anonymous one.
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
        draft = createDraft(
          String(st.seed || room),
          String(st.format || ''),
          uids[0],
          uids[1],
          st.draftConfig || {},
        );
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

      if (action === 'offer') {
        // One act, two beats: putting your motion up as the offerer, and
        // putting your counter up as the responder. The pure layer decides
        // which of the two this caller is entitled to.
        const poolId = String((body && body.poolId) || '');
        let input = { poolId };
        if (!poolId) {
          const text = String((body && body.text) || '').replace(/\s+/g, ' ').trim().slice(0, MOTION_MAX + 1);
          // The site motion boundary applies before anything is stored. A
          // hand-written motion is the one place a heavy subject can enter
          // a round that every seeded bank already refuses.
          const guard = checkContent({ text, kind: 'motion' });
          if (!guard.ok) return { ok: false, reason: 'blocked', message: guard.reason || 'Pick a different motion.' };
          input = { text };
        }
        const res = applyOffer(draft, uid, input);
        if (!res.ok) return { ok: false, reason: res.reason };
        draft = advance(res.draft);
      } else if (action === 'respond') {
        const res = applyResponse(draft, uid, body && body.choice);
        if (!res.ok) return { ok: false, reason: res.reason };
        draft = advance(res.draft);
      } else if (action === 'motion') {
        const res = applyMotionPick(draft, uid, body && body.motionId);
        if (!res.ok) return { ok: false, reason: res.reason };
        draft = advance(res.draft);
      } else if (action === 'side') {
        const res = applySidePick(draft, uid, body && body.side);
        if (!res.ok) return { ok: false, reason: res.reason };
        draft = advance(res.draft);
      } else if (action === 'expire') {
        const elapsed = Date.now() - (phaseAt || 0);
        if (!stale && phaseAt && elapsed < (phaseMs(draft.phase) - EXPIRE_GRACE_MS)) {
          return { ok: false, reason: 'too_early' };
        }
        // Before the responder has answered, exactly ONE person has moved,
        // so resolving the beat for the other is how a room opens onto an
        // empty chair. Only the debater whose own clock ran out may expire
        // those two beats; a silent peer unwinds through the ghost path.
        // A stale draft is the exception: a room stuck forever on a dead
        // beat is worse than a resolution nobody watched.
        if (!stale && !eitherMayExpire(draft) && String(actorFor(draft)) !== uid) {
          return { ok: false, reason: 'not_your_clock' };
        }
        draft = advance(autoResolve(draft));
        // A stale draft runs itself out to the end rather than handing the
        // next caller another dead beat to expire.
        if (stale) {
          for (let i = 0; i < PHASES_MAX && draft.phase !== 'done'; i++) {
            draft = advance(autoResolve(draft));
          }
        }
      } else {
        return { ok: false, reason: 'bad_action' };
      }

      const phaseMoved = draft.phase !== before || !phaseAt;
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

      return { ok: true, draft: publicDraft(draft, phaseAt) };
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
