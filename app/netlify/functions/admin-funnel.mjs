// /api/admin/funnel?days=7  →  Round-complete funnel for the last N days.
//
// Reads the `events` collection. Two event sources for the round funnel:
//   • event == 'battle_started'       (server-logged round start, from
//                                      /api/log-event when /debate-it
//                                      enters phase=speech)
//   • event == 'app_event' AND
//     metadata.name == 'round_start'  (gtag → track.js bridge mirror of
//                                      the same start, fires only when
//                                      gtag is loaded — useful as a
//                                      sanity-check on the server log)
//   • event == 'app_event' AND
//     metadata.name == 'round_complete'  (gtag completion event from
//                                         /debate-it endSpeech +
//                                         /index simulator end-of-round)
//
// Also surfaces Funnel Fix #3 (stuck-speech escape hatch) telemetry:
//   stuck_speech_shown / stuck_speech_skipped — fired by the 60s
//   amber-banner useEffect in debate-it.html. Shown / skipped ratio
//   tells us whether the banner is meaningfully catching stuck rounds
//   (vs. firing spuriously) before we ship more funnel work.
//
// No composite indexes required: range query is on `createdAt` only,
// rest of the filtering happens in JS over the result set. Cap at
// MAX_DOCS to keep the Function under timeout. Past the cap the
// response flags `sampled:true` so the caller knows the ratio is real
// but the absolute counts are floored.
//
// Auth gate: same as admin-analytics / admin-signin-errors.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY } from './lib/admin-cache.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const DEFAULT_DAYS = 7;
const MAX_DAYS = 60;
// 2026-05-20: was 20000. This endpoint was one of three (with
// founder-video + subscribers) missed by the 2026-05-19 admin-cache
// pass, so each load could scan up to 20K raw event docs uncached —
// enough to exhaust the free-tier Firestore read quota and 500 every
// admin endpoint (incl. the cached ones, on a cache miss). Cap lowered
// + 5-min cache added below to match the rest of the dashboard.
const MAX_DOCS = 2500;  // 2026-06-15: halved; shared cache (admin-cache.mjs) recomputes a cold open once per TTL

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-funnel auth error:', err.message);
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
      console.error('admin-funnel profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  const url = new URL(request.url);
  const daysRaw = parseInt(url.searchParams.get('days') || '', 10);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(MAX_DAYS, daysRaw)) : DEFAULT_DAYS;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const cacheKey = 'funnel:' + days;
  const cached = await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    const snap = await db.collection('events')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(MAX_DOCS)
      .get();

    const docs = snap.docs;
    const sampled = docs.length >= MAX_DOCS;

    // Buckets. battle_started is the server-logged round-start
    // (authoritative, server-side). round_start in the gtag bridge
    // is a parallel signal — both should track each other; divergence
    // means either /api/log-event is dropping or gtag is blocked.
    let battleStarted = 0;
    let gtagRoundStart = 0;
    let roundComplete = 0;
    let stuckShown = 0;
    let stuckSkipped = 0;

    // Per-format slice for round_complete. Useful when the team starts
    // routing the per-format pre-round interstitial — we'll want to
    // see if completion rate lifts more for one format than another.
    const completeByFormat = {};
    const startByFormat = {};

    // Distinct uids that started vs completed — gives a user-weighted
    // completion rate alongside the event-weighted one. Event-weighted
    // is inflated by power users running many rounds; user-weighted is
    // the cleaner cohort number.
    const startersByUid = new Set();
    const completersByUid = new Set();

    for (const doc of docs) {
      const d = doc.data();
      const ev = d.event;
      const meta = d.metadata || {};
      if (ev === 'battle_started') {
        battleStarted++;
        if (d.uid) startersByUid.add(d.uid);
        if (meta.format) startByFormat[meta.format] = (startByFormat[meta.format] || 0) + 1;
        continue;
      }
      if (ev !== 'app_event') continue;
      const name = meta.name;
      if (name === 'round_start') {
        gtagRoundStart++;
        if (d.uid) startersByUid.add(d.uid);
        if (meta.format) startByFormat[meta.format] = (startByFormat[meta.format] || 0) + 1;
      } else if (name === 'round_complete') {
        roundComplete++;
        if (d.uid) completersByUid.add(d.uid);
        if (meta.format) completeByFormat[meta.format] = (completeByFormat[meta.format] || 0) + 1;
      } else if (name === 'stuck_speech_shown') {
        stuckShown++;
      } else if (name === 'stuck_speech_skipped') {
        stuckSkipped++;
      }
    }

    // Prefer battle_started as the canonical denominator (server-logged,
    // not gated on gtag). Fall back to the gtag round_start count if
    // battle_started looks suspiciously low — happens if log-event
    // got rate-limited or the client lost network on speech-enter.
    const startsCanonical = Math.max(battleStarted, gtagRoundStart);
    const completionRate = startsCanonical > 0
      ? +(roundComplete / startsCanonical * 100).toFixed(1)
      : null;
    const userCompletionRate = startersByUid.size > 0
      ? +(completersByUid.size / startersByUid.size * 100).toFixed(1)
      : null;
    const stuckSkipRate = stuckShown > 0
      ? +(stuckSkipped / stuckShown * 100).toFixed(1)
      : null;

    const result = {
      windowDays: days,
      sinceISO: since.toISOString(),
      sampled,
      sampleSize: docs.length,

      starts: {
        battleStartedServer: battleStarted,
        gtagRoundStart,
        canonical: startsCanonical,
      },
      completes: roundComplete,
      completionRatePct: completionRate,
      uniqueStarters: startersByUid.size,
      uniqueCompleters: completersByUid.size,
      userCompletionRatePct: userCompletionRate,

      fix3StuckSpeech: {
        shown: stuckShown,
        skipped: stuckSkipped,
        skipRatePct: stuckSkipRate,
      },

      byFormat: {
        starts: startByFormat,
        completes: completeByFormat,
      },

      timestamp: new Date().toISOString(),
    };
    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-funnel error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/funnel',
};
