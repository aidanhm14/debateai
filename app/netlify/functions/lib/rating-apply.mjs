// ─────────────────────────────────────────────────────────────
// Apply a completed round to the Debate Rating ladder.
//
// Server-side and transactional. Both debaters move together or neither
// does, because a half-applied round leaves one person's rating paid
// for by nobody.
//
// WHAT IS ELIGIBLE
//  - Human versus human only. Beating the AI is practice, not a result.
//  - The round must be finished and carry a real panel result. A split
//    panel is a draw: it changes both ratings without inventing a winner.
//  - CONSENT, as an OPT-OUT since 2026-08-24 (the founder: every round
//    record goes on the board unless it is uniquely bad because
//    something happened). It used to require BOTH debaters to flip
//    leaderboardConsent to true after the round, on their own screens,
//    which is why almost nothing outside a tournament ever moved the
//    ladder: two people finished a real round and the result existed
//    nowhere. A round now rates unless a debater explicitly kept it off,
//    which the client writes as `false` on their own key (the Firestore
//    rule on that map lets a writer touch only their own). Rating
//    someone who opted out would still publish a record they declined,
//    so `false` on either side is honoured and still stops the round.
//    An async round consents by being published public, which already
//    lists both names in the feed.
//
// IDEMPOTENCY
// rating_changes ids are deterministic: `${source}_${eventId}_${uid}`.
// Re-running the sweep, the endpoint, and the backfill over the same
// round is a no-op rather than a double credit.
// ─────────────────────────────────────────────────────────────
import { applyRound, defaultRatingDoc } from './rating.mjs';

export const SOURCES = ['async', 'live'];

// A server-owned result path may supply a more precise provenance than
// eligibility can infer from the stored ballot shape. Keep the allow-list
// closed so a caller cannot invent arbitrary audit labels.
export function resolvedVerdictSource(inferred, override) {
  return override === 'tournament-director' || override === 'server' ? override : inferred;
}

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
    // The aiOpp flag is not the only way an AI sits in a round: seeded
    // async challenges carry the AI as a named participant with
    // uid 'ai' and no flag. One of those rated for real (2026-08-18,
    // "The Debater · AI" at 1662 on the ladder), so the human-vs-human
    // rule checks the seats, not just the flag.
    if (a === 'ai' || b === 'ai') return { ok: false, reason: 'ai_opponent' };
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
    const noWinner = d.ballotUnresolved;
    const hasWinner = !!(ballot && (ballot.winner === 'pro' || ballot.winner === 'con'));
    const hasServerDraw = !!(noWinner && noWinner.outcome === 'no_winner'
      && d.serverJudgeState === 'unresolved');
    if (!hasWinner && !hasServerDraw) {
      return { ok: false, reason: 'no_verdict' };
    }
    const a = d.proUid;
    const b = d.conUid;
    if (!a || !b) return { ok: false, reason: 'missing_participant' };
    if (a === b) return { ok: false, reason: 'same_user' };
    // Absent means yes. Only an explicit false, from the debater's own
    // client, keeps a round off the ladder.
    const consents = d.leaderboardConsent || {};
    if (consents[a] === false || consents[b] === false) {
      return { ok: false, reason: 'opted_out' };
    }
    return {
      ok: true,
      a: { uid: a, name: d.proName || '', side: 'pro' },
      b: { uid: b, name: d.conName || '', side: 'con' },
      outcome: hasServerDraw ? 'draw' : (ballot.winner === 'pro' ? 'a' : 'b'),
      // Same discriminator lib/judgment.mjs uses: a ballot carrying a
      // panel record came from live-judge.mjs running the season's panel
      // server-side; one without came from a debater's browser. Recorded
      // rather than acted on here, because the ladder deliberately moves
      // on both (a rating pays nobody). Money does not: see
      // MONEY_VERDICT_SOURCES in lib/settle.mjs.
      verdictSource: hasServerDraw || (ballot && ballot.panel) ? 'server' : 'participant',
      motion: d.motion || '',
    };
  }

  return { ok: false, reason: 'unknown_source' };
}

