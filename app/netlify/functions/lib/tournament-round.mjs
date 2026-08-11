// ─────────────────────────────────────────────────────────────
// Is this live round part of a real tournament, and are these two
// people actually the pairing?
//
// WHY THIS EXISTS
// Entering the tournament is consent to a public competitive record:
// standings and prize money are the stated point of entering, and the
// rules say so. Casual /spar keeps its opt-in checkbox, because someone
// matched with a stranger for fun did not ask for a permanent record.
//
// So the ladder needs to tell those two cases apart, and it has to do it
// from something a participant cannot forge.
//
// WHAT IS NOT TRUSTED
// `/tournaments` builds its round links with `source=tournament` in the
// query string. That is a client-supplied value. Trusting it would let
// anyone append it to a casual round and publish their OPPONENT'S
// competitive record without that person ever agreeing, which is the
// exact harm the consent gate exists to prevent. It is not read here.
//
// WHAT IS TRUSTED
// The room id is generated server-side by the tournament's own pairing
// step and stored on the round document. Verification walks back to
// that record: parse the room, load the tournament's round, find a
// pairing whose room matches, then confirm BOTH debaters are members of
// the two entries that pairing names. A stranger cannot put their uid
// inside a tournament entry, so passing all four checks means the
// tournament really did pair these two people in this room.
//
// The parse is pure and tested; the verification does the reads.
// ─────────────────────────────────────────────────────────────

// Mirrors roomFor() in tournament-admin.mjs:
//   'Debatable-' + tid.slice(0, 12) + '-' + key + '-' + (index + 1)
// where key is 'r<n>' for prelims or 'e<n>' for elims.
const ROOM_RE = /^Debatable-([A-Za-z0-9]{1,12})-([re]\d{1,3})-(\d{1,3})$/;

/**
 * Pull the tournament prefix, round key and pairing index out of a room
 * id. Returns null for any room that is not shaped like a tournament
 * room, which is the overwhelmingly common case (spar rooms, direct
 * challenges) and costs nothing.
 *
 * A successful parse proves NOTHING on its own. It only says the string
 * is worth spending reads on.
 */
export function parseTournamentRoom(room) {
  const m = ROOM_RE.exec(String(room || ''));
  if (!m) return null;
  return { tidPrefix: m[1], roundKey: m[2], index: Number(m[3]) };
}

/**
 * Does `pairing` name two entries whose members include both uids, one
 * on each side? Pure, so the membership rule is testable without
 * Firestore.
 *
 * Sides are checked but NOT required to match gov/opp, because which
 * bench a debater took is the round document's business and a director
 * can swap sides. What must hold is that these two specific people are
 * the two sides of this specific pairing.
 */
export function pairingMatches(pairing, govMembers, oppMembers, proUid, conUid) {
  if (!pairing || !proUid || !conUid || proUid === conUid) return false;
  const gov = new Set((govMembers || []).filter(Boolean));
  const opp = new Set((oppMembers || []).filter(Boolean));
  if (!gov.size || !opp.size) return false;
  return (gov.has(proUid) && opp.has(conUid)) || (gov.has(conUid) && opp.has(proUid));
}

/**
 * The full check, with reads. Returns { ok:true, tid, roundKey } only
 * when the tournament's own records confirm the pairing.
 *
 * Fails CLOSED on every error and every ambiguity: an unreadable
 * tournament, a prefix matching more than one tournament, a missing
 * round, a room that is not in the pairings, or entries that do not list
 * both debaters. Failing closed here means the round falls back to
 * needing an explicit checkbox, which is the safe direction: the cost is
 * a missing rating, and the cost of failing open is publishing a
 * competitive record for someone who never agreed to one.
 */
export async function verifyTournamentPairing(db, room, proUid, conUid) {
  const parsed = parseTournamentRoom(room);
  if (!parsed) return { ok: false, reason: 'not_tournament_shaped' };
  if (!proUid || !conUid || proUid === conUid) return { ok: false, reason: 'bad_participants' };

  try {
    // The room carries only the first 12 characters of the tournament
    // id, so this is a prefix scan over document ids. Limited to 2 so an
    // ambiguous prefix is detected rather than silently resolved to
    // whichever document sorted first.
    const { FieldPath } = await import('firebase-admin/firestore');
    // A tournament id is 20 characters and the room carries only the
    // first 12, so this is a PREFIX scan, not an equality lookup. The
    // upper bound appends \uf8ff (above every ordinary code point) so the
    // range covers every id starting with the prefix. An equal lo and hi
    // would match only a literal 12-character id and so would never
    // match a real tournament.
    const lo = parsed.tidPrefix;
    const hi = parsed.tidPrefix + '\uf8ff';
    const tSnap = await db.collection('tournaments')
      .where(FieldPath.documentId(), '>=', lo)
      .where(FieldPath.documentId(), '<', hi)
      .limit(2)
      .get();

    if (tSnap.empty) return { ok: false, reason: 'no_tournament' };
    if (tSnap.size > 1) return { ok: false, reason: 'ambiguous_tournament' };

    const tRef = tSnap.docs[0].ref;
    const rSnap = await tRef.collection('rounds').doc(parsed.roundKey).get();
    if (!rSnap.exists) return { ok: false, reason: 'no_round' };

    const pairings = rSnap.data().pairings;
    if (!Array.isArray(pairings)) return { ok: false, reason: 'no_pairings' };
    const pairing = pairings.find((p) => p && p.room === room);
    if (!pairing) return { ok: false, reason: 'room_not_paired' };
    if (!pairing.govEntry || !pairing.oppEntry) return { ok: false, reason: 'incomplete_pairing' };

    const [govSnap, oppSnap] = await Promise.all([
      tRef.collection('entries').doc(String(pairing.govEntry)).get(),
      tRef.collection('entries').doc(String(pairing.oppEntry)).get(),
    ]);
    if (!govSnap.exists || !oppSnap.exists) return { ok: false, reason: 'missing_entry' };

    const ok = pairingMatches(
      pairing,
      govSnap.data().members,
      oppSnap.data().members,
      proUid, conUid,
    );
    if (!ok) return { ok: false, reason: 'participants_not_in_entries' };

    return { ok: true, tid: tRef.id, roundKey: parsed.roundKey };
  } catch (err) {
    console.warn('[tournament-round] verification failed, treating as casual:', err.message);
    return { ok: false, reason: 'error' };
  }
}
