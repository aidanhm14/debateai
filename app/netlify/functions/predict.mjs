// Prediction market on real human rounds, AI-judged. POINTS ONLY (virtual,
// non-redeemable). Server-authoritative: the client can NEVER write balances,
// pools, or payouts. every economy mutation goes through this function with
// admin credentials, after validation. Firestore rules deny all client writes
// to the predict_* collections (see firestore.rules), so even a malicious
// client can only READ public market state + its own balance.
//
// Anti-insider-trading model:
//   - self-exclusion: the two debaters of a round cannot bet on it.
//   - mid-round lock: bets are rejected after market.lockAt (set to the
//     middle of the round when the market opens).
//   - blind: bets are never readable by other clients (rules deny read on
//     the bets subcollection); only this function sees them.
//   - settlement is server-side + idempotent; payouts derive from the final
//     pool, parimutuel.
//   - the verdict is the round's AI-judge result. settle() prefers the
//     verdict recorded on live_rounds/{room} (the canonical round result)
//     and only falls back to the caller-supplied verdict. settle can only be
//     called by a debater of that round (who is self-excluded from betting,
//     so has no direct payout incentive). v-next hardening: re-judge the
//     transcript server-side so settlement needs zero trust in any client.
//
// Actions (POST { action, ... }): state | open | bet | settle.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';

const START_BALANCE = 1000;          // seed for a new predictor
const MAX_STAKE = 5000;              // sanity cap per bet
const DEFAULT_LOCK_SEC = 240;        // fallback "middle of the round" if caller gives none
const MAX_LOCK_SEC = 1800;           // never hold a market open > 30 min
const SIDES = { pro: 1, con: 1 };

function tierFor(r){
  if (r >= 1500) return 'Oracle';
  if (r >= 1300) return 'Forecaster';
  if (r >= 1150) return 'Pundit';
  if (r >= 1000) return 'Spectator';
  return 'Rookie';
}

