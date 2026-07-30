// The human appeal bench.
//
// GET                                    list appeals (open first)
// POST { action:'resolve', appealId, outcome, reason }
//
// Fix 3, the half a reviewer touches. This is the only surface in the
// codebase that can change a verdict, and it requires a human: there is
// no model call in this file and no scheduled job that resolves an
// appeal on its own. An appeal that expires unread stays open and shows
// up at the top of this list, which is the correct failure mode. A
// system that auto-upheld stale appeals would be house control wearing a
// cron job.
//
// AN OVERTURN IS NOT JUST A FIELD FLIP. Standing and credits have
// already moved by the time anyone appeals, so resolving one has to
// reach both:
//   overturned -> reverse the ladder, reverse the payouts, re-apply and
//                 re-settle off the corrected winner
//   void       -> reverse the ladder, reverse the payouts, refund every
//                 stake at face value
//   upheld     -> nothing moves, but the review is still recorded
//
// Every step is idempotent on a deterministic id, because this runs
// against live balances and a half-finished resolution has to be safe to
// re-drive.
import { requireAdmin } from './lib/admin-auth.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';
import { deleteCachedShared } from './lib/admin-cache.mjs';
import { reverseMarket, settleMarket, voidMarket } from './lib/settle.mjs';
import { marketId as mkMarketId } from './lib/credits.mjs';
import { reverseRoundRating, applyRoundRating } from './lib/rating-apply.mjs';
import { appendRevision } from './lib/judge-audit.mjs';
import {
  APPEAL_COLLECTION, canReview, validOutcome, revisedJudgment, requiresReversal, participantsOf,
} from './lib/judge-appeals.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { db, uid: reviewerUid } = auth;

  if (request.method === 'GET') return jsonResponse(await listAppeals(db), 200, request);
  if (request.method !== 'POST') return errorResponse('GET or POST', 405, request);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Bad JSON', 400, request); }
  if (body.action !== 'resolve') return errorResponse('Unknown action', 400, request);

  const appealRef = db.collection(APPEAL_COLLECTION).doc(String(body.appealId || ''));
  const outcome = String(body.outcome || '');
  if (!validOutcome(outcome)) return errorResponse('Outcome must be upheld, overturned, or void.', 400, request);
  // A reason is mandatory. An unexplained overturn is worth less as
  // evidence than the ballot it replaced.
  const reason = String(body.reason || '').trim();
  if (reason.length < 20) return errorResponse('Give a reason of at least 20 characters. It goes on the public record.', 400, request);

  const aSnap = await appealRef.get();
  if (!aSnap.exists) return errorResponse('No such appeal.', 404, request);
  const appeal = { ...aSnap.data(), id: aSnap.id };

  const jRef = db.collection('judgments').doc(appeal.judgmentId);
  const jSnap = await jRef.get();
  if (!jSnap.exists) return errorResponse('The ballot for this appeal is gone.', 404, request);
  const judgment = { ...jSnap.data(), id: jSnap.id };

  const gate = canReview({ judgment, appeal, reviewerUid });
  if (!gate.ok) {
    return errorResponse(
      gate.reason === 'reviewer_conflict'
        ? 'You debated in this round or filed this appeal. Someone else has to review it.'
        : gate.reason === 'already_resolved' ? 'This appeal is already resolved.' : 'Cannot review this appeal.',
      403, request,
    );
  }

  const now = Date.now();
  const patch = revisedJudgment(judgment, {
    outcome, reviewerUid, reviewerName: body.reviewerName || '', reason, nowMs: now,
  });

  // Flip the verdict and close the appeal together, so the ballot can
  // never sit corrected with the appeal still queued (or the reverse).
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(appealRef);
    if (!fresh.exists || fresh.data().state !== 'open') throw new Error('already_resolved');
    tx.update(jRef, patch);
    tx.update(appealRef, {
      state: 'resolved',
      outcome,
      reviewerUid,
      reviewerName: String(body.reviewerName || '').slice(0, 80),
      reviewReason: reason.slice(0, 2000),
      resolvedAt: now,
    });
  }).catch((err) => { throw err; });

  const effects = { outcome, market: null, rating: null, resettled: null, reapplied: null };
  const rev = (Number(judgment.revision) || 0) + 1;

  if (requiresReversal(outcome)) {
    const mid = mkMarketId(judgment.source, judgment.eventId);
    // Reverse first, always. Re-settling on top of unreversed payouts
    // would pay the corrected winner without clawing back the original
    // one, which mints credits out of an appeal.
    effects.market = await reverseMarket(db, mid, {
      reason: outcome === 'void' ? 'Round voided on appeal' : 'Verdict overturned on appeal',
      rev,
      judgmentId: judgment.id,
      now,
    }).catch((err) => ({ reversed: false, reason: String(err && err.message).slice(0, 120) }));

    effects.rating = await reverseRoundRating(db, {
      source: judgment.source,
      eventId: judgment.eventId,
      uids: participantsOf(judgment),
      rev: Number(judgment.revision) || 0,
      reason: outcome === 'void' ? 'Round voided on appeal' : 'Verdict overturned on appeal',
      now,
    }).catch((err) => ({ reversed: false, reason: String(err && err.message).slice(0, 120) }));

    if (outcome === 'void') {
      // No usable result. Every stake goes back at face value, which is
      // the only side-neutral way to close a market with no winner.
      effects.resettled = await voidMarket(db, mid, 'Round voided on appeal', now)
        .catch((err) => ({ voided: false, reason: String(err && err.message).slice(0, 120) }));
    } else {
      // Overturned. The judgment now carries the corrected winner, so
      // settlement reads it the same way it read the original.
      await jRef.update({ disputeState: 'overturned', revision: rev });
      effects.resettled = await settleMarket(db, mid, { rev, now })
        .catch((err) => ({ settled: false, reason: String(err && err.message).slice(0, 120) }));
      effects.reapplied = await reapplyRating(db, judgment, rev, now)
        .catch((err) => ({ applied: false, reason: String(err && err.message).slice(0, 120) }));
    }
  }

  await appendRevision(db, judgment.id, {
    kind: 'appeal_resolved',
    appealState: 'resolved',
    appealId: appeal.id,
    outcome,
    reviewerUid,
    reason: reason.slice(0, 2000),
    verdictBefore: judgment.winner || null,
    verdictAfter: patch.winner !== undefined ? patch.winner : (judgment.winner || null),
    effects,
    actor: 'human-reviewer',
  }).catch((err) => console.error('[admin-appeals] audit revision failed', judgment.id, err && err.message));

  await deleteCachedShared('judge-reliability-v1').catch(() => {});

  return jsonResponse({ resolved: true, outcome, effects }, 200, request);
};