// Change-row ids are deterministic, which is what makes a re-run a
// no-op. A round whose verdict was overturned on appeal has to be
// applied a second time off the corrected result, so every pass after
// the first is namespaced by its revision. Revision 0 keeps the original
// bare id, so nothing already written moves.
function changeId(source, eventId, uid, rev) {
  const n = Number(rev) || 0;
  return n > 0 ? `${source}_${eventId}_${uid}_r${n}` : `${source}_${eventId}_${uid}`;
}

export function resultForOutcome(outcome, side) {
  if (outcome === 'draw') return 'draw';
  return outcome === side ? 'win' : 'loss';
}

export function recordCountsAfter(record, result, direction = 1) {
  const step = direction < 0 ? -1 : 1;
  return {
    games: Math.max(0, (Number(record && record.games) || 0) + step),
    wins: Math.max(0, (Number(record && record.wins) || 0) + (result === 'win' ? step : 0)),
    losses: Math.max(0, (Number(record && record.losses) || 0) + (result === 'loss' ? step : 0)),
    draws: Math.max(0, (Number(record && record.draws) || 0) + (result === 'draw' ? step : 0)),
  };
}

// Transactional apply. Returns { applied:bool, reason?, changes? }.
export async function applyRoundRating(db, {
  source, eventId, roundData, now, rev, verdictSourceOverride,
}) {
  const at = now || Date.now();
  const baseEligibility = eligibility(source, roundData);
  if (!baseEligibility.ok) return { applied: false, reason: baseEligibility.reason };
  const elig = {
    ...baseEligibility,
    verdictSource: resolvedVerdictSource(baseEligibility.verdictSource, verdictSourceOverride),
  };

  const idA = changeId(source, eventId, elig.a.uid, rev);
  const idB = changeId(source, eventId, elig.b.uid, rev);
  const changeA = db.collection('rating_changes').doc(idA);
  const changeB = db.collection('rating_changes').doc(idB);
  const rateA = db.collection('user_ratings').doc(elig.a.uid);
  const rateB = db.collection('user_ratings').doc(elig.b.uid);

  return db.runTransaction(async (tx) => {
    // All reads first: Firestore forbids a read after a write.
    const [cA, cB, rA, rB] = await Promise.all([
      tx.get(changeA), tx.get(changeB), tx.get(rateA), tx.get(rateB),
    ]);
    if (cA.exists || cB.exists) {
      return {
        applied: false,
        reason: 'already_applied',
        // A prior run may have committed both rating rows and then died
        // before mirroring their compact deltas onto the room. Return the
        // existing pair so an idempotent retry can repair that display.
        changes: cA.exists && cB.exists ? [cA.data(), cB.data()] : [],
      };
    }

    const preA = rA.exists ? rA.data() : defaultRatingDoc(at);
    const preB = rB.exists ? rB.data() : defaultRatingDoc(at);
    const next = applyRound(preA, preB, elig.outcome);

    const mk = (pre, post, me, them, result) => ({
      uid: me.uid,
      name: me.name,
      opponentUid: them.uid,
      side: me.side,
      source,
      eventId,
      rev: Number(rev) || 0,
      motion: elig.motion.slice(0, 300),
      verdictSource: elig.verdictSource,
      result,
      before: { rating: pre.rating, rd: pre.rd, vol: pre.vol },
      after: { rating: post.rating, rd: post.rd, vol: post.vol },
      delta: Math.round((post.rating - pre.rating) * 10) / 10,
      at,
    });

    const rowA = mk(preA, next.a, elig.a, elig.b, resultForOutcome(elig.outcome, 'a'));
    const rowB = mk(preB, next.b, elig.b, elig.a, resultForOutcome(elig.outcome, 'b'));

    const merge = (pre, post, result) => ({
      ...post,
      ...recordCountsAfter(pre, result),
      peak: Math.max(pre.peak || post.rating, post.rating),
      lastEventAt: at,
      createdAt: pre.createdAt || at,
      updatedAt: at,
    });

    tx.set(rateA, merge(preA, next.a, rowA.result), { merge: true });
    tx.set(rateB, merge(preB, next.b, rowB.result), { merge: true });
    tx.set(changeA, rowA);
    tx.set(changeB, rowB);

    return { applied: true, changes: [rowA, rowB] };
  });
}

