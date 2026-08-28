import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';
import { pairDropIn, availableForDropIn } from './lib/tournament.mjs';
import { tournamentRoomSetup } from './lib/tournament-motion-pool.mjs';

// ── Drop-in pairing: the queue that turns "turn up whenever" into a round ──
//
// POST /api/tournament/dropin
//   { action: 'ready',  t }   join the pool
//   { action: 'leave',  t }   leave it
//   { action: 'poll',   t }   where am I, and pair the pool if it can be paired
//
// `lib/tournament.mjs` has had `pairDropIn` and its 1045-assertion test
// harness since 2026-07-28 and NOTHING HAS EVER CALLED IT. /tournaments
// promised "turn up whenever, get paired, play as many rounds as you
// like" while the only engine wired to a button paired a whole field
// per synchronous round. This file is the missing half: a queue a
// person can actually stand in, a server loop that seats them, and a
// room that opens on two people who are both there.
//
// ── The slot is a deadline, NOT a heartbeat, and this is load-bearing ──
//
// `availableAt` is the single field the engine reads, and it reads it
// for two different things: freshness (`availableForDropIn` drops a
// slot older than DROPIN_AVAILABLE_MS, 6 min) and accrued waiting time
// (`pairDropIn` measures `now - availableAt` against
// DROPIN_REMATCH_PATIENCE_MS, 4 min, before it will seat a repeat
// matchup).
//
// So the obvious implementation, a 30-second heartbeat that keeps the
// slot warm, DEADLOCKS the other half: a slot refreshed every 30s never
// accrues 4 minutes of wait, so the patience gate never releases, and
// two entrants who have already met sit in the queue forever while the
// screen says "searching". That is the same deadlock the clamp in the
// library warns about, reached from the opposite direction, and the
// clamp does not catch it.
//
// Therefore: `availableAt` is written ONCE when you say you are ready
// and is never refreshed while you wait. Six minutes later the slot
// expires and you drop out of the pool until you say so again.
//
// That expiry is also the presence check, which is the point. The
// 2026-08-11 measurement found 390 of 411 rounds never completed a
// speech because rooms opened onto empty chairs. A tab nobody is
// sitting at cannot re-arm an expired slot, so it stops being paired
// within six minutes instead of being seated against someone who
// actually showed up.

const READY_TTL_MS = 6 * 60 * 1000;   // mirrors DROPIN_AVAILABLE_MS in the lib
// This is an operator launch gate, separate from the tournament status. A
// host can move the event to `running` to start the admin broadcast without
// unleashing public pairings. It defaults closed and must be enabled
// explicitly in the environment when the product is ready.
const PUBLIC_PAIRING_ENABLED = process.env.TOURNAMENT_PUBLIC_PAIRING_ENABLED === '1';
// A matcher pass is cheap but not free (it reads every entry), and N
// waiting clients all poll. One attempt per this interval per
// tournament is plenty: the pool only changes when someone arrives or
// a round ends, and both of those are minutes apart, not milliseconds.
const MATCH_THROTTLE_MS = 2500;
const POLL_MIN_MS = 3000;             // per-caller floor, so a hot loop cannot spin the matcher

// ── Queue tuning, and why it cannot stay hardcoded ──────────────────
//
// Two numbers govern how the queue feels, and BOTH were sized for a
// long format. Neither assumption survives a drop-in day:
//
//   windowMs   how long a ready slot lives before it goes stale. It is
//              also the presence check, so it wants to be about one
//              round long: long enough that a real person waiting is
//              not dropped, short enough that a closed laptop is.
//
//   patienceMs how long the engine holds out for a rematch-free draw
//              before seating a repeat.
//
// The patience default is 4 minutes, which is most of a 5-minute round
// spent looking at a spinner. Worse, the hold is ALL-OR-NOTHING and
// across the field: `pairDropIn` looks for a rematch-free perfect matching
// over the whole pool, and if one does not exist it returns ZERO
// pairings, so a single unavoidable repeat freezes every other pair too.
//
// That is a corner case in a 40-person field and the normal case in a
// small one. A field of N people has only N-1 fresh opponents each.
// Past that point every single pass hits the hold, and at four minutes
// the field spends more of the hour held than debating.
//
// A repeat matchup is also a much smaller cost in a short format than
// in a long one: it is five minutes on a different motion, not half an
// hour. So the shorter the round, the less patience is worth.
//
// Both are read off the tournament document so a director can turn
// them on the day without a deploy, which is the right instrument for
// a live event. Absent an override the defaults are exactly the old
// values, so nothing that exists today changes behaviour.
const DEFAULT_WINDOW_MS = READY_TTL_MS;
const DEFAULT_PATIENCE_MS = 4 * 60 * 1000;

