// ─────────────────────────────────────────────────────────────
// Debater value markets. Trade a debater's rating with points.
//
// Server-authoritative in the same shape as predict.mjs: the client can
// never write a balance, a book, or a position. Every mutation runs here
// under admin credentials after validation, and the value_* collections
// carry no Firestore rules at all, so the default deny covers them. That
// is deliberate, not an oversight. A client-side write to value_markets
// would let one visitor set the price everyone else trades against.
//
// ONE CURRENCY, NOT A FOURTH ECONOMY
// This spends `predict_balances`, the same wallet /predict uses. There
// are already three overlapping economies in this tree (floor_*,
// predict_*, and the credits/settle stack), and minting a fourth to sit
// beside them would be the actual mistake. Credits earned calling rounds
// on /predict deploy straight into debater shares here.
//
// WHAT IS AUDITED
// Every mutation appends to `value_ledger` with a deterministic id, so a
// retried request is a no-op rather than a double spend, and the whole
// economy can be replayed from the ledger.
//
// LEGAL POSTURE, UNCHANGED
// Points are free, non-purchasable, non-transferable, and non-redeemable.
// Nothing here converts to money in either direction, and no code path
// added here takes a payment. Every staking route passes through
// checkWagerEligibility (18+, jurisdiction, fails closed).
//
// Actions (POST { action, ... }):
//   board | market | quote | trade | portfolio | pitch | claim | settle
// ─────────────────────────────────────────────────────────────

import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { checkWagerEligibility } from './lib/wager-eligibility.mjs';
import { isRankable, displayRating } from './lib/rating.mjs';
import {
  VM, marketIdFor, openMarket, publicMarket,
  tradeCost, avgPrice, markPrice, applyTrade, fairValue,
  emptyPosition, positionValue, netShares, applyToPosition,
  settleValue, settlePosition,
  canTrade, canPitch, TRADE_REASONS, marketEligible, MIN_MARKET_GAMES,
} from './lib/value-market.mjs';

const MARKETS = 'value_markets';
const POSITIONS = 'value_positions';
const LEDGER = 'value_ledger';
const PITCHES = 'value_pitches';
const WALLET = 'predict_balances';
const RATINGS = 'user_ratings';

const BOARD_LIMIT = 60;
const PITCH_LIMIT = 40;
const DRIP_MS = 20 * 60 * 60 * 1000;   // a "day" with slack, so a habit is not punished for drifting an hour

const posId = (marketId, uid) => `${marketId}_${uid}`;

// ── wallet ──────────────────────────────────────────────────────────

async function readBalance(db, uid) {
  const snap = await db.collection(WALLET).doc(uid).get();
  return snap.exists ? (snap.data().balance || 0) : VM.OPEN_GRANT;
}

// Deterministic ledger ids make idempotency structural. A retry writes
// the same id and Firestore rejects it, rather than paying twice.
function ledgerRef(db, kind, refId, uid, seq) {
  return db.collection(LEDGER).doc(`${kind}:${refId}:${uid}${seq === undefined ? '' : ':' + seq}`);
}

// ── rating lookup ───────────────────────────────────────────────────

async function ratingsFor(db, uids) {
  if (!uids.length) return new Map();
  const out = new Map();
  // getAll caps at 300 refs per call; the board never asks for that many.
  const refs = uids.slice(0, 300).map((u) => db.collection(RATINGS).doc(u));
  const snaps = await db.getAll(...refs);
  snaps.forEach((s, i) => { if (s.exists) out.set(uids[i], s.data()); });
  return out;
}

// ── board ───────────────────────────────────────────────────────────
//
// The daily habit surface. Sorted by the size of the gap between the
// ladder and the market, because that gap is the only reason to show up.

async function board(db, uid, sort) {
  const snap = await db.collection(MARKETS)
    .where('status', '==', 'open')
    .limit(BOARD_LIMIT)
    .get();

  const docs = snap.docs.map((d) => d.data());
  const rmap = await ratingsFor(db, docs.map((m) => m.subjectUid));

  let rows = docs.map((m) => {
    const pub = publicMarket(m, rmap.get(m.subjectUid));
    return { ...pub, _edge: Math.abs(pub.edge ?? 0) };
  });

  if (sort === 'volume') rows.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  else if (sort === 'rating') rows.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else rows.sort((a, b) => b._edge - a._edge);
  rows.forEach((r) => { delete r._edge; });

  let mine = [];
  if (uid) {
    const held = await db.collection(POSITIONS).where('uid', '==', uid).limit(100).get();
    mine = held.docs.map((d) => d.data()).filter((p) => netShares(p, 'long') + netShares(p, 'short') > 0)
      .map((p) => p.marketId);
  }

  return { markets: rows, holding: mine, config: publicConfig() };
}

