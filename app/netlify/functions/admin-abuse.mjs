// /api/admin/abuse  →  Is anyone draining us, and are the guards actually on?
//
// Two halves:
//
//   trips    the per-day rate-limit deny counters lib/rate-limit.mjs now
//            writes to abuse_daily/{YYYY-MM-DD} (field shape
//            `{ns}__{layer}__{lane}` → count, lane ∈ named|anon|ip).
//            A trip is either a bot correctly refused or a person wrongly
//            refused; either way it belongs on a dashboard, because a
//            limiter nobody can see can never have its sizing judged.
//            claude.mjs also counts its sign-in wall here (ns 'claude',
//            layer 'sign_in_wall') so the free-round gate's fire rate is
//            visible next to everything else.
//
//   posture  the guard configuration itself. UPSTASH_* unset means every
//            limiter on the site is running the per-isolate in-memory
//            fallback — the "lottery" the lib's own header warns about —
//            and that is an ops fact the dashboard should shout about,
//            not a console.warn nobody reads.
//
// Read cost: DAYS doc lookups on abuse_daily + one guest_rounds count.
// Cached briefly (trips move faster than the heavy analytics).

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, wantsFresh } from './lib/admin-cache.mjs';
import { HAS_UPSTASH } from './lib/rate-limit.mjs';

const DAYS = 7;
const TTL_ABUSE = 10 * 60 * 1000; // 10 min — fresher than TTL_HEAVY on purpose

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const db = gate.db;

  const cacheKey = 'abuse:v1';
  const cached = wantsFresh(request) ? null : await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    const dayIds = [];
    for (let i = 0; i < DAYS; i++) {
      dayIds.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    }
    const snaps = await Promise.all(dayIds.map(id => db.collection('abuse_daily').doc(id).get()));

    // days: [{ day, total, rows: [{ns, layer, lane, count}] }], newest first.
    // totalsByNs: 7-day sum per namespace for the at-a-glance strip.
    const days = [];
    const totalsByNs = {};
    let weekTotal = 0;
    snaps.forEach((snap, i) => {
      const row = { day: dayIds[i], total: 0, rows: [] };
      if (snap.exists) {
        const d = snap.data();
        for (const [field, count] of Object.entries(d)) {
          if (typeof count !== 'number') continue;
          const parts = field.split('__');
          if (parts.length !== 3) continue;
          const [ns, layer, lane] = parts;
          row.rows.push({ ns, layer, lane, count });
          row.total += count;
          totalsByNs[ns] = (totalsByNs[ns] || 0) + count;
          weekTotal += count;
        }
        row.rows.sort((a, b) => b.count - a.count);
      }
      days.push(row);
    });

    // Guest free-round spend: how many anonymous devices have burned live
    // rounds through the metered /spar lane.
    let guestRounds = null;
    try {
      const agg = await db.collection('guest_rounds').count().get();
      guestRounds = agg.data().count;
    } catch (err) {
      console.warn('admin-abuse guest_rounds count failed:', err.message);
    }

    const result = {
      generatedAt: new Date().toISOString(),
      weekTotal,
      totalsByNs,
      days,
      guestRounds,
      posture: {
        upstash: HAS_UPSTASH,
        // APP_CHECK_REQUIRED=false means the ~800KB reCAPTCHA bundle is
        // decorative and curl gets a 200 (the pre-2026-08-18 state).
        // Exact-match 'true', mirroring lib/appcheck.mjs — anything else
        // means log-only mode, and reporting that as enforced would be
        // the exact false-comfort this card exists to remove.
        appCheckRequired: process.env.APP_CHECK_REQUIRED === 'true',
        anonFreeCalls: Number(process.env.ANON_FREE_CALLS || 6),
        guestFreeRounds: Number(process.env.GUEST_FREE_ROUNDS || 2),
      },
    };

    await setCachedShared(cacheKey, result, TTL_ABUSE);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-abuse error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/abuse',
};