function queueTuning(tData) {
  const d = tData || {};
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  // Floor the window at 2 minutes. Below that a real person reading a
  // ballot between rounds would age out of a queue they are standing
  // in, which is the opposite of the presence check's job.
  const windowMs = Math.max(2 * 60 * 1000, num(d.dropinWindowMs, DEFAULT_WINDOW_MS));
  // Patience is clamped to windowMs - 60s inside the library as well;
  // clamping here too keeps the number this file reports and the number
  // the engine acts on identical, rather than merely compatible.
  const patienceMs = Math.max(0, Math.min(
    num(d.dropinPatienceMs, DEFAULT_PATIENCE_MS),
    windowMs - 60 * 1000,
  ));
  return { windowMs, patienceMs };
}

function roomFor(tid, key, index) {
  // Same derivation as tournament-admin's, deliberately: a room id is
  // reproducible from the pairing rather than random, so a reload hands
  // out the link that was already handed out.
  return 'Debatable-' + String(tid).slice(0, 12) + '-' + key + '-' + (index + 1);
}

async function resolveTournament(db, slugOrId) {
  const key = String(slugOrId || '').trim();
  if (!key) return null;
  const direct = await db.collection('tournaments').doc(key).get();
  if (direct.exists) return { id: direct.id, ref: direct.ref, data: direct.data() };
  const bySlug = await db.collection('tournaments').where('slug', '==', key).limit(1).get();
  if (bySlug.empty) return null;
  const d = bySlug.docs[0];
  return { id: d.id, ref: d.ref, data: d.data() };
}

function myEntryFrom(snap, uid) {
  for (const doc of snap.docs) {
    const members = doc.data().members;
    if (Array.isArray(members) && members.includes(uid)) return doc;
  }
  return null;
}

// What the caller needs to render: am I queued, am I seated, who with,
// and which room. Derived from the entry doc so there is one source of
// truth rather than a status field that can disagree with it.
function selfState(entryDoc, now, pairingDoc, windowMs) {
  const d = entryDoc.data();
  const availableAt = Number(d.availableAt || 0);
  // The window is passed in rather than read from the constant, because
  // a tournament can tune it (see queueTuning) and a slot reported as
  // live here while the engine treats it as stale is a queue that says
  // "you are next" to somebody it will never seat.
  const w = Number(windowMs) > 0 ? Number(windowMs) : READY_TTL_MS;
  const fresh = availableAt > 0 && now - availableAt <= w;
  return {
    entryId: entryDoc.id,
    name: d.name || 'Entry',
    wins: Number(d.wins || 0),
    losses: Number(d.losses || 0),
    inPairing: d.inPairing || '',
    queued: fresh && !d.inPairing,
    // An expired slot is reported as expired rather than as "not
    // queued", because the two need different words on screen: one
    // asks you to join, the other asks whether you are still there.
    slotExpired: availableAt > 0 && !d.inPairing && !fresh,
    waitingMs: fresh ? Math.max(0, now - availableAt) : 0,
    expiresInMs: fresh ? Math.max(0, w - (now - availableAt)) : 0,
    pairing: pairingDoc || null,
  };
}

