// ─────────────────────────────────────────────────────────────────────
// /api/stage-judge — the ballot for a debate that happened on the live
// broadcast, including the open-floor kind that has no speeches in it.
//
// Same posture as live-judge.mjs: the request carries nothing but a
// trigger. The transcript, the mode, the motion and the two sides are
// all read from stream_stage/{room} server-side, so a debater can ask
// for a ballot and cannot tell us what the conversation said.
//
// WHAT IS DIFFERENT FROM live-judge, and it is only two things.
//
// 1. THE METHOD. A casual stage round is an open floor: both microphones
//    live, cutting in legal, no turn order. Pointed at that transcript,
//    the speech method reads "the other side never got to finish that"
//    as a dropped argument and quietly converts rudeness into points. So
//    the mode picks the method: `casual` routes to
//    CONVERSATION_ADJUDICATION_CORE, `structured` to the ordinary casual
//    1v1 core. Nothing else about how a verdict is reached changes; it
//    is the same season, the same panel, the same no-tie-break rule.
//
// 2. WHAT THE VERDICT DOES. Nothing, beyond being published and
//    audited. A stage round does NOT move the rating ladder, does not
//    write a judgment record, and settles no market. The two seats were
//    filled by a host choosing who to let on the air, and a host-curated
//    guest slot must not be a way to hand out rating changes. The audit
//    row is still written, because a published verdict with no record of
//    which models produced it is the thing the charter exists to forbid.
// ─────────────────────────────────────────────────────────────────────

import { verifyIdToken, extractBearerToken, isAdminEmail, isOwnerEmail } from './lib/auth.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { buildAdjudicationBlock } from './lib/adjudication.mjs';
import { seasonFor } from './lib/judge-charter.mjs';
import { runPanel } from './lib/judge-run.mjs';
import { auditRecord, writeAudit } from './lib/judge-audit.mjs';
import { deriveSpeakerScores } from './lib/speaker-score.mjs';
import {
  airtimeBrief,
  emptyBoard,
  judgeReadiness,
  seatOf,
  sortTurns,
  transcriptFor,
} from './lib/stage.mjs';

const JUDGE_MODEL = process.env.LIVE_JUDGE_MODEL || 'claude-sonnet-5';
const JUROR_TIMEOUT_MS = Number(process.env.LIVE_JUDGE_JUROR_TIMEOUT_MS || 22000);
const LEASE_MS = 90000;

