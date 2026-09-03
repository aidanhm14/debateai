import { getDb } from './lib/firestore.mjs';
import judgeHandler, {
  RECOVERY_GRACE_MS,
  timestampMillis,
  judgeLeaseWaitMs,
} from './live-judge.mjs';

// ── The patient judge ───────────────────────────────────────────────
//
// Why this exists, measured rather than reasoned about (2026-09-03).
// A live round ends, the finishing browser calls /api/live-judge, and the
// season's three-family panel runs inside that request. A synchronous
// invocation dies at roughly 26 seconds, so the jurors are capped at 22.
// Timed against a real stuck round with production keys and a generous
// budget, the three pinned jurors took 25.9s (claude-fable-5), 34.2s
// (gpt-5.5) and 23.3s (gemini-3.6-flash). Every one of them SUCCEEDED.
// They are simply slower than the window they were being given, so all
// three were aborted, the panel recorded votesCast:0, and the client
// scheduled a retry into the identical wall. The round in question did
// that five times and sat on "Ballot is generating" indefinitely. The
// spectators' reading of it was exactly right: the panel had never been
// able to deliberate.
//
// Two things were wrong and this fixes both.
//
// 1. THE PANEL HAD NO WINDOW IT COULD FINISH IN. A scheduled function is
//    a background invocation with a 15 minute ceiling, so it can simply
//    wait for the jurors. The request path keeps its tight budget because
//    a fast panel is still worth trying while somebody is watching; this
//    is the net underneath it, and it is the one that actually lands.
//
// 2. RECOVERY DEPENDED ON AN OPEN BROWSER. `ballotPending` was read by
//    live-judge and by nothing else, and live-judge is only ever invoked
//    by a page. When both debaters closed their tabs the round was
//    orphaned with no ballot and nothing anywhere would ever try again.
//
// It deliberately runs the SAME handler rather than a second judging
// implementation. Provenance is the whole point of that path: the season
// pin, the lease, the audit row, the rating write and verdictSource
// 'server' all have to be identical, and a parallel copy is how those
// quietly drift apart. This file only decides WHICH rooms get another go.
//
// It presents INTERNAL_JUDGE_KEY and is treated as a watcher asking for
// recovery, never as a participant: it waits out the same grace window
// and takes the same lease. With the key unset it cannot call at all.

// Bounded per run so a backlog cannot fan out into an unbounded provider
// bill in one minute. Three rooms at up to ~40s each is about two
// minutes, comfortably inside the background ceiling.
const MAX_PER_RUN = Number(process.env.BALLOT_SWEEP_MAX_PER_RUN || 3);
// Scan width. Small because the healthy steady state is zero rows.
const SCAN_LIMIT = 40;
// Past this, retrying is spending real provider calls on a round nobody
// is waiting for. Both debaters are long gone; the transcript is kept.
const MAX_AGE_MS = Number(process.env.BALLOT_SWEEP_MAX_AGE_MS || 24 * 60 * 60 * 1000);
const MAX_ATTEMPTS = Number(process.env.BALLOT_SWEEP_MAX_ATTEMPTS || 15);

// Pure, so the rules about WHICH rooms get another panel can be tested
// without a database or a provider key. Rows are {id, data} pairs.
export function selectSweepTargets(rows, now = Date.now(), opts = {}) {
  const maxPerRun = opts.maxPerRun != null ? opts.maxPerRun : MAX_PER_RUN;
  const maxAgeMs = opts.maxAgeMs != null ? opts.maxAgeMs : MAX_AGE_MS;
  const maxAttempts = opts.maxAttempts != null ? opts.maxAttempts : MAX_ATTEMPTS;
  const due = [];
  const skipped = { decided: 0, unresolved: 0, tooYoung: 0, leased: 0, abandoned: 0, noStamp: 0 };
  for (const row of rows) {
    const d = (row && row.data) || {};
    if (d.ballot) { skipped.decided += 1; continue; }
    if (d.ballotUnresolved) { skipped.unresolved += 1; continue; }
    const pendingAt = timestampMillis(d.ballotPendingAt);
    if (!pendingAt) { skipped.noStamp += 1; continue; }
    const age = now - pendingAt;
    if (age < RECOVERY_GRACE_MS) { skipped.tooYoung += 1; continue; }
    if (age > maxAgeMs) { skipped.abandoned += 1; continue; }
    if ((Number(d.serverJudgeAttempt) || 0) >= maxAttempts) { skipped.abandoned += 1; continue; }
    if (judgeLeaseWaitMs(d, now) > 0) { skipped.leased += 1; continue; }
    due.push({ room: row.id, age });
  }
  // Oldest first: the round that has been waiting longest is the one
  // whose debaters are most likely to still be checking back.
  due.sort((a, b) => b.age - a.age);
  return { due, batch: due.slice(0, maxPerRun), skipped };
}

function internalRequest(room) {
  return new Request('https://itsdebatable.com/api/live-judge', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-judge-key': String(process.env.INTERNAL_JUDGE_KEY || ''),
    },
    body: JSON.stringify({ room }),
  });
}

export default async () => {
  if (!process.env.INTERNAL_JUDGE_KEY) {
    console.warn('[ballot-sweep] INTERNAL_JUDGE_KEY is unset, sweep disabled');
    return new Response('disabled', { status: 200 });
  }

  const db = getDb();
  const now = Date.now();

  // Single equality on a plain field, so the automatic single-field index
  // covers it and there is no composite index to deploy. Everything else
  // is filtered in memory over at most SCAN_LIMIT rows.
  const snap = await db.collection('live_rounds')
    .where('ballotPending', '==', true)
    .limit(SCAN_LIMIT)
    .get();

  const rows = [];
  snap.forEach((doc) => { rows.push({ id: doc.id, data: doc.data() || {} }); });
  const { due, batch, skipped } = selectSweepTargets(rows, now);

  const results = [];
  // Sequential on purpose. Three rooms in parallel is nine concurrent
  // provider calls, which is how a sweep turns into a rate-limit event.
  for (const item of batch) {
    const t0 = Date.now();
    try {
      const res = await judgeHandler(internalRequest(item.room), {});
      let code = 'ok';
      try {
        const body = await res.clone().json();
        code = body && (body.code || (body.ballot ? 'decided' : 'ok')) || 'ok';
      } catch (e) { /* non-JSON body */ }
      results.push({ room: item.room, status: res.status, code, ms: Date.now() - t0 });
    } catch (err) {
      results.push({ room: item.room, error: err.message, ms: Date.now() - t0 });
    }
  }

  console.log('[ballot-sweep]', JSON.stringify({
    scanned: snap.size, due: due.length, ran: results.length, skipped, results,
  }));
  return new Response('ok', { status: 200 });
};

// Every minute. The healthy steady state is a single query returning
// nothing, and a round that ends is waiting on this to get its ballot,
// so a slower cadence is paid for directly in how long two people sit
// looking at a spinner.
export const config = {
  schedule: '* * * * *',
};
