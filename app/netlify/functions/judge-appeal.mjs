// Debater-facing appeal route.
//
// POST { action:'file', judgmentId, ground, detail }  file an appeal
// GET  ?judgmentId=...                                read appeal state
//
// Fix 3, the half a debater touches. Filing sets `disputeState:'open'`
// on the judgment, which lib/credits.mjs `verdictFrom` already treats as
// a refusal, so credits stop moving on a verdict that is under review.
// That primitive was written before appeals existed and was never set by
// anything; this is what finally sets it.
//
// A HUMAN decides. There is deliberately no path in this file that asks
// a model to re-judge the round. Re-running the ballot through a bigger
// model is the same circularity with a larger bill, and it is exactly
// the move a plaintiff's lawyer would read out loud.
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getDb } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { appendRevision } from './lib/judge-audit.mjs';
import {
  APPEAL_COLLECTION, appealId, canAppeal, newAppeal, validGround,
  APPEAL_WINDOW_MS,
} from './lib/judge-appeals.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  const db = getDb();

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const judgmentId = String(url.searchParams.get('judgmentId') || '').slice(0, 200);
    if (!judgmentId) return errorResponse('judgmentId required', 400, request);
    return jsonResponse(await appealStatus(db, judgmentId), 200, request);
  }

  if (request.method !== 'POST') return errorResponse('POST or GET', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to appeal a ballot.', 401, request);
  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch {
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }
  // Anonymous accounts are free and unlimited to mint, so an anonymous
  // appeal is an unbounded queue rather than a right. The appellant also
  // has to be a named participant on the round, which an anonymous
  // account cannot be for a rated async round.
  if (decoded.firebase && decoded.firebase.sign_in_provider === 'anonymous') {
    return errorResponse('Appeals need a signed-in account.', 403, request);
  }
  const uid = decoded.sub;

  let body;
  try { body = await request.json(); } catch { return errorResponse('Bad JSON', 400, request); }
  if (body.action !== 'file') return errorResponse('Unknown action', 400, request);

  const judgmentId = String(body.judgmentId || '').slice(0, 200);
  if (!judgmentId) return errorResponse('judgmentId required', 400, request);
  if (!validGround(body.ground)) return errorResponse('Pick a ground for the appeal.', 400, request);

  const jRef = db.collection('judgments').doc(judgmentId);
  const jSnap = await jRef.get();
  if (!jSnap.exists) return errorResponse('No such ballot.', 404, request);
  const judgment = { ...jSnap.data(), id: jSnap.id };

  const aRef = db.collection(APPEAL_COLLECTION).doc(appealId(judgmentId, uid));
  const existing = await aRef.get();

  const gate = canAppeal({ judgment, uid, nowMs: Date.now(), existing: existing.exists });
  if (!gate.ok) return errorResponse(appealDenial(gate), gate.reason === 'not_a_participant' ? 403 : 409, request);

  const appeal = newAppeal({
    judgment,
    uid,
    name: decoded.name || '',
    side: gate.side,
    ground: body.ground,
    detail: body.detail,
    nowMs: Date.now(),
  });

  // Freeze settlement and file the appeal together. If the freeze
  // landed without the appeal, a round would be stuck unsettled with
  // nothing in the queue explaining why.
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(jRef);
    if (!fresh.exists) throw new Error('judgment vanished');
    const cur = fresh.data();
    if (cur.disputeState === 'open') throw new Error('already_under_review');
    tx.set(aRef, appeal);
    tx.update(jRef, { disputeState: 'open', appealCount: (Number(cur.appealCount) || 0) + 1 });
  });

  await appendRevision(db, judgmentId, {
    kind: 'appeal_filed',
    appealState: 'open',
    appealId: appeal.id,
    appellantSide: gate.side,
    ground: appeal.ground,
    actor: 'appellant',
  }).catch((err) => console.error('[judge-appeal] audit revision failed', judgmentId, err && err.message));

  return jsonResponse({
    filed: true,
    appealId: appeal.id,
    state: 'open',
    // Stated rather than implied. An appeal that silently sits in a
    // queue is indistinguishable from an appeal nobody reads.
    settlementFrozen: true,
    windowHours: APPEAL_WINDOW_MS / 3600_000,
    next: 'A human reviewer decides this. Credits do not move on this round while it is open.',
  }, 200, request);
};

function appealDenial(gate) {
  switch (gate.reason) {
    case 'not_a_participant': return 'Only the debaters in a round can appeal its ballot.';
    case 'already_filed': return 'You have already appealed this ballot.';
    case 'already_under_review': return 'This ballot is already under review.';
    case 'window_closed': return 'The appeal window on this ballot has closed.';
    case 'not_signed_in': return 'Sign in to appeal a ballot.';
    default: return 'This ballot cannot be appealed.';
  }
}

// Public read of appeal state for a ballot. The resolution and the
// reviewer's reason are public because the verdict is public; the
// appellant's own written complaint is not returned here, since that is
// their text about a round rather than part of the record of it.
async function appealStatus(db, judgmentId) {
  const snap = await db.collection(APPEAL_COLLECTION).where('judgmentId', '==', judgmentId).limit(10).get();
  const appeals = snap.docs.map((d) => {
    const a = d.data();
    return {
      id: d.id,
      state: a.state,
      ground: a.ground,
      appellantSide: a.appellantSide,
      filedAt: a.filedAt || 0,
      outcome: a.outcome || null,
      reviewReason: a.state === 'resolved' ? (a.reviewReason || '') : '',
      reviewerName: a.state === 'resolved' ? (a.reviewerName || '') : '',
      resolvedAt: a.resolvedAt || 0,
    };
  });
  return {
    judgmentId,
    appeals,
    open: appeals.some((a) => a.state === 'open'),
    windowHours: APPEAL_WINDOW_MS / 3600_000,
  };
}

export const config = { path: '/api/judge/appeal' };