function safeRoomName(s) {
  return String(s || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
}

const READINESS_COPY = {
  too_short: 'There is not enough of a conversation here to judge. Argue a bit longer and try again.',
  pro_silent: 'Pro barely spoke. A ballot over one side of an argument would be invented, not judged.',
  con_silent: 'Con barely spoke. A ballot over one side of an argument would be invented, not judged.',
};

function buildPrompt(board, turns) {
  const conversation = board.mode === 'casual';
  const system = [
    // The mode picks the method. This one line is the whole difference
    // between judging an exchange and judging a speech round that
    // happens to be interleaved.
    buildAdjudicationBlock({ format: conversation ? 'conversation' : 'quick' }),
    conversation
      ? 'This round was an OPEN FLOOR: both microphones were live for the whole stretch and cutting in was allowed. There was no turn order, so there is nothing procedural to break and nothing procedural to punish.'
      : 'This round ran ALTERNATING TIMED TURNS. One side held the floor at a time. Anything the transcript marks as off-turn is a stage-management matter for the host and must not affect the verdict or the scores.',
    'Return ONE JSON object and nothing else:',
    '{',
    '  "winner": "pro" | "con",',
    '  "proPoints": <number 1-100, one decimal>,',
    '  "conPoints": <number 1-100, one decimal>,',
    conversation
      ? '  "decidingIssue": "<8 words or fewer naming the ONE substantive question the conversation turned on, never a label such as clarity or who spoke more>",'
      : '  "decidingIssue": "<8 words or fewer naming the ONE clash that decided it, the substantive question and not the outcome>",',
    // dimensions BEFORE rfd, and rfd LAST, on purpose. Measured against
    // the live model: this method's ballot runs 1400 to 3000 output
    // tokens, and when the prose came first a long one starved the
    // scorecard and truncated the object mid-`dimensions`, which is the
    // 2026-08-12 failure exactly. Prose last means an overrun costs the
    // tail of one paragraph rather than the whole ballot.
    '  "dimensions": { "clarity": {"pro":<1-10>,"con":<1-10>}, "reasoning": {...}, "responsiveness": {...}, "weighing": {...}, "strategy": {...}, "persuasion": {...} },',
    conversation
      ? '  "rfd": "<the decision, ONE paragraph, LAST so nothing after it can be lost>"'
      : '  "rfd": "<the decision, ONE paragraph, LAST so nothing after it can be lost>"',
    '}',
    // Length is a hard rule rather than a target because it is also the
    // latency budget: output tokens ARE the wall clock here, and a seat
    // that runs past the juror timeout records as a missing vote. Also
    // no line breaks: a literal newline inside a JSON string is invalid
    // and the shared parser does a plain JSON.parse.
    conversation
      ? 'LENGTH IS A HARD RULE. The rfd is ONE paragraph of 110 to 150 words with NO line breaks in it at all. Open with the deciding issue, name the two exchanges that settled it with a short quote each, name what went unanswered, and close with the one thing the losing side needed to do differently. No preamble and no retelling of the transcript.'
      : 'LENGTH IS A HARD RULE. The rfd is ONE paragraph of 110 to 150 words with NO line breaks in it at all. Open with the deciding issue, name the clashes that mattered and who took each, and close with the one thing the losing side needed to change.',
    'EVERY DIMENSION IS AN INDEPENDENT 1-10 SCORE FOR EACH SIDE, NOT A SHARE OF TEN. Both sides can earn an 8 on the same axis. 9-10 exceptional, 7-8 strong, 5-6 mixed, 3-4 weak, 1-2 absent.',
    'SCORE THE AXES HONESTLY AND USE THE WHOLE RANGE. The headline points are COMPUTED from the six axis scores at published weights, so the axes are the real ballot and there is no separate number to soften.',
    conversation
      ? 'In this mode: responsiveness means answering what was actually asked rather than a weaker version of it, strategy means holding the exchange on the question that decided the round, and clarity means being followable in a fast back-and-forth. None of the six may reward volume, persistence, or airtime.'
      : 'persuasion = whether the case moved a reasonable listener hearing it once. It is NOT confidence, fluency, accent, or polish.',
    'RFD STYLE: punctuation is periods, commas, semicolons; never an em dash, never a dash used as a pause. Wrap the two to four phrases that actually decided the round in **double asterisks**; no other markdown and no line breaks.',
  ].filter(Boolean).join('\n\n');

  const pro = (board.seats && board.seats.pro) || {};
  const con = (board.seats && board.seats.con) || {};
  const user = [
    `MODE: ${conversation ? 'Open floor conversation, interruptions allowed' : 'Alternating timed turns'}`,
    `QUESTION: ${String(board.motion || '').slice(0, 500)}`,
    `PRO: ${pro.name || 'Pro'}`,
    `CON: ${con.name || 'Con'}`,
    '',
    airtimeBrief(turns),
    '',
    conversation ? 'TRANSCRIPT (timestamped from the start of the floor; [cuts in over X] marks a line that began while the other side was still talking, and those markers are approximate):' : 'TRANSCRIPT:',
    transcriptFor(turns, board),
  ].join('\n');

  return { system, user };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('POST only', 405, request);

  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) {
    return jsonResponse({ error: 'App verification failed. Reload and try again.', code: 'APP_CHECK' }, 401, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to do that', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); } catch (e) { return errorResponse('Sign in to do that', 401, request); }
  const uid = decoded.sub;

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const db = getDb();
  const streamSnap = await db.collection('site_stream').doc('current').get();
  const stream = streamSnap.exists ? (streamSnap.data() || {}) : {};
  const roomName = safeRoomName(body.room || stream.roomName);
  if (!roomName) return errorResponse('No stage to judge', 404, request);

  const ref = db.collection('stream_stage').doc(roomName);
  const snap = await ref.get();
  if (!snap.exists) return errorResponse('No stage to judge', 404, request);
  const board = { ...emptyBoard(roomName), ...(snap.data() || {}) };

  const host = !!(decoded.email && (isAdminEmail(decoded.email) || isOwnerEmail(decoded.email)));
  const seated = !!seatOf(board, uid);
  if (!host && !seated) return errorResponse('Not on this stage', 403, request);

  // Idempotent. A retry after a dropped response must return the ballot
  // that already exists rather than buying a second panel.
  if (board.ballot && board.ballot.panel) {
    return jsonResponse({ ok: true, already: true, ballot: board.ballot }, 200, request);
  }

  const limited = await checkLayers('stagejudge', 'uid_' + uid, [
    { window: 60 * 60 * 1000, max: 12, label: 'hour' },
  ]);
  if (!limited.ok) return errorResponse('Judging is briefly rate limited. The transcript is saved.', 429, request);

  const turnSnap = await ref.collection('turns').limit(500).get();
  const turns = sortTurns(turnSnap.docs.map((d) => d.data() || {}));

  const ready = judgeReadiness(turns, board);
  if (!ready.ok) {
    return jsonResponse({
      ok: false,
      code: ready.code,
      error: READINESS_COPY[ready.code] || 'There is not enough here to judge.',
      airtime: ready.air,
    }, 200, request);
  }

  // One panel at a time. Two seated debaters both pressing the button is
  // the normal case, not an edge case.
  const now = Date.now();
  const claim = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const d = fresh.exists ? (fresh.data() || {}) : {};
    if (d.ballot && d.ballot.panel) return { kind: 'done', ballot: d.ballot };
    const startedAt = Number(d.judgeStartedAt) || 0;
    if (d.judgeState === 'running' && now - startedAt < LEASE_MS) {
      return { kind: 'busy', retryAfterMs: LEASE_MS - (now - startedAt) };
    }
    tx.set(ref, { status: 'judging', judgeState: 'running', judgeStartedAt: now, updatedAt: now }, { merge: true });
    return { kind: 'claimed' };
  });
  if (claim.kind === 'done') return jsonResponse({ ok: true, already: true, ballot: claim.ballot }, 200, request);
  if (claim.kind === 'busy') {
    return jsonResponse({ ok: false, code: 'judge_in_progress', retryAfterMs: claim.retryAfterMs }, 202, request);
  }

  const { system, user } = buildPrompt(board, turns);
  const season = seasonFor(now);

  let judged;
  try {
    judged = await runPanel(season, system, user, {
      aKey: 'pro',
      bKey: 'con',
      singleModel: JUDGE_MODEL,
      jurorTimeoutMs: JUROR_TIMEOUT_MS,
      scoreScale: 100,
    });
  } catch (err) {
    console.error('[stage-judge] panel failed', roomName, err.message);
    await ref.set({ judgeState: 'failed', status: 'ended', updatedAt: Date.now() }, { merge: true }).catch(() => {});
    return jsonResponse({ ok: false, code: 'judge_failed', error: err.message }, 200, request);
  }

  const format = board.mode === 'casual' ? 'conversation' : 'quick';

  // An even split is not tie-broken here either. On this surface there
  // is no ladder and no market to void, so the honest end state is a
  // published no-winner: the panel disagreed, and saying so is the
  // result.
  if (!judged.ballot || (judged.ballot.winner !== 'pro' && judged.ballot.winner !== 'con')) {
    const unresolved = {
      resolution: (judged.panel && judged.panel.resolution) || 'unresolved',
      panel: judged.panel || null,
      at: Date.now(),
    };
    await ref.set({
      status: 'ended', judgeState: 'unresolved', ballotUnresolved: unresolved, updatedAt: Date.now(),
    }, { merge: true });
    try {
      await writeAudit(db, auditRecord({
        judgmentId: 'stage_' + roomName,
        source: 'stage',
        eventId: roomName,
        season,
        jurorResults: judged.jurorResults,
        panel: judged.panel,
        motion: board.motion || '',
        format,
        clashMapUsed: false,
        now: Date.now(),
      }));
    } catch (err) { console.error('[stage-judge] unresolved audit failed', err.message); }
    return jsonResponse({ ok: false, code: 'unresolved', noWinner: unresolved }, 200, request);
  }

  const derived = deriveSpeakerScores(judged.ballot);
  const ballot = {
    ...judged.ballot,
    proPoints: derived.pro != null ? derived.pro : judged.ballot.proPoints,
    conPoints: derived.con != null ? derived.con : judged.ballot.conPoints,
    scoreScale: 100,
    pointsDerived: derived.derived === true,
    proName: (board.seats && board.seats.pro && board.seats.pro.name) || 'Pro',
    conName: (board.seats && board.seats.con && board.seats.con.name) || 'Con',
    mode: board.mode,
    motion: board.motion || '',
    panel: judged.panel,
    // Said on the ballot rather than only in this file, because a viewer
    // reading a verdict is entitled to know what it moved.
    ranked: false,
    at: Date.now(),
  };

  await ref.set({
    ballot,
    status: 'ended',
    judgeState: 'complete',
    judgedAt: FieldValue.serverTimestamp(),
    updatedAt: Date.now(),
  }, { merge: true });

  try {
    await writeAudit(db, auditRecord({
      judgmentId: 'stage_' + roomName,
      source: 'stage',
      eventId: roomName,
      season,
      jurorResults: judged.jurorResults,
      panel: judged.panel,
      motion: board.motion || '',
      format,
      clashMapUsed: false,
      now: Date.now(),
    }));
  } catch (err) {
    console.error('[stage-judge] audit write failed', roomName, err.message);
  }

  return jsonResponse({ ok: true, ballot }, 200, request);
};

export const config = { path: '/api/stage-judge' };
