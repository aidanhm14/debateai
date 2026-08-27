// Prediction market on real human rounds, AI-judged. POINTS ONLY (virtual,
// non-redeemable). Server-authoritative: the client can NEVER write balances,
// pools, or payouts. every economy mutation goes through this function with
// admin credentials, after validation. Firestore rules deny all client writes
// to the predict_* collections (see firestore.rules), so even a malicious
// client can only READ public market state + its own balance.
//
// Anti-insider-trading model:
//   - own side only: a debater in the round may back THEMSELVES and nobody
//     else. They cannot stake on their opponent, so no one in a round can
//     ever be paid for losing it. (Before 2026-08-25 debaters were excluded
//     outright; Aidan's call was that backing yourself is the point. The
//     match-fixing incentive lives entirely in the OTHER direction, so that
//     is the direction that stays shut.)
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
import { checkWagerEligibility, checkWagerAge, invalidateWagerEligibility, MINOR_AGE_RANGES } from './lib/wager-eligibility.mjs';
import { judgmentId } from './lib/judgment.mjs';

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
function publicPriceHistory(m) {
  if (!m || !Array.isArray(m.priceHistory)) return [];
  return m.priceHistory.slice(-60).map((point) => ({
    at: Math.max(0, Number(point && point.at) || 0),
    proPct: Math.max(0, Math.min(100, Number(point && point.proPct) || 0)),
  })).filter((point) => point.at > 0);
}
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
    priceHistory: publicPriceHistory(m),
    verdict: m.verdict || null,
    rfd: m.rfd || '',
    settledAt: ms(m.settledAt),
  };
}

// ── App-run AI markets: RETIRED 2026-08-25 ────────────────────────────
// This function used to mint its own markets from a hardcoded motion bank
// so /predict was never an empty page: seven cards at a time, each with a
// motion nobody had argued, two "cases" written by the bank, a pool seeded
// with 100 house points a side (which is why every card read a flat 50/50)
// and a countdown to a Haiku call that decided a debate that never
// happened. Aidan, 2026-08-25: "details that are fake, dont exist are bad
// here." He is right, and the board was the worst place on the site for it,
// because a market's whole claim is that the number on it means something.
//
// A market now exists only where a round exists. `open` is called by a
// debater when a live round starts, and that is the only way one is
// created. An empty board means nobody is debating right now, which is a
// true thing to say and a fixable one.
//
// The ~1,100 `kind:'ai'` documents already in Firestore are LEFT IN PLACE
// and simply never queried again (the board reads `live_*` keys now). None
// of them ever carried a stake, so nothing is stranded; purging them is one
// query whenever it is worth the write cost.
//
// Gone with them: MOTION_BANK / LEGACY_MOTIONS, ensureMarkets, seedActivity,
// judgeMotion, resolveAiMarket, settleMarket, voidMarket, and the `resolve`
// / `seed` / `reset` actions, plus scheduled-predict-sweep.mjs, whose only
// job was draining a board of markets nobody had bet on.


