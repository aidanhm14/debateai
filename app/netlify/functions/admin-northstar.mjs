// /api/admin/northstar?days=7  →  The numbers the company actually runs on.
//
// The old KPI strip led with lifetime vanity totals (cases generated, forum
// posts, teams) that answer "what exists" rather than "is this working."
// This endpoint computes the 2026-08 priority stack in one payload:
//
//   accounts   named signups (Auth is the source of truth, not
//              user_profiles — no signup path writes a profile doc) and
//              activation: how many named accounts have EVER finished a
//              round. 31/215 on 2026-08-19; the whole retention plan is
//              downstream of this number.
//   rounds     finished rounds by kind in the window. Voice outnumbers
//              typed ~9x; the split is the point, not a detail.
//   spar       queue joins vs matches. Measured 878 joins → 148 matches
//              (17%) over 12 days in August: the activation leak is
//              liquidity, not UX. count() aggregations on the existing
//              events composite indexes, 1 read each.
//   betting    the pivot's scoreboard. Bets placed is the number that
//              says whether the pivot has a product; 766 markets had
//              settled with zero bets when it was called.
//   open       live tournament docs, pass-through of the entry counters.
//
// Read cost per recompute: ~8 count() aggregations (1 read each), one
// bounded generations scan (small collection), one Auth listUsers page
// walk (REST, not Firestore), 2 tournament doc reads, and the bets
// subcollections only while they are small. Cached TTL_HEAVY behind the
// shared admin cache, so the dashboard pays this every few hours, not
// every open.

import { getDb } from './lib/firestore.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY, wantsFresh } from './lib/admin-cache.mjs';

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

// generations is the finished-round ledger (a doc lands when a round
// completes and logs). Small collection; a bounded newest-first scan is
// cheaper than maintaining a (kind, createdAt) composite index for it.
const GENERATIONS_SCAN_CAP = 2000;

// Round kinds that mean "a round happened," as opposed to a single typed
// turn. Mirrors VALID_KINDS in log-generation.mjs.
const ROUND_KINDS = new Set(['voice_round', 'live_round', 'practice_round', 'judge']);

// While total bets fit under this cap we read them all and compute the
// windowed count in memory; a collection-group createdAt index can be
// added the day this cap is actually hit. At the time of writing the
// all-time total is 1.
const BETS_READ_CAP = 200;

