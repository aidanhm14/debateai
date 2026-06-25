// ─────────────────────────────────────────────────────────────
// Scheduled: resolve markets whose round has ended and settle every
// open position pro-rata. Two idempotency guards:
//   1. The market is "claimed" in a transaction that aborts if it was
//      already settled, so the verdict is written exactly once.
//   2. Each position is settled in its own transaction that aborts if
//      that position is already settled, so payouts can never double.
// Runs every 2 minutes. Play credits only.
// ─────────────────────────────────────────────────────────────
import { getDb, FieldValue } from './lib/firestore.mjs';
import { computeVerdict, sharpScore, defaultUser } from './lib/floor.mjs';

const MAX_MARKETS_PER_RUN = 40;

export default async () => {
  const stats = { claimed: 0, settledMarkets: 0, settledPositions: 0, errors: 0 };
  try {
    const db = getDb();
    const now = Date.now();

    // markets whose round has ended (single-field inequality → auto-indexed)
    const snap = await db
      .collection('floor_markets')
      .where('resolveAt', '<=', now)
      .orderBy('resolveAt')
      .limit(MAX_MARKETS_PER_RUN)
      .get();

    for (const doc of snap.docs) {
      const market = doc.data();
      if (market.settled) {
        // already has a verdict; sweep any positions a prior run left open
        await settlePositions(db, doc.ref, market, market.result, stats);
        continue;
      }

      const verdict = computeVerdict(market);

      // 1. claim the market + write the verdict exactly once
      let claimed = false;
      try {
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          if (!fresh.exists || fresh.data().settled) return; // someone else claimed it
          tx.update(doc.ref, { settled: true, status: 'settled', result: verdict, settledAt: FieldValue.serverTimestamp() });
          claimed = true;
        });
      } catch (e) {
        stats.errors++;
        console.error('[floor-resolve] claim error', doc.id, e.message);
        continue;
      }
      if (claimed) stats.claimed++;

      // 2. settle the positions against the now-final verdict
      await settlePositions(db, doc.ref, market, verdict, stats);
      stats.settledMarkets++;
    }

    console.log('[floor-resolve]', JSON.stringify(stats));
    return new Response(JSON.stringify(stats), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[floor-resolve] fatal', err);
    return new Response('error', { status: 500 });
  }
};

async function settlePositions(db, marketRef, market, verdict, stats) {
  if (!verdict || (verdict.judge !== 'A' && verdict.judge !== 'B')) return;
  const pool = { A: market.pool.A, B: market.pool.B };
  const total = pool.A + pool.B;
  const marketId = marketRef.id;

  const posSnap = await marketRef.collection('positions').where('settled', '==', false).get();
  for (const pdoc of posSnap.docs) {
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(pdoc.ref);
        if (!fresh.exists || fresh.data().settled) return; // idempotent
        const pos = fresh.data();
        const userRef = db.collection('floor_users').doc(pos.uid);
        const userSnap = await tx.get(userRef);
        const u = userSnap.exists ? userSnap.data() : defaultUser(pos.uid);

        const won = pos.side === verdict.judge;
        const payout = won && pool[pos.side] > 0 ? Math.round((pos.stake * total) / pool[pos.side]) : 0;

        const next = {
          ...u,
          uid: pos.uid,
          credits: (u.credits || 0) + payout,
          returned: (u.returned || 0) + payout,
          bets: (u.bets || 0) + 1,
          wins: (u.wins || 0) + (won ? 1 : 0),
          convSum: (u.convSum || 0) + (pos.mult || 1),
          streak: won ? (u.streak || 0) + 1 : 0,
        };
        next.sharpScore = sharpScore(next);

        tx.set(userRef, { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.update(pdoc.ref, { settled: true, won, payout, settledAt: FieldValue.serverTimestamp() });

        const ledger = db.collection('floor_ledger').doc(pos.uid).collection('txns').doc();
        tx.set(ledger, {
          type: won ? 'settle_win' : 'settle_loss',
          amount: payout,
          balAfter: next.credits,
          marketId,
          note: (won ? 'Hit on ' : 'Missed on ') + market[pos.side].nm + ' · ' + market.fmt,
          ts: FieldValue.serverTimestamp(),
        });
        stats.settledPositions++;
      });
    } catch (e) {
      stats.errors++;
      console.error('[floor-resolve] settle error', pdoc.id, e.message);
    }
  }
}

export const config = {
  schedule: '*/2 * * * *', // every 2 minutes
};
