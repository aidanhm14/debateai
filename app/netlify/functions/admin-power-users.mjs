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
import { getCachedShared, setCachedShared, getStaleShared, TTL_HEAVY, wantsFresh } from './lib/admin-cache.mjs';
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

  // 2026-07-01: one 30d scan serves every standard window (see
  // admin-heatmap.mjs note) — per-window aggregation happens in-process
  // and all four results share one cache entry, so flipping the /admin
  // global time window stops costing a fresh events scan per flip.
  const WINDOWS = [1, 3, 7, 30];
  const multi = WINDOWS.includes(days);
  const cacheKey = multi ? 'power-users:multi:' + k : 'power-users:' + days + ':' + k;
  const cached = wantsFresh(request) ? null : await getCachedShared(cacheKey);
  if (cached) {
    const hit = multi ? cached[days] : cached;
    if (hit) return jsonResponse(hit, 200, request);
  }

  try {
    const scanSince = multi ? new Date(Date.now() - 30 * 86_400_000) : since;
    // Race the events scan against a deadline under Netlify's ~10s limit. A
    // slow / quota-pressured scan can hang without throwing; without this the
    // platform 502s before the catch below can serve the last-cached value.
    const SCAN_DEADLINE_MS = 8000;
    const snap = await Promise.race([
      db.collection('events')
        .where('createdAt', '>=', scanSince)
        .orderBy('createdAt', 'desc')
        .limit(MAX_DOCS)
        .get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SCAN_DEADLINE_EXCEEDED_' + SCAN_DEADLINE_MS + 'ms')), SCAN_DEADLINE_MS)),
    ]);

    // Drop the founder's own usage so the leaderboard is real users.
    const excludeUids = await getExcludedUids(db);
    const oldestMs = snap.size ? (snap.docs[snap.size - 1].data().createdAt?.toMillis?.() || 0) : 0;

    // Aggregate one window from the in-memory scan: uid → row + top-K.
    const buildWindow = (wDays) => {
      const wSince = new Date(Date.now() - wDays * 86_400_000);
      const wSinceMs = wSince.getTime();
      const acc = new Map();
      let totalScored = 0;
      let windowSize = 0;

      for (const d of snap.docs) {
        const data = d.data();
        const uid = data.uid;
        const t = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0;
        if (!t || t < wSinceMs) continue;
        windowSize++;
        if (!uid) continue;
        if (excludeUids.has(uid)) continue;
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

      return {
        wSince,
        sampled: snap.size >= MAX_DOCS && oldestMs > wSinceMs,
        windowSize,
        uniqueUsers: acc.size,
        totalScored,
        top: [...acc.values()].sort((a, b) => b.score - a.score).slice(0, k),
      };
    };

    const windowsToBuild = multi ? WINDOWS : [days];
    const built = new Map(windowsToBuild.map(w => [w, buildWindow(w)]));

    // Hydrate display name / email / photo ONCE for the union of top
    // uids across windows (heavy overlap on a small user base).
    const uidSet = new Set();
    for (const b of built.values()) for (const t of b.top) uidSet.add(t.uid);
    const uids = [...uidSet];
    const profileDocs = await Promise.all(
      uids.map(uid => db.collection('user_profiles').doc(uid).get().catch(() => null))
    );
    const profileByUid = new Map(uids.map((uid, i) => [uid, profileDocs[i]]));

    const shapeUser = (t) => {
      const p = profileByUid.get(t.uid);
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
    };

    const shapeResult = (wDays, b) => ({
      windowDays: wDays,
      sinceISO: b.wSince.toISOString(),
      sampled: b.sampled,
      sampleSize: b.windowSize,
      uniqueUsers: b.uniqueUsers,
      totalScored: b.totalScored,
      topUsers: b.top.map(shapeUser),
    });

    if (multi) {
      const all = {};
      for (const w of WINDOWS) all[w] = shapeResult(w, built.get(w));
      await setCachedShared(cacheKey, all, TTL_HEAVY);
      return jsonResponse(all[days], 200, request);
    }
    const result = shapeResult(days, built.get(days));
    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-power-users error:', err);
    const stale = await getStaleShared(cacheKey).catch(() => null);
    const staleVal = stale && stale.value ? (multi ? stale.value[days] : stale.value) : null;
    if (staleVal) {
      return jsonResponse({ ...staleVal, _stale: true, _staleAgeMs: stale.ageMs, _quota: /RESOURCE_EXHAUSTED|quota/i.test(err.message || '') }, 200, request);
    }
    return errorResponse('Failed to load power users: ' + (err.message || 'unknown'), 500, request);
  }
};

export const config = { path: '/api/admin/power-users' };
