// ─────────────────────────────────────────────────────────────
// GET /api/floor/state — the live board, the leaderboard, and (when
// signed in) the caller's balance + open positions. Read-only.
// Auth is OPTIONAL: anonymous callers get the board + leaderboard;
// signed-in callers also get their credits, sharp stats, and the
// position they hold on each visible market. Designed to be polled
// every ~10s; the client interpolates countdowns locally between
// polls to keep Firestore reads low.
// ─────────────────────────────────────────────────────────────
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, getCached } from './lib/admin-cache.mjs';
import { FLOOR_ANON_CACHE_KEY, defaultUser } from './lib/floor.mjs';

const BOARD_LIMIT = 18;
const LB_LIMIT = 15;
const TXN_LIMIT = 18;
const RECENT_RESOLVED_MS = 60000; // also show markets resolved in the last minute
// 2026-07-01: the anonymous half of the payload (board + leaderboard) is
// identical for every caller, so it rides the Firestore-backed shared
// cache — a poll costs 1 cache read instead of ~33 collection reads.
// Short TTL: pools/backers move on bets, so keep it near-live.
const ANON_TTL_MS = 15_000;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const db = getDb();
  const now = Date.now();

  // optional auth
  let uid = null;
  const token = extractBearerToken(request);
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.sub;
    } catch (e) {
      uid = null; // treat as anonymous rather than hard-fail the board
    }
  }

  try {
    // Anonymous half (board + leaderboard): shared-cache first.
    let anon = await getCachedShared(FLOOR_ANON_CACHE_KEY).catch(() => null);
    if (!anon) {
      // board: active + very-recently-resolved (single-field inequality → auto-indexed)
      const boardSnap = await withDeadline(db
        .collection('floor_markets')
        .where('resolveAt', '>', now - RECENT_RESOLVED_MS)
        .orderBy('resolveAt')
        .limit(BOARD_LIMIT)
        .get(), 2500);
      const markets = boardSnap.docs.map((d) => ({ id: d.id, ...stripMarket(d.data()) }));

      // leaderboard — name/photo stamped onto floor_users by floor-bet.
      const lbSnap = await withDeadline(db.collection('floor_users').orderBy('sharpScore', 'desc').limit(LB_LIMIT).get(), 2500);
      const leaderboard = lbSnap.docs.map((d) => {
        const u = d.data();
        return { uid: d.id, name: u.name || '', photo: u.photo || '', sharpScore: u.sharpScore || 600, wins: u.wins || 0, bets: u.bets || 0, streak: u.streak || 0 };
      });

      anon = { markets, leaderboard };
      await setCachedShared(FLOOR_ANON_CACHE_KEY, anon, ANON_TTL_MS).catch(() => {});
    }

    let me = null;
    let myPositions = {};
    let recentTxns = [];
    if (uid) {
      const userSnap = await withDeadline(db.collection('floor_users').doc(uid).get(), 2000);
      const u = userSnap.exists ? userSnap.data() : defaultUser(uid);
      me = {
        uid,
        credits: u.credits || 0,
        sharpScore: u.sharpScore || 600,
        bets: u.bets || 0,
        wins: u.wins || 0,
        streak: u.streak || 0,
        staked: u.staked || 0,
        returned: u.returned || 0,
        convSum: u.convSum || 0,
        isNew: !userSnap.exists,
      };
      // my position on each visible market, in one batched read (no index needed)
      if (anon.markets.length) {
        const posRefs = anon.markets.map((m) => db.collection('floor_markets').doc(m.id).collection('positions').doc(uid));
        const posSnaps = await withDeadline(db.getAll(...posRefs), 2000);
        posSnaps.forEach((ps, i) => {
          if (ps.exists) {
            const p = ps.data();
            myPositions[anon.markets[i].id] = { side: p.side, stake: p.stake, window: p.window, mult: p.mult, settled: !!p.settled, won: p.won, payout: p.payout || 0 };
          }
        });
      }

      const txnSnap = await withDeadline(db
        .collection('floor_ledger')
        .doc(uid)
        .collection('txns')
        .orderBy('ts', 'desc')
        .limit(TXN_LIMIT)
        .get(), 2000);
      recentTxns = txnSnap.docs.map((doc) => {
        const t = doc.data() || {};
        return {
          id: doc.id,
          type: t.type || '',
          amount: Number(t.amount || 0),
          balAfter: Number(t.balAfter || 0),
          marketId: t.marketId || '',
          note: t.note || '',
          ts: t.ts && typeof t.ts.toMillis === 'function' ? t.ts.toMillis() : null,
        };
      });
    }

    return jsonResponse({ now, markets: anon.markets, leaderboard: anon.leaderboard, me, myPositions, recentTxns }, 200, request);
  } catch (err) {
    console.error('[floor-state] error', err);
    // Serve the last-known-good anonymous board (in-memory) before
    // failing — the /floor client retries on error, and with Firestore
    // over quota a fast degraded board beats a hammer loop of 500s.
    const lkg = getCached(FLOOR_ANON_CACHE_KEY);
    if (lkg && lkg.markets) {
      return jsonResponse({ now, markets: lkg.markets, leaderboard: lkg.leaderboard || [], me: null, myPositions: {}, recentTxns: [], degraded: true }, 200, request);
    }
    return errorResponse('Could not load the board.', 500, request);
  }
};

// trim internal fields; the client never needs boundResult etc.
function stripMarket(m) {
  return {
    kind: m.kind,
    fmt: m.fmt,
    motion: m.motion,
    A: m.A,
    B: m.B,
    motionRevealAt: m.motionRevealAt,
    roundStartAt: m.roundStartAt,
    midpointAt: m.midpointAt,
    resolveAt: m.resolveAt,
    pool: m.pool,
    backers: m.backers,
    settled: !!m.settled,
    result: m.result || null,
  };
}

export const config = {
  path: '/api/floor/state',
};
