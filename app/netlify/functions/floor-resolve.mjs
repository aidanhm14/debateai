// ─────────────────────────────────────────────────────────────
// Scheduled: resolve markets whose round has ended and settle every
// open position pro-rata. Two idempotency guards:
//   1. The market verdict is claimed once and then kept on the market.
//   2. Each position settles in its own transaction that aborts if that
//      position is already settled, so payouts can never double.
// Runs every 5 minutes. Play credits only.
// ─────────────────────────────────────────────────────────────
import { getDb, FieldValue } from './lib/firestore.mjs';
import { computeVerdict, sharpScore, defaultUser } from './lib/floor.mjs';

const MAX_MARKETS_PER_RUN = 80;

export default async () => {
  const stats = { claimed: 0, settledMarkets: 0, settledPositions: 0, errors: 0 };
  try {
    const db = getDb();
    const now = Date.now();

    const dueDocs = await loadSettlementQueue(db);

    for (const doc of dueDocs) {
      const market = doc.data();
      if ((market.resolveAt || 0) > now) continue;

      // 1. claim the market + write the verdict exactly once. If a prior
      // run claimed the verdict but died before finishing positions, reuse
      // the existing result and only sweep positions.
      let claimed = false;
      let verdict = validVerdict(market.result) ? market.result : null;
      try {
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          if (!fresh.exists || fresh.data().positionsSettled) return; // someone else finished it
          const data = fresh.data();
          if ((data.resolveAt || 0) > Date.now()) return;
          verdict = validVerdict(data.result) ? data.result : computeVerdict(data);
          if (!data.settled || !validVerdict(data.result)) {
            tx.update(doc.ref, { settled: true, status: 'settled', result: verdict, positionsSettled: false, settledAt: FieldValue.serverTimestamp() });
          }
          claimed = true;
        });
      } catch (e) {
        stats.errors++;
        console.error('[floor-resolve] claim error', doc.id, e.message);
        continue;
      }
      if (claimed) stats.claimed++;
      if (!claimed || !validVerdict(verdict)) continue;

      // 2. settle the positions against the now-final verdict
      const errorsBeforeSettle = stats.errors;
      await settlePositions(db, doc.ref, market, verdict, stats);
      if (stats.errors === errorsBeforeSettle) {
        await doc.ref.set({ positionsSettled: true, positionsSettledAt: FieldValue.serverTimestamp() }, { merge: true });
        stats.settledMarkets++;
      }
    }

    console.log('[floor-resolve]', JSON.stringify(stats));
    return new Response(JSON.stringify(stats), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[floor-resolve] fatal', err);
    return new Response('error', { status: 500 });
  }
};

async function loadSettlementQueue(db) {
  const markets = db.collection('floor_markets');
  const [queueSnap, legacySnap] = await Promise.all([
    markets.where('positionsSettled', '==', false).limit(MAX_MARKETS_PER_RUN).get(),
    // Legacy markets created before positionsSettled existed still need a
    // path into the queue. Active inventory is intentionally tiny, so this
    // single-field query stays cheap and avoids a composite index.
    markets.where('settled', '==', false).limit(MAX_MARKETS_PER_RUN).get(),
  ]);
  const byId = new Map();
  queueSnap.docs.forEach((doc) => byId.set(doc.id, doc));
  legacySnap.docs.forEach((doc) => byId.set(doc.id, doc));
  return [...byId.values()];
}

function validVerdict(v) {
  return !!v && (v.judge === 'A' || v.judge === 'B');
}

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
  schedule: '*/5 * * * *', // every 5 minutes
};
