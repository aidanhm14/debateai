// /api/admin/cohorts → weekly signup cohort retention + DAU/WAU/MAU.
//
// For the last `weeks` Sunday-anchored cohorts, computes the % of users
// who returned in each subsequent week (return = at least one event in
// that week). Standard cohort grid: rows = signup week, cols = weeks
// since signup, values = retention %.
//
// Also returns:
//   - DAU/WAU/MAU rolling counts (last day / 7 days / 28 days)
//   - Stickiness = DAU/MAU (industry-standard engagement proxy)
//   - 14-day DAU sparkline
//
// Two scans:
//   1. user_profiles where createdAt >= cohortStart → buckets new users
//      by week.
//   2. events where createdAt >= cohortStart → maps uid → set of weeks
//      they were active.
//
// Both queries are bounded; MAX_DOCS clamps the events scan so the
// function never runs away on a busy day.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, getStaleShared, TTL_HEAVY, wantsFresh } from './lib/admin-cache.mjs';
import { getExcludedUids } from './lib/founder-exclude.mjs';

const DEFAULT_WEEKS = 8;
const MAX_WEEKS = 16;
// 2026-06-27: 10K → 4K. Cohorts was the single biggest quota drain on
// /admin — up to 20K user_profiles + 10K events = ~30K reads (60% of the
// Spark daily budget) in ONE call, which is what blew the quota for the
// other panels. Retention uniqueness is per-uid-per-week, so a 4K event
// sample over the window still ranks the cohorts correctly; the profiles
// cap below is cut to match.
const MAX_EVENT_DOCS = 4_000;

// Sunday 00:00 in UTC at the start of the week containing `ms`.
function weekStartUTC(ms) {
  const d = new Date(ms);
  const day = d.getUTCDay(); // 0 = Sunday
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  return start;
}

