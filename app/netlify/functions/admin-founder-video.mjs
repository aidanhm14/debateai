// /api/admin/founder-video?days=7  →  Founder-intro video drop-off
// funnel for the last N days.
//
// Reads the `events` collection. The landing-page <video> listener
// (see app/landing.html, .founder-video block) routes through
// window.gtag('event', 'founder_video_<bucket>', ...) which the
// gtag → track.js bridge mirrors into Firestore as:
//
//   event === 'app_event'
//   metadata.name in {
//     'founder_video_play',
//     'founder_video_25',
//     'founder_video_50',
//     'founder_video_75',
//     'founder_video_complete',
//   }
//
// Each event is sessionStorage-gated client-side, so one visitor
// counts at most once per bucket per session. Anonymous viewers land
// under synthetic uids of the form `anon:<sessionId>` (log-event.mjs
// allows app_event for anon writes). The play→25→50→75→complete drop
// curve answers "how engaging is the intro," not just "how many
// pressed play."
//
// No composite indexes required: createdAt range + JS-side filtering.
// Capped at MAX_DOCS; sampled:true on overflow.
//
// Auth gate: same admin-uid / user_profiles.isAdmin check used across
// /api/admin/* endpoints.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY } from './lib/admin-cache.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const DEFAULT_DAYS = 7;
const MAX_DAYS = 60;
// 2026-05-20: was 20000. Missed by the 2026-05-19 admin-cache pass —
// see admin-funnel.mjs. Cap lowered + 5-min cache added below.
const MAX_DOCS = 2500;  // 2026-06-15: halved; shared cache (admin-cache.mjs) recomputes a cold open once per TTL

const BUCKETS = ['play', '25', '50', '75', 'complete'];

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-founder-video auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  let isAdmin = uid === ADMIN_UID;
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) {
        isAdmin = true;
      }
    } catch (err) {
      console.error('admin-founder-video profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  const url = new URL(request.url);
  const daysRaw = parseInt(url.searchParams.get('days') || '', 10);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(MAX_DAYS, daysRaw)) : DEFAULT_DAYS;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // 2026-07-01: one 30d scan serves every standard window (see
  // admin-heatmap.mjs note) — all four windows aggregate in-process and
  // share one cache entry, so the /admin global time window stops costing
  // a fresh events scan per flip.
  const WINDOWS = [1, 3, 7, 30];
  const multi = WINDOWS.includes(days);
  const cacheKey = multi ? 'founder-video:multi' : 'founder-video:' + days;
  const cached = await getCachedShared(cacheKey);
  if (cached) {
    const hit = multi ? cached[days] : cached;
    if (hit) return jsonResponse(hit, 200, request);
  }

  try {
    // app_event-only query keeps the scan tight — funnel doesn't need
    // the rest of the events collection's volume.
    const scanSince = multi ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : since;
    const snap = await db.collection('events')
      .where('event', '==', 'app_event')
      .where('createdAt', '>=', scanSince)
      .orderBy('createdAt', 'desc')
      .limit(MAX_DOCS)
      .get();

    const docs = snap.docs;
    const oldestMs = docs.length ? (docs[docs.length - 1].data().createdAt?.toMillis?.() || 0) : 0;

    const buildWindow = (wDays) => {
      const wSince = new Date(Date.now() - wDays * 24 * 60 * 60 * 1000);
      const wSinceMs = wSince.getTime();
      let windowSize = 0;

      const counts = { play: 0, '25': 0, '50': 0, '75': 0, complete: 0 };
      // Distinct-uid counts give "people," event counts give "fires."
      // For sessionStorage-gated events they should match closely, but
      // the gap surfaces bots / replays from privacy-mode sessions where
      // sessionStorage isn't persisting between page loads.
      const uidsByBucket = {
        play: new Set(), '25': new Set(), '50': new Set(), '75': new Set(), complete: new Set(),
      };

      for (const doc of docs) {
        const d = doc.data();
        const t = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
        if (!t || t < wSinceMs) continue;
        windowSize++;
        const name = (d.metadata && d.metadata.name) || '';
        if (!name.startsWith('founder_video_')) continue;
        const bucket = name.slice('founder_video_'.length);
        if (!(bucket in counts)) continue;
        counts[bucket]++;
        if (d.uid) uidsByBucket[bucket].add(d.uid);
      }

      // Drop-off rates: each bucket as a % of plays. Tells you what
      // fraction of starters made it past each quartile.
      const plays = counts.play;
      const retention = {};
      for (const b of BUCKETS) {
        retention[b] = plays > 0 ? +(counts[b] / plays * 100).toFixed(1) : null;
      }

      return {
        windowDays: wDays,
        sinceISO: wSince.toISOString(),
        sampled: docs.length >= MAX_DOCS && oldestMs > wSinceMs,
        sampleSize: windowSize,
        counts,
        uniqueUids: Object.fromEntries(BUCKETS.map(b => [b, uidsByBucket[b].size])),
        retentionPct: retention,
        timestamp: new Date().toISOString(),
      };
    };

    if (multi) {
      const all = {};
      for (const w of WINDOWS) all[w] = buildWindow(w);
      await setCachedShared(cacheKey, all, TTL_HEAVY);
      return jsonResponse(all[days], 200, request);
    }
    const result = buildWindow(days);
    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-founder-video error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/founder-video',
};