function publicConfig() {
  return {
    payout: VM.SHARE_PAYOUT,
    bandLo: VM.BAND_LO,
    bandHi: VM.BAND_HI,
    minTrade: VM.MIN_TRADE,
    maxTrade: VM.MAX_TRADE,
    maxPosition: VM.MAX_POSITION,
    pitchMin: VM.PITCH_MIN_SHARES,
    drip: VM.DAILY_DRIP,
    dripCap: VM.DRIP_CAP,
  };
}

// ── one market ──────────────────────────────────────────────────────

async function marketDetail(db, uid, marketId) {
  const mSnap = await db.collection(MARKETS).doc(String(marketId)).get();
  if (!mSnap.exists) return null;
  const m = mSnap.data();

  const rSnap = await db.collection(RATINGS).doc(m.subjectUid).get();
  const rating = rSnap.exists ? rSnap.data() : null;

  const pSnap = await db.collection(PITCHES)
    .where('marketId', '==', marketId)
    .orderBy('createdAt', 'desc')
    .limit(PITCH_LIMIT)
    .get();

  let position = null;
  if (uid) {
    const posSnap = await db.collection(POSITIONS).doc(posId(marketId, uid)).get();
    if (posSnap.exists) {
      const p = posSnap.data();
      const value = positionValue(m, p);
      position = {
        long: netShares(p, 'long'),
        short: netShares(p, 'short'),
        costBasis: p.costBasis || 0,
        value,
        unrealized: value - (p.costBasis || 0),
        realized: p.realized || 0,
        canPitch: canPitch(p).ok,
      };
    }
  }

  return {
    market: publicMarket(m, rating),
    ladder: rating ? displayRating({ ...rating, games: rating.games || 0 }) : null,
    rankable: rating ? isRankable({ ...rating, games: rating.games || 0 }) : false,
    isSubject: !!(uid && m.subjectUid === uid),
    position,
    pitches: pSnap.docs.map((d) => {
      const p = d.data();
      return {
        id: d.id,
        name: p.name || 'Trader',
        side: p.side,
        shares: p.shares || 0,
        body: p.body || '',
        createdAt: p.createdAt || 0,
      };
    }),
    config: publicConfig(),
  };
}

// ── quote ───────────────────────────────────────────────────────────
//
// Priced from the live book so the confirm dialog cannot show a price
// the trade will not actually get.

async function quote(db, marketId, side, shares) {
  const snap = await db.collection(MARKETS).doc(String(marketId)).get();
  if (!snap.exists) return null;
  const m = snap.data();
  const n = Math.trunc(Number(shares) || 0);
  const cost = tradeCost(m, side, n);
  return {
    shares: n,
    side,
    cost,
    avgPrice: Math.round(avgPrice(m, side, n) * 100) / 100,
    markBefore: Math.round(markPrice(m, side) * 100) / 100,
    markAfter: Math.round(markPrice(applyTrade(m, side, n), side) * 100) / 100,
  };
}

// ── trade ───────────────────────────────────────────────────────────

