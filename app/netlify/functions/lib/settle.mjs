// ─────────────────────────────────────────────────────────────
// Market settlement. The only way credits are paid out.
//
// Reads the judgment, pays the winners pari-mutuel, writes an
// append-only ledger entry per payout, and updates Sharp Score inputs.
// If there is no judgment the market stays open and this returns a
// reason. It never guesses a winner.
// ─────────────────────────────────────────────────────────────
import {
  verdictFrom, payoutFor, ledgerEntry, sharpScore, defaultAccount, CREDITS,
} from './credits.mjs';

const PAGE = 300;

export async function settleMarket(db, marketId, opts = {}) {
  const now = opts.now || Date.now();
  const marketRef = db.collection('markets').doc(marketId);

  // 1. Claim the market and stamp the verdict, exactly once.
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(marketRef);
    if (!snap.exists) return { ok: false, reason: 'no_market' };
    const m = snap.data();
    if (m.positionsSettled) return { ok: false, reason: 'already_settled' };

    // Reuse a verdict claimed by an earlier run that died mid-payout.
    if (m.settled && m.result && (m.result.side === 'A' || m.result.side === 'B')) {
      return { ok: true, market: m, verdict: m.result };
    }

    const jSnap = await tx.get(db.collection('judgments').doc(m.judgmentId || `${m.source}_${m.eventId}`));
    const v = verdictFrom(jSnap.exists ? { ...jSnap.data(), id: jSnap.id } : null);
    if (!v.ok) return { ok: false, reason: v.reason };

    tx.update(marketRef, {
      settled: true,
      status: 'settled',
      result: { side: v.side, judgmentId: v.judgmentId, verdictSource: v.verdictSource },
      judgmentId: v.judgmentId,
      settledAt: now,
      updatedAt: now,
    });
    return { ok: true, market: m, verdict: { side: v.side, judgmentId: v.judgmentId } };
  });

  if (!claim.ok) return { settled: false, reason: claim.reason };

  // 2. Pay positions. Separate from the claim so a large book does not
  //    blow the transaction size limit, and so a crash mid-payout can
  //    be resumed: every write is idempotent on a deterministic id.
  const stats = { paid: 0, lost: 0, credited: 0, errors: 0 };
  const winning = claim.verdict.side;
  const pool = claim.market.pool || { A: 0, B: 0 };

  let cursor = null;
  for (;;) {
    let q = marketRef.collection('positions').orderBy('__name__').limit(PAGE);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get();
    if (page.empty) break;
    cursor = page.docs[page.docs.length - 1];

    for (const pdoc of page.docs) {
      const pos = pdoc.data();
      if (pos.settled) continue;
      const payout = payoutFor(pos, winning, pool);
      try {
        await payOne(db, { marketId, pdoc, pos, payout, now, judgmentId: claim.verdict.judgmentId });
        if (payout > 0) { stats.paid++; stats.credited += payout; } else { stats.lost++; }
      } catch (err) {
        stats.errors++;
        console.error('[settle] position', marketId, pdoc.id, err.message);
      }
    }
    if (page.size < PAGE) break;
  }

  if (!stats.errors) {
    await marketRef.update({ positionsSettled: true, updatedAt: Date.now() }).catch(() => {});
  }
  return { settled: true, side: winning, stats };
}

async function payOne(db, { marketId, pdoc, pos, payout, now, judgmentId }) {
  const uid = pos.uid || pdoc.id;
  const acctRef = db.collection('credit_accounts').doc(uid);
  const entry = ledgerEntry({
    kind: 'settle', uid, amount: payout, balanceAfter: 0,
    refType: 'market', refId: marketId,
    reason: payout > 0 ? 'Called it' : 'Missed it',
    actor: 'settlement', now,
  });
  const txnRef = db.collection('credit_ledger').doc(uid).collection('txns').doc(entry.txnId);

  await db.runTransaction(async (tx) => {
    const [aSnap, tSnap, pSnap] = await Promise.all([tx.get(acctRef), tx.get(txnRef), tx.get(pdoc.ref)]);
    // Deterministic id: if this txn exists the payout already happened.
    if (tSnap.exists) return;
    if (pSnap.exists && pSnap.data().settled) return;

    const a = aSnap.exists ? aSnap.data() : defaultAccount(uid, now);
    const won = payout > 0;
    const credits = (a.credits || 0) + payout;
    const next = {
      ...a,
      uid,
      credits,
      returned: (a.returned || 0) + payout,
      bets: (a.bets || 0) + 1,
      wins: (a.wins || 0) + (won ? 1 : 0),
      convSum: (a.convSum || 0) + (Number(pos.mult) || 1),
      streak: won ? (a.streak || 0) + 1 : 0,
      updatedAt: now,
    };
    next.sharpScore = sharpScore(next);

    tx.set(acctRef, next, { merge: true });
    tx.set(txnRef, { ...entry, balanceAfter: credits, judgmentId });
    tx.update(pdoc.ref, { settled: true, payout, settledAt: now });
  });
}

// Void a market nobody can judge: refund every stake at face value.
// Used when a round is cancelled or a judgment is thrown out.
export async function voidMarket(db, marketId, reason, now = Date.now()) {
  const marketRef = db.collection('markets').doc(marketId);
  const snap = await marketRef.get();
  if (!snap.exists) return { voided: false, reason: 'no_market' };
  if (snap.data().positionsSettled) return { voided: false, reason: 'already_settled' };

  const positions = await marketRef.collection('positions').get();
  let refunded = 0;
  for (const pdoc of positions.docs) {
    const pos = pdoc.data();
    if (pos.settled) continue;
    const uid = pos.uid || pdoc.id;
    const stake = Number(pos.stake) || 0;
    const acctRef = db.collection('credit_accounts').doc(uid);
    const entry = ledgerEntry({
      kind: 'reversal', uid, amount: stake, balanceAfter: 0,
      refType: 'market', refId: marketId,
      reason: String(reason || 'Round voided').slice(0, 120), actor: 'system', now,
    });
    const txnRef = db.collection('credit_ledger').doc(uid).collection('txns').doc(entry.txnId);
    try {
      await db.runTransaction(async (tx) => {
        const [aSnap, tSnap] = await Promise.all([tx.get(acctRef), tx.get(txnRef)]);
        if (tSnap.exists) return;
        const a = aSnap.exists ? aSnap.data() : defaultAccount(uid, now);
        const credits = (a.credits || 0) + stake;
        tx.set(acctRef, { ...a, uid, credits, staked: Math.max(0, (a.staked || 0) - stake), updatedAt: now }, { merge: true });
        tx.set(txnRef, { ...entry, balanceAfter: credits });
        tx.update(pdoc.ref, { settled: true, payout: stake, voided: true, settledAt: now });
      });
      refunded++;
    } catch (e) { console.error('[void]', marketId, uid, e.message); }
  }
  await marketRef.update({
    status: 'void', settled: true, positionsSettled: true,
    result: null, voidReason: String(reason || '').slice(0, 120), updatedAt: now,
  });
  return { voided: true, refunded };
}

export { CREDITS };