async function countEvents(db, field, value, since) {
  // 1 read. Rides the existing composite indexes
  // events(metadata.name ASC, createdAt ASC) / events(event ASC, createdAt ASC).
  try {
    const agg = await db.collection('events')
      .where(field, '==', value)
      .where('createdAt', '>=', since)
      .count()
      .get();
    return (agg.data() && agg.data().count) || 0;
  } catch (err) {
    console.warn('northstar count failed', field, value, err.message);
    return null;
  }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const days = Math.min(MAX_DAYS, Math.max(1, Number(url.searchParams.get('days')) || DEFAULT_DAYS));
  const cacheKey = `northstar:v1:${days}`;
  const cached = wantsFresh(request) ? null : await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  const db = getDb();
  const now = Date.now();
  const since = new Date(now - days * 24 * 60 * 60 * 1000);

  try {
    // ── Accounts: Auth is authoritative ────────────────────────────────
    let named = 0, anonymous = 0;
    const namedUids = new Set();
    const namedByDay = {}; // last 14 days, YYYY-MM-DD → count
    const dayFloor = now - 14 * 24 * 60 * 60 * 1000;
    try {
      const users = await listAllAuthUsers();
      for (const u of users) {
        const providers = (u.providerData || []).map(p => p.providerId).filter(p => p !== 'anonymous');
        if (!providers.length) { anonymous += 1; continue; }
        named += 1;
        namedUids.add(u.uid);
        const created = u.metadata && u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : 0;
        if (created >= dayFloor) {
          const day = new Date(created).toISOString().slice(0, 10);
          namedByDay[day] = (namedByDay[day] || 0) + 1;
        }
      }
    } catch (err) {
      console.warn('northstar listAllAuthUsers failed:', err.message);
    }

    // ── Rounds finished, by kind, plus ever-activated named uids ───────
    // One newest-first scan over generations covers both: kind counts in
    // the window, and the distinct-uid ∩ named set for activation.
    const byKind = {};
    let finishedInWindow = 0;
    const everRoundUids = new Set();
    let generationsScanned = 0;
    let scanCoversAllTime = true;
    try {
      const snap = await db.collection('generations')
        .orderBy('createdAt', 'desc')
        .limit(GENERATIONS_SCAN_CAP)
        .get();
      generationsScanned = snap.size;
      scanCoversAllTime = snap.size < GENERATIONS_SCAN_CAP;
      for (const doc of snap.docs) {
        const d = doc.data();
        const kind = d.kind || 'other';
        if (!ROUND_KINDS.has(kind)) continue;
        if (d.uid) everRoundUids.add(d.uid);
        const ts = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
        if (ts >= since.getTime()) {
          byKind[kind] = (byKind[kind] || 0) + 1;
          finishedInWindow += 1;
        }
      }
    } catch (err) {
      console.warn('northstar generations scan failed:', err.message);
    }
    let activatedNamed = 0;
    for (const uid of everRoundUids) if (namedUids.has(uid)) activatedNamed += 1;

    // ── Spar liquidity ─────────────────────────────────────────────────
    const [queueJoins, matches, aiFallbacks] = await Promise.all([
      countEvents(db, 'metadata.name', 'spar_queue_join', since),
      countEvents(db, 'metadata.name', 'spar_match_found', since),
      countEvents(db, 'metadata.name', 'spar_ai_fallback', since),
    ]);

    // ── Betting (the pivot) ────────────────────────────────────────────
    const betting = { openMarkets: null, settledMarkets: null, wallets: null, betsAllTime: null, betsWindow: null, recentBets: [], betsPartial: false };
    try {
      const [openAgg, settledAgg, walletsAgg, betsAgg] = await Promise.all([
        db.collection('predict_markets').where('liveKey', '==', 'ai_open').count().get(),
        db.collection('predict_markets').where('liveKey', '==', 'ai_settled').count().get(),
        db.collection('predict_balances').count().get(),
        db.collectionGroup('bets').count().get(),
      ]);
      betting.openMarkets = openAgg.data().count;
      betting.settledMarkets = settledAgg.data().count;
      betting.wallets = walletsAgg.data().count;
      betting.betsAllTime = betsAgg.data().count;
      // Cash rounds are the one economy moving real money on a verdict
      // (2026-08-22). Count is best-effort: the collection may not exist
      // yet on a given environment.
      try {
        const cashAgg = await db.collection('cash_rounds').count().get();
        betting.cashRounds = cashAgg.data().count;
      } catch (e) { betting.cashRounds = null; }
      if (betting.betsAllTime > 0 && betting.betsAllTime <= BETS_READ_CAP) {
        const betsSnap = await db.collectionGroup('bets').get();
        let inWindow = 0;
        const recent = [];
        for (const doc of betsSnap.docs) {
          const d = doc.data();
          const ts = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
          if (ts >= since.getTime()) inWindow += 1;
          recent.push({ name: d.name || 'Anon', pick: d.pick || '', stake: d.stake || 0, ts });
        }
        recent.sort((a, b) => b.ts - a.ts);
        betting.betsWindow = inWindow;
        betting.recentBets = recent.slice(0, 10);
      } else if (betting.betsAllTime > BETS_READ_CAP) {
        betting.betsPartial = true;
      } else {
        betting.betsWindow = 0;
      }
    } catch (err) {
      console.warn('northstar betting reads failed:', err.message);
    }

    // ── The Open (and any other tournament docs) ───────────────────────
    const open = [];
    try {
      const tSnap = await db.collection('tournaments').get();
      for (const doc of tSnap.docs) {
        const d = doc.data();
        open.push({
          id: doc.id,
          name: d.name || doc.id,
          status: d.status || '',
          isPublic: d.isPublic === true,
          entryCount: d.entryCount || 0,
          paidEntries: d.paidEntries || 0,
          compedEntries: d.compedEntries || 0,
          prizePoolCents: d.prizePoolCents || 0,
          entryFeeCents: d.entryFeeCents || 0,
          startsAtISO: d.startsAtISO || null,
          startsAt: d.startsAt || '',
        });
      }
    } catch (err) {
      console.warn('northstar tournaments read failed:', err.message);
    }

    const result = {
      windowDays: days,
      generatedAt: new Date().toISOString(),
      accounts: {
        named,
        anonymous,
        namedByDay,
        activatedEver: activatedNamed,
        activationPct: named ? Math.round((activatedNamed / named) * 1000) / 10 : null,
        // A failed log write undercounts, so activation is a floor.
        activationIsFloor: true,
        scanCoversAllTime,
        generationsScanned,
      },
      rounds: { finished: finishedInWindow, byKind },
      spar: {
        queueJoins,
        matches,
        aiFallbacks,
        matchRate: queueJoins ? Math.round(((matches || 0) / queueJoins) * 1000) / 10 : null,
      },
      betting,
      open,
    };

    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-northstar error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/northstar',
};
