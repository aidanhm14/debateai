// ─────────────────────────────────────────────────────────────
// Writing a judged round into a tournament's ledger.
//
// One job: when live-judge produces a server-side verdict for a room
// that verifyTournamentPairing confirmed belongs to a tournament, post
// that result onto the round document and both entry documents, in the
// SAME shape the director's manual entry writes.
//
// FIELD SHAPE HAS EXACTLY ONE AUTHORITY: resultPatch in
// lib/tournament.mjs. This module used to carry its own entry model
// (results[] / points / available / waitingSince / pairedRoom), built
// on 2026-08-11 for a drop-in queue that was never wired to a page,
// while a second session wired the queue that IS live
// (tournament-dropin.mjs: availableAt / inPairing) a day later. Two
// write paths with two field models against one standings read is a
// split brain, and the standings are what pays $850, so the orphan
// model is gone: this now folds results with resultPatch exactly like
// tournament-admin's report action, and the two paths guard against
// each other (see idempotency).
//
// IDEMPOTENCY, IN BOTH DIRECTIONS
// The judge can retry, and the director can hand-enter a result the
// judge already applied (or vice versa). Two guards, both inside the
// transaction: a results/{roomId} receipt doc (stops a judge retry),
// and the pairing's own status === 'complete' on the round document
// (stops the second path, whichever went first). The director's amend
// flow stays the single way to CORRECT a result: it reverses model
// fields resultPatch wrote, which is the other reason both paths must
// write identical shapes.
//
// RELEASE TO IDLE, NOT RE-QUEUE
// Completing a result clears inPairing and leaves availableAt at 0,
// matching the deliberate call in tournament-admin: rejoining the
// drop-in pool is an act by someone still at the keyboard, never an
// automatic re-entry that could seat a person who already walked away
// (the 2026-08-11 empty-chair lesson).
// ─────────────────────────────────────────────────────────────
import { resultPatch } from './tournament.mjs';

/**
 * Post a judged round onto the tournament. All ids come from
 * verifyTournamentPairing, so the caller never re-derives them.
 *
 * gov/opp: { entryId, won, speaks, camRating }. `speaks` is the ballot's
 * per-side score; missing speaks record as 0 rather than blocking the
 * win. `camRating` is the disclosed camera-presence event-rating
 * adjustment (<= 0) from the ballot's tournamentScoring; it is stored on
 * the pairing so tournamentRatings can apply it on every rebuild, and a
 * missing value records as 0 rather than blocking anything.
 */
