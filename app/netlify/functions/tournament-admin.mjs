import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';
import {
  pairPrelimRound, standings, breakField, elimPairings, elimLabel,
  advanceElim, resultPatch, byePatch,
} from './lib/tournament.mjs';

// ── Tournament control room ────────────────────────────────────────
//
// Everything a director does between "we're running a tournament" and
// "here is the champion": create it, open and close registration,
// generate each draw, release it, take results, break to elims, and
// close the books.
//
// Authority is two-tier. Site admins can touch any tournament; the
// HOST of a tournament can run their own and nothing else. That split
// is what makes hosting available to a coach without handing them the
// rest of the platform.
//
// ── Storage shape, and why ─────────────────────────────────────────
//
//   tournaments/{tid}                    the tournament
//   tournaments/{tid}/entries/{entryId}  one per team (or solo debater)
//   tournaments/{tid}/rounds/{roundKey}  one per round, PAIRINGS INLINE
//
// Pairings live as an array on the round document rather than as
// their own collection. A round is at most a couple of dozen
// pairings, so the whole draw fits comfortably in one document, and
// every surface that shows a draw (the public page, the director's
// sheet, a participant checking which room they are in) then costs
// ONE read instead of one per pairing. The read cost of a tournament
// page is the thing that scales with spectators, and the 2026-07-28
// load audit is the standing evidence that a quadratic read pattern
// on a live surface is the failure that actually shows up at venue
// scale.
//
// The trade is that reporting a result rewrites the round document.
// Results arrive one at a time from one director, so contention is
// not a real concern; the write runs in a transaction anyway.
//
// ── What this does NOT do yet ──────────────────────────────────────
//
// Results are entered by the director. The AI judge already writes a
// ballot at the end of every /live-round, so the obvious next step is
// for a tournament round to post its own result back here and have
// the director confirm rather than type. That wants the ballot to
// carry the tournament and pairing ids through the round doc, and it
// wants a human confirmation step regardless, because a tab that
// silently accepts machine results has no answer when one is
// contested. Deliberately left for after a real tournament has run.

const VALID_FORMATS = new Set([
  'quick', 'blitz', 'apda', 'bp', 'worlds', 'asian', 'ld', 'pf', 'policy', 'congress',
]);

const NAME_MAX = 80;
const DESC_MAX = 600;
const MOTION_MAX = 280;

function cleanText(s, max) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'tournament';
}

function roundKey(kind, roundNo) {
  // 'd' is drop-in, and its number is the pairing SEQUENCE rather than
  // a round number: drop-in play has no rounds, so each seating gets
  // its own doc. Sharing this function is what lets recordResult below
  // report a drop-in result through the same path as a paired round.
  if (kind === 'dropin') return 'd' + roundNo;
  return (kind === 'elim' ? 'e' : 'r') + roundNo;
}

// Room ids are derived, never random, so a director who reloads the
// page mid-round hands out the same link they handed out before.
function roomFor(tid, key, index) {
  return 'Debatable-' + String(tid).slice(0, 12) + '-' + key + '-' + (index + 1);
}

