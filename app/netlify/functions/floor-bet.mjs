// ─────────────────────────────────────────────────────────────
// POST /api/floor/bet  — place a play-credit position on a market.
// Server-authoritative: validates the betting window against the
// SERVER clock, checks balance, and does the whole thing in one
// Firestore transaction (deduct credits, log ledger txn, create the
// position, bump the pari-mutuel pool). Idempotent: one position per
// user per market, enforced by reading the position doc in the txn.
// Play credits only. No cash, no redemption.
// ─────────────────────────────────────────────────────────────
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { FLOOR, windowOf, bettable, poolMult, defaultUser } from './lib/floor.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to play The Floor.', 401, request);

  let uid;
  let displayName = '';
  let photo = '';
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.sub;
    // Stamp identity onto the floor_users doc so the public leaderboard
    // can show a name instead of a bare uid (floor-state reads it back).
    displayName = String(decoded.name || (decoded.email ? decoded.email.split('@')[0] : '') || '').slice(0, 60);
    photo = typeof decoded.picture === 'string' ? decoded.picture.slice(0, 300) : '';
  } catch (err) {
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return errorResponse('Invalid request body', 400, request);
  }

  const marketId = typeof body.marketId === 'string' ? body.marketId : '';
  const side = body.side === 'A' || body.side === 'B' ? body.side : null;
  const stake = Math.round(Number(body.stake));

  if (!marketId) return errorResponse('Missing market', 400, request);
  if (!side) return errorResponse('Pick a side', 400, request);
  if (!Number.isFinite(stake) || stake < FLOOR.MIN_STAKE || stake > FLOOR.MAX_STAKE) {
    return errorResponse(`Stake must be between ${FLOOR.MIN_STAKE} and ${FLOOR.MAX_STAKE} credits.`, 400, request);
  }

  const db = getDb();
  const marketRef = db.collection('floor_markets').doc(marketId);
  const userRef = db.collection('floor_users').doc(uid);
  const posRef = marketRef.collection('positions').doc(uid);
  const ledgerCol = db.collection('floor_ledger').doc(uid).collection('txns');

  try {
    const result = await db.runTransaction(async (tx) => {
      const [marketSnap, userSnap, posSnap] = await Promise.all([tx.get(marketRef), tx.get(userRef), tx.get(posRef)]);

      if (!marketSnap.exists) throw new Error('That market no longer exists.');
      const market = marketSnap.data();
      if (market.settled) throw new Error('That round is already resolved.');

      const now = Date.now();
      const w = windowOf(market, now);
      if (!bettable(w)) throw new Error('That betting window just closed.');

      if (posSnap.exists) throw new Error('You already have a position on this round.');

      const isNew = !userSnap.exists;
      const u = isNew ? defaultUser(uid) : userSnap.data();
      if (stake > (u.credits || 0)) throw new Error('Not enough credits for that stake.');

      const mult = FLOOR.MULT[w];
      const newCredits = (u.credits || 0) - stake;
      const oddsAtBet = poolMult(market.pool, side);

      tx.set(userRef, { ...u, uid, name: displayName || u.name || '', photo: photo || u.photo || '', credits: newCredits, staked: (u.staked || 0) + stake, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

      tx.set(posRef, {
        uid,
        side,
        stake,
        window: w,
        mult,
        oddsAtBet,
        marketId,
        createdAt: FieldValue.serverTimestamp(),
        settled: false,
        payout: 0,
      });

      const pool = { A: market.pool.A, B: market.pool.B };
      const backers = { A: market.backers.A, B: market.backers.B };
      pool[side] += stake;
      backers[side] += 1;
      tx.update(marketRef, { pool, backers });

      // append-only ledger
      if (isNew) {
        tx.set(ledgerCol.doc(), { type: 'grant', amount: FLOOR.START_CREDITS, balAfter: FLOOR.START_CREDITS, note: 'Welcome credits', ts: FieldValue.serverTimestamp() });
      }
      tx.set(ledgerCol.doc(), { type: 'stake', amount: -stake, balAfter: newCredits, marketId, note: 'Backed ' + market[side].nm + ' · ' + market.fmt, ts: FieldValue.serverTimestamp() });

      return { credits: newCredits, window: w, mult, side, stake, oddsAtBet };
    });

    return jsonResponse({ ok: true, ...result }, 200, request);
  } catch (err) {
    // expected validation errors are user-facing; unexpected ones are 500
    const msg = err && err.message ? err.message : 'Could not place that bet.';
    const expected = /window|position|credits|market|round|side|stake/i.test(msg);
    if (!expected) console.error('[floor-bet] error:', err);
    return errorResponse(msg, expected ? 409 : 500, request);
  }
};

export const config = {
  path: '/api/floor/bet',
};