function dayKeyUTC(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { db } = auth;

  const url = new URL(request.url);
  const weeks = Math.max(2, Math.min(MAX_WEEKS, parseInt(url.searchParams.get('weeks') || String(DEFAULT_WEEKS), 10)));

  const cacheKey = 'cohorts:v2:' + weeks;
  const cached = wantsFresh(request) ? null : await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    const excludeUids = await getExcludedUids(db);
    const now = Date.now();
    const cohortStartMs = weekStartUTC(now) - (weeks - 1) * 7 * 24 * 60 * 60 * 1000;
    const cohortStart = new Date(cohortStartMs);

    // ── 1. Signup cohorts ────────────────────────────────────────
    // Pull user_profiles by createdAt. Bucket by Sunday week start.
    const cohortMap = new Map(); // weekStartMs → Set<uid>
    for (let i = 0; i < weeks; i++) {
      const ws = cohortStartMs + i * 7 * 24 * 60 * 60 * 1000;
      cohortMap.set(ws, new Set());
    }

    const profilesSnap = await db.collection('user_profiles')
      .where('createdAt', '>=', cohortStart)
      .limit(6_000)  // 2026-06-27: 20K → 6K to cap the per-call read cost (see MAX_EVENT_DOCS note)
      .get()
      .catch(err => {
        console.warn('cohort profiles query failed:', err.message);
        return { docs: [] };
      });

    profilesSnap.docs.forEach(d => {
      if (excludeUids.has(d.id)) return;
      const data = d.data();
      const t = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : null;
      if (!t) return;
      const ws = weekStartUTC(t);
      if (cohortMap.has(ws)) cohortMap.get(ws).add(d.id);
    });

    // ── 2. Activity scan ─────────────────────────────────────────
    // For retention we need to know which weeks each user-in-cohort
    // was active. Pull events since cohortStart; cap at MAX_EVENT_DOCS.
    const userWeeks = new Map(); // uid → Set<weekStartMs>
    const userDays = new Map(); // uid → Set<dayKey>  (for DAU/WAU/MAU)

    let eventsScanned = 0;
    let sampled = false;
    const eventsSnap = await db.collection('events')
      .where('createdAt', '>=', cohortStart)
      .orderBy('createdAt', 'desc')
      .limit(MAX_EVENT_DOCS)
      .get()
      .catch(err => {
        console.warn('cohort events query failed:', err.message);
        return { docs: [] };
      });
    eventsScanned = eventsSnap.docs.length;
    if (eventsScanned >= MAX_EVENT_DOCS) sampled = true;

    eventsSnap.docs.forEach(d => {
      const data = d.data();
      const uid = data.uid;
      const t = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : null;
      if (!uid || !t) return;
      if (excludeUids.has(uid)) return;
      const ws = weekStartUTC(t);
      if (!userWeeks.has(uid)) userWeeks.set(uid, new Set());
      userWeeks.get(uid).add(ws);
      const dk = dayKeyUTC(t);
      if (!userDays.has(uid)) userDays.set(uid, new Set());
      userDays.get(uid).add(dk);
    });

    // ── 3. Build cohort grid ─────────────────────────────────────
    const cohortRows = [];
    const sortedCohorts = [...cohortMap.keys()].sort((a, b) => a - b);
    sortedCohorts.forEach((ws, rowIdx) => {
      const cohortUids = cohortMap.get(ws);
      const size = cohortUids.size;
      // For each subsequent week (0 = signup week, 1 = next, ...),
      // compute the share of cohort users active that week.
      const cells = [];
      const maxOffset = weeks - rowIdx;
      for (let offset = 0; offset < maxOffset; offset++) {
        const targetWs = ws + offset * 7 * 24 * 60 * 60 * 1000;
        let active = 0;
        cohortUids.forEach(uid => {
          const set = userWeeks.get(uid);
          if (set && set.has(targetWs)) active++;
        });
        cells.push({
          offset,
          weekStartISO: new Date(targetWs).toISOString().slice(0, 10),
          active,
          pct: size > 0 ? +(active / size * 100).toFixed(1) : null,
        });
      }
      cohortRows.push({
        weekStartISO: new Date(ws).toISOString().slice(0, 10),
        weekLabel: new Date(ws).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        size,
        cells,
      });
    });

    // ── 4. DAU / WAU / MAU + 14d sparkline ───────────────────────
    const todayDk = dayKeyUTC(now);
    const dauSet = new Set();
    const wauSet = new Set();
    const mauSet = new Set();
    const DAY = 86_400_000;
    userDays.forEach((daySet, uid) => {
      daySet.forEach(dk => {
        const age = todayDk - dk;
        if (age < DAY) dauSet.add(uid);
        if (age < 7 * DAY) wauSet.add(uid);
        if (age < 28 * DAY) mauSet.add(uid);
      });
    });

    const dauSpark = [];
    for (let i = 13; i >= 0; i--) {
      const dk = todayDk - i * DAY;
      const dayUsers = new Set();
      userDays.forEach((daySet, uid) => {
        if (daySet.has(dk)) dayUsers.add(uid);
      });
      dauSpark.push({
        dayISO: new Date(dk).toISOString().slice(0, 10),
        dau: dayUsers.size,
      });
    }

    const stickiness = mauSet.size > 0 ? +(dauSet.size / mauSet.size * 100).toFixed(1) : null;

    const result = {
      cohortRows,
      weeks,
      dau: dauSet.size,
      wau: wauSet.size,
      mau: mauSet.size,
      stickinessPct: stickiness,
      dauSpark,
      eventsScanned,
      sampled,
    };
    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-cohorts error:', err);
    const stale = await getStaleShared(cacheKey).catch(() => null);
    if (stale && stale.value) {
      return jsonResponse({ ...stale.value, _stale: true, _staleAgeMs: stale.ageMs, _quota: /RESOURCE_EXHAUSTED|quota/i.test(err.message || '') }, 200, request);
    }
    return errorResponse('Failed to load cohorts: ' + (err.message || 'unknown'), 500, request);
  }
};

export const config = { path: '/api/admin/cohorts' };
