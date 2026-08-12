// ─────────────────────────────────────────────────────────────
// Writing a finished round into a drop-in tournament's ledger.
//
// The decision rules live in lib/tournament-live.mjs and are pure. This
// file is the I/O half: claim a pairing, and post a result onto both
// entries so the board moves.
//
// WHY THE ROOM ID IS THE KEY TO EVERYTHING
// Each drop-in pairing writes a real `tournaments/{tid}/rounds/r{n}`
// document with a single pairing in it, using the SAME room-id shape the
// scheduled engine uses. That is not cosmetic. `lib/tournament-round.mjs`
// verifies a live round belongs to a tournament by walking the room id
// back to that record, and `live-judge.mjs` uses that verification to
// treat tournament entry as consent to a public competitive record. Pair
// outside that shape and every drop-in round silently stops rating.
//
// IDEMPOTENCY
// A result is keyed by ROOM. The judge can retry, a director can
// re-enter, the sweep can run twice; the second write is a no-op rather
// than a second helping of points. Same discipline as rating_changes.
// ─────────────────────────────────────────────────────────────
import { roundPoints } from './tournament-live.mjs';

// Mirrors roomFor() in tournament-admin.mjs. Drop-in pairings are keyed
// r1, r2, r3... off a rolling counter rather than a round number,
// because a drop-in day has no rounds. The parser in
// lib/tournament-round.mjs accepts up to r999, which is the real ceiling
// on pairings in a day and far above any plausible field.
export function liveRoomFor(tid, n) {
  return 'Debatable-' + String(tid).slice(0, 12) + '-r' + n + '-1';
}

export const MAX_LIVE_PAIRINGS = 999;

/**
 * Claim a pairing: both entries must still be waiting when the
 * transaction commits, or the whole thing rolls back.
 *
 * Two clients polling at the same instant will both compute the same
 * pairing from the same pool, which is correct and is exactly why the
 * claim has to be transactional. The loser of the race sees its entries
 * already taken and simply polls again.
 */
export async function claimPairing(db, { tid, pairing, now }) {
  const at = Number(now) || Date.now();
  const tRef = db.collection('tournaments').doc(tid);
  const govRef = tRef.collection('entries').doc(pairing.govEntry);
  const oppRef = tRef.collection('entries').doc(pairing.oppEntry);

  return db.runTransaction(async (tx) => {
    const [tSnap, gov, opp] = await Promise.all([tx.get(tRef), tx.get(govRef), tx.get(oppRef)]);
    if (!tSnap.exists) return { ok: false, reason: 'no_tournament' };
    if (!gov.exists || !opp.exists) return { ok: false, reason: 'entry_gone' };

    const g = gov.data();
    const o = opp.data();
    // The re-read is the whole point: available may have flipped since
    // the pool was read, and a pairing built on a stale read would seat
    // someone who is already in another room.
    if (g.available !== true || o.available !== true) return { ok: false, reason: 'taken' };
    if (g.pairedRoom || o.pairedRoom) return { ok: false, reason: 'taken' };

    const n = Math.min(MAX_LIVE_PAIRINGS, (Number(tSnap.data().livePairCount) || 0) + 1);
    const room = liveRoomFor(tid, n);

    // The rounds document is what `verifyTournamentPairing` reads, so its
    // shape is load-bearing rather than bookkeeping.
    tx.set(tRef.collection('rounds').doc('r' + n), {
      key: 'r' + n,
      live: true,
      createdAt: at,
      pairings: [{
        govEntry: pairing.govEntry,
        oppEntry: pairing.oppEntry,
        room,
        rematch: !!pairing.rematch,
        pointsGap: Number(pairing.pointsGap) || 0,
      }],
    });
    tx.update(tRef, { livePairCount: n, lastPairedAt: at });

    const seat = { available: false, pairedRoom: room, pairedAt: at, waitingSince: 0 };
    tx.update(govRef, { ...seat, currentSide: 'gov' });
    tx.update(oppRef, { ...seat, currentSide: 'opp' });

    return {
      ok: true, room, roundKey: 'r' + n,
      gov: { entryId: pairing.govEntry, members: g.members || [], name: g.name || '' },
      opp: { entryId: pairing.oppEntry, members: o.members || [], name: o.name || '' },
      rematch: !!pairing.rematch,
    };
  });
}

/**
 * Post a finished round onto both entries.
 *
 * `speaks` is the ballot's 23-30 score per side; `room` (the entertainment
 * read) is optional and is stored but NEVER folded into points. See the
 * fence comment in lib/tournament-live.mjs: a cash ladder carrying a
 * watchability score would walk through the judge rubric's own guard
 * against scoring fluency and accent.
 */
export async function applyTournamentResult(db, { tid, roomId, gov, opp, now }) {
  const at = Number(now) || Date.now();
  const tRef = db.collection('tournaments').doc(tid);
  const doneRef = tRef.collection('results').doc(roomId);

  return db.runTransaction(async (tx) => {
    const done = await tx.get(doneRef);
    if (done.exists) return { applied: false, reason: 'already_applied' };

    const govRef = tRef.collection('entries').doc(gov.entryId);
    const oppRef = tRef.collection('entries').doc(opp.entryId);
    const [g, o] = await Promise.all([tx.get(govRef), tx.get(oppRef)]);
    if (!g.exists || !o.exists) return { applied: false, reason: 'entry_gone' };

    const post = (snap, side, other) => {
      const d = snap.data();
      const result = {
        won: !!side.won,
        speaks: Number.isFinite(Number(side.speaks)) ? Number(side.speaks) : null,
        room: Number.isFinite(Number(side.room)) ? Number(side.room) : null,
        opponentEntryId: other.entryId,
        roomId,
        at,
      };
      const results = (Array.isArray(d.results) ? d.results : []).concat([result]);
      const opponents = (Array.isArray(d.opponents) ? d.opponents : []);
      return {
        results,
        points: (Number(d.points) || 0) + roundPoints(result),
        wins: (Number(d.wins) || 0) + (side.won ? 1 : 0),
        losses: (Number(d.losses) || 0) + (side.won ? 0 : 1),
        speaks: (Number(d.speaks) || 0) + (Number(side.speaks) || 0),
        roundsPlayed: results.length,
        // The opponent list is what keeps the next pairing rematch-free,
        // so it has to be written here rather than at pairing time: a
        // pairing that never produced a round should not block a future
        // one against the same person.
        opponents: opponents.includes(other.entryId) ? opponents : opponents.concat([other.entryId]),
        sideCount: {
          gov: (d.sideCount?.gov || 0) + (side.side === 'gov' ? 1 : 0),
          opp: (d.sideCount?.opp || 0) + (side.side === 'opp' ? 1 : 0),
        },
        // Back into the pool, still checked in. Someone who finished a
        // round on a drop-in day is the likeliest next pairing, and
        // making them re-queue by hand loses exactly that person.
        available: true,
        waitingSince: at,
        pairedRoom: null,
        currentSide: null,
        updatedAt: at,
      };
    };

    tx.update(govRef, post(g, { ...gov, side: 'gov' }, opp));
    tx.update(oppRef, post(o, { ...opp, side: 'opp' }, gov));
    tx.set(doneRef, { roomId, at, gov: gov.entryId, opp: opp.entryId });
    return { applied: true };
  });
}