// ── reversal ────────────────────────────────────────────────────────
//
// Back a rated round out of the ladder, so a verdict overturned by a
// human reviewer does not leave the standing it produced in place. An
// appeal that cannot reach the ladder is not an appeal.
//
// WHAT THIS CAN AND CANNOT RESTORE, stated because the difference
// matters and quietly pretending otherwise would be a false record.
// The stored change row carries `before` and `after`, so the rating
// DELTA is exactly reversible and the win or loss count is exactly
// reversible. Glicko rating deviation and volatility are path
// dependent: if the debater has played other rounds since, there is no
// arithmetic that returns them to a counterfactual rd. So rating,
// games, wins, losses and draws are corrected, rd and vol are left where the
// later rounds put them, and the compensating row says so rather than
// implying a clean rewind. Peak is not walked back either, for the same
// reason: it is a historical high water mark, not a running total.
//
// Append-only, same as the ledger: the original change row stays, and
// the correction is a new row with `kind:'reversal'`.
export async function reverseRoundRating(db, { source, eventId, uids, now, rev, reason }) {
  const at = now || Date.now();
  const revN = Number(rev) || 0;
  const list = (uids || []).filter(Boolean);
  if (list.length !== 2) return { reversed: false, reason: 'need_two_participants' };

  const refs = list.map((uid) => ({
    uid,
    change: db.collection('rating_changes').doc(changeId(source, eventId, uid, revN)),
    // The compensating row gets its own deterministic id, so a retried
    // reversal is a no-op rather than a second clawback.
    rebate: db.collection('rating_changes').doc(`${changeId(source, eventId, uid, revN)}_reversal`),
    rating: db.collection('user_ratings').doc(uid),
  }));

  return db.runTransaction(async (tx) => {
    const snaps = await Promise.all(refs.flatMap((r) => [tx.get(r.change), tx.get(r.rebate), tx.get(r.rating)]));
    const rows = [];
    for (let i = 0; i < refs.length; i++) {
      const [cSnap, rbSnap, rSnap] = [snaps[i * 3], snaps[i * 3 + 1], snaps[i * 3 + 2]];
      if (!cSnap.exists) return { reversed: false, reason: 'nothing_applied' };
      if (rbSnap.exists) return { reversed: false, reason: 'already_reversed' };
      rows.push({ ref: refs[i], change: cSnap.data(), rating: rSnap.exists ? rSnap.data() : null });
    }

    const out = [];
    for (const row of rows) {
      const c = row.change;
      const cur = row.rating || {};
      const delta = Number(c.delta) || 0;
      const rating = Math.round(((Number(cur.rating) || 0) - delta) * 10) / 10;

      tx.set(row.ref.rating, {
        rating,
        ...recordCountsAfter(cur, c.result, -1),
        updatedAt: at,
      }, { merge: true });

      const rebate = {
        uid: c.uid,
        name: c.name || '',
        opponentUid: c.opponentUid || '',
        side: c.side || '',
        source,
        eventId,
        rev: revN,
        kind: 'reversal',
        reversesChangeId: row.ref.change.id,
        motion: c.motion || '',
        verdictSource: 'human-review',
        result: 'reversed',
        reason: String(reason || 'Verdict overturned on appeal').slice(0, 200),
        before: { rating: Number(cur.rating) || 0, rd: cur.rd ?? null, vol: cur.vol ?? null },
        after: { rating, rd: cur.rd ?? null, vol: cur.vol ?? null },
        delta: Math.round(-delta * 10) / 10,
        // Named on the row so nobody reading it later assumes the
        // confidence terms were rewound too.
        note: 'Rating, games, wins, losses and draws corrected. Rating deviation and volatility are not reconstructed.',
        at,
      };
      tx.set(row.ref.rebate, rebate);
      out.push(rebate);
    }
    return { reversed: true, changes: out };
  });
}