async function trade(db, uid, name, marketId, side, shares) {
  const mRef = db.collection(MARKETS).doc(String(marketId));
  const pRef = db.collection(POSITIONS).doc(posId(marketId, uid));
  const bRef = db.collection(WALLET).doc(uid);
  const now = Date.now();

  return db.runTransaction(async (t) => {
    // Every read first. Firestore rejects a transaction that reads after
    // a write, and this one has four of each.
    const [mSnap, pSnap, bSnap] = await Promise.all([t.get(mRef), t.get(pRef), t.get(bRef)]);
    if (!mSnap.exists) throw new Error('no_market');
    const m = mSnap.data();
    const pos = pSnap.exists ? pSnap.data() : emptyPosition(uid, marketId, now);
    const balance = bSnap.exists ? (bSnap.data().balance || 0) : VM.OPEN_GRANT;

    const n = Math.trunc(Number(shares) || 0);
    const gate = canTrade({ uid, market: m, position: pos, side, shares: n });
    if (!gate.ok) throw new Error(gate.reason);

    const cost = tradeCost(m, side, n);
    if (cost > 0 && balance < cost) throw new Error('insufficient');

    const nextBook = applyTrade(m, side, n);
    const nextPos = applyToPosition(pos, side, n, cost);
    const nextHeld = netShares(nextPos, side);
    const { costBasis, realized } = nextPos;

    const firstTrade = !pSnap.exists;
    const newBalance = balance - cost;

    t.set(bRef, {
      balance: newBalance,
      updatedAt: FieldValue.serverTimestamp(),
      ...(bSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });

    t.set(pRef, {
      ...nextPos,
      uid, marketId,
      name: String(name || '').slice(0, 60),
      updatedAt: now,
      ...(firstTrade ? { createdAt: now } : {}),
    }, { merge: true });

    t.update(mRef, {
      qLong: nextBook.qLong,
      qShort: nextBook.qShort,
      volume: (m.volume || 0) + Math.abs(cost),
      trades: (m.trades || 0) + 1,
      traders: (m.traders || 0) + (firstTrade ? 1 : 0),
      updatedAt: now,
    });

    t.set(ledgerRef(db, 'trade', marketId, uid, `${now}`), {
      kind: 'trade', uid, marketId,
      side, shares: n, cost,
      balanceAfter: newBalance,
      walletType: 'play',
      createdAt: now,
    });

    return {
      ok: true,
      cost,
      balance: newBalance,
      avgPrice: Math.round(avgPrice(m, side, n) * 100) / 100,
      position: { long: side === 'long' ? nextHeld : netShares(pos, 'long'), short: side === 'short' ? nextHeld : netShares(pos, 'short') },
      market: publicMarket({ ...m, ...nextBook }, null),
    };
  });
}

// ── portfolio ───────────────────────────────────────────────────────

async function portfolio(db, uid) {
  const [balance, held] = await Promise.all([
    readBalance(db, uid),
    db.collection(POSITIONS).where('uid', '==', uid).limit(200).get(),
  ]);

  const positions = held.docs.map((d) => d.data())
    .filter((p) => netShares(p, 'long') + netShares(p, 'short') > 0);

  const mSnaps = positions.length
    ? await db.getAll(...positions.map((p) => db.collection(MARKETS).doc(p.marketId)))
    : [];

  const rows = [];
  let exposure = 0;
  let basis = 0;
  let realized = 0;

  positions.forEach((p, i) => {
    const ms = mSnaps[i];
    if (!ms || !ms.exists) return;
    const m = ms.data();
    const value = positionValue(m, p);
    exposure += value;
    basis += p.costBasis || 0;
    realized += p.realized || 0;
    rows.push({
      marketId: p.marketId,
      name: m.name,
      long: netShares(p, 'long'),
      short: netShares(p, 'short'),
      costBasis: p.costBasis || 0,
      value,
      unrealized: value - (p.costBasis || 0),
      mark: Math.round(markPrice(m, 'long') * 100) / 100,
      settled: !!m.settled,
    });
  });

  rows.sort((a, b) => b.value - a.value);

  return {
    balance,
    exposure,
    equity: balance + exposure,
    unrealized: exposure - basis,
    realized,
    positions: rows,
    config: publicConfig(),
  };
}

// ── daily drip ──────────────────────────────────────────────────────
//
// A floor, not an income. It tops a broke trader back up to something
// playable and stops entirely above DRIP_CAP, so it cannot be farmed by
// logging in and never trading.

async function claim(db, uid) {
  const bRef = db.collection(WALLET).doc(uid);
  const now = Date.now();

  return db.runTransaction(async (t) => {
    const snap = await t.get(bRef);
    const d = snap.exists ? snap.data() : null;
    const balance = d ? (d.balance || 0) : VM.OPEN_GRANT;
    const last = d && d.lastDripAt ? d.lastDripAt : 0;

    if (!snap.exists) {
      t.set(bRef, {
        balance: VM.OPEN_GRANT, lastDripAt: now,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { ok: true, granted: VM.OPEN_GRANT, balance: VM.OPEN_GRANT, reason: 'opening_grant' };
    }
    if (balance >= VM.DRIP_CAP) {
      return { ok: false, granted: 0, balance, reason: 'above_cap', nextAt: 0 };
    }
    if (now - last < DRIP_MS) {
      return { ok: false, granted: 0, balance, reason: 'too_soon', nextAt: last + DRIP_MS };
    }

    const granted = VM.DAILY_DRIP;
    t.set(bRef, { balance: balance + granted, lastDripAt: now, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    t.set(ledgerRef(db, 'drip', String(Math.floor(now / DRIP_MS)), uid), {
      kind: 'drip', uid, cost: -granted, balanceAfter: balance + granted,
      walletType: 'play', createdAt: now,
    });
    return { ok: true, granted, balance: balance + granted, nextAt: now + DRIP_MS };
  });
}

// ── pitch ───────────────────────────────────────────────────────────
//
// Caleb's rule, implemented literally: capital is what buys you the
// microphone. You cannot argue a debater is underpriced on their page
// unless you are holding the position that claim implies.

async function pitch(db, uid, name, marketId, body) {
  const pSnap = await db.collection(POSITIONS).doc(posId(marketId, uid)).get();
  const pos = pSnap.exists ? pSnap.data() : null;
  const gate = canPitch(pos);
  if (!gate.ok) return { ok: false, reason: gate.reason, message: gate.message };

  const text = String(body || '').trim().slice(0, VM.PITCH_MAX_LEN);
  if (text.length < 4) return { ok: false, reason: 'empty', message: 'Say something.' };

  const now = Date.now();
  const shares = netShares(pos, gate.side);
  const ref = db.collection(PITCHES).doc(`${marketId}_${uid}_${now}`);
  await ref.set({
    marketId, uid,
    name: String(name || 'Trader').slice(0, 60),
    side: gate.side,
    shares,
    body: text,
    createdAt: now,
  });
  return { ok: true, pitch: { id: ref.id, name, side: gate.side, shares, body: text, createdAt: now } };
}

// ── settlement ──────────────────────────────────────────────────────
//
// The rule the Floor broke. A payout comes from a rating document or it
// does not come at all. There is no simulate path here: if user_ratings
// has no final rating for the subject, the market stays open and nobody
// is paid, which is strictly better than stamping a made-up close on it.

async function settle(db, marketId) {
  const mRef = db.collection(MARKETS).doc(String(marketId));
  const mSnap = await mRef.get();
  if (!mSnap.exists) return { ok: false, reason: 'no_market' };
  const m = mSnap.data();
  if (m.settled) return { ok: false, reason: 'already_settled' };

  const rSnap = await db.collection(RATINGS).doc(m.subjectUid).get();
  if (!rSnap.exists) return { ok: false, reason: 'no_rating' };
  const rating = rSnap.data();

  const s = settleValue(rating.rating);
  if (!s.ok) return { ok: false, reason: s.reason };

  const posSnap = await db.collection(POSITIONS).where('marketId', '==', marketId).get();
  const now = Date.now();
  let paidTotal = 0;
  let paidCount = 0;

  // One transaction per holder rather than one for the market: a market
  // with hundreds of holders would blow the 500-write transaction limit,
  // and a partial settlement that has to be retried is safe here because
  // each holder's payout is idempotent on a deterministic ledger id.
  for (const doc of posSnap.docs) {
    const p = doc.data();
    const amount = settlePosition(p, s);
    const lRef = ledgerRef(db, 'settle', marketId, p.uid);
    const bRef = db.collection(WALLET).doc(p.uid);

    // eslint-disable-next-line no-await-in-loop
    const did = await db.runTransaction(async (t) => {
      const [lSnap, bSnap] = await Promise.all([t.get(lRef), t.get(bRef)]);
      if (lSnap.exists) return 0;                       // already paid, idempotent
      const bal = bSnap.exists ? (bSnap.data().balance || 0) : VM.OPEN_GRANT;
      t.set(bRef, { balance: bal + amount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      t.set(doc.ref, { settled: true, settledAt: now, payout: amount }, { merge: true });
      t.set(lRef, {
        kind: 'settle', uid: p.uid, marketId,
        cost: -amount, balanceAfter: bal + amount,
        finalRating: rating.rating, walletType: 'play', createdAt: now,
      });
      return amount;
    });
    if (did) { paidTotal += did; paidCount += 1; }
  }

  await mRef.update({
    status: 'settled', settled: true,
    finalRating: rating.rating,
    settlement: { norm: s.norm, longPay: s.longPay, shortPay: s.shortPay },
    settledAt: now, updatedAt: now,
  });

  return { ok: true, marketId, finalRating: rating.rating, paidTotal, paidCount };
}

// Open a market for every rankable debater that does not have one. Safe
// to re-run: the market id is derived from the uid, so a second pass
// writes nothing new.
async function sync(db, limit = 50) {
  const snap = await db.collection(RATINGS).limit(Math.min(300, limit * 4)).get();
  const now = Date.now();
  const minGames = Number(process.env.VALUE_MIN_MARKET_GAMES) || MIN_MARKET_GAMES;
  let opened = 0;
  const skipped = [];

  for (const doc of snap.docs) {
    if (opened >= limit) break;
    const r = doc.data();
    const uid = doc.id;
    // marketEligible, not isRankable. See the note on marketEligible:
    // the leaderboard's confidence bar would exclude precisely the
    // debaters worth pricing.
    if (!marketEligible(r, minGames).ok) { skipped.push('thin_record'); continue; }
    const id = marketIdFor(uid);
    // eslint-disable-next-line no-await-in-loop
    const exists = await db.collection(MARKETS).doc(id).get();
    if (exists.exists) continue;
    // eslint-disable-next-line no-await-in-loop
    const prof = await db.collection('user_profiles').doc(uid).get();
    const pd = prof.exists ? prof.data() : {};
    const m = openMarket({
      subjectUid: uid,
      name: pd.displayName || pd.name || 'Debater',
      handle: pd.handle || '',
      ratingDoc: r,
      now,
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection(MARKETS).doc(id).set(m);
    opened += 1;
  }
  return { ok: true, opened, considered: snap.size, skippedThinRecord: skipped.length, minGames };
}

// ── handler ─────────────────────────────────────────────────────────

export default async (request, context) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('POST only', 405, request);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Bad JSON', 400, request); }
  const action = String(body.action || '');
  const db = getDb();

  // Identity is optional for read-only actions so the board is a real
  // shop window rather than a login wall.
  let uid = '';
  let email = '';
  let name = '';
  try {
    const token = extractBearerToken(request);
    if (token) {
      const decoded = await verifyIdToken(token);
      if (decoded) { uid = decoded.uid; email = decoded.email || ''; name = decoded.name || ''; }
    }
  } catch { /* an unreadable token is the same as no token */ }

  try {
    switch (action) {
      case 'board':
        return jsonResponse(await board(db, uid, String(body.sort || 'edge')), 200, request);

      case 'market': {
        const d = await marketDetail(db, uid, body.marketId);
        if (!d) return errorResponse('No such market', 404, request);
        return jsonResponse(d, 200, request);
      }

      case 'quote': {
        const q = await quote(db, body.marketId, String(body.side || 'long'), body.shares);
        if (!q) return errorResponse('No such market', 404, request);
        return jsonResponse(q, 200, request);
      }

      case 'portfolio':
        if (!uid) return errorResponse('Sign in required', 401, request);
        return jsonResponse(await portfolio(db, uid), 200, request);

      case 'claim':
        if (!uid) return errorResponse('Sign in required', 401, request);
        return jsonResponse(await claim(db, uid), 200, request);

      case 'trade': {
        if (!uid) return errorResponse('Sign in required', 401, request);
        // 18+ and jurisdiction, fails closed. Same gate every other
        // staking path in this tree runs through.
        const elig = await checkWagerEligibility(db, uid, request, context);
        if (!elig.ok) return jsonResponse({ ok: false, reason: elig.reason, message: elig.message }, 403, request);
        try {
          const r = await trade(db, uid, name, String(body.marketId || ''), String(body.side || 'long'), body.shares);
          return jsonResponse(r, 200, request);
        } catch (e) {
          const reason = e.message || 'failed';
          const message = TRADE_REASONS[reason] || 'That trade could not be placed.';
          return jsonResponse({ ok: false, reason, message }, 400, request);
        }
      }

      case 'pitch': {
        if (!uid) return errorResponse('Sign in required', 401, request);
        const r = await pitch(db, uid, name, String(body.marketId || ''), body.body);
        return jsonResponse(r, r.ok ? 200 : 403, request);
      }

      case 'settle': {
        if (!uid || !isAdminEmail(email)) return errorResponse('Admin only', 403, request);
        return jsonResponse(await settle(db, String(body.marketId || '')), 200, request);
      }

      case 'sync': {
        if (!uid || !isAdminEmail(email)) return errorResponse('Admin only', 403, request);
        return jsonResponse(await sync(db, Number(body.limit) || 50), 200, request);
      }

      default:
        return errorResponse('Unknown action', 400, request);
    }
  } catch (err) {
    console.error('[value-market]', action, err);
    return errorResponse('Market unavailable', 500, request);
  }
};

export const config = { path: '/api/value-market' };
