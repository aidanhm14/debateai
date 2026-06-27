// /api/admin/power-users → top users by engagement in the last N days.
//
// Aggregates the events collection by uid, scores each uid on a
// composite engagement metric (sessions + generations + rounds), and
// returns the top K with their display name, last-seen time, and a
// per-uid event mix. Click-through from /admin populates the
// per-user activity panel.
//
// Composite score weights:
//   1 × event-count   (volume)
//   3 × session_start (re-engagement)
//   5 × battle_started or app_event:round_start (core feature usage)
//   8 × app_event:round_complete (feature completion)
//
// Bounded by MAX_DOCS — past the cap the score is still ranked
// correctly within the sampled window, just floored.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, getStaleShared, TTL_HEAVY } from './lib/admin-cache.mjs';
import { getExcludedUids } from './lib/founder-exclude.mjs';

// 2026-05-19: MAX_DOCS cut 30K → 5K. Power-users is rank-based; the
// top 15-20 users by engagement are reliably surfaced from a 5K event
// sample. Combined with caching, this is what keeps /admin under
// the Firestore quota.
const MAX_DOCS = 1500;  // 2026-06-27: 2500 → 1500. Rank-based; top users surface reliably from the sample, shared cache recomputes once per TTL
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const TOP_K = 20;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { db } = auth;

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(MAX_DAYS, parseInt(url.searchParams.get('days') || String(DEFAULT_DAYS), 10)));
  const k = Math.max(5, Math.min(50, parseInt(url.searchParams.get('limit') || String(TOP_K), 10)));
  const since = new Date(Date.now() - days * 86_400_000);

  const cacheKey = 'power-users:' + days + ':' + k;
  const cached = await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    const snap = await db.collection('events')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(MAX_DOCS)
      .get();

    // Drop the founder's own usage so the leaderboard is real users.
    const excludeUids = await getExcludedUids(db);

    // uid → aggregate
    const acc = new Map();
    let totalScored = 0;
    let sampled = snap.size >= MAX_DOCS;

    for (const d of snap.docs) {
      const data = d.data();
      const uid = data.uid;
      if (!uid) continue;
      if (excludeUids.has(uid)) continue;
      const t = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0;
      const meta = data.metadata || {};
      const ev = data.event;
      const evName = ev === 'app_event' && meta.name ? meta.name : ev;

      let row = acc.get(uid);
      if (!row) {
        row = {
          uid,
          events: 0,
          sessions: 0,
          pageViews: 0,
          rounds: 0,
          completes: 0,
          conversions: 0,
          score: 0,
          lastTs: 0,
          firstTs: Number.MAX_SAFE_INTEGER,
          eventMix: {},
          path0: '',
        };
        acc.set(uid, row);
      }
      row.events++;
      row.score += 1;
      if (t > row.lastTs) row.lastTs = t;
      if (t < row.firstTs) row.firstTs = t;
      row.eventMix[evName] = (row.eventMix[evName] || 0) + 1;

      if (ev === 'page_view') row.pageViews++;
      if (ev === 'session_start') { row.sessions++; row.score += 3; }
      if (ev === 'battle_started' || evName === 'round_start') { row.rounds++; row.score += 5; }
      if (evName === 'round_complete') { row.completes++; row.score += 8; }
      if (ev === 'conversion') { row.conversions++; row.score += 10; }
      if (!row.path0 && meta.path) row.path0 = meta.path;
      totalScored++;
    }

    const top = [...acc.values()].sort((a, b) => b.score - a.score).slice(0, k);

    // Hydrate display name / email / photo for the top K.
    const profiles = await Promise.all(
      top.map(t => db.collection('user_profiles').doc(t.uid).get().catch(() => null))
    );
    const out = top.map((t, i) => {
      const p = profiles[i];
      const pd = p && p.exists ? p.data() : null;
      const sortedMix = Object.entries(t.eventMix).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return {
        uid: t.uid,
        name: (pd && pd.displayName) || (pd && pd.email ? pd.email.split('@')[0] : '') || 'anon',
        email: pd ? pd.email || '' : '',
        photoURL: pd ? pd.photoURL || '' : '',
        joined: pd && pd.createdAt && pd.createdAt.toMillis ? pd.createdAt.toMillis() : null,
        score: t.score,
        events: t.events,
        sessions: t.sessions,
        pageViews: t.pageViews,
        rounds: t.rounds,
        completes: t.completes,
        conversions: t.conversions,
        lastTs: t.lastTs,
        firstTs: t.firstTs === Number.MAX_SAFE_INTEGER ? null : t.firstTs,
        topEvents: sortedMix.map(([ev, n]) => ({ event: ev, count: n })),
        entryPath: t.path0,
      };
    });

    const result = {
      windowDays: days,
      sinceISO: since.toISOString(),
      sampled,
      sampleSize: snap.size,
      uniqueUsers: acc.size,
      totalScored,
      topUsers: out,
    };
    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-power-users error:', err);
    const stale = await getStaleShared(cacheKey).catch(() => null);
    if (stale && stale.value) {
      return jsonResponse({ ...stale.value, _stale: true, _staleAgeMs: stale.ageMs, _quota: /RESOURCE_EXHAUSTED|quota/i.test(err.message || '') }, 200, request);
    }
    return errorResponse('Failed to load power users: ' + (err.message || 'unknown'), 500, request);
  }
};

export const config = { path: '/api/admin/power-users' };