export async function applyTournamentResult(db, { tid, roundKey, roomId, gov, opp, now }) {
  const at = Number(now) || Date.now();
  const tRef = db.collection('tournaments').doc(tid);
  const roundRef = tRef.collection('rounds').doc(String(roundKey || ''));
  const doneRef = tRef.collection('results').doc(roomId);

  return db.runTransaction(async (tx) => {
    const [done, rSnap] = await Promise.all([tx.get(doneRef), tx.get(roundRef)]);
    if (done.exists) {
      const receipt = done.data() || {};
      return {
        applied: false,
        reason: 'already_applied',
        winner: receipt.winner || '',
        resultRevision: Math.max(0, Math.trunc(Number(receipt.resultRevision) || 0)),
        reportedBy: receipt.reportedBy || 'ai-judge',
      };
    }
    if (!rSnap.exists) return { applied: false, reason: 'no_round' };

    const pairings = Array.isArray(rSnap.data().pairings) ? rSnap.data().pairings.slice() : [];
    const idx = pairings.findIndex((p) => p && p.room === roomId);
    if (idx === -1) return { applied: false, reason: 'no_pairing' };
    const p = pairings[idx];
    // The director got there first. Their entry stands; correcting it
    // is the amend flow's job, never a second automatic write.
    if (p.status === 'complete') {
      return {
        applied: false,
        reason: 'already_reported',
        winner: p.winner || '',
        resultRevision: Math.max(0, Math.trunc(Number(p.resultRevision) || 0)),
        reportedBy: p.reportedBy || '',
      };
    }

    const govRef = tRef.collection('entries').doc(String(p.govEntry));
    const oppRef = tRef.collection('entries').doc(String(p.oppEntry));
    const [g, o] = await Promise.all([tx.get(govRef), tx.get(oppRef)]);
    if (!g.exists || !o.exists) return { applied: false, reason: 'entry_gone' };

    const seatUids = Array.from(new Set([
      ...(Array.isArray(g.data().members) ? g.data().members : []),
      ...(Array.isArray(o.data().members) ? o.data().members : []),
    ].map((uid) => String(uid || '').trim()).filter(Boolean)));
    const seatSnaps = await Promise.all(seatUids.map((uid) =>
      tx.get(db.collection('active_tournament_seats').doc(uid))));

    const govSpeaks = Number.isFinite(Number(gov.speaks)) ? Number(gov.speaks) : 0;
    const oppSpeaks = Number.isFinite(Number(opp.speaks)) ? Number(opp.speaks) : 0;
    // Clamped to the deduction band here as well as at read time, so the
    // stored pairing can never carry a rating bonus for camera choice.
    const camClamp = (v) => (Number.isFinite(Number(v)) ? Math.max(-20, Math.min(0, Number(v))) : 0);
    const govCamRating = camClamp(gov.camRating);
    const oppCamRating = camClamp(opp.camRating);

    const govPatch = resultPatch({ entryId: p.govEntry, ...g.data() }, {
      won: !!gov.won, speaks: govSpeaks, side: 'gov', opponentEntryId: p.oppEntry,
    });
    const oppPatch = resultPatch({ entryId: p.oppEntry, ...o.data() }, {
      won: !!opp.won, speaks: oppSpeaks, side: 'opp', opponentEntryId: p.govEntry,
    });
    // A rematch would double an opponent id; keep the list a set, same
    // as the director path.
    govPatch.opponents = Array.from(new Set(govPatch.opponents));
    oppPatch.opponents = Array.from(new Set(oppPatch.opponents));
    // Release both sides back to IDLE (see header).
    govPatch.inPairing = '';
    oppPatch.inPairing = '';
    govPatch.availableAt = 0;
    oppPatch.availableAt = 0;
    // An elim loser leaves the bracket, same as the director path's
    // post-transaction update. It has to happen HERE because a judge
    // result marks the pairing complete, which makes the director's
    // own entry answer 'already_reported' — without this line an
    // auto-applied elim would leave the loser alive in later draws.
    if (String(roundKey).startsWith('e')) {
      (gov.won ? oppPatch : govPatch).status = 'eliminated';
    }

    tx.update(govRef, govPatch);
    tx.update(oppRef, oppPatch);
    seatSnaps.forEach((seatSnap) => {
      const seat = seatSnap.exists ? (seatSnap.data() || {}) : {};
      if (seat.tid === tid && (seat.room === roomId || seat.pairingId === p.pairingId)) {
        tx.delete(seatSnap.ref);
      }
    });

    pairings[idx] = {
      ...p,
      status: 'complete',
      winner: gov.won ? 'gov' : 'opp',
      govSpeaks,
      oppSpeaks,
      govCamRating,
      oppCamRating,
      reportedBy: 'ai-judge',
      resultRevision: Math.max(0, Math.trunc(Number(p.resultRevision) || 0)),
    };
    tx.update(roundRef, { pairings });
    tx.set(doneRef, {
      roomId, roundKey, at,
      gov: String(p.govEntry), opp: String(p.oppEntry),
      winner: gov.won ? 'gov' : 'opp',
      resultRevision: Math.max(0, Math.trunc(Number(p.resultRevision) || 0)),
      reportedBy: 'ai-judge',
    });
    return {
      applied: true,
      winner: gov.won ? 'gov' : 'opp',
      resultRevision: Math.max(0, Math.trunc(Number(p.resultRevision) || 0)),
      reportedBy: 'ai-judge',
    };
  });
}
