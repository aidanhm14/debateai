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

function ms(v){ return v ? (v.toMillis ? v.toMillis() : v) : null; }
function publicMarket(m, id) {
  if (!m) return null;
  return {
    room: id,
    kind: m.kind || 'human',
    motion: m.motion || '',
    format: m.format || '',
    proName: m.proName || 'Pro',
    conName: m.conName || 'Con',
    proCase: m.proCase || '',
    conCase: m.conCase || '',
    status: m.status || 'open',
    lockAt: ms(m.lockAt),
    resolvesAt: ms(m.lockAt),
    poolPro: m.poolPro || 0,
    poolCon: m.poolCon || 0,
    betCount: m.betCount || 0,
    verdict: m.verdict || null,
    rfd: m.rfd || '',
    settledAt: ms(m.settledAt),
  };
}

// ── App-run AI markets ────────────────────────────────────────────────
// Always-on markets so /predict is a live market even with no human rounds.
// Each market = a motion with two framed sides; the AI judge resolves it at
// lockAt. The outcome is genuinely unknown until resolution (you predict the
// judge's call), so no sealing is needed; bets just lock before resolution.
const MOTION_BANK = [
  { m:'This house would ban targeted political advertising.', pro:'Microtargeting fractures the shared public square and lets campaigns lie privately to narrow slices of voters.', con:'A ban hands incumbents and big brands the advantage; small challengers rely on cheap targeted reach to be heard.' },
  { m:'This house believes social media has done more harm than good.', pro:'Engagement-maximizing feeds trade teen mental health and shared truth for time-on-app.', con:'It collapsed the cost of organizing, learning, and reaching an audience for billions with no other platform.' },
  { m:'This house would require AI systems to disclose their training data.', pro:'Without provenance you cannot audit bias, theft, or safety; disclosure is the floor for accountability.', con:'Forced disclosure leaks trade secrets and entrenches incumbents who can afford the compliance and litigation.' },
  { m:'This house regrets the rise of the gig economy.', pro:'It rebranded precarity as freedom and offloaded every employer risk onto the worker.', con:'It gave flexible income to millions locked out of rigid 9-to-5 work and undercut exploitative local monopolies.' },
  { m:'This house would abolish standardized testing in university admissions.', pro:'The tests measure wealth and prep access more than aptitude and entrench inequality.', con:'Removing the one common yardstick makes admissions more arbitrary and easier for the connected to game.' },
  { m:'This house believes billionaire philanthropy does more harm than good.', pro:'It launders reputations and lets unelected donors set public priorities with no accountability.', con:'It funds moonshots and unpopular causes that slow, vote-seeking governments never would.' },
  { m:'This house would let cities ban cars from their centers.', pro:'Car-free centers cut deaths, emissions, and noise while reviving street life and local trade.', con:'It punishes the disabled, tradespeople, and the poor who cannot just switch to a bike.' },
  { m:'This house believes remote work has been bad for early-career workers.', pro:'Juniors lose the ambient mentorship, networks, and visibility that build a career.', con:'It widened access, cut brutal commutes, and let talent compete regardless of geography.' },
  { m:'This house would make voting compulsory.', pro:'Universal turnout pulls policy toward the median citizen and away from extreme, motivated minorities.', con:'Coercing the disengaged adds noise, not signal, and a non-vote is itself legitimate speech.' },
  { m:'This house would ban influencers from marketing to children.', pro:'Kids cannot tell a friend from an ad, and parasocial trust makes the manipulation worse.', con:'It is unenforceable, kills a real income ladder, and parents, not the state, should police it.' },
];
function newRoomId(){ return 'ai-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
const AI_TARGET_OPEN = 6;
function aiLockWindowMs(){ return (15 + Math.floor(Math.random() * 75)) * 60 * 1000; } // 15-90 min betting window

async function ensureMarkets(db) {
  // Single-field query (liveKey) so no composite index is needed.
  const open = await db.collection('predict_markets').where('liveKey', '==', 'ai_open').get();
  const need = AI_TARGET_OPEN - open.size;
  if (need <= 0) return;
  const batch = db.batch();
  for (let i = 0; i < need; i++) {
    const pick = MOTION_BANK[Math.floor(Math.random() * MOTION_BANK.length)];
    const ref = db.collection('predict_markets').doc(newRoomId());
    batch.set(ref, {
      kind: 'ai', liveKey: 'ai_open', motion: pick.m, proName: 'Pro', conName: 'Con',
      proCase: pick.pro, conCase: pick.con, format: 'quick',
      proUid: '', conUid: '',
      status: 'open', lockAt: new Date(Date.now() + aiLockWindowMs()),
      createdAt: FieldValue.serverTimestamp(), poolPro: 0, poolCon: 0, betCount: 0, verdict: null,
    });
  }
  await batch.commit();
}

// Ask the AI judge to call a market's motion. Returns { verdict, rfd }.
async function judgeMotion(origin, m) {
  const sys = 'You are an impartial competitive-debate judge. Decide which side wins the motion on the merits of the two framed cases. Be decisive. Respond ONLY with compact JSON: {"winner":"pro"|"con","reason":"one tight sentence"}';
  const usr = 'Motion: ' + m.motion + '\nPro/Government case: ' + (m.proCase || '') + '\nCon/Opposition case: ' + (m.conCase || '') + '\n\nWho wins? JSON only.';
  const r = await fetch(origin + '/api/claude', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, stream: false, system: sys, messages: [{ role: 'user', content: usr }], _feature: 'predict-resolve' }),
  });
  const txt = await r.text();
  let inner = txt;
  try { const j = JSON.parse(txt); if (j && Array.isArray(j.content)) inner = j.content.map(c => c.text || '').join(''); } catch (e) {}
  const a = inner.indexOf('{'), b = inner.lastIndexOf('}');
  if (a >= 0 && b > a) { try { const o = JSON.parse(inner.slice(a, b + 1)); const w = String(o.winner || '').toLowerCase(); if (w === 'pro' || w === 'con') return { verdict: w, rfd: String(o.reason || '').slice(0, 240) }; } catch (e) {} }
  // Fallback: deterministic-ish coin from the motion text so a parse miss still resolves.
  return { verdict: (m.motion.length % 2 === 0) ? 'pro' : 'con', rfd: '' };
}

