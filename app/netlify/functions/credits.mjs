// /api/credits — your play-credit balance, and staking on a market.
//
// Credits are free, non-purchasable, non-transferable, non-redeemable
// virtual participation points. There is no code path in this file or
// in lib/credits.mjs that converts them to or from anything.
//
// GET                      -> balance, Sharp Score, record
// POST { action:'stake' }  -> stake on a market
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import {
  CREDITS, canStake, poolMult, impliedPct, ledgerEntry, defaultAccount,
} from './lib/credits.mjs';

const REASONS = {
  no_market: 'That market no longer exists.',
  settled: 'That round is already settled.',
  locked: 'The window on that round just closed.',
  already_staked: 'You already have a position on this round.',
  debater_excluded: 'You are debating this one. You cannot predict your own round.',
};

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to play.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed.', 401, request); }
  const uid = decoded.sub;
  const db = getDb();

  if (request.method === 'GET') {
    const snap = await withDeadline(db.collection('credit_accounts').doc(uid).get(), 2500);
    const a = snap.exists ? snap.data() : defaultAccount(uid, Date.now());
    return jsonResponse({
      credits: a.credits,
      sharpScore: a.sharpScore || 600,
      record: { bets: a.bets || 0, wins: a.wins || 0, streak: a.streak || 0 },
      // Said plainly, on the surface that shows the number.
      disclaimer: 'Virtual participation points. No cash value, not redeemable, not transferable.',
    }, 200, request);
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid request body', 400, request); }

  if (body.action !== 'stake') return errorResponse('Unknown action', 400, request);

  const marketId = String(body.marketId || '');
  const side = body.side === 'A' || body.side === 'B' ? body.side : null;
  const stake = Math.round(Number(body.stake));
  if (!marketId) return errorResponse('Missing market', 400, request);
  if (!side) return errorResponse('Pick a side', 400, request);
  if (!Number.isFinite(stake) || stake < CREDITS.MIN_STAKE || stake > CREDITS.MAX_STAKE) {
    return errorResponse(`Stake between ${CREDITS.MIN_STAKE} and ${CREDITS.MAX_STAKE} credits.`, 400, request);
  }

  const marketRef = db.collection('markets').doc(marketId);
  const acctRef = db.collection('credit_accounts').doc(uid);
  const posRef = marketRef.collection('positions').doc(uid);
  const now = Date.now();

  try {
    const result = await db.runTransaction(async (tx) => {
      const [mSnap, aSnap, pSnap] = await Promise.all([tx.get(marketRef), tx.get(acctRef), tx.get(posRef)]);
      if (!mSnap.exists) throw new Error('That market no longer exists.');
      const m = mSnap.data();

      const gate = canStake({ uid, market: m, position: pSnap.exists ? pSnap.data() : null, nowMs: now });
      if (!gate.ok) throw new Error(REASONS[gate.reason] || 'You cannot stake on this one.');

      const isNew = !aSnap.exists;
      const a = isNew ? defaultAccount(uid, now) : aSnap.data();
      if (stake > (a.credits || 0)) throw new Error('Not enough credits for that stake.');

      const credits = (a.credits || 0) - stake;
      const oddsAtStake = poolMult(m.pool, side);

      tx.set(acctRef, {
        ...a, uid,
        name: String(decoded.name || '').slice(0, 60),
        credits,
        staked: (a.staked || 0) + stake,
        updatedAt: now,
      }, { merge: true });

      tx.set(posRef, {
        uid, side, stake,
        window: gate.window, mult: gate.mult, oddsAtStake,
        marketId, settled: false, payout: 0, createdAt: now,
      });

      const pool = { A: m.pool.A, B: m.pool.B };
      const backers = { A: m.backers.A, B: m.backers.B };
      pool[side] += stake;
      backers[side] += 1;
      tx.update(marketRef, { pool, backers, updatedAt: now });

      // Opening grant is recorded, not assumed, so the ledger sums to
      // the balance for every account from its first entry.
      if (isNew) {
        const g = ledgerEntry({
          kind: 'grant', uid, amount: CREDITS.START, balanceAfter: CREDITS.START,
          refType: 'signup', refId: 'welcome', reason: 'Welcome credits', actor: 'system', now,
        });
        tx.set(db.collection('credit_ledger').doc(uid).collection('txns').doc(g.txnId), g);
      }
      const e = ledgerEntry({
        kind: 'stake', uid, amount: -stake, balanceAfter: credits,
        refType: 'market', refId: marketId,
        reason: 'Backed ' + (side === 'A' ? (m.sideA?.label || 'A') : (m.sideB?.label || 'B')),
        actor: 'system', now,
      });
      tx.set(db.collection('credit_ledger').doc(uid).collection('txns').doc(e.txnId), e);

      return { credits, side, stake, window: gate.window, mult: gate.mult, oddsAtStake, pctA: impliedPct(pool) };
    });
    return jsonResponse({ ok: true, ...result }, 200, request);
  } catch (err) {
    const msg = err && err.message ? err.message : 'Could not place that stake.';
    const expected = /credits|market|stake|side|locked|round|debat|already/i.test(msg);
    if (!expected) console.error('[credits] stake error', err);
    return errorResponse(msg, expected ? 409 : 500, request);
  }
};

export const config = { path: '/api/credits' };
