// ─────────────────────────────────────────────────────────────
// Apply a completed round to the Debate Rating ladder.
//
// Server-side and transactional. Both debaters move together or neither
// does, because a half-applied round leaves one person's rating paid
// for by nobody.
//
// WHAT IS ELIGIBLE
//  - Human versus human only. Beating the AI is practice, not a result.
//  - The round must be finished and carry a real verdict.
//  - CONSENT. A live round only counts when BOTH debaters flipped
//    leaderboardConsent, which is the existing rule for
//    leaderboard_entries (see the consent block in live-round.html).
//    Rating someone who opted out of the public board would publish a
//    competitive record they declined. An async round consents by being
//    published public, which already lists both names in the feed.
//
// IDEMPOTENCY
// rating_changes ids are deterministic: `${source}_${eventId}_${uid}`.
// Re-running the sweep, the endpoint, and the backfill over the same
// round is a no-op rather than a double credit.
// ─────────────────────────────────────────────────────────────
import { applyRound, defaultRatingDoc } from './rating.mjs';

export const SOURCES = ['async', 'live'];

// Normalize a stored round into { a, b, outcome, verdictSource } or a
// reason it does not qualify. Pure, so the tests can drive it directly.
export function eligibility(source, d) {
  if (!d) return { ok: false, reason: 'not_found' };

  if (source === 'async') {
    if (d.state !== 'complete') return { ok: false, reason: 'not_complete' };
    if (d.aiOpp) return { ok: false, reason: 'ai_opponent' };
    if (d.hidden) return { ok: false, reason: 'hidden' };
    if (d.visibility !== 'public') return { ok: false, reason: 'not_public' };
    const ballot = d.ballot;
    if (!ballot || (ballot.winner !== 'prop' && ballot.winner !== 'opp')) {
      return { ok: false, reason: 'no_verdict' };
    }
    const a = d.prop && d.prop.uid;
    const b = d.opp && d.opp.uid;
    if (!a || !b) return { ok: false, reason: 'missing_participant' };
    if (a === b) return { ok: false, reason: 'same_user' };
    return {
      ok: true,
      a: { uid: a, name: (d.prop && d.prop.name) || '', side: 'prop' },
      b: { uid: b, name: (d.opp && d.opp.name) || '', side: 'opp' },
      outcome: ballot.winner === 'prop' ? 'a' : 'b',
      // The async ballot is written by async-sweep server-side, so the
      // verdict is ours. The live ballot is written by a participant's
      // browser; recorded here so a later integrity pass can tell the
      // two apart without re-reading every round.
      verdictSource: 'server',
      motion: d.motion || '',
    };
  }

  if (source === 'live') {
    const ballot = d.ballot;
    if (!ballot || (ballot.winner !== 'pro' && ballot.winner !== 'con')) {
      return { ok: false, reason: 'no_verdict' };
    }
    const a = d.proUid;
    const b = d.conUid;
    if (!a || !b) return { ok: false, reason: 'missing_participant' };
    if (a === b) return { ok: false, reason: 'same_user' };
    const consents = d.leaderboardConsent || {};
    if (consents[a] !== true || consents[b] !== true) {
      return { ok: false, reason: 'consent_missing' };
    }
    return {
      ok: true,
      a: { uid: a, name: d.proName || '', side: 'pro' },
      b: { uid: b, name: d.conName || '', side: 'con' },
      outcome: ballot.winner === 'pro' ? 'a' : 'b',
      verdictSource: 'participant',
      motion: d.motion || '',
    };
  }

  return { ok: false, reason: 'unknown_source' };
}

// Transactional apply. Returns { applied:bool, reason?, changes? }.
export async function applyRoundRating(db, { source, eventId, roundData, now }) {
  const at = now || Date.now();
  const elig = eligibility(source, roundData);
  if (!elig.ok) return { applied: false, reason: elig.reason };

  const idA = `${source}_${eventId}_${elig.a.uid}`;
  const idB = `${source}_${eventId}_${elig.b.uid}`;
  const changeA = db.collection('rating_changes').doc(idA);
  const changeB = db.collection('rating_changes').doc(idB);
  const rateA = db.collection('user_ratings').doc(elig.a.uid);
  const rateB = db.collection('user_ratings').doc(elig.b.uid);

  return db.runTransaction(async (tx) => {
    // All reads first: Firestore forbids a read after a write.
    const [cA, cB, rA, rB] = await Promise.all([
      tx.get(changeA), tx.get(changeB), tx.get(rateA), tx.get(rateB),
    ]);
    if (cA.exists || cB.exists) return { applied: false, reason: 'already_applied' };

    const preA = rA.exists ? rA.data() : defaultRatingDoc(at);
    const preB = rB.exists ? rB.data() : defaultRatingDoc(at);
    const next = applyRound(preA, preB, elig.outcome);

    const wonA = elig.outcome === 'a';
    const mk = (pre, post, me, them, won) => ({
      uid: me.uid,
      name: me.name,
      opponentUid: them.uid,
      side: me.side,
      source,
      eventId,
      motion: elig.motion.slice(0, 300),
      verdictSource: elig.verdictSource,
      result: won ? 'win' : 'loss',
      before: { rating: pre.rating, rd: pre.rd, vol: pre.vol },
      after: { rating: post.rating, rd: post.rd, vol: post.vol },
      delta: Math.round((post.rating - pre.rating) * 10) / 10,
      at,
    });

    const rowA = mk(preA, next.a, elig.a, elig.b, wonA);
    const rowB = mk(preB, next.b, elig.b, elig.a, !wonA);

    const merge = (pre, post, won) => ({
      ...post,
      games: (pre.games || 0) + 1,
      wins: (pre.wins || 0) + (won ? 1 : 0),
      losses: (pre.losses || 0) + (won ? 0 : 1),
      draws: pre.draws || 0,
      peak: Math.max(pre.peak || post.rating, post.rating),
      lastEventAt: at,
      createdAt: pre.createdAt || at,
      updatedAt: at,
    });

    tx.set(rateA, merge(preA, next.a, wonA), { merge: true });
    tx.set(rateB, merge(preB, next.b, !wonA), { merge: true });
    tx.set(changeA, rowA);
    tx.set(changeB, rowB);

    return { applied: true, changes: [rowA, rowB] };
  });
}
