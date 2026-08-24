import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';
import { pairDropIn, availableForDropIn } from './lib/tournament.mjs';
import { AGE_BRACKETS, BRACKET_LABEL, bracketOf, partitionByBracket } from './lib/tournament-bracket.mjs';

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

// ── Two fields, one queue ────────────────────────────────────────────
//
// Under 18 and 18-plus are paired SEPARATELY (lib/tournament-bracket.mjs
// carries why). The matcher itself is untouched: it is 1045 assertions
// of seeded, rematch-avoiding, globally-optimal pairing and none of that
// wants a second axis bolted through it. Instead the pool is split
// before it is handed over and the matcher runs once per bracket, which
// makes the guarantee structural rather than a filter someone can later
// forget to apply.
//
// Each bracket's draw gets its OWN sequence number and therefore its own
// round document, because pairingId is 'd{seq}-{n}' and two draws
// sharing a seq would hand two different pairs the same id.
//
// An entry that has never said which bracket it is in is not paired at
// all. It is not a failure and is not reported as one: the queue asks.

const READY_TTL_MS = 6 * 60 * 1000;   // mirrors DROPIN_AVAILABLE_MS in the lib
// A matcher pass is cheap but not free (it reads every entry), and N
// waiting clients all poll. One attempt per this interval per
// tournament is plenty: the pool only changes when someone arrives or
// a round ends, and both of those are minutes apart, not milliseconds.
const MATCH_THROTTLE_MS = 2500;
const POLL_MIN_MS = 3000;             // per-caller floor, so a hot loop cannot spin the matcher

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
function selfState(entryDoc, now, pairingDoc) {
  const d = entryDoc.data();
  const availableAt = Number(d.availableAt || 0);
  const fresh = availableAt > 0 && now - availableAt <= READY_TTL_MS;
  const bracket = bracketOf(d);
  return {
    entryId: entryDoc.id,
    name: d.name || 'Entry',
    bracket,
    bracketLabel: BRACKET_LABEL[bracket] || '',
    // The one thing standing between this entry and a round. Reported
    // on every response so the page can ask the question in place
    // instead of showing a spinner that will never resolve.
    bracketRequired: !bracket,
    wins: Number(d.wins || 0),
    losses: Number(d.losses || 0),
    inPairing: d.inPairing || '',
    queued: fresh && !d.inPairing,
    // An expired slot is reported as expired rather than as "not
    // queued", because the two need different words on screen: one
    // asks you to join, the other asks whether you are still there.
    slotExpired: availableAt > 0 && !d.inPairing && !fresh,
    waitingMs: fresh ? Math.max(0, now - availableAt) : 0,
    expiresInMs: fresh ? Math.max(0, READY_TTL_MS - (now - availableAt)) : 0,
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

  const allEntries = await entriesRef.get();
  const mine = myEntryFrom(allEntries, myUid);
  if (!mine) return errorResponse('Register for this tournament first.', 409, request);
  if ((mine.data().status || 'registered') === 'withdrawn') {
    return errorResponse('This entry has withdrawn.', 409, request);
  }

  if (action === 'leave') {
    await mine.ref.update({ availableAt: 0 });
    return jsonResponse({ ok: true, self: selfState(await mine.ref.get(), now, null) }, 200, request);
  }

  if (action === 'ready') {
    // Already seated? Say so rather than queueing someone into two
    // rooms. This is the same class of guard as the spar queue's
    // inPairing check and it is the one that keeps a person from
    // owing two opponents a round at once.
    if (mine.data().inPairing) {
      const pairing = await loadPairing(t.ref, mine.data().inPairing);
      return jsonResponse({ ok: true, already: true, self: selfState(mine, now, pairing) }, 200, request);
    }
    // No bracket, no queue. Silently pairing an unanswered entry would
    // mean guessing an age, and both guesses are wrong in a way that
    // matters: one seats a minor against adult strangers, the other
    // seats an adult against children.
    if (!bracketOf(mine.data())) {
      return jsonResponse({
        error: 'BRACKET_REQUIRED',
        message: 'Tell us whether you are 18 or over before you join the queue. Under 18 and 18-plus debate in separate brackets.',
        self: selfState(mine, now, null),
      }, 409, request);
    }
    // Written once, never refreshed while waiting. See the header.
    await mine.ref.update({ availableAt: now, readyAt: FieldValue.serverTimestamp() });
    const after = await mine.ref.get();
    return jsonResponse({ ok: true, self: selfState(after, now, null) }, 200, request);
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
    matched = await attemptPairing(db, t, now);
  }

  const fresh = await mine.ref.get();
  if (!spinning) await mine.ref.update({ lastPollAt: now }).catch(() => {});
  const pairing = await loadPairing(t.ref, fresh.data().inPairing);
  // Pool size is reported for the CALLER'S OWN bracket. The whole
  // field's number would be a lie by omission on the exact screen where
  // it matters: "6 people waiting" while every one of them is in the
  // other bracket is how a queue reads as broken.
  const myBracket = bracketOf(fresh.data());
  const pool = availableForDropIn(
    allEntries.docs
      .map((d) => ({ entryId: d.id, ...d.data() }))
      .filter((e) => bracketOf(e) === myBracket),
    now,
  );

  return jsonResponse({
    ok: true,
    self: selfState(fresh, now, pairing),
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
async function attemptPairing(db, t, now) {
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

      const pools = partitionByBracket(entries);
      const startSeq = Number(tData.dropinSeq || 0);
      let seq = startSeq;
      let seated = 0;
      let held = false;

      // Stamp the attempt even when nothing seats, so a quiet pool does
      // not have every waiting client re-running the matcher.
      tx.update(t.ref, { dropinAt: now });

      // One draw per bracket, each with its own sequence number so the
      // pairing ids they mint ('d{seq}-{n}') cannot collide.
      for (const bracket of AGE_BRACKETS) {
        const pool = pools[bracket] || [];
        if (pool.length < 2) continue;

        const trySeq = seq + 1;
        // The bracket is namespaced into the seed input rather than
        // into `seq`, so each field's draw is independently
        // reproducible from the record when somebody asks why they hit
        // the same opponent twice.
        const draw = pairDropIn(pool, { tid: t.id + '#' + bracket, seq: trySeq, now });
        held = held || draw.heldForFreshOpponent === true;
        if (!draw.pairings.length) continue;

        seq = trySeq;
        const key = 'd' + seq;
        const pairings = draw.pairings.map((p, i) => ({ ...p, room: roomFor(t.id, key, i), bracket }));

        tx.set(t.ref.collection('rounds').doc(key), {
          kind: 'dropin',
          // `roundNo` carries the SEQUENCE for a drop-in round, which is
          // the contract roundKey() in tournament-admin.mjs already
          // states: `if (kind === 'dropin') return 'd' + roundNo`. It was
          // written as 0 here, so the control room's report-result — which
          // sends the round's own roundNo — resolved every drop-in result
          // to a document named 'd0' that does not exist, and came back
          // no_round. The director's amend path is the human check on an
          // auto-posted verdict in a cash tournament, so it has to land.
          roundNo: seq,
          // A drop-in round is released by construction. The pending →
          // released gate exists so a director can look at a prelim draw
          // before anyone sees it and regenerate a bad one; there is no
          // such moment here, because the two people were seated the
          // instant this document was written and are already in the
          // room.
          status: 'released',
          seq,
          key,
          bracket,
          label: 'Drop-in · ' + (BRACKET_LABEL[bracket] || bracket),
          seed: draw.seed,
          pairings,
          rematches: draw.rematches,
          pullUps: draw.pullUps,
          rematchFallback: draw.rematchFallback,
          createdAt: FieldValue.serverTimestamp(),
        });

        for (const p of pairings) {
          // Clearing availableAt as they are seated is what keeps a
          // player out of the next pass while they are mid-round; the
          // result handler is what puts them back in the pool.
          tx.update(t.ref.collection('entries').doc(p.govEntry), { inPairing: p.pairingId, availableAt: 0 });
          tx.update(t.ref.collection('entries').doc(p.oppEntry), { inPairing: p.pairingId, availableAt: 0 });
        }
        seated += pairings.length;
      }

      if (seq !== startSeq) tx.update(t.ref, { dropinSeq: seq });
      return { seated, heldForFreshOpponent: seated === 0 && held };
    });
  } catch (err) {
    // A contended transaction is normal here and must never surface as
    // a failed poll: the caller's own state is still correct, and the
    // next poll will try again.
    return { seated: 0, error: String(err?.message || err).slice(0, 120) };
  }
}

export const config = { path: '/api/tournament/dropin' };
