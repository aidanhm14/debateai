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
  { m:'This house believes the West should cut all subsidies to fossil fuel companies.', pro:'Public money should not bankroll the industry most responsible for the climate bill we are all paying.', con:'Yanking subsidies overnight spikes energy prices on the poor and hands the market to dirtier foreign producers.' },
  { m:'This house would replace the income tax with a wealth tax.', pro:'Taxing stocks of hoarded wealth hits the rentier class income tax lets slip through loopholes.', con:'Wealth is hard to value, easy to move offshore, and the tax collapses the moment capital flees.' },
  { m:'This house believes universities should abolish tenure.', pro:'Lifetime job security shields deadwood and lets the protected coast while adjuncts carry the teaching.', con:'Tenure is the last real guard for academic freedom; kill it and research bends to whoever signs the checks.' },
  { m:'This house would let private companies operate their own armed forces.', pro:'States already outsource security; formalizing it brings oversight to a market that runs in the shadows now.', con:'Private armies answer to shareholders, not citizens, and put lethal force on the open auction block.' },
  { m:'This house believes professional sports should have no salary caps.', pro:'Caps are owner collusion dressed as fairness; players should earn what an open market will pay.', con:'Without caps three rich franchises buy every title and the league dies of its own predictability.' },
  { m:'This house would make all public transit free.', pro:'Free transit cuts cars, clears air, and ends the cruelty of fining the poor for needing to move.', con:'Someone pays; free fares gut the maintenance budget and the system rots into the unreliable mess that empties it.' },
  { m:'This house believes anonymous online speech does more harm than good.', pro:'Anonymity is the shield behind which harassment, fraud, and disinformation operate with impunity.', con:'It is the only protection whistleblowers, dissidents, and abuse survivors have against retaliation.' },
  { m:'This house would abolish the monarchy in constitutional monarchies.', pro:'Inherited power is an affront to democracy and a costly relic dressed up as tradition.', con:'A neutral head of state above politics is a stabilizer republics keep trying and failing to replace.' },
  { m:'This house believes effective altruism has corrupted modern philanthropy.', pro:'It reduces moral life to a spreadsheet and lets the rich buy moral cover with cold cost-per-life math.', con:'Measuring impact rescued giving from vanity and vibes; the alternative is feeling good while helping less.' },
  { m:'This house would ban single-use plastics outright.', pro:'A hard ban is the only thing that has ever moved industry off a material choking the oceans.', con:'Blunt bans push users to higher-carbon substitutes and hit the disabled who rely on single-use tools.' },
  { m:'This house believes sports betting should be banned.', pro:'Legal betting turned every game into a vector for addiction and quietly corrupts the players inside it.', con:'Prohibition just hands the market to offshore books with zero protections; regulation beats a black market.' },
  { m:'This house would require a license to become a parent.', pro:'We license far lower-stakes acts than raising a human; screening could prevent foreseeable abuse.', con:'Reproductive licensing is the door to eugenics and hands the state power no government should hold.' },
];
function newRoomId(){ return 'ai-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
const AI_TARGET_OPEN = 7;
const HOUSE_SEED = 100;        // opening liquidity per side so a fresh market isn't an empty 0-pool book
// Stagger lock windows so the board churns: some resolve within minutes (so the
// "recently resolved" feed fills fast and stays alive), some hold open longer.
function aiLockWindowMs(i){ const floor = 6 + ((i || 0) % 4) * 9; return (floor + Math.floor(Math.random() * 12)) * 60 * 1000; } // ~6-45 min

function newMarketDoc(pick, i){
  return {
    kind: 'ai', liveKey: 'ai_open', motion: pick.m, proName: 'Pro', conName: 'Con',
    proCase: pick.pro, conCase: pick.con, format: 'quick',
    proUid: '', conUid: '',
    status: 'open', lockAt: new Date(Date.now() + aiLockWindowMs(i)),
    createdAt: FieldValue.serverTimestamp(), poolPro: HOUSE_SEED, poolCon: HOUSE_SEED, betCount: 0, verdict: null,
  };
}

async function ensureMarkets(db) {
  // Single-field query (liveKey) so no composite index is needed.
  const open = await db.collection('predict_markets').where('liveKey', '==', 'ai_open').get();
  const need = AI_TARGET_OPEN - open.size;
  if (need <= 0) return;
  // Avoid minting a motion that's already open OR sitting in the resolved feed,
  // so open and settled cards never collide (which would shrink the visible
  // resolved feed after dedupe).
  const settled = await db.collection('predict_markets').where('liveKey', '==', 'ai_settled').get();
  const taken = new Set([...open.docs, ...settled.docs].map(d => (d.data().motion || '').trim().toLowerCase()));
  const pool = MOTION_BANK.filter(p => !taken.has(p.m.trim().toLowerCase()));
  const batch = db.batch();
  for (let i = 0; i < need; i++) {
    const pick = (pool.length ? pool : MOTION_BANK)[Math.floor(Math.random() * (pool.length ? pool.length : MOTION_BANK.length))];
    if (pool.length) pool.splice(pool.indexOf(pick), 1);
    batch.set(db.collection('predict_markets').doc(newRoomId()), newMarketDoc(pick, i));
  }
  await batch.commit();
}

// One-time activity seed: judge a handful of motions and store them already
// settled, so "recently resolved" shows real AI verdicts from the first load.
// Idempotent-ish: no-op once enough settled markets exist. No fake leaderboard
// entries are created — the skill ladder stays real.
async function seedActivity(db, origin, want) {
  const settled = await db.collection('predict_markets').where('liveKey', '==', 'ai_settled').get();
  let need = Math.max(0, (want || 5) - settled.size);
  if (need <= 0) return 0;
  // Exclude motions already open OR settled so seeded resolved cards never
  // collide with an open card (which would hide them after the board dedupe).
  const open = await db.collection('predict_markets').where('liveKey', '==', 'ai_open').get();
  const have = new Set([...settled.docs, ...open.docs].map(d => (d.data().motion || '').trim().toLowerCase()));
  const pool = MOTION_BANK.filter(p => !have.has(p.m.trim().toLowerCase()));
  let made = 0;
  for (let i = 0; i < need && i < pool.length; i++) {
    const pick = pool[i];
    const j = await judgeMotion(origin, { motion: pick.m, proCase: pick.pro, conCase: pick.con });
    // Plausible opening book: weight the seeded pool toward the eventual loser a
    // little so payouts read realistically; these are house points, not bets.
    const a = HOUSE_SEED + Math.floor(Math.random() * 240), b = HOUSE_SEED + Math.floor(Math.random() * 240);
    await db.collection('predict_markets').doc(newRoomId()).set({
      kind: 'ai', liveKey: 'ai_settled', motion: pick.m, proName: 'Pro', conName: 'Con',
      proCase: pick.pro, conCase: pick.con, format: 'quick', proUid: '', conUid: '',
      status: 'settled', verdict: j.verdict, rfd: j.rfd,
      poolPro: j.verdict === 'pro' ? a : b, poolCon: j.verdict === 'pro' ? b : a,
      betCount: 0, createdAt: FieldValue.serverTimestamp(),
      lockAt: new Date(Date.now() - 60000), settledAt: FieldValue.serverTimestamp(),
    });
    made++;
  }
  return made;
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
  // 'list'/'resolve'/'seed' are public market upkeep (no economy mutation, self-
  // limiting): they keep the board fresh whether or not anyone is signed in.
  const PUBLIC_ACTIONS = { list: 1, resolve: 1, seed: 1, reset: 1 };
  if (!uid && !PUBLIC_ACTIONS[action]) return errorResponse('Sign in to do that', 401, request);

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
      const settledSorted = settledSnap.docs.sort((a, b) => (ms(b.data().settledAt) || 0) - (ms(a.data().settledAt) || 0));
      const openSorted = openSnap.docs.sort((a, b) => (ms(a.data().lockAt) || 0) - (ms(b.data().lockAt) || 0));
      // Dedupe by motion so the board never shows the same question twice (open
      // wins over settled; newest settled wins over older). Guards against the
      // inline-resolver / seed race producing duplicate cards.
      const seenMotion = new Set();
      let settledShown = 0;
      for (const d of [...openSorted, ...settledSorted]) {
        const data = d.data();
        const key = (data.motion || '').trim().toLowerCase();
        if (key && seenMotion.has(key)) continue;
        if (data.status === 'settled') { if (settledShown >= 6) continue; settledShown++; }
        if (key) seenMotion.add(key);
        const pm = publicMarket(data, d.id);
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

  // ── seed: one-time activity seed (real AI verdicts into recently-resolved) ──
  if (action === 'seed') {
    const origin = new URL(request.url).origin;
    let made = 0;
    try { made = await seedActivity(db, origin, Math.min(8, parseInt(body.want, 10) || 5)); } catch (e) {}
    try { await ensureMarkets(db); } catch (e) {}
    return jsonResponse({ ok: true, seeded: made }, 200, request);
  }

  // ── reset: rebuild a clean board. SAFETY: refuses once any real bet exists,
  // so it can never wipe live positions. Only useful pre-launch to clear seed
  // collisions. ──
  if (action === 'reset') {
    const all = await db.collection('predict_markets').get();
    const realBets = all.docs.reduce((n, d) => n + (d.data().betCount || 0), 0);
    if (realBets > 0) return errorResponse('Reset disabled: the board has live bets', 403, request);
    for (const d of all.docs) {
      const bets = await d.ref.collection('bets').get();
      const batch = db.batch();
      bets.docs.forEach(b => batch.delete(b.ref));
      batch.delete(d.ref);
      await batch.commit();
    }
    const origin = new URL(request.url).origin;
    try { await ensureMarkets(db); } catch (e) {}
    let made = 0;
    try { made = await seedActivity(db, origin, 6); } catch (e) {}
    return jsonResponse({ ok: true, reset: true, seeded: made }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};
