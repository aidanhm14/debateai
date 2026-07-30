// ─────────────────────────────────────────────────────────────
// Market settlement. The only way credits are paid out.
//
// Reads the judgment, pays the winners pari-mutuel, writes an
// append-only ledger entry per payout, and updates Sharp Score inputs.
// If there is no judgment the market stays open and this returns a
// reason. It never guesses a winner.
//
// NO RAKE. There is no fee term anywhere below. The pool staked by the
// people who were wrong is the whole of what pays the people who were
// right, and the operator's take is identical whichever side wins. That
// is the fee-neutrality promise in lib/judge-charter.mjs, and
// scripts/test-judge-integrity.mjs asserts this file and credits.mjs
// stay free of a rake so it cannot be introduced quietly later.
//
// PROVENANCE GATE. Money only moves on a verdict this server wrote.
// See MONEY_VERDICT_SOURCES below.
//
// REVERSIBILITY. A settled market can be unwound, because an appeal
// that cannot reach already-paid credits is not an appeal. See
// reverseMarket.
// ─────────────────────────────────────────────────────────────
import {
  verdictFrom, payoutFor, ledgerEntry, sharpScore, defaultAccount, CREDITS,
} from './credits.mjs';

const PAGE = 300;

// Which verdicts are allowed to move credits.
//
// `server` verdicts are written by async-sweep inside this deployment.
// `participant` verdicts are written by a debater's own browser, which
// is how the live-round ballot currently reaches Firestore. A verdict
// authored by one of the two people with a stake in it must never
// settle an economy, and it is worse than the house writing it: the
// counterparty wrote the result. judgment.mjs has recorded this
// provenance honestly since it was written; this is the gate that
// finally acts on it.
//
// Consequence, stated plainly: live human rounds do not settle credits
// until their ballot is generated server-side. The rating ladder and the
// public record are unaffected, since both already carry the provenance
// field and neither pays anybody.
export const MONEY_VERDICT_SOURCES = new Set(['server']);

// Ledger ids are deterministic on `refId`, which is what makes a
// retried settlement a no-op rather than a double payment. A market that
// has been reversed and re-settled needs ids that do not collide with
// the run being corrected, so every pass after the first is namespaced
// by its revision number. Revision 0 keeps the original bare id.
function refFor(marketId, rev) {
  const n = Number(rev) || 0;
  return n > 0 ? `${marketId}#r${n}` : marketId;
}