// Re-apply the ladder off the corrected verdict. The rating layer reads
// a round document rather than a judgment, so the round's ballot winner
// is rewritten in memory to match the reviewer's call. Nothing is
// written back to the round: the original ballot stays exactly as the
// model wrote it, and the correction lives on the judgment and in the
// rating_changes rows.
async function reapplyRating(db, judgment, rev, now) {
  const coll = judgment.source === 'async' ? 'async_rounds' : 'live_rounds';
  const rSnap = await db.collection(coll).doc(judgment.eventId).get();
  if (!rSnap.exists) return { applied: false, reason: 'round_not_found' };
  const d = rSnap.data();
  const labels = judgment.sideLabels || (judgment.source === 'async' ? { a: 'prop', b: 'opp' } : { a: 'pro', b: 'con' });
  const corrected = judgment.winner === 'a' ? labels.a : labels.b;
  return applyRoundRating(db, {
    source: judgment.source,
    eventId: judgment.eventId,
    roundData: { ...d, ballot: { ...(d.ballot || {}), winner: corrected } },
    rev,
    now,
  });
}

async function listAppeals(db) {
  const snap = await db.collection(APPEAL_COLLECTION).orderBy('filedAt', 'desc').limit(200).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const open = rows.filter((r) => r.state === 'open');
  const resolved = rows.filter((r) => r.state !== 'open');
  return {
    // Oldest open appeal first: the queue is a service-level promise and
    // the thing at risk of breaching it should be at the top.
    open: open.sort((a, b) => (a.filedAt || 0) - (b.filedAt || 0)),
    resolved,
    counts: {
      open: open.length,
      resolved: resolved.length,
      overturned: resolved.filter((r) => r.outcome === 'overturned').length,
      upheld: resolved.filter((r) => r.outcome === 'upheld').length,
      void: resolved.filter((r) => r.outcome === 'void').length,
    },
  };
}

export const config = { path: '/api/admin/appeals' };
