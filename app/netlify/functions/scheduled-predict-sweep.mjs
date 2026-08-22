import { getDb, FieldValue } from './lib/firestore.mjs';

// ─────────────────────────────────────────────────────────────
// Scheduled sweep for the prediction board.
//
// WHY THIS EXISTS
// predict.mjs resolves "up to 2 overdue markets inline" on a page load
// and its comment says "the cron + the next loads sweep the rest".
// There was no cron. It was assumed and never written, so the only
// thing draining the board was visitors, at two per visit, on a page
// that was not in the nav at all between 2026-08-19 and 2026-08-21.
//
// Measured on 2026-08-21 before this shipped: 286 markets sitting in
// `open` with every single one past its lock time, against 12 settled.
// The countdown on the board had expired on every card a visitor could
// see, which is a worse first impression than an empty board: an empty
// board says nobody is debating, a board full of dead clocks says
// nothing here works.
//
// THE CHEAP HALF, AND IT IS MOST OF THEM
// Zero bets have ever been placed on this board. Resolving all 286
// would be 286 judge calls to settle nothing, which is real money spent
// to compute verdicts nobody staked on and nobody asked for. So a
// market that expires with NO stake on it is retired without a model
// call at all. It is not marked settled, because no judgment happened
// and a board that prints an unjudged verdict is lying; it is not
// marked void either, because void means stakes came back and there
// were none. `ai_expired` is its own state and it appears on neither
// board.
//
// A market that DOES carry a stake is always judged, however long the
// backlog, because someone's points are in it. Those are bounded per
// run and run concurrently, so wall clock is the slowest judge call
// rather than their sum.
//
// Expiring a market also returns its motion to the pool for free:
// ensureMarkets excludes only `ai_open` and `ai_settled`, so anything
// expired becomes mintable again without a line of extra code.
// ─────────────────────────────────────────────────────────────

// Judged per run. Each is a model call, so this is the cost dial. Stakes
// are always judged first and the remainder of the budget keeps the
// resolved feed moving, because a feed that never gains a row reads as
// abandoned even when the open board is fresh.
const RESOLVE_BUDGET = 6;
// How many of the budget may go to markets nobody staked. At least one,
// so the resolved feed keeps a pulse on a quiet day.
const UNSTAKED_RESOLVE_MAX = 2;
// Retired per run without a judge. Batched writes, so this is cheap and
// the only reason to bound it at all is the Firestore batch ceiling.
const EXPIRE_BUDGET = 400;

const ms = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
};

export default async () => {
  const db = getDb();
  const now = Date.now();
  const out = { expired: 0, resolved: 0, failed: 0, stillOpen: 0, overdue: 0 };

  // Single-field query, same as ensureMarkets, so no composite index.
  const snap = await db.collection('predict_markets').where('liveKey', '==', 'ai_open').get();

  const overdue = snap.docs.filter((d) => {
    const at = ms(d.data().lockAt);
    return at && now >= at;
  });
  out.overdue = overdue.length;
  out.stillOpen = snap.size - overdue.length;
  if (!overdue.length) {
    console.log('[predict-sweep]', JSON.stringify(out));
    return new Response('ok', { status: 200 });
  }

  const staked = overdue.filter((d) => Number(d.data().betCount || 0) > 0);
  const unstaked = overdue.filter((d) => !(Number(d.data().betCount || 0) > 0));

  // ── judge the ones with something riding on them ──────────────────
  const toResolve = staked.slice(0, RESOLVE_BUDGET);
  const spare = Math.min(UNSTAKED_RESOLVE_MAX, RESOLVE_BUDGET - toResolve.length);
  // Oldest first among the unstaked, so the feed gains the rows that
  // have been waiting longest rather than whichever the query returned.
  const unstakedByAge = unstaked
    .slice()
    .sort((a, b) => ms(a.data().lockAt) - ms(b.data().lockAt));
  const alsoResolve = spare > 0 ? unstakedByAge.slice(0, spare) : [];
  const resolveIds = [...toResolve, ...alsoResolve].map((d) => d.id);

  if (resolveIds.length) {
    const origin = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://itsdebatable.com';
    const results = await Promise.allSettled(
      resolveIds.map((id) => resolveViaEndpoint(origin, id)),
    );
    results.forEach((r) => { if (r.status === 'fulfilled' && r.value) out.resolved++; else out.failed++; });
  }

  // ── retire the rest, no model call ────────────────────────────────
  const resolving = new Set(resolveIds);
  const expiring = unstakedByAge.filter((d) => !resolving.has(d.id)).slice(0, EXPIRE_BUDGET);
  for (let i = 0; i < expiring.length; i += 400) {
    const batch = db.batch();
    for (const d of expiring.slice(i, i + 400)) {
      batch.update(d.ref, {
        status: 'expired',
        // Off both board queries. Not settled (nothing was judged) and
        // not void (nothing was staked, so nothing came back).
        liveKey: 'ai_expired',
        expiredAt: FieldValue.serverTimestamp(),
        expiredReason: 'lock passed with no stake',
      });
      out.expired++;
    }
    await batch.commit();
  }

  // Retiring markets frees board slots, so top up in the same run. The
  // list action is what ensureMarkets already hangs off; calling it is
  // how the board refills without a second copy of the minting rules
  // living here and drifting from the one in predict.mjs.
  if (out.expired || out.resolved) {
    const origin = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://itsdebatable.com';
    try {
      await fetch(`${origin}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      out.toppedUp = true;
    } catch { out.toppedUp = false; }
  }

  console.log('[predict-sweep]', JSON.stringify(out));
  return new Response('ok', { status: 200 });
};

// Resolution lives in predict.mjs and is transactional there (it claims
// a market into `resolving` before spending a judge call, so two sweeps
// or a sweep racing a page load cannot double-judge one market). Calling
// its own endpoint reuses that guard rather than duplicating it here,
// which is the failure mode a second copy of settlement logic would
// eventually produce.
async function resolveViaEndpoint(origin, room) {
  try {
    const res = await fetch(`${origin}/api/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve', room }),
    });
    if (!res.ok) return false;
    const j = await res.json().catch(() => null);
    return !!(j && j.ok);
  } catch {
    return false;
  }
}

export const config = {
  // Ten minutes. The lock windows are 6 to 45 minutes, so this keeps the
  // longest a settled market can sit unsettled to roughly one window,
  // and the run costs nothing on a board with no overdue markets.
  schedule: '*/10 * * * *',
};