async function loadTournament(db, tid) {
  const ref = db.collection('tournaments').doc(tid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { ref, data: snap.data() };
}

async function loadEntries(db, tid) {
  const snap = await db.collection('tournaments').doc(tid).collection('entries').get();
  return snap.docs.map((d) => ({ entryId: d.id, ...d.data() }));
}

// ── Seating: a paired entry is not in the drop-in queue ────────────
//
// `inPairing` is what stops one person owing two opponents a round at
// once. Until 2026-08-26 ONLY the drop-in queue wrote it, and only
// report-result cleared it, so the two engines were blind to each
// other: a debater the director had just paired into Round 1 could
// press "ready" and be seated a second time, in a second room, against
// a different opponent. Both rooms auto-post a result, so one entrant
// banks two results for the same slot and their off-draw opponent gets
// a result that appears in no released draw.
//
// It is not a hypothetical race. `release-round` sets the tournament to
// `running`, and `running` is the exact status that opens the queue, so
// publishing a synchronous draw is what opens the door.
//
// So every draw now seats its entries and every redraw releases the one
// it replaced. report-result already clears `inPairing` unconditionally
// (and says why), so a finished round hands people back either way.
//
// Cheap by construction: one batch over at most a few dozen entries,
// and the pairing ids are already the value the queue's loadPairing
// parses ('r1-1' splits to the round key 'r1', same as 'd7-1').
async function applySeating(db, tid, pairings, prevPairings) {
  const entriesRef = db.collection('tournaments').doc(tid).collection('entries');
  const seated = new Map();
  for (const p of pairings || []) {
    if (p.govEntry) seated.set(p.govEntry, p.pairingId || '');
    if (p.oppEntry) seated.set(p.oppEntry, p.pairingId || '');
  }
  // A redraw must release anyone the new draw does not seat, or the
  // discarded draw locks them out of the queue with a pairing id that
  // no longer resolves.
  const released = [];
  for (const p of prevPairings || []) {
    for (const id of [p.govEntry, p.oppEntry]) {
      if (id && !seated.has(id)) released.push(id);
    }
  }
  if (!seated.size && !released.length) return;
  const batch = db.batch();
  for (const [id, pairingId] of seated) batch.update(entriesRef.doc(id), { inPairing: pairingId });
  for (const id of new Set(released)) batch.update(entriesRef.doc(id), { inPairing: '' });
  await batch.commit();
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
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }
  const myUid = decoded.sub;
  const myEmail = String(decoded.email || '');
  const siteAdmin = isAdminEmail(myEmail) || myUid === process.env.ADMIN_UID;

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const action = String(body?.action || '').trim();
  const db = getDb();

  // ── create ──────────────────────────────────────────────────────
  // Open to any signed-in user: hosting is the point, and a
  // tournament nobody registers for costs nothing. Public listing is
  // a separate flag that only a site admin can raise, so an untested
  // host can run a real event without it appearing on the front page
  // before anyone has checked it.
  if (action === 'create') {
    const name = cleanText(body?.name, NAME_MAX);
    if (!name) return errorResponse('Give the tournament a name.', 400, request);
    const format = String(body?.format || 'apda').toLowerCase();
    if (!VALID_FORMATS.has(format)) return errorResponse('Unknown format', 400, request);

    const teamSize = Number(body?.teamSize) === 2 ? 2 : 1;
    const prelimRounds = Math.max(1, Math.min(9, Number(body?.prelimRounds) || 4));
    const breakSize = Math.max(0, Math.min(32, Number(body?.breakSize) || 4));

    // Slug collisions get a numeric suffix rather than an error; a
    // host naming their event the same thing as last season is normal.
    const base = slugify(name);
    let slug = base;
    for (let i = 2; i <= 20; i += 1) {
      const taken = await db.collection('tournaments').where('slug', '==', slug).limit(1).get();
      if (taken.empty) break;
      slug = base + '-' + i;
    }

    const ref = db.collection('tournaments').doc();
    await ref.set({
      slug,
      name,
      format,
      teamSize,
      prelimRounds,
      breakSize,
      description: cleanText(body?.description, DESC_MAX),
      startsAt: cleanText(body?.startsAt, 40),
      hostUid: myUid,
      hostName: cleanText(decoded.name || decoded.email || 'Host', NAME_MAX),
      status: 'draft',
      currentRound: 0,
      isPublic: false,
      entryCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return jsonResponse({ ok: true, tid: ref.id, slug }, 200, request);
  }

  // Every remaining action targets one tournament.
  const tid = String(body?.tid || '').trim();
  if (!tid) return errorResponse('Missing tid', 400, request);
  const t = await loadTournament(db, tid);
  if (!t) return errorResponse('No such tournament', 404, request);
  const isHost = t.data.hostUid === myUid;
  if (!isHost && !siteAdmin) return errorResponse('Only the host can run this tournament.', 403, request);

  // ── update ──────────────────────────────────────────────────────
  if (action === 'update') {
    const patch = { updatedAt: FieldValue.serverTimestamp() };
    if (body.name != null) patch.name = cleanText(body.name, NAME_MAX) || t.data.name;
    if (body.description != null) patch.description = cleanText(body.description, DESC_MAX);
    if (body.startsAt != null) patch.startsAt = cleanText(body.startsAt, 40);
    if (body.format != null && VALID_FORMATS.has(String(body.format).toLowerCase())) {
      patch.format = String(body.format).toLowerCase();
    }
    if (body.prelimRounds != null) patch.prelimRounds = Math.max(1, Math.min(9, Number(body.prelimRounds) || 4));
    if (body.breakSize != null) patch.breakSize = Math.max(0, Math.min(32, Number(body.breakSize) || 0));
    // Only a site admin can put a tournament on the public list.
    if (body.isPublic != null && siteAdmin) patch.isPublic = !!body.isPublic;
    // The entry fee is data, not code (see entry-checkout.mjs), but until
    // now nothing could write it, so changing a price meant a raw
    // Firestore edit. Site-admin only, and clamped: 0 turns the paid door
    // off entirely, and the ceiling stops a fat finger from turning a $5
    // door into a $500 one. Never touches prizePoolCents, which the
    // webhook owns.
    if (body.entryFeeCents != null && siteAdmin) {
      patch.entryFeeCents = Math.max(0, Math.min(50000, Math.round(Number(body.entryFeeCents) || 0)));
    }
    // Whether the drop-in queue runs at all. Nothing could write this
    // before 2026-08-26, so a director who wanted a SYNCHRONOUS day —
    // one draw, every room starting together, a real gap between rounds
    // to talk into — had no way to close the queue except a raw
    // Firestore edit. The two models want opposite things from the same
    // field and the choice belongs to whoever is running the day.
    if (body.dropIn != null && siteAdmin) patch.dropIn = !!body.dropIn;
    // ── Drop-in queue tuning (see queueTuning in tournament-dropin.mjs) ──
    //
    // Both defaults were sized for a long format on one undivided
    // field, and a short-format drop-in day is neither. The rematch
    // hold in particular is all-or-nothing per bracket, so on a small
    // bracket that has run out of fresh opponents it stalls EVERY pair
    // for its full duration. These are the dial for that, and they are
    // here rather than in code because the moment you need to turn one
    // is the middle of a live event.
    //
    // Clamped at both ends: a window under 2 minutes ages out a person
    // reading their ballot, and one over 30 keeps pairing a closed
    // laptop. Patience above the window is meaningless (the engine
    // clamps it to window - 60s anyway).
    if (body.dropinWindowMs != null) {
      patch.dropinWindowMs = Math.max(120000, Math.min(1800000, Math.round(Number(body.dropinWindowMs) || 0)));
    }
    if (body.dropinPatienceMs != null) {
      patch.dropinPatienceMs = Math.max(0, Math.min(1800000, Math.round(Number(body.dropinPatienceMs) || 0)));
    }
    // Changing team size after entries exist would invalidate every
    // registration, so it is settled at creation.
    await t.ref.update(patch);
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── status transitions ──────────────────────────────────────────
  if (action === 'set-status') {
    const next = String(body?.status || '').trim();
    const allowed = new Set(['draft', 'registration', 'running', 'break', 'elims', 'complete', 'cancelled']);
    if (!allowed.has(next)) return errorResponse('Unknown status', 400, request);
    await t.ref.update({ status: next, updatedAt: FieldValue.serverTimestamp() });
    return jsonResponse({ ok: true, status: next }, 200, request);
  }

  // ── pair-round ──────────────────────────────────────────────────
  // Generate the next prelim draw. Written as 'pending' so the
  // director can look at it before anyone else can: a draw is not
  // real until it is released, and being able to regenerate one that
  // came out badly (a broken bracket, a missing team who just showed
  // up) without anyone having seen it is the difference between a tab
  // and a spreadsheet.
  if (action === 'pair-round') {
    const all = await loadEntries(db, tid);
    // Check-in gates the draw. The page tells every registrant "check
    // in or you will be left out of the draw," and until 2026-08-10
    // the engine quietly paired 'registered' entries anyway, which is
    // how a director ends up debating empty rooms. When at least two
    // entries have checked in, only checked-in entries are paired;
    // a tournament whose director skipped check-in entirely (zero
    // checked in) still pairs everyone, so the old workflow keeps
    // working. Pass includeUnchecked to override for one draw.
    const checkedIn = all.filter((e) => String(e.status || '') === 'checked_in');
    const gateOnCheckIn = checkedIn.length >= 2 && !body?.includeUnchecked;
    const entries = gateOnCheckIn ? checkedIn : all;
    const leftOut = gateOnCheckIn
      ? all.filter((e) => String(e.status || 'registered') === 'registered').length
      : 0;
    const roundNo = Number(body?.roundNo) || (Number(t.data.currentRound) || 0) + 1;
    if (roundNo > Number(t.data.prelimRounds || 4)) {
      return errorResponse('That is past the last prelim round. Break to elims instead.', 400, request);
    }
    const key = roundKey('prelim', roundNo);
    const roundRef = t.ref.collection('rounds').doc(key);
    const existing = await roundRef.get();
    if (existing.exists && existing.data().status !== 'pending' && !body?.force) {
      return errorResponse('Round ' + roundNo + ' is already released. Pass force to redraw it.', 409, request);
    }

    const draw = pairPrelimRound(entries, roundNo, {
      tid,
      // A redraw must differ from the draw it replaces, or "regenerate"
      // silently does nothing and looks broken.
      seed: body?.reseed ? Math.floor(Math.random() * 0xffffffff) : undefined,
    });
    if (draw.error) return errorResponse(draw.error, 400, request);

    const pairings = draw.pairings.map((p, i) => ({ ...p, room: roomFor(tid, key, i) }));
    await roundRef.set({
      roundNo,
      kind: 'prelim',
      label: 'Round ' + roundNo,
      motion: cleanText(body?.motion, MOTION_MAX),
      status: 'pending',
      pairings,
      bye: draw.bye || null,
      seed: draw.seed,
      pullUps: draw.pullUps || 0,
      rematches: draw.rematches || 0,
      searchExhausted: !!draw.searchExhausted,
      checkedInOnly: gateOnCheckIn,
      leftOut,
      pairedAt: FieldValue.serverTimestamp(),
    });
    // Seat the new draw and release whatever a redraw just discarded.
    await applySeating(db, tid, pairings, existing.exists ? (existing.data().pairings || []) : []);
    return jsonResponse({
      ok: true,
      round: { roundNo, key, pairings, bye: draw.bye || null,
        pullUps: draw.pullUps, rematches: draw.rematches,
        checkedInOnly: gateOnCheckIn, leftOut },
    }, 200, request);
  }

  // ── release-round ───────────────────────────────────────────────
  // Publish the draw and the motion. Participants see rooms only now.
  if (action === 'release-round') {
    const roundNo = Number(body?.roundNo) || Number(t.data.currentRound) || 1;
    const kind = String(body?.kind || 'prelim');
    const key = roundKey(kind, roundNo);
    const roundRef = t.ref.collection('rounds').doc(key);
    const snap = await roundRef.get();
    if (!snap.exists) return errorResponse('That round has not been paired yet.', 404, request);

    const patch = {
      status: 'released',
      releasedAt: FieldValue.serverTimestamp(),
    };
    if (body.motion != null) patch.motion = cleanText(body.motion, MOTION_MAX);
    await roundRef.update(patch);
    await t.ref.update({
      currentRound: roundNo,
      currentKind: kind,
      status: kind === 'elim' ? 'elims' : 'running',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── report-result ───────────────────────────────────────────────
  // One pairing's outcome. Folded into the entries' records in the
  // same transaction that marks the pairing complete, so a result can
  // never be counted twice by a double click or a retried request:
  // the pairing's own status is the guard.
  if (action === 'report-result') {
    const roundNo = Number(body?.roundNo);
    const kind = String(body?.kind || 'prelim');
    const pairingId = String(body?.pairingId || '');
    const winner = String(body?.winner || '');
    if (!['gov', 'opp'].includes(winner)) return errorResponse('Winner must be gov or opp.', 400, request);
    const govSpeaks = Number(body?.govSpeaks || 0);
    const oppSpeaks = Number(body?.oppSpeaks || 0);

    const key = roundKey(kind, roundNo);
    const roundRef = t.ref.collection('rounds').doc(key);

    try {
      const out = await db.runTransaction(async (tx) => {
        const rSnap = await tx.get(roundRef);
        if (!rSnap.exists) return { ok: false, reason: 'no_round' };
        const round = rSnap.data();
        const pairings = Array.isArray(round.pairings) ? round.pairings.slice() : [];
        const idx = pairings.findIndex((p) => p.pairingId === pairingId);
        if (idx === -1) return { ok: false, reason: 'no_pairing' };
        const p = pairings[idx];
        if (p.status === 'complete' && !body?.amend) return { ok: false, reason: 'already_reported' };

        const govRef = t.ref.collection('entries').doc(p.govEntry);
        const oppRef = t.ref.collection('entries').doc(p.oppEntry);
        const [govSnap, oppSnap] = await Promise.all([tx.get(govRef), tx.get(oppRef)]);
        if (!govSnap.exists || !oppSnap.exists) return { ok: false, reason: 'entry_missing' };

        // An amendment reverses the previous result before applying
        // the new one, so correcting a mistyped ballot doesn't leave
        // both teams credited with a win.
        let govBase = { entryId: p.govEntry, ...govSnap.data() };
        let oppBase = { entryId: p.oppEntry, ...oppSnap.data() };
        if (p.status === 'complete' && body?.amend) {
          govBase = reverseResult(govBase, p, 'gov');
          oppBase = reverseResult(oppBase, p, 'opp');
        }

        const govPatch = resultPatch(govBase, {
          won: winner === 'gov', speaks: govSpeaks, side: 'gov', opponentEntryId: p.oppEntry,
        });
        const oppPatch = resultPatch(oppBase, {
          won: winner === 'opp', speaks: oppSpeaks, side: 'opp', opponentEntryId: p.govEntry,
        });
        // A rematch would double an opponent id on an amend; keep the
        // list a set so head-to-head stays meaningful.
        govPatch.opponents = Array.from(new Set(govPatch.opponents));
        oppPatch.opponents = Array.from(new Set(oppPatch.opponents));

        // Releasing both sides back into the drop-in pool is the half
        // of the loop that makes "play as many rounds as you like"
        // true. Cleared unconditionally: on a paired round it is a
        // no-op, and leaving it set on a drop-in pairing would lock
        // that entrant out of the queue permanently the moment their
        // round ended. They are released to IDLE, not re-queued, so
        // rejoining stays a deliberate act by someone still at the
        // keyboard rather than an automatic re-entry that could seat a
        // person who has already walked away.
        govPatch.inPairing = '';
        oppPatch.inPairing = '';

        tx.update(govRef, govPatch);
        tx.update(oppRef, oppPatch);

        pairings[idx] = {
          ...p,
          status: 'complete',
          winner,
          govSpeaks,
          oppSpeaks,
          reportedBy: myUid,
        };
        tx.update(roundRef, { pairings });
        return { ok: true, eliminated: kind === 'elim' ? (winner === 'gov' ? p.oppEntry : p.govEntry) : null };
      });

      if (!out.ok) {
        const msg = {
          no_round: 'That round does not exist.',
          no_pairing: 'That pairing is not in this round.',
          already_reported: 'That result is already in. Pass amend to correct it.',
          entry_missing: 'One of those teams is no longer registered.',
        }[out.reason] || 'Could not record that result.';
        return errorResponse(msg, 409, request);
      }
      // Elim losers stop being active so they drop out of later draws.
      if (out.eliminated) {
        await t.ref.collection('entries').doc(out.eliminated)
          .update({ status: 'eliminated' }).catch(() => {});
      }
      return jsonResponse({ ok: true }, 200, request);
    } catch (err) {
      console.error('[tournament-admin] report-result:', err?.message || err);
      return errorResponse('Could not record that result.', 500, request);
    }
  }

  // ── record-bye ──────────────────────────────────────────────────
  if (action === 'record-bye') {
    const roundNo = Number(body?.roundNo);
    const key = roundKey('prelim', roundNo);
    const snap = await t.ref.collection('rounds').doc(key).get();
    if (!snap.exists || !snap.data().bye) return errorResponse('That round has no bye.', 404, request);
    const bye = snap.data().bye;
    if (snap.data().byeRecorded) return jsonResponse({ ok: true, already: true }, 200, request);
    const eRef = t.ref.collection('entries').doc(bye.entryId);
    const eSnap = await eRef.get();
    if (!eSnap.exists) return errorResponse('That team is no longer registered.', 404, request);
    await eRef.update(byePatch({ entryId: bye.entryId, ...eSnap.data() }));
    await t.ref.collection('rounds').doc(key).update({ byeRecorded: true });
    return jsonResponse({ ok: true }, 200, request);
  }

  // ── break ───────────────────────────────────────────────────────
  // Cut the field and build the first elim bracket.
  if (action === 'break') {
    const entries = await loadEntries(db, tid);
    const want = Number(body?.breakSize) || Number(t.data.breakSize) || 4;
    const br = breakField(entries, want);
    if (br.error) return errorResponse(br.error, 400, request);
    if (br.size < 2) return errorResponse('Not enough entries to run an elimination round.', 400, request);

    const label = elimLabel(br.size);
    const key = roundKey('elim', 1);
    const pairings = elimPairings(br.breaking, label, 1)
      .map((p, i) => ({ ...p, room: roomFor(tid, key, i) }));

    await t.ref.collection('rounds').doc(key).set({
      roundNo: 1,
      kind: 'elim',
      label,
      motion: cleanText(body?.motion, MOTION_MAX),
      status: 'pending',
      pairings,
      breaking: br.breaking,
      tieOnLine: !!br.tieOnLine,
      pairedAt: FieldValue.serverTimestamp(),
    });
    // Everyone who didn't break is done. Marking them explicitly is
    // what keeps them out of later elim draws and off the active list.
    const breakingIds = new Set(br.breaking.map((b) => b.entryId));
    const batch = db.batch();
    entries.forEach((e) => {
      if (!breakingIds.has(e.entryId) && e.status !== 'withdrawn') {
        batch.update(t.ref.collection('entries').doc(e.entryId), { status: 'eliminated' });
      }
    });
    await batch.commit();
    await applySeating(db, tid, pairings, []);
    await t.ref.update({ status: 'break', breakSize: br.size, updatedAt: FieldValue.serverTimestamp() });

    return jsonResponse({ ok: true, size: br.size, label, breaking: br.breaking, tieOnLine: !!br.tieOnLine }, 200, request);
  }

  // ── advance-elim ────────────────────────────────────────────────
  if (action === 'advance-elim') {
    const fromRound = Number(body?.roundNo) || 1;
    const fromKey = roundKey('elim', fromRound);
    const snap = await t.ref.collection('rounds').doc(fromKey).get();
    if (!snap.exists) return errorResponse('That elimination round does not exist.', 404, request);
    const pairings = snap.data().pairings || [];
    const undecided = pairings.filter((p) => p.status !== 'complete').length;
    if (undecided) return errorResponse(undecided + ' result(s) still outstanding in that round.', 409, request);

    const winners = advanceElim(pairings);
    if (winners.length <= 1) {
      await t.ref.update({
        status: 'complete',
        champion: winners[0] || null,
        completedAt: FieldValue.serverTimestamp(),
      });
      return jsonResponse({ ok: true, complete: true, champion: winners[0] || null }, 200, request);
    }

    const nextRound = fromRound + 1;
    const key = roundKey('elim', nextRound);
    const label = elimLabel(winners.length);
    const next = elimPairings(winners, label, nextRound)
      .map((p, i) => ({ ...p, room: roomFor(tid, key, i) }));
    await t.ref.collection('rounds').doc(key).set({
      roundNo: nextRound,
      kind: 'elim',
      label,
      motion: cleanText(body?.motion, MOTION_MAX),
      status: 'pending',
      pairings: next,
      pairedAt: FieldValue.serverTimestamp(),
    });
    await applySeating(db, tid, next, []);
    return jsonResponse({ ok: true, label, pairings: next }, 200, request);
  }

  // ── entry admin ─────────────────────────────────────────────────
  // A director needs to be able to drop a no-show and re-add a team
  // that turned up late, without the team having to do anything.
  if (action === 'set-entry-status') {
    const entryId = String(body?.entryId || '');
    const next = String(body?.status || '');
    const allowed = new Set(['registered', 'checked_in', 'withdrawn', 'dropped', 'eliminated']);
    if (!entryId || !allowed.has(next)) return errorResponse('Bad entry status', 400, request);
    await t.ref.collection('entries').doc(entryId).update({ status: next });
    return jsonResponse({ ok: true }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};

// Undo a previously applied result so an amendment doesn't double
// count. Mirrors resultPatch exactly; if one changes, so must this.
function reverseResult(entry, pairing, side) {
  const wasWinner = pairing.winner === side;
  const speaks = Number(side === 'gov' ? pairing.govSpeaks : pairing.oppSpeaks) || 0;
  const opponentId = side === 'gov' ? pairing.oppEntry : pairing.govEntry;
  return {
    ...entry,
    wins: Math.max(0, Number(entry.wins || 0) - (wasWinner ? 1 : 0)),
    losses: Math.max(0, Number(entry.losses || 0) - (wasWinner ? 0 : 1)),
    speaks: Math.max(0, Number(entry.speaks || 0) - speaks),
    sideCount: {
      gov: Math.max(0, Number(entry.sideCount?.gov || 0) - (side === 'gov' ? 1 : 0)),
      opp: Math.max(0, Number(entry.sideCount?.opp || 0) - (side === 'opp' ? 1 : 0)),
    },
    opponents: (Array.isArray(entry.opponents) ? entry.opponents : []).filter((o) => o !== opponentId),
  };
}

export const config = { path: '/api/tournament-admin' };
