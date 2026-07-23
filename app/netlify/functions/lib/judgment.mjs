// ─────────────────────────────────────────────────────────────
// Judgment — the canonical, auditable record of who won a round.
//
// WHY THIS EXISTS
// The Floor settled markets from `Math.random()` whenever a market had
// no bound result, and nothing in the codebase ever wrote a bound
// result, so the random path was the only one that ever ran. Deleting
// that line would not have fixed it: the real defect was that
// settlement was ALLOWED to produce a winner without a verdict record.
//
// So there is now exactly one place a winner comes from. A judgment is
// written once per event, carries the model and rubric that produced
// it, and both the rating ladder and the credit economy settle off it.
// Settlement with no judgment does not guess; it refuses.
//
// Judgments are also the dispute surface. A ballot that turns out to be
// wrong gets humanReview and disputeState set here, and the compensating
// entries downstream reference this id.
// ─────────────────────────────────────────────────────────────

// Bump when the adjudication rubric materially changes, so a disputed
// ballot can be reproduced against the rubric that actually judged it.
export const RUBRIC_VERSION = 'adjudication-2026-07';

export const SOURCES = ['async', 'live'];

export function judgmentId(source, eventId) {
  return `${source}_${eventId}`;
}

// Extract the canonical verdict from a stored round.
//
// Note this deliberately does NOT check leaderboard consent. Consent
// governs whether a result appears on the public ladder, not whether
// the round had a winner. Conflating the two would mean an unconsented
// round could never settle its market either, which punishes the
// predictors rather than protecting the debaters.
export function fromRound(source, eventId, d) {
  if (!d) return { ok: false, reason: 'not_found' };

  if (source === 'async') {
    if (d.state !== 'complete') return { ok: false, reason: 'not_complete' };
    const b = d.ballot;
    if (!b || (b.winner !== 'prop' && b.winner !== 'opp')) return { ok: false, reason: 'no_verdict' };
    return {
      ok: true,
      value: {
        id: judgmentId(source, eventId),
        source, eventId,
        judgeType: 'ai',
        modelVersion: b.model || 'unknown',
        rubricVersion: RUBRIC_VERSION,
        winner: b.winner === 'prop' ? 'a' : 'b',
        sideLabels: { a: 'prop', b: 'opp' },
        participants: {
          a: (d.prop && d.prop.uid) || '',
          b: (d.opp && d.opp.uid) || '',
        },
        aiOpponent: !!d.aiOpp,
        sideScores: { a: numOr(b.propPoints, 0), b: numOr(b.oppPoints, 0) },
        rfd: String(b.rfd || '').slice(0, 4000),
        motion: String(d.motion || '').slice(0, 500),
        // Written by async-sweep on the server, so we own it.
        verdictSource: 'server',
        confidence: null,
        decisiveArgs: [],
        strongestRebuttal: '',
        unresolved: [],
        humanReview: null,
        disputeState: 'none',
        judgedAt: b.at || d.completedAt || 0,
      },
    };
  }

  if (source === 'live') {
    const b = d.ballot;
    if (!b || (b.winner !== 'pro' && b.winner !== 'con')) return { ok: false, reason: 'no_verdict' };
    if (!d.proUid || !d.conUid) return { ok: false, reason: 'missing_participant' };
    return {
      ok: true,
      value: {
        id: judgmentId(source, eventId),
        source, eventId,
        judgeType: 'ai',
        modelVersion: b.model || 'unknown',
        rubricVersion: RUBRIC_VERSION,
        winner: b.winner === 'pro' ? 'a' : 'b',
        sideLabels: { a: 'pro', b: 'con' },
        participants: { a: d.proUid, b: d.conUid },
        aiOpponent: false,
        sideScores: { a: numOr(b.proPoints, 0), b: numOr(b.conPoints, 0) },
        rfd: String(b.rfd || '').slice(0, 4000),
        motion: String(d.motion || '').slice(0, 500),
        // Written by a participant's browser. Recorded honestly so an
        // integrity pass can find these without re-reading every round.
        verdictSource: 'participant',
        confidence: null,
        decisiveArgs: [],
        strongestRebuttal: '',
        unresolved: [],
        humanReview: null,
        disputeState: 'none',
        judgedAt: b.at || d.completedAt || 0,
      },
    };
  }

  return { ok: false, reason: 'unknown_source' };
}

function numOr(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// Write the judgment once. Idempotent: a judgment is a historical fact,
// so a second write never overwrites the first. If you need to change a
// verdict, that is a dispute, not an update.
export async function recordJudgment(db, { source, eventId, roundData }) {
  const j = fromRound(source, eventId, roundData);
  if (!j.ok) return { recorded: false, reason: j.reason };

  const ref = db.collection('judgments').doc(j.value.id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return { recorded: false, reason: 'already_recorded', judgment: snap.data() };
    tx.set(ref, { ...j.value, createdAt: Date.now() });
    return { recorded: true, judgment: j.value };
  });
}