export async function settleMarket(db, marketId, opts = {}) {
  const now = opts.now || Date.now();
  const rev = Number(opts.rev) || 0;
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
    if (!MONEY_VERDICT_SOURCES.has(v.verdictSource)) {
      return { ok: false, reason: 'verdict_not_server_authored' };
    }

    tx.update(marketRef, {
      settled: true,
      status: 'settled',
      result: { side: v.side, judgmentId: v.judgmentId, verdictSource: v.verdictSource },
      judgmentId: v.judgmentId,
      settledAt: now,
      settleRev: rev,
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
        await payOne(db, { marketId, pdoc, pos, payout, now, rev, judgmentId: claim.verdict.judgmentId });
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

async function payOne(db, { marketId, pdoc, pos, payout, now, rev, judgmentId }) {
  const uid = pos.uid || pdoc.id;
  const acctRef = db.collection('credit_accounts').doc(uid);
  const entry = ledgerEntry({
    kind: 'settle', uid, amount: payout, balanceAfter: 0,
    refType: 'market', refId: refFor(marketId, rev),
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

// ── reversal ────────────────────────────────────────────────────────
//
// Unwind a settled market so a corrected verdict can be paid, or so the
// stakes can be refunded. Called by the appeal path when a human
// reviewer overturns or voids a ballot.
//
// An appeal route that cannot reach credits already paid out is
// decoration, so this has to exist. It is the ugly half of the appeal
// promise and it is deliberately explicit rather than clever:
//
//  - Every payout becomes a NEGATIVE `reversal` entry, namespaced by
//    revision so its id cannot collide with the settlement it corrects.
//  - Positions go back to unsettled, so a re-settle pays them again off
//    the corrected winner. Stakes are untouched, because they were never
//    returned to accounts; the pool is still intact and still pays.
//  - Sharp Score inputs are backed out of the account and the score is
//    recomputed, so a reversed call stops counting as a called market.
//
// BALANCES CAN GO NEGATIVE HERE, on purpose. Someone can stake credits
// they were paid by a verdict that later flips, and clamping the
// reversal at zero would leave the ledger's arithmetic false: the sum of
// the entries would stop equalling the balance, which is the one
// property that makes an append-only ledger worth having. Credits are
// free, non-purchasable and non-redeemable, so an underwater balance
// costs the holder nothing real and the staking path already refuses a
// stake larger than the balance. A true ledger beats a flattering one.
export async function reverseMarket(db, marketId, { reason, rev, judgmentId, now } = {}) {
  const at = now || Date.now();
  const revN = Number(rev) || 1;
  const marketRef = db.collection('markets').doc(marketId);
  const snap = await marketRef.get();
  if (!snap.exists) return { reversed: false, reason: 'no_market' };
  const m = snap.data();
  if (!m.settled && !m.positionsSettled) return { reversed: false, reason: 'not_settled' };

  const positions = await marketRef.collection('positions').get();
  const stats = { clawedBack: 0, credits: 0, errors: 0 };

  for (const pdoc of positions.docs) {
    const pos = pdoc.data();
    if (!pos.settled) continue;
    const uid = pos.uid || pdoc.id;
    const payout = Number(pos.payout) || 0;
    const acctRef = db.collection('credit_accounts').doc(uid);
    const entry = ledgerEntry({
      kind: 'reversal', uid, amount: -payout, balanceAfter: 0,
      refType: 'market', refId: refFor(marketId, revN),
      reason: String(reason || 'Verdict reversed on appeal').slice(0, 120),
      actor: 'appeal', now: at,
    });
    const txnRef = db.collection('credit_ledger').doc(uid).collection('txns').doc(entry.txnId);

    try {
      await db.runTransaction(async (tx) => {
        const [aSnap, tSnap, pSnap] = await Promise.all([tx.get(acctRef), tx.get(txnRef), tx.get(pdoc.ref)]);
        if (tSnap.exists) return;                       // already reversed
        if (!pSnap.exists || !pSnap.data().settled) return;

        const a = aSnap.exists ? aSnap.data() : defaultAccount(uid, at);
        const credits = (a.credits || 0) - payout;
        const won = payout > 0;
        const next = {
          ...a,
          uid,
          credits,
          returned: (a.returned || 0) - payout,
          bets: Math.max(0, (a.bets || 0) - 1),
          wins: Math.max(0, (a.wins || 0) - (won ? 1 : 0)),
          convSum: Math.max(0, (a.convSum || 0) - (Number(pos.mult) || 1)),
          // A streak is path-dependent and cannot be reconstructed from
          // one reversed market. Reset rather than guessed: a wrong
          // streak is a claim about a record, and the whole point here
          // is to stop making unbacked claims about records.
          streak: 0,
          updatedAt: at,
        };
        next.sharpScore = sharpScore(next);

        tx.set(acctRef, next, { merge: true });
        tx.set(txnRef, { ...entry, balanceAfter: credits, judgmentId: judgmentId || '' });
        tx.update(pdoc.ref, { settled: false, payout: 0, reversedAt: at, reversedRev: revN });
      });
      stats.clawedBack++;
      stats.credits += payout;
    } catch (e) {
      stats.errors++;
      console.error('[reverse]', marketId, uid, e.message);
    }
  }

  if (!stats.errors) {
    await marketRef.update({
      settled: false,
      positionsSettled: false,
      status: 'open',
      result: null,
      reversedAt: at,
      settleRev: revN,
      reverseReason: String(reason || '').slice(0, 120),
      updatedAt: at,
    }).catch(() => {});
  }
  return { reversed: !stats.errors, stats, rev: revN };
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