// Seed a balance doc the first time we see a user. Returns the balance.
async function ensureBalance(db, uid) {
  const ref = db.collection('predict_balances').doc(uid);
  const snap = await ref.get();
  if (snap.exists) return snap.data().balance || 0;
  await ref.set({ balance: START_BALANCE, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return START_BALANCE;
}

function publicMarket(m, id) {
  if (!m) return null;
  return {
    room: id,
    motion: m.motion || '',
    format: m.format || '',
    proName: m.proName || 'Pro',
    conName: m.conName || 'Con',
    status: m.status || 'open',
    lockAt: m.lockAt ? (m.lockAt.toMillis ? m.lockAt.toMillis() : m.lockAt) : null,
    poolPro: m.poolPro || 0,
    poolCon: m.poolCon || 0,
    betCount: m.betCount || 0,
    verdict: m.verdict || null,
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); } catch (e) { return errorResponse('Invalid token', 401, request); }
  const uid = decoded.sub;
  const name = String((decoded.name || '').split(/\s+/)[0] || 'Anon').slice(0, 24);

  let body;
  try { body = await request.json(); } catch (e) { return errorResponse('Bad JSON', 400, request); }
  const action = body && body.action;
  const db = getDb();

  // ── state: my balance + (optional) a market + my bet + top leaderboard ──
  if (action === 'state') {
    const balance = await ensureBalance(db, uid);
    const out = { ok: true, balance, tier: tierFor(0) };
    const room = body.room && String(body.room).slice(0, 80);
    if (room) {
      const mSnap = await db.collection('predict_markets').doc(room).get();
      out.market = publicMarket(mSnap.data(), room);
      const bSnap = await db.collection('predict_markets').doc(room).collection('bets').doc(uid).get();
      out.myBet = bSnap.exists ? { pick: bSnap.data().pick, stake: bSnap.data().stake } : null;
    }
    // top leaderboard (cheap: a small ordered read)
    try {
      const lb = await db.collection('predict_leaderboard').orderBy('rating', 'desc').limit(12).get();
      out.leaderboard = lb.docs.map(d => ({ name: d.data().name || 'Anon', rating: d.data().rating || 1000, tier: tierFor(d.data().rating || 1000), me: d.id === uid }));
      const meLb = await db.collection('predict_leaderboard').doc(uid).get();
      out.tier = tierFor(meLb.exists ? (meLb.data().rating || 1000) : 1000);
      out.rating = meLb.exists ? (meLb.data().rating || 1000) : 1000;
    } catch (e) { out.leaderboard = []; }
    return jsonResponse(out, 200, request);
  }

  // ── open: create the market for a live round (called by a debater) ──────
  if (action === 'open') {
    const room = body.room && String(body.room).slice(0, 80);
    if (!room) return errorResponse('Missing room', 400, request);
    const proUid = String(body.proUid || ''), conUid = String(body.conUid || '');
    // only a participant of the round may open its market
    if (uid !== proUid && uid !== conUid) return errorResponse('Not a participant', 403, request);
    const ref = db.collection('predict_markets').doc(room);
    const existing = await ref.get();
    if (existing.exists) return jsonResponse({ ok: true, market: publicMarket(existing.data(), room), already: true }, 200, request);
    let lockSec = parseInt(body.lockInSec, 10);
    if (!Number.isFinite(lockSec) || lockSec <= 0) lockSec = DEFAULT_LOCK_SEC;
    lockSec = Math.min(MAX_LOCK_SEC, lockSec);
    const lockAt = new Date(Date.now() + lockSec * 1000);
    const doc = {
      room, proUid, conUid,
      proName: String(body.proName || 'Pro').slice(0, 40),
      conName: String(body.conName || 'Con').slice(0, 40),
      motion: String(body.motion || '').slice(0, 300),
      format: String(body.format || '').slice(0, 40),
      status: 'open', lockAt, createdAt: FieldValue.serverTimestamp(),
      poolPro: 0, poolCon: 0, betCount: 0, verdict: null,
    };
    await ref.set(doc);
    return jsonResponse({ ok: true, market: publicMarket(doc, room) }, 200, request);
  }

  // ── bet: place a points bet (server-authoritative, atomic) ──────────────
  if (action === 'bet') {
    const room = body.room && String(body.room).slice(0, 80);
    const pick = body.pick;
    let stake = parseInt(body.stake, 10);
    if (!room) return errorResponse('Missing room', 400, request);
    if (!SIDES[pick]) return errorResponse('Bad side', 400, request);
    if (!Number.isFinite(stake) || stake < 1) return errorResponse('Bad stake', 400, request);
    stake = Math.min(MAX_STAKE, stake);
    await ensureBalance(db, uid);

    const mRef = db.collection('predict_markets').doc(room);
    const balRef = db.collection('predict_balances').doc(uid);
    const betRef = mRef.collection('bets').doc(uid);

    try {
      const result = await db.runTransaction(async (t) => {
        const m = await t.get(mRef);
        if (!m.exists) throw new Error('no-market');
        const md = m.data();
        if (md.status !== 'open') throw new Error('closed');
        const lockMs = md.lockAt && md.lockAt.toMillis ? md.lockAt.toMillis() : md.lockAt;
        if (lockMs && Date.now() >= lockMs) throw new Error('locked');
        if (uid === md.proUid || uid === md.conUid) throw new Error('self-exclusion');
        const existingBet = await t.get(betRef);
        if (existingBet.exists) throw new Error('already-bet');
        const bal = await t.get(balRef);
        const balance = bal.exists ? (bal.data().balance || 0) : 0;
        if (balance < stake) throw new Error('insufficient');
        // All reads must precede writes in a transaction. seed the leaderboard
        // doc at the 1000 base so settle()'s increment(delta) builds on 1000,
        // not on 0.
        const lbRef = db.collection('predict_leaderboard').doc(uid);
        const lbSnap = await t.get(lbRef);
        t.update(balRef, { balance: FieldValue.increment(-stake), updatedAt: FieldValue.serverTimestamp() });
        t.set(betRef, { uid, name, pick, stake, createdAt: FieldValue.serverTimestamp() });
        t.update(mRef, {
          [pick === 'pro' ? 'poolPro' : 'poolCon']: FieldValue.increment(stake),
          betCount: FieldValue.increment(1),
        });
        if (!lbSnap.exists) t.set(lbRef, { uid, name, rating: 1000, bets: 0, wins: 0, net: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        return { balance: balance - stake };
      });
      return jsonResponse({ ok: true, balance: result.balance }, 200, request);
    } catch (e) {
      const msg = String(e.message || e);
      const map = { 'no-market': 'No open market', 'closed': 'Betting is closed', 'locked': 'Betting locked at the middle speeches', 'self-exclusion': "You can't bet on a round you're in", 'already-bet': 'You already bet this round', 'insufficient': 'Not enough points' };
      return errorResponse(map[msg] || 'Could not place bet', 400, request);
    }
  }

  // ── lock: close betting at the middle speeches (called by a debater) ────
  // Time-based lockAt is unreliable for human rounds (pauses, prep), so the
  // live round triggers this when the round actually crosses its middle speech.
  if (action === 'lock') {
    const room = body.room && String(body.room).slice(0, 80);
    if (!room) return errorResponse('Missing room', 400, request);
    const mRef = db.collection('predict_markets').doc(room);
    const m = await mRef.get();
    if (!m.exists) return errorResponse('No market', 404, request);
    const md = m.data();
    if (uid !== md.proUid && uid !== md.conUid) return errorResponse('Not a participant', 403, request);
    if (md.status === 'open') await mRef.update({ status: 'locked', lockedAt: FieldValue.serverTimestamp() });
    return jsonResponse({ ok: true, status: 'locked' }, 200, request);
  }

  // ── settle: resolve the market by the AI verdict (idempotent) ───────────
  if (action === 'settle') {
    const room = body.room && String(body.room).slice(0, 80);
    if (!room) return errorResponse('Missing room', 400, request);
    const mRef = db.collection('predict_markets').doc(room);

    // Prefer the canonical round verdict if the round recorded one.
    let verdict = null;
    try {
      const lr = await db.collection('live_rounds').doc(room).get();
      if (lr.exists && (lr.data().verdict === 'pro' || lr.data().verdict === 'con')) verdict = lr.data().verdict;
    } catch (e) { /* live_rounds may not exist for this room */ }
    if (!verdict && (body.verdict === 'pro' || body.verdict === 'con')) verdict = body.verdict;
    if (!verdict) return errorResponse('No verdict', 400, request);

    // Authorize: only a debater of this round may trigger settlement.
    const pre = await mRef.get();
    if (!pre.exists) return errorResponse('No market', 404, request);
    const pm = pre.data();
    if (uid !== pm.proUid && uid !== pm.conUid) return errorResponse('Not a participant', 403, request);
    if (pm.status === 'settled') return jsonResponse({ ok: true, already: true, verdict: pm.verdict }, 200, request);

    const bets = await mRef.collection('bets').get();
    const total = (pm.poolPro || 0) + (pm.poolCon || 0);
    const winnerPool = verdict === 'pro' ? (pm.poolPro || 0) : (pm.poolCon || 0);

    const batch = db.batch();
    batch.update(mRef, { status: 'settled', verdict, settledAt: FieldValue.serverTimestamp() });

    bets.forEach((b) => {
      const d = b.data();
      const won = d.pick === verdict;
      const impliedProb = total > 0 ? ((d.pick === 'pro' ? (pm.poolPro || 0) : (pm.poolCon || 0)) / total) : 0.5;
      const payout = (won && winnerPool > 0) ? Math.floor(d.stake * total / winnerPool) : 0;
      const ratingDelta = won ? Math.round(6 + 30 * (1 - impliedProb)) : -Math.round(6 + 30 * impliedProb);
      if (payout > 0) {
        batch.update(db.collection('predict_balances').doc(d.uid), { balance: FieldValue.increment(payout), updatedAt: FieldValue.serverTimestamp() });
      }
      const lbRef = db.collection('predict_leaderboard').doc(d.uid);
      batch.set(lbRef, {
        uid: d.uid, name: d.name || 'Anon',
        rating: FieldValue.increment(ratingDelta),
        bets: FieldValue.increment(1),
        wins: FieldValue.increment(won ? 1 : 0),
        net: FieldValue.increment(won ? (payout - d.stake) : -d.stake),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    await batch.commit();
    return jsonResponse({ ok: true, verdict, settled: bets.size, pool: total }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};
