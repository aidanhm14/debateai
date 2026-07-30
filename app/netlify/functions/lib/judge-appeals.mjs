// ─────────────────────────────────────────────────────────────
// APPEALS — the human layer above the model.
//
// Fix 3. Real debate has an appeal route and nobody finds it strange
// there. An AI judge with no route above it is the thing that reads as
// house control, because the only entity that can revisit a verdict is
// the entity that issued it.
//
// THE LOAD-BEARING RULES, all enforced below rather than by policy:
//
//  1. A HUMAN decides. The appeal is never routed back to a model.
//     There is deliberately no "let a bigger model re-judge it" path in
//     this file: that would be the same circularity with more compute.
//  2. FILING FREEZES SETTLEMENT. `disputeState: 'open'` already makes
//     verdictFrom refuse, so credits cannot move on a verdict under
//     review. That primitive existed before this file; appeals are what
//     finally set it.
//  3. A REVIEWER CANNOT RULE ON THEIR OWN ROUND. Checked against the
//     judgment's participants, not against a role list, because the
//     conflict is with the round and not with the job.
//  4. NOTHING IS DELETED. An overturn writes a revision beside the
//     original verdict. The first ballot stays readable forever, which
//     is the only version of this that survives being subpoenaed.
//
// Pure module. No I/O. scripts/test-judge-integrity.mjs drives it.
// ─────────────────────────────────────────────────────────────
import { APPEAL_POLICY } from './judge-charter.mjs';

export const APPEAL_COLLECTION = 'judge_appeals';
export const GROUNDS = APPEAL_POLICY.grounds.map((g) => g.key);
export const OUTCOMES = APPEAL_POLICY.outcomes.map((o) => o.key);
export const APPEAL_WINDOW_MS = APPEAL_POLICY.windowHours * 3600_000;

// One appeal per person per round. A deterministic id makes a double
// submit a no-op instead of a duplicate queue entry.
export function appealId(judgmentId, uid) {
  return `${judgmentId}__${uid}`;
}

export function participantsOf(judgment) {
  const p = (judgment && judgment.participants) || {};
  return [p.a, p.b].filter(Boolean);
}

export function sideOf(judgment, uid) {
  const p = (judgment && judgment.participants) || {};
  if (uid && p.a === uid) return 'a';
  if (uid && p.b === uid) return 'b';
  return null;
}

// Can this person file? Debaters only, inside the window, once.
export function canAppeal({ judgment, uid, nowMs, existing }) {
  if (!judgment) return { ok: false, reason: 'no_judgment' };
  if (!uid) return { ok: false, reason: 'not_signed_in' };
  const side = sideOf(judgment, uid);
  if (!side) return { ok: false, reason: 'not_a_participant' };
  if (existing) return { ok: false, reason: 'already_filed' };
  if (judgment.disputeState === 'open') return { ok: false, reason: 'already_under_review' };

  const judgedAt = Number(judgment.judgedAt) || Number(judgment.createdAt) || 0;
  const now = Number(nowMs) || 0;
  // A missing judgedAt would otherwise compute an expired window and
  // silently deny a real appeal, so an unstamped judgment stays open.
  if (judgedAt && now - judgedAt > APPEAL_WINDOW_MS) {
    return { ok: false, reason: 'window_closed', closedAt: judgedAt + APPEAL_WINDOW_MS };
  }
  return { ok: true, side, deadline: judgedAt ? judgedAt + APPEAL_WINDOW_MS : null };
}

export function validGround(g) {
  return GROUNDS.includes(String(g || ''));
}

export function newAppeal({ judgment, uid, name, side, ground, detail, nowMs }) {
  return {
    id: appealId(judgment.id, uid),
    judgmentId: judgment.id,
    source: judgment.source || '',
    eventId: judgment.eventId || '',
    appellantUid: uid,
    appellantName: String(name || '').slice(0, 80),
    appellantSide: side,
    // The verdict as it stood when the appeal was filed. Kept on the
    // appeal so a resolution can be read without having to trust that
    // the judgment document was not touched in between.
    verdictAppealed: judgment.winner || null,
    seasonId: judgment.seasonId || '',
    rubricVersion: judgment.rubricVersion || '',
    rubricHash: judgment.rubricHash || '',
    ground: String(ground || ''),
    detail: String(detail || '').slice(0, 2000),
    state: 'open',
    outcome: null,
    reviewerUid: '',
    reviewerName: '',
    reviewReason: '',
    resolvedAt: 0,
    filedAt: Number(nowMs) || 0,
  };
}

// Can this reviewer rule on this appeal? The conflict test is against
// the round, so an admin who debated it is still disqualified.
export function canReview({ judgment, appeal, reviewerUid }) {
  if (!appeal) return { ok: false, reason: 'no_appeal' };
  if (appeal.state !== 'open') return { ok: false, reason: 'already_resolved' };
  if (!reviewerUid) return { ok: false, reason: 'not_signed_in' };
  if (participantsOf(judgment).includes(reviewerUid)) return { ok: false, reason: 'reviewer_conflict' };
  if (reviewerUid === appeal.appellantUid) return { ok: false, reason: 'reviewer_conflict' };
  return { ok: true };
}

export function validOutcome(o) {
  return OUTCOMES.includes(String(o || ''));
}

// What the judgment becomes. The original winner and scores are never
// overwritten: they move into `original` on first revision and the live
// fields carry the corrected result, so both readings stay available to
// anyone reading the document later.
export function revisedJudgment(judgment, { outcome, reviewerUid, reviewerName, reason, nowMs }) {
  const now = Number(nowMs) || 0;
  const original = judgment.original || {
    winner: judgment.winner || null,
    sideScores: judgment.sideScores || null,
    rfd: judgment.rfd || '',
    judgeType: judgment.judgeType || 'ai',
    judgedAt: Number(judgment.judgedAt) || 0,
  };

  const humanReview = {
    reviewerUid,
    reviewerName: String(reviewerName || '').slice(0, 80),
    outcome,
    reason: String(reason || '').slice(0, 2000),
    at: now,
  };

  if (outcome === 'upheld') {
    return {
      disputeState: 'upheld',
      humanReview,
      original,
      // Winner untouched. An upheld appeal is still a review that
      // happened, and the record says so.
      revisedAt: now,
    };
  }

  if (outcome === 'void') {
    return {
      disputeState: 'void',
      humanReview,
      original,
      winner: null,
      judgeType: 'human-review',
      revisedAt: now,
    };
  }

  // Overturned. The verdict flips; the scores are left as the model
  // wrote them because a human reviewer overturning a call is not
  // claiming to have re-scored four axes of speaker points, and
  // inventing numbers to match the new winner would be a fabrication
  // sitting in the permanent record.
  const flipped = judgment.winner === 'a' ? 'b' : 'a';
  return {
    disputeState: 'overturned',
    humanReview,
    original,
    winner: flipped,
    judgeType: 'human-review',
    revisedAt: now,
  };
}

// Does this outcome require money and standing to be reversed?
export function requiresReversal(outcome) {
  return outcome === 'overturned' || outcome === 'void';
}
