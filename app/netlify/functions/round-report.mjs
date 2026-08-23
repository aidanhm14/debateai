// ─────────────────────────────────────────────────────────────
// /api/round-report — the audience says a round is over.
//
// POST { room, reason } → { ok, closed, state, reports }
//
// WHY THIS EXISTS. Every listing surface already tells a live round from
// a dead one by the seat heartbeat both debaters write every 30s
// (`lastSeenAt`, ~100s window in watch-live.mjs, live.html and
// spar.html). Nothing told the PERSON ALREADY IN THE ROOM. A spectator
// who followed a direct link, or who was watching when both debaters
// closed their tabs, sat in front of "Speech 1 of 4" and a clock at 5:00
// with no way to learn that nobody was coming, and no way to say so. The
// debaters have the whole no-show apparatus (checkOpponentPresence, the
// "Looking for your debater" strip, the no-show prompt); every bit of it
// is gated `!isSpectator()`.
//
// A REPORT IS EVIDENCE, NOT A VERDICT — same posture as the machine NSFW
// flag (2026-08-18) and the motion-change consent gate (2026-08-12). One
// viewer must never be able to end a round two people are actually in.
// So the outcome depends on whether anybody with standing to object is
// present, read from the server's own copy of the heartbeat rather than
// from anything the caller sends:
//
//   no fresh seat beat  → the round is marked over on the first report.
//                         Nobody is there to object, and the room is
//                         already invisible to every listing, so this
//                         only corrects what the page shows the people
//                         who are still looking at it.
//   fresh seat beat     → NOTHING is closed. The report is counted and
//                         shown to the debaters as a question ("the
//                         audience thinks this is over"), which they
//                         answer with the controls they already have.
//                         The crowd sets the agenda; it does not seize
//                         the round.
//
// The close is deliberately REVERSIBLE and needs no undo endpoint: the
// page renders "over" only while the room is still quiet, so a debater
// who comes back and resumes beating relights their own round. `status`
// is deliberately NOT touched — it has many consumers and a wrong value
// there would break the ballot path; this writes its own fields.
//
// Any verified account may report, anonymous included, because watching
// is open to strangers by design and the close is gated on absence
// rather than on who is asking. A seated debater is turned away: they
// end their own round with their own controls, and letting their report
// through would mean reading their own live heartbeat as the thing
// blocking them.
// ─────────────────────────────────────────────────────────────
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';

const ROOM_MAX = 120;

// Match roomIsLiveNow() in live.html / spar.html and LIVE_WINDOW_MS in
// watch-live.mjs. One number decides "is this round alive" across the
// whole site; a second opinion here would let a round read dead on the
// page it is being watched on and live in the list that offered it.
const LIVE_WINDOW_MS = 100 * 1000;

// A report is one tap on one dead room. The per-uid report document is
// the real idempotence, so these layers only need to stop a loop.
const REPORT_LAYERS = [
  { windowMs: 60 * 1000, max: 8 },
  { windowMs: 60 * 60 * 1000, max: 40 },
];

function millis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number') return v;
  return 0;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to report a round.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Sign in again to report a round.', 401, request); }
  const uid = decoded.sub;

  let body = {};
  try { body = await request.json(); } catch {}
  const room = String(body.room || '').slice(0, ROOM_MAX);
  if (!room) return errorResponse('Missing room', 400, request);
  const reason = body.reason === 'empty' ? 'empty' : 'over';

  const gate = await checkLayers('rrep', uid || callerIp(request), REPORT_LAYERS);
  if (!gate.ok) return errorResponse('Slow down a moment.', 429, request);

  const db = getDb();
  const ref = db.collection('live_rounds').doc(room);
  const reportRef = ref.collection('over_reports').doc(uid);

  try {
    const out = await withDeadline(db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw Object.assign(new Error('Round not found.'), { code: 404 });
      const d = snap.data() || {};
      const now = Date.now();

      // A finished round is not a stuck one. Say so rather than stamping
      // a second ending on top of the ballot that already ended it.
      if (d.ballot) return { state: 'judged', closed: false, reports: d.overReports || 0 };

      if (uid === d.proUid || uid === d.conUid) {
        return { state: 'you_are_debating', closed: false, reports: d.overReports || 0 };
      }

      const beat = millis(d.lastSeenAt);
      const live = beat > 0 && (now - beat) < LIVE_WINDOW_MS;

      // One row per reporter, so a double tap is one report and a
      // re-report after a debater comes and goes still only counts once.
      const prior = await tx.get(reportRef);
      const first = !prior.exists;
      if (first) {
        tx.set(reportRef, {
          at: FieldValue.serverTimestamp(), reason,
          // What was true when they said it. A report filed against a
          // live room and one filed against a dead one are different
          // claims, and only the record can tell them apart later.
          roomWasLive: live, speechIdx: typeof d.speechIdx === 'number' ? d.speechIdx : 0,
        });
      }
      const reports = (d.overReports || 0) + (first ? 1 : 0);

      const patch = {};
      if (first) patch.overReports = FieldValue.increment(1);

      // An ending already on the record and NOT falsified by a later
      // heartbeat stands as it is. Re-stamping it with each new report
      // would walk the timestamp forward, and that timestamp is exactly
      // what the page compares against the last beat to decide whether
      // a debater came back after it — so a moving stamp would make a
      // resumed round read as freshly ended.
      const priorEnd = Number(d.endedAtMs || 0);
      const alreadyEnded = priorEnd > 0 && priorEnd >= beat;
      if (!live && !alreadyEnded) {
        // Nobody with standing to object is in the room. Mark it, and
        // record WHO decided and on what basis, because "an audience
        // member said so while the room was empty" is the whole warrant
        // for ending someone else's round.
        patch.endedAt = FieldValue.serverTimestamp();
        patch.endedBy = 'audience';
        patch.endedReason = 'no_debaters';
        // Kept as a plain number so the page can tell an ending stamped
        // now from one stamped before a debater's last beat.
        patch.endedAtMs = now;
      }
      if (Object.keys(patch).length) tx.update(ref, patch);

      return { state: live ? 'still_live' : 'ended', closed: !live, reports, counted: first };
    }), 4000);

    return jsonResponse({ ok: true, ...out }, 200, request);
  } catch (err) {
    if (err && err.code === 404) return errorResponse('Round not found.', 404, request);
    console.warn('[round-report] failed', room, err && err.message);
    return errorResponse('Could not file that. Try again.', 503, request);
  }
};

export const config = { path: '/api/round-report' };