export default async (request, context) => {
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
  const PUBLIC_ACTIONS = { list: 1 };
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
      // The board queries by liveKey. Real markets carry `live_*` and the
      // retired AI ones carried `ai_*`, so the two can never share a board
      // again by accident. Markets opened before 2026-08-25 have no key at
      // all, which is why the board starts empty rather than resurrecting
      // 464 dead countdowns from rounds that ended months ago.
      liveKey: 'live_open',
      proName: String(body.proName || 'Pro').slice(0, 40),
      conName: String(body.conName || 'Con').slice(0, 40),
      motion: String(body.motion || '').slice(0, 300),
      format: String(body.format || '').slice(0, 40),
      status: 'open', lockAt, createdAt: FieldValue.serverTimestamp(),
      poolPro: 0, poolCon: 0, betCount: 0,
      // The client draws market volatility from this server-owned trace.
      // One point per accepted bet makes the graph identical for everyone;
      // keeping only the last 60 bounds the document and response size.
      priceHistory: [{ at: Date.now(), proPct: 50 }],
      verdict: null,
    };
    await ref.set(doc);
    return jsonResponse({ ok: true, market: publicMarket(doc, room) }, 200, request);
  }

  // ── bet: place a points bet (server-authoritative, atomic) ──────────────
  // ── attest: record the one-time 18+ confirmation ───────────────────────
  // Separate from corpusAgeAttested by design. Agreeing to have your
  // transcript licensed and agreeing to stake are different acts, and one
  // must never be read as consent to the other.
  //
  // A profile that already self-reported a minor age range is refused
  // here, not just at the stake. Letting them write the flag and bounce
  // at bet time would leave a stored "I am 18" on an account we already
  // know is not, which is worse evidence than no flag at all.
  if (action === 'attest') {
    if (body.confirm !== true) return errorResponse('Confirmation required', 400, request);
    const pRef = db.collection('user_profiles').doc(uid);
    const pSnap = await pRef.get();
    const pd = pSnap.exists ? pSnap.data() : null;
    const range = pd && pd.onboarding && typeof pd.onboarding.ageRange === 'string'
      ? pd.onboarding.ageRange.trim().toLowerCase() : '';
    if (range && MINOR_AGE_RANGES.has(range)) {
      return errorResponse('Staking is 18+. Your profile says you are under 18.', 403, request);
    }
    await pRef.set({
      wagerAgeAttested: true,
      wagerAgeAttestedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    invalidateWagerEligibility(uid);
    const after = await checkWagerAge(db, uid);
    return jsonResponse({ ok: true, eligible: after.ok }, 200, request);
  }

  if (action === 'bet') {
    const room = body.room && String(body.room).slice(0, 80);
    const pick = body.pick;
    let stake = parseInt(body.stake, 10);
    if (!room) return errorResponse('Missing room', 400, request);
    if (!SIDES[pick]) return errorResponse('Bad side', 400, request);
    if (!Number.isFinite(stake) || stake < 1) return errorResponse('Bad stake', 400, request);
    stake = Math.min(MAX_STAKE, stake);

    // 18+ and jurisdiction, checked before a balance doc is even seeded.
    // Seeding first would hand a minor a 1000-point balance and a
    // leaderboard row, which is an account we then have to explain.
    // `code` is what the client branches on. Never string-match the
    // message: 'no_attestation' is a one-tap confirm and 'minor' is a
    // dead end, and rendering a confirm box to a 15-year-old because a
    // sentence got reworded is the exact failure this gate exists to stop.
    const elig = await checkWagerEligibility(db, uid, request, context);
    if (!elig.ok) return jsonResponse({ error: elig.message, code: elig.reason }, 403, request);

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
        // Own side only. A debater backing themselves is a debater with
        // every incentive already pointing at winning; a debater backing
        // their OPPONENT is match-fixing with a receipt, so that branch is
        // the one that throws.
        if (uid === md.proUid && pick !== 'pro') throw new Error('wrong-side');
        if (uid === md.conUid && pick !== 'con') throw new Error('wrong-side');
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
        const nextPoolPro = (md.poolPro || 0) + (pick === 'pro' ? stake : 0);
        const nextPoolCon = (md.poolCon || 0) + (pick === 'con' ? stake : 0);
        const nextTotal = nextPoolPro + nextPoolCon;
        const nextProPct = nextTotal > 0 ? Math.round((nextPoolPro / nextTotal) * 1000) / 10 : 50;
        const history = Array.isArray(md.priceHistory) ? md.priceHistory.slice(-59) : [];
        // Markets created before this field shipped cannot be reconstructed
        // from aggregate pools. Start their trace now instead of inventing a
        // path for old bets that we never recorded.
        history.push({ at: Date.now(), proPct: nextProPct });
        t.update(balRef, { balance: FieldValue.increment(-stake), updatedAt: FieldValue.serverTimestamp() });
        t.set(betRef, { uid, name, pick, stake, createdAt: FieldValue.serverTimestamp() });
        t.update(mRef, {
          [pick === 'pro' ? 'poolPro' : 'poolCon']: FieldValue.increment(stake),
          betCount: FieldValue.increment(1),
          priceHistory: history,
        });
        if (!lbSnap.exists) t.set(lbRef, { uid, name, rating: 1000, bets: 0, wins: 0, net: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        return { balance: balance - stake };
      });
      return jsonResponse({ ok: true, balance: result.balance }, 200, request);
    } catch (e) {
      const msg = String(e.message || e);
      const map = { 'no-market': 'No open market', 'closed': 'Betting is closed', 'locked': 'Betting locked at the middle speeches', 'wrong-side': "You're in this round. You can back yourself, not your opponent.", 'already-bet': 'You already bet this round', 'insufficient': 'Not enough points' };
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

    // ── Verdict provenance ──────────────────────────────────────────
    // This used to accept `body.verdict` from the caller, and the caller
    // is required to be one of the two debaters. So a debater decided
    // the outcome of a market that paid out other people's stakes. The
    // self-exclusion rule stopped them betting on their own round and
    // did nothing about them CALLING it, which is the larger of the two
    // powers. lib/settle.mjs already refuses to move credits on a
    // verdict an interested party authored (MONEY_VERDICT_SOURCES); this
    // surface now holds the same line.
    //
    // The only accepted verdict is a recorded judgment stamped
    // verdictSource:'server'. Note what that means today: lib/judgment.mjs
    // stamps live-round ballots 'participant', because they are written
    // by a debater's browser. So live-round markets VOID and refund until
    // live ballots move server-side. That is the correct behaviour, not a
    // regression. A market nobody can honestly settle should return
    // everyone's stake, not pay out on the say-so of someone in the round.
    let verdict = null;
    try {
      const jSnap = await db.collection('judgments').doc(judgmentId('live', room)).get();
      const j = jSnap.exists ? jSnap.data() : null;
      if (j && j.verdictSource === 'server' && (j.winner === 'a' || j.winner === 'b')) {
        const labels = j.sideLabels || { a: 'pro', b: 'con' };
        const side = labels[j.winner];
        if (side === 'pro' || side === 'con') verdict = side;
      }
    } catch (e) { /* no judgment recorded is the same as no verdict */ }

    // Authorize: only a debater of this round may trigger settlement.
    // They can no longer influence the OUTCOME, only ask us to close the
    // market, so this stays a convenience trigger rather than a power.
    const pre = await mRef.get();
    if (!pre.exists) return errorResponse('No market', 404, request);
    const pm = pre.data();
    if (uid !== pm.proUid && uid !== pm.conUid) return errorResponse('Not a participant', 403, request);
    if (pm.status === 'settled') return jsonResponse({ ok: true, already: true, verdict: pm.verdict }, 200, request);
    if (pm.status === 'voided') return jsonResponse({ ok: true, already: true, voided: true }, 200, request);

    // ── No server verdict: void and refund at face value ─────────────
    // Side-neutral by construction. No rating moves, because a voided
    // market measured nobody's read.
    if (!verdict) {
      const openBets = await mRef.collection('bets').get();
      const vBatch = db.batch();
      vBatch.update(mRef, {
        status: 'voided',
        liveKey: 'live_void',
        voidReason: 'no_server_verdict',
        voidedAt: FieldValue.serverTimestamp(),
      });
      openBets.forEach((b) => {
        const d = b.data();
        if (d.stake > 0) {
          vBatch.update(db.collection('predict_balances').doc(d.uid), {
            balance: FieldValue.increment(d.stake),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
      await vBatch.commit();
      return jsonResponse({ ok: true, voided: true, reason: 'no_server_verdict', refunded: openBets.size }, 200, request);
    }

    const bets = await mRef.collection('bets').get();
    const total = (pm.poolPro || 0) + (pm.poolCon || 0);
    const winnerPool = verdict === 'pro' ? (pm.poolPro || 0) : (pm.poolCon || 0);

    const batch = db.batch();
    batch.update(mRef, { status: 'settled', liveKey: 'live_settled', verdict, settledAt: FieldValue.serverTimestamp() });

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

  // ── list: the board of markets on real rounds ──────────────────────────
  // Only markets `open` created, i.e. one per live round that actually
  // happened. There is no minting here any more and nothing to sweep: if the
  // board is empty, nobody is debating right now.
  //
  // Stale guard: a human round's lockAt is minutes after it opens, and a
  // market whose round ended without a recorded server verdict just sits at
  // `open` forever (settle voids it, but only if a debater's browser asks).
  // A card counting down from a round that finished last March is the same
  // lie as an invented one, so anything older than OPEN_TTL_MS drops off the
  // board. It stays in Firestore; it just stops being advertised.
  if (action === 'list') {
    const OPEN_TTL_MS = 3 * 60 * 60 * 1000;
    const balance = uid ? await ensureBalance(db, uid) : null;
    const out = { ok: true, balance, signedIn: !!uid, markets: [] };
    try {
      const now = Date.now();
      const openSnap = await db.collection('predict_markets').where('liveKey', '==', 'live_open').get();
      const settledSnap = await db.collection('predict_markets').where('liveKey', '==', 'live_settled').get();
      const fresh = openSnap.docs.filter((d) => {
        const at = ms(d.data().createdAt) || ms(d.data().lockAt) || 0;
        return at && (now - at) < OPEN_TTL_MS;
      }).sort((a, b) => (ms(b.data().createdAt) || 0) - (ms(a.data().createdAt) || 0));
      const settled = settledSnap.docs
        .sort((a, b) => (ms(b.data().settledAt) || 0) - (ms(a.data().settledAt) || 0))
        .slice(0, 6);
      for (const d of [...fresh, ...settled]) {
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

  return errorResponse('Unknown action', 400, request);
};