// Settle a market to a verdict (parimutuel). Shared by human-round settle + AI resolve.
async function settleMarket(db, mRef, pm, verdict, rfd) {
  const bets = await mRef.collection('bets').get();
  const total = (pm.poolPro || 0) + (pm.poolCon || 0);
  const winnerPool = verdict === 'pro' ? (pm.poolPro || 0) : (pm.poolCon || 0);
  const batch = db.batch();
  batch.update(mRef, { status: 'settled', liveKey: 'ai_settled', verdict, rfd: rfd || pm.rfd || '', settledAt: FieldValue.serverTimestamp() });
  bets.forEach((b) => {
    const d = b.data();
    const won = d.pick === verdict;
    const impliedProb = total > 0 ? ((d.pick === 'pro' ? (pm.poolPro || 0) : (pm.poolCon || 0)) / total) : 0.5;
    const payout = (won && winnerPool > 0) ? Math.floor(d.stake * total / winnerPool) : 0;
    const ratingDelta = won ? Math.round(6 + 30 * (1 - impliedProb)) : -Math.round(6 + 30 * impliedProb);
    if (payout > 0) batch.update(db.collection('predict_balances').doc(d.uid), { balance: FieldValue.increment(payout), updatedAt: FieldValue.serverTimestamp() });
    batch.set(db.collection('predict_leaderboard').doc(d.uid), {
      uid: d.uid, name: d.name || 'Anon', rating: FieldValue.increment(ratingDelta),
      bets: FieldValue.increment(1), wins: FieldValue.increment(won ? 1 : 0),
      net: FieldValue.increment(won ? (payout - d.stake) : -d.stake), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
  return { settled: bets.size, pool: total };
}

// Resolve one AI market if it's past lockAt. Claim-guarded so it judges once.
async function resolveAiMarket(db, origin, room) {
  const mRef = db.collection('predict_markets').doc(room);
  const claimed = await db.runTransaction(async (t) => {
    const s = await t.get(mRef);
    if (!s.exists) return null;
    const md = s.data();
    if (md.kind !== 'ai' || md.status === 'settled' || md.status === 'resolving') return null;
    if (!ms(md.lockAt) || Date.now() < ms(md.lockAt)) return null;
    t.update(mRef, { status: 'resolving', liveKey: 'ai_resolving' });
    return md;
  });
  if (!claimed) return null;
  const { verdict, rfd } = await judgeMotion(origin, claimed);
  const fresh = await mRef.get();
  await settleMarket(db, mRef, fresh.data(), verdict, rfd);
  return verdict;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  // Auth is OPTIONAL so the market board (`list`) is browsable signed-out.
  // Every mutating / user-specific action below requires a uid (guarded next).
  const token = extractBearerToken(request);
  let decoded = null;
  if (token) { try { decoded = await verifyIdToken(token); } catch (e) { decoded = null; } }
  const uid = decoded ? decoded.sub : null;
  const name = decoded ? String((decoded.name || '').split(/\s+/)[0] || 'Anon').slice(0, 24) : 'Anon';

  let body;
  try { body = await request.json(); } catch (e) { return errorResponse('Bad JSON', 400, request); }
  const action = body && body.action;
  const db = getDb();
  if (!uid && action !== 'list') return errorResponse('Sign in to do that', 401, request);

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

  // ── list: the live AI market board (Kalshi-style) ──────────────────────
  if (action === 'list') {
    const origin = new URL(request.url).origin;
    try { await ensureMarkets(db); } catch (e) {}
    // Resolve up to 2 overdue markets inline (bounded latency); the cron + the
    // next loads sweep the rest.
    try {
      const openish = await db.collection('predict_markets').where('liveKey', '==', 'ai_open').get();
      let did = 0;
      for (const d of openish.docs) {
        if (did >= 2) break;
        if (ms(d.data().lockAt) && Date.now() >= ms(d.data().lockAt)) { await resolveAiMarket(db, origin, d.id); did++; }
      }
    } catch (e) {}
    const balance = uid ? await ensureBalance(db, uid) : null;
    const out = { ok: true, balance, signedIn: !!uid, markets: [] };
    try {
      const openSnap = await db.collection('predict_markets').where('liveKey', '==', 'ai_open').get();
      const settledSnap = await db.collection('predict_markets').where('liveKey', '==', 'ai_settled').get();
      const settled = settledSnap.docs
        .sort((a, b) => (ms(b.data().settledAt) || 0) - (ms(a.data().settledAt) || 0))
        .slice(0, 6);
      const openSorted = openSnap.docs.sort((a, b) => (ms(a.data().lockAt) || 0) - (ms(b.data().lockAt) || 0));
      for (const d of [...openSorted, ...settled]) {
        const pm = publicMarket(d.data(), d.id);
        if (uid) { const bet = await d.ref.collection('bets').doc(uid).get(); pm.myBet = bet.exists ? { pick: bet.data().pick, stake: bet.data().stake } : null; }
        out.markets.push(pm);
      }
    } catch (e) { out.marketsError = String(e.message || e); }
    try {
      const lb = await db.collection('predict_leaderboard').orderBy('rating', 'desc').limit(12).get();
      out.leaderboard = lb.docs.map(x => ({ name: x.data().name || 'Anon', rating: x.data().rating || 1000, tier: tierFor(x.data().rating || 1000), me: uid && x.id === uid }));
      if (uid) { const meLb = await db.collection('predict_leaderboard').doc(uid).get(); out.rating = meLb.exists ? (meLb.data().rating || 1000) : 1000; out.tier = tierFor(out.rating); }
    } catch (e) { out.leaderboard = []; }
    return jsonResponse(out, 200, request);
  }

  // ── resolve: judge + settle overdue AI markets (cron or on-demand) ──────
  if (action === 'resolve') {
    const origin = new URL(request.url).origin;
    const room = body.room && String(body.room).slice(0, 80);
    if (room) { const v = await resolveAiMarket(db, origin, room); return jsonResponse({ ok: true, verdict: v }, 200, request); }
    // sweep all overdue (bounded)
    let n = 0;
    try {
      const openSnap = await db.collection('predict_markets').where('liveKey', '==', 'ai_open').get();
      for (const d of openSnap.docs) { if (n >= 10) break; if (ms(d.data().lockAt) && Date.now() >= ms(d.data().lockAt)) { await resolveAiMarket(db, origin, d.id); n++; } }
    } catch (e) {}
    try { await ensureMarkets(db); } catch (e) {}
    return jsonResponse({ ok: true, resolved: n }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};
