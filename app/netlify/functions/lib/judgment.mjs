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
// entries downstream reference this id. That is what judge-appeal.mjs
// writes to, and what lib/settle.mjs reverses off.
// ─────────────────────────────────────────────────────────────
import { seasonFor, rubricHash } from './judge-charter.mjs';

// The rubric a judgment was decided under is no longer a constant in
// this file. It is read from the season calendar in
// lib/judge-charter.mjs at the moment the round was judged, along with
// the hash of that rubric's published text.
//
// That matters for exactly the reason this whole layer exists: a
// judgment has to be reproducible against the criteria that actually
// judged it, not against whatever the criteria say today. A round judged
// in July is stamped with July's rubric forever, even after a new season
// pins a new one, and the hash makes an after-the-fact edit to the
// published criteria detectable rather than a matter of trust.
export const SOURCES = ['async', 'live'];

// Season and rubric stamp for a moment in time. `judgedAt` of 0 falls
// into the earliest season, which is the honest reading of a round with
// no timestamp: it was judged before we started recording this.
function charterStamp(judgedAt) {
  const season = seasonFor(judgedAt || 0);
  return {
    seasonId: season.id,
    rubricVersion: season.rubricVersion,
    rubricHash: rubricHash(season.rubricVersion),
    rubricPublished: !!season.published,
  };
}

// Panel summary for the judgment document. The full per-juror record
// lives in judge_audit; what belongs on the verdict itself is how much
// the panel agreed, because that is the number a debater reading their
// own ballot should see next to the result.
function panelStamp(ballot) {
  const p = ballot && ballot.panel;
  if (!p) return { panel: null, confidence: null };
  return {
    panel: {
      resolution: p.resolution || '',
      votesCast: Number(p.votesCast) || 0,
      panelSize: Number(p.panelSize) || 0,
      tally: p.tally || null,
      agreement: Number.isFinite(Number(p.agreement)) ? Number(p.agreement) : null,
      unanimous: !!p.unanimous,
      dissent: Array.isArray(p.dissent) ? p.dissent : [],
      marginSpread: Number(p.marginSpread) || 0,
      models: Array.isArray(p.models) ? p.models : [],
    },
    // Panel agreement IS the confidence figure. It was a null column
    // waiting for exactly this: a number that comes from independent
    // jurors rather than from asking one model how sure it feels, which
    // is a self-report and worth nothing.
    confidence: Number.isFinite(Number(p.agreement)) ? Number(p.agreement) : null,
  };
}

export function judgmentId(source, eventId) {
  return `${source}_${eventId}`;
}

// Per-axis judge scorecard, normalized to the same a/b side abstraction
// as sideScores (async: a=prop b=opp, live: a=pro b=con). Null unless
// the ballot carried a complete numeric block — a partial scorecard is
// dropped whole, matching what the render surfaces do. Judgments
// written before the scorecard shipped simply carry null.
const DIMENSION_AXES = ['clarity', 'reasoning', 'responsiveness', 'weighing'];

function dimensionsFromBallot(ballot, aKey, bKey) {
  const dm = ballot && ballot.dimensions;
  if (!dm || typeof dm !== 'object') return null;
  const out = {};
  for (const axis of DIMENSION_AXES) {
    const ax = dm[axis];
    const a = Number(ax && ax[aKey]);
    const b = Number(ax && ax[bKey]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    out[axis] = { a, b };
  }
  return out;
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
    const judgedAt = b.at || d.completedAt || 0;
    const ps = panelStamp(b);
    return {
      ok: true,
      value: {
        id: judgmentId(source, eventId),
        source, eventId,
        judgeType: ps.panel ? 'ai-panel' : 'ai',
        modelVersion: b.model || 'unknown',
        ...charterStamp(judgedAt),
        winner: b.winner === 'prop' ? 'a' : 'b',
        sideLabels: { a: 'prop', b: 'opp' },
        participants: {
          a: (d.prop && d.prop.uid) || '',
          b: (d.opp && d.opp.uid) || '',
        },
        aiOpponent: !!d.aiOpp,
        sideScores: { a: numOr(b.propPoints, 0), b: numOr(b.oppPoints, 0) },
        dimensionScores: dimensionsFromBallot(b, 'prop', 'opp'),
        rfd: String(b.rfd || '').slice(0, 4000),
        motion: String(d.motion || '').slice(0, 500),
        // Written by async-sweep on the server, so we own it. This is
        // also the only provenance lib/settle.mjs will move credits on.
        verdictSource: 'server',
        panel: ps.panel,
        confidence: ps.confidence,
        decisiveArgs: [],
        strongestRebuttal: '',
        unresolved: [],
        humanReview: null,
        disputeState: 'none',
        judgedAt,
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
        ...charterStamp(b.at || d.completedAt || 0),
        winner: b.winner === 'pro' ? 'a' : 'b',
        sideLabels: { a: 'pro', b: 'con' },
        participants: { a: d.proUid, b: d.conUid },
        aiOpponent: false,
        sideScores: { a: numOr(b.proPoints, 0), b: numOr(b.conPoints, 0) },
        dimensionScores: dimensionsFromBallot(b, 'pro', 'con'),
        rfd: String(b.rfd || '').slice(0, 4000),
        motion: String(d.motion || '').slice(0, 500),
        // Written by a participant's browser. Recorded honestly so an
        // integrity pass can find these without re-reading every round,
        // and now load-bearing: lib/settle.mjs refuses to move credits
        // on a verdict one of the two interested parties authored.
        verdictSource: 'participant',
        panel: null,
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
