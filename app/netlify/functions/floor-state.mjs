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
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { defaultUser } from './lib/floor.mjs';

const BOARD_LIMIT = 18;
const LB_LIMIT = 15;
const RECENT_RESOLVED_MS = 60000; // also show markets resolved in the last minute

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
    // board: active + very-recently-resolved (single-field inequality → auto-indexed)
    const boardSnap = await db
      .collection('floor_markets')
      .where('resolveAt', '>', now - RECENT_RESOLVED_MS)
      .orderBy('resolveAt')
      .limit(BOARD_LIMIT)
      .get();
    const markets = boardSnap.docs.map((d) => ({ id: d.id, ...stripMarket(d.data()) }));

    // leaderboard
    const lbSnap = await db.collection('floor_users').orderBy('sharpScore', 'desc').limit(LB_LIMIT).get();
    const leaderboard = lbSnap.docs.map((d) => {
      const u = d.data();
      return { uid: d.id, sharpScore: u.sharpScore || 600, wins: u.wins || 0, bets: u.bets || 0, streak: u.streak || 0 };
    });

    let me = null;
    let myPositions = {};
    if (uid) {
      const userSnap = await db.collection('floor_users').doc(uid).get();
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
      if (boardSnap.docs.length) {
        const posRefs = boardSnap.docs.map((d) => d.ref.collection('positions').doc(uid));
        const posSnaps = await db.getAll(...posRefs);
        posSnaps.forEach((ps, i) => {
          if (ps.exists) {
            const p = ps.data();
            myPositions[boardSnap.docs[i].id] = { side: p.side, stake: p.stake, window: p.window, mult: p.mult, settled: !!p.settled, won: p.won, payout: p.payout || 0 };
          }
        });
      }
    }

    return jsonResponse({ now, markets, leaderboard, me, myPositions }, 200, request);
  } catch (err) {
    console.error('[floor-state] error', err);
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