// The pairing a seated entrant is in, read back off the round doc its
// id points at. `inPairing` holds 'd{seq}-{n}', and the doc key is the
// part before the dash.
async function loadPairing(tRef, inPairing) {
  if (!inPairing) return null;
  const key = String(inPairing).split('-')[0];
  if (!key) return null;
  const snap = await tRef.collection('rounds').doc(key).get();
  if (!snap.exists) return null;
  const p = (snap.data().pairings || []).find((x) => x.pairingId === inPairing);
  return p || null;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  if (!PUBLIC_PAIRING_ENABLED) {
    return errorResponse('Public tournament pairing is paused. Watch the admin stream.', 409, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to join the queue.', 401, request);
  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch {
    return errorResponse('Sign in to join the queue.', 401, request);
  }
  // Named accounts only. Anonymous accounts are free and unlimited to
  // mint (the 2026-07-28 rate-limit lesson), and an anonymous entrant
  // could fill the queue with throwaways that never arrive, which is
  // precisely the empty-chair failure this queue is built to avoid.
  if (decoded.firebase?.sign_in_provider === 'anonymous') {
    return errorResponse('Create an account to enter the queue.', 403, request);
  }
  // `sub` is the ID token's own name for the subject. See lib/auth.mjs.
  const myUid = decoded.sub;

  let body;
  try { body = await request.json(); } catch { return errorResponse('Bad request', 400, request); }
  const action = String(body?.action || '').trim();
  if (!['ready', 'leave', 'poll'].includes(action)) {
    return errorResponse('Unknown action.', 400, request);
  }

  const db = getDb();
  const t = await resolveTournament(db, body?.t);
  if (!t) return errorResponse('Tournament not found.', 404, request);
  if (t.data.dropIn === false) {
    return errorResponse('This tournament does not run drop-in rounds.', 409, request);
  }
  // 'running' ONLY, and this is a correctness gate rather than a
  // preference. A drop-in round writes wins, losses and speaks onto the
  // entry docs that the standings and therefore the prize bracket are
  // computed from. Allowing the queue during 'registration' — which the
  // first version of this file did, while the live $500 tournament sat
  // in exactly that status — would have let entrants bank results
  // against the board days before the doors opened. The host flipping
  // the tournament to running IS the doors opening; there is no second
  // switch to invent.
  if ((t.data.status || '') !== 'running') {
    return errorResponse('The queue opens when the tournament starts.', 409, request);
  }

  const entriesRef = t.ref.collection('entries');
  const now = Date.now();
  const tuning = queueTuning(t.data);

  const allEntries = await entriesRef.get();
  const mine = myEntryFrom(allEntries, myUid);
  if (!mine) return errorResponse('Register for this tournament first.', 409, request);
  if ((mine.data().status || 'registered') === 'withdrawn') {
    return errorResponse('This entry has withdrawn.', 409, request);
  }

  if (action === 'leave') {
    await mine.ref.update({ availableAt: 0 });
    return jsonResponse({ ok: true, self: selfState(await mine.ref.get(), now, null, tuning.windowMs) }, 200, request);
  }

  if (action === 'ready') {
    // Already seated? Say so rather than queueing someone into two
    // rooms. This is the same class of guard as the spar queue's
    // inPairing check and it is the one that keeps a person from
    // owing two opponents a round at once.
    if (mine.data().inPairing) {
      const pairing = await loadPairing(t.ref, mine.data().inPairing);
      return jsonResponse({ ok: true, already: true, self: selfState(mine, now, pairing, tuning.windowMs) }, 200, request);
    }
    // Written once, never refreshed while waiting. See the header.
    await mine.ref.update({ availableAt: now, readyAt: FieldValue.serverTimestamp() });
    const after = await mine.ref.get();
    return jsonResponse({ ok: true, self: selfState(after, now, null, tuning.windowMs) }, 200, request);
  }

  // ── poll ─────────────────────────────────────────────────────────
  //
  // Every waiting client calls this. It does two things: reports where
  // the caller stands, and, at most once per MATCH_THROTTLE_MS for the
  // whole tournament, tries to seat the pool.

  const lastPoll = Number(mine.data().lastPollAt || 0);
  const spinning = now - lastPoll < POLL_MIN_MS;

  const lastMatch = Number(t.data.dropinAt || 0);
  let matched = null;

  if (!spinning && now - lastMatch >= MATCH_THROTTLE_MS) {
    matched = await attemptPairing(db, t, now, tuning);
  }

  const fresh = await mine.ref.get();
  if (!spinning) await mine.ref.update({ lastPollAt: now }).catch(() => {});
  const pairing = await loadPairing(t.ref, fresh.data().inPairing);
  const pool = availableForDropIn(
    allEntries.docs.map((d) => ({ entryId: d.id, ...d.data() })),
    now,
    tuning.windowMs,
  );

  return jsonResponse({
    ok: true,
    self: selfState(fresh, now, pairing, tuning.windowMs),
    // Honest queue texture: how many people could be paired right now,
    // and whether the engine deliberately held rather than seating a
    // repeat. A spinner that says nothing is why a slow queue reads as
    // a broken one.
    poolSize: pool.length,
    held: matched?.heldForFreshOpponent === true,
    seated: matched?.seated || 0,
  }, 200, request);
};

// One transaction: read every entry, ask the engine who should play,
// write the pairings and mark both sides seated. It has to be atomic
// or two concurrent polls seat the same person twice, which is the
// four-way-write failure duo-pair was rebuilt to avoid.
async function attemptPairing(db, t, now, tuning) {
  try {
    return await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(t.ref);
      const tData = tSnap.data() || {};
      // Re-check inside the transaction: two polls that both passed the
      // cheap pre-check outside it arrive here together, and only one
      // should run the matcher.
      if (now - Number(tData.dropinAt || 0) < MATCH_THROTTLE_MS) return { seated: 0 };

      const snap = await tx.get(t.ref.collection('entries'));
      const entries = snap.docs.map((d) => ({ entryId: d.id, ...d.data() }));
      const entriesById = new Map(entries.map((e) => [String(e.entryId), e]));

      const seq = Number(tData.dropinSeq || 0) + 1;
      const draw = pairDropIn(entries, {
        tid: t.id,
        seq,
        now,
        windowMs: tuning.windowMs,
        rematchPatienceMs: tuning.patienceMs,
      });

      // Stamp the attempt even when nothing seats, so a quiet pool does
      // not have every waiting client re-running the matcher.
      tx.update(t.ref, { dropinAt: now });
      if (!draw.pairings.length) {
        return { seated: 0, heldForFreshOpponent: draw.heldForFreshOpponent === true };
      }

      const key = 'd' + seq;
      const pairings = draw.pairings.map((p, i) => ({ ...p, room: roomFor(t.id, key, i) }));

      tx.set(t.ref.collection('rounds').doc(key), {
        kind: 'dropin',
        // `roundNo` carries the sequence for a drop-in round. The
        // director's report-result action uses it to find this document.
        roundNo: seq,
        // A drop-in round is released by construction. The two people
        // are seated the instant this document is written.
        status: 'released',
        seq,
        key,
        label: 'Drop-in',
        seed: draw.seed,
        pairings,
        rematches: draw.rematches,
        pullUps: draw.pullUps,
        rematchFallback: draw.rematchFallback,
        createdAt: FieldValue.serverTimestamp(),
      });

      for (const p of pairings) {
        const setup = tournamentRoomSetup(
          t.id,
          tData,
          p,
          entriesById,
          t.id + '|' + key + '|' + p.pairingId,
        );
        if (setup) {
          tx.set(db.collection('room_admissions').doc(p.room), {
            ...setup.admission,
            createdAt: FieldValue.serverTimestamp(),
          });
          if (setup.draft) {
            tx.set(db.collection('round_drafts').doc(p.room), {
              ...setup.draft,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        }
        // Clearing availableAt as they are seated is what keeps a
        // player out of the next pass while they are mid-round; the
        // result handler is what puts them back in the pool.
        tx.update(t.ref.collection('entries').doc(p.govEntry), { inPairing: p.pairingId, availableAt: 0 });
        tx.update(t.ref.collection('entries').doc(p.oppEntry), { inPairing: p.pairingId, availableAt: 0 });
      }

      tx.update(t.ref, { dropinSeq: seq });
      return { seated: pairings.length, heldForFreshOpponent: false };
    });
  } catch (err) {
    // A contended transaction is normal here and must never surface as
    // a failed poll: the caller's own state is still correct, and the
    // next poll will try again.
    return { seated: 0, error: String(err?.message || err).slice(0, 120) };
  }
}

export const config = { path: '/api/tournament/dropin' };
