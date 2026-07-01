// /api/admin/heatmap → activity slices for the 30-day window.
//
// Returns:
//   - heatmap[7][24]    hour-of-day × day-of-week grid (UTC) counted
//                       from page_view events.
//   - devices           desktop / mobile / tablet split from
//                       session_start UA strings.
//   - browsers          Chrome / Safari / Firefox / Edge / Opera / IE
//                       / other.
//   - os                Windows / macOS / iOS / Android / Linux / etc.
//   - inAppShare        % of sessions opened inside in-app browsers
//                       (Instagram/FB/TikTok/etc).
//   - topPages          most-visited page paths.
//   - topReferrers      most-common page_view referrers.
//   - brainMix          AI brain usage from app_event metadata.
//   - formatMix         debate format mix from app_event metadata.
//
// One scan of the events collection over the window, with
// MAX_DOCS clamping. All bucketing is done in-process.

import { requireAdmin } from './lib/admin-auth.mjs';
import { parseUA, normalizePath } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, getStaleShared, TTL_HEAVY } from './lib/admin-cache.mjs';
import { getExcludedUids } from './lib/founder-exclude.mjs';

// 2026-05-19: MAX_DOCS cut 30K → 5K. The heatmap is a sample-based
// visualization; 5K page_view events across 30 days still gives a
// statistically meaningful 7×24 grid. Combined with the cache below,
// this is what makes /admin survive on a tight Firestore budget.
const MAX_DOCS = 1500;  // 2026-06-27: 2500 → 1500. Sample-based grid; the shared cache recomputes a cold open at most once per TTL
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { db } = auth;

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(MAX_DAYS, parseInt(url.searchParams.get('days') || String(DEFAULT_DAYS), 10)));
  const since = new Date(Date.now() - days * 86_400_000);

  // 2026-07-01: the /admin global time window (24h/3d/7d/30d) turned each
  // flip into a fresh events scan (per-days cache keys). Since the scan is
  // newest-first, ONE 30d scan can serve every standard window: aggregate
  // in-process per window, cache all four results under one key. A cold
  // open now costs one scan no matter how many windows get flipped.
  const WINDOWS = [1, 3, 7, 30];
  const multi = WINDOWS.includes(days);
  const cacheKey = multi ? 'heatmap:multi' : 'heatmap:' + days;
  const cached = await getCachedShared(cacheKey);
  if (cached) {
    const hit = multi ? cached[days] : cached;
    if (hit) return jsonResponse(hit, 200, request);
  }

  try {
    const scanDays = multi ? 30 : days;
    const scanSince = multi ? new Date(Date.now() - 30 * 86_400_000) : since;
    const snap = await db.collection('events')
      .where('createdAt', '>=', scanSince)
      .orderBy('createdAt', 'desc')
      .limit(MAX_DOCS)
      .get();

    // Drop the founder's own usage so the dashboard reflects real users.
    const excludeUids = await getExcludedUids(db);

    const topN = (obj, n = 10) => Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => ({ key: k, count: v }));

    // Aggregate one window from the in-memory scan. The scan is the
    // expensive part; re-walking snap.docs per window is microseconds.
    const oldestMs = snap.size ? (snap.docs[snap.size - 1].data().createdAt?.toMillis?.() || 0) : 0;
    const buildWindow = (wDays) => {
      const wSince = new Date(Date.now() - wDays * 86_400_000);
      const wSinceMs = wSince.getTime();

      // 7×24 grid, [dayOfWeek][hour] — Sunday = 0 (UTC).
      const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));

      const devices = { desktop: 0, mobile: 0, tablet: 0 };
      const browsers = {};
      const oss = {};
      let surfaceInApp = 0;
      let surfaceTotal = 0;

      const pageCounts = {};
      const refCounts = {};
      const brainCounts = {};
      const formatCounts = {};
      const personaCounts = {};

      const eventTypeCounts = {};
      let windowSize = 0;

      for (const d of snap.docs) {
        const data = d.data();
        if (data.uid && excludeUids.has(data.uid)) continue;
        const t = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : null;
        if (!t || t < wSinceMs) continue;
        windowSize++;
        const ev = data.event;
        const meta = data.metadata || {};

        eventTypeCounts[ev] = (eventTypeCounts[ev] || 0) + 1;

        // Heatmap: count page_view only (one signal per page-visit).
        if (ev === 'page_view') {
          const date = new Date(t);
          heatmap[date.getUTCDay()][date.getUTCHours()]++;
          const path = normalizePath(meta.path);
          pageCounts[path] = (pageCounts[path] || 0) + 1;
          if (meta.referrer) {
            let r = String(meta.referrer);
            try { r = new URL(r).hostname || r; } catch {}
            if (r) refCounts[r] = (refCounts[r] || 0) + 1;
          }
        }

        if (ev === 'session_start') {
          const ua = parseUA(meta.user_agent || '');
          devices[ua.device] = (devices[ua.device] || 0) + 1;
          browsers[ua.browser] = (browsers[ua.browser] || 0) + 1;
          oss[ua.os] = (oss[ua.os] || 0) + 1;
          surfaceTotal++;
          if (ua.surface === 'in-app') surfaceInApp++;
        }

        // Brain / format / persona usage. Mostly fired via app_event
        // (gtag bridge) — case_generate, round_start, round_complete.
        const evName = ev === 'app_event' && meta.name ? meta.name : ev;
        if (meta.brain) brainCounts[meta.brain] = (brainCounts[meta.brain] || 0) + 1;
        if (meta.format && (evName === 'round_start' || evName === 'round_complete' || ev === 'battle_started')) {
          formatCounts[meta.format] = (formatCounts[meta.format] || 0) + 1;
        }
        if (meta.persona) personaCounts[meta.persona] = (personaCounts[meta.persona] || 0) + 1;
      }

      // sampled = the scan hit its cap AND may not reach back to this
      // window's start (newest-first scan: short windows stay exact).
      const sampled = snap.size >= MAX_DOCS && oldestMs > wSinceMs;

      return {
        windowDays: wDays,
        sinceISO: wSince.toISOString(),
        sampled,
        sampleSize: windowSize,
        heatmap,
        devices,
        browsers,
        os: oss,
        surfaceInAppShare: surfaceTotal > 0 ? +(surfaceInApp / surfaceTotal * 100).toFixed(1) : null,
        surfaceTotal,
        topPages: topN(pageCounts, 12),
        topReferrers: topN(refCounts, 8),
        brainMix: topN(brainCounts, 8),
        formatMix: topN(formatCounts, 12),
        personaMix: topN(personaCounts, 12),
        eventTypeCounts,
      };
    };

    if (multi) {
      const all = {};
      for (const w of WINDOWS) all[w] = buildWindow(w);
      await setCachedShared(cacheKey, all, TTL_HEAVY);
      return jsonResponse(all[days], 200, request);
    }
    const result = buildWindow(scanDays);
    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-heatmap error:', err);
    const stale = await getStaleShared(cacheKey).catch(() => null);
    const staleVal = stale && stale.value ? (multi ? stale.value[days] : stale.value) : null;
    if (staleVal) {
      return jsonResponse({ ...staleVal, _stale: true, _staleAgeMs: stale.ageMs, _quota: /RESOURCE_EXHAUSTED|quota/i.test(err.message || '') }, 200, request);
    }
    return errorResponse('Failed to load heatmap: ' + (err.message || 'unknown'), 500, request);
  }
};

export const config = { path: '/api/admin/heatmap' };
