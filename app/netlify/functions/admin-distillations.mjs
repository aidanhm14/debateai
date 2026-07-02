// /api/admin/distillations  →  Freshness + content snapshot of every
// learning_distillations/{format} doc.
//
// Background: scheduled-distill.mjs runs nightly at 04:00 UTC, pulls
// the top-rated generations per format from the last 30 days, asks
// Claude Haiku to extract "PATTERNS THAT WORK," writes the result to
// learning_distillations/{slug}. lib/distillations.mjs reads that doc
// on every brain call and appends a LEARNED PATTERNS block to the
// system prompt.
//
// Until now the only signal that the nightly run actually happened was
// looking at function logs in the Netlify dashboard. This endpoint
// surfaces freshness on /admin so the loop's heartbeat is visible
// without leaving the tab: per-format age + example count + first 200
// chars of the distillation. Stale (>36h) or missing formats render
// as red flags so a regression is obvious at a glance.
//
// Read cost: 9 Firestore reads per call (FORMATS.length). Cheap.
// Cached 5 min via admin-cache so refreshing the dashboard doesn't
// re-read for every keystroke.
//
// Auth gate: same admin-only pattern as the rest of /admin endpoints.

import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY } from './lib/admin-cache.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';

// Mirrors FORMATS in scheduled-distill.mjs. Keep in sync if formats
// get added there — a format missing from this list won't have a row
// on /admin and will look invisibly skipped by the nightly run.
const FORMATS = [
  { slug: 'apda',     name: 'APDA' },
  { slug: 'bp',       name: 'British Parli' },
  { slug: 'asian',    name: 'Asian Parli' },
  { slug: 'worlds',   name: 'Worlds' },
  { slug: 'pf',       name: 'Public Forum' },
  { slug: 'ld',       name: 'Lincoln-Douglas' },
  { slug: 'policy',   name: 'Policy' },
  { slug: 'congress', name: 'Congress' },
  { slug: 'mun',      name: 'MUN' },
];

// Anything older than 36h is flagged stale. The cron fires once
// daily so a healthy run lands every ~24h; 36h leaves a 12h grace
// window for a single missed run before the alarm bell rings.
const STALE_MS = 36 * 60 * 60 * 1000;

// Preview cap. Distillations top out around 1-2 KB; 200 chars is
// enough to eyeball quality without making the dashboard wall-of-text.
const PREVIEW_CHARS = 200;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-distillations auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) {
        isAdmin = true;
      }
    } catch (err) {
      console.error('admin-distillations profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  const cacheKey = 'distillations:v1';
  const cached = await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    const now = Date.now();
    // Parallel reads keep this under one round-trip-time per format.
    const rows = await Promise.all(FORMATS.map(async (f) => {
      try {
        const snap = await db.collection('learning_distillations').doc(f.slug).get();
        if (!snap.exists) {
          return {
            slug: f.slug,
            name: f.name,
            present: false,
            ageMs: null,
            stale: true,           // missing entirely → treat as stale
            exampleCount: 0,
            model: null,
            distillationChars: 0,
            preview: '',
          };
        }
        const data = snap.data() || {};
        const createdAt = data.createdAt
          ? (typeof data.createdAt.toMillis === 'function'
              ? data.createdAt.toMillis()
              : new Date(data.createdAt).getTime())
          : null;
        const ageMs = createdAt != null ? Math.max(0, now - createdAt) : null;
        const distillation = String(data.distillation || '');
        return {
          slug: f.slug,
          name: f.name,
          present: true,
          ageMs,
          stale: ageMs == null || ageMs > STALE_MS,
          exampleCount: Number(data.exampleCount || 0),
          model: data.model || null,
          distillationChars: distillation.length,
          preview: distillation.slice(0, PREVIEW_CHARS),
        };
      } catch (err) {
        console.error('admin-distillations format', f.slug, 'error:', err.message);
        return {
          slug: f.slug,
          name: f.name,
          present: false,
          ageMs: null,
          stale: true,
          exampleCount: 0,
          model: null,
          distillationChars: 0,
          preview: '',
          error: err.message,
        };
      }
    }));

    // Stale-first ordering: regressions sort to the top so the eye
    // catches them without scanning the whole list. Within stale and
    // within fresh, older first so the laggard is the one you see.
    rows.sort((a, b) => {
      if (a.stale !== b.stale) return a.stale ? -1 : 1;
      const aAge = a.ageMs == null ? Infinity : a.ageMs;
      const bAge = b.ageMs == null ? Infinity : b.ageMs;
      return bAge - aAge;
    });

    const result = {
      rows,
      summary: {
        total: rows.length,
        present: rows.filter(r => r.present).length,
        stale: rows.filter(r => r.stale).length,
        oldestAgeMs: rows.reduce((m, r) => (r.ageMs != null && r.ageMs > m ? r.ageMs : m), 0),
      },
      staleThresholdMs: STALE_MS,
      timestamp: new Date().toISOString(),
    };
    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-distillations error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/distillations',
};
