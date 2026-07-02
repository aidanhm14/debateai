// Admin aggregator for the signin_errors collection.
//
// /api/admin-signin-errors?days=7  →  JSON breakdown of sign-in failures
// over the last N days, grouped by code, surface, inApp flag, and browser.
//
// The 62% sign-in drop in the funnel is the second-biggest leak after
// round-complete. signin_errors went live 2026-05-14 (commit a37440f) but
// nothing reads it yet — this endpoint is the first time we can actually
// see the dominant failure mode without dropping into the Firebase console.
//
// Auth: same gate as admin-analytics.mjs + admin-user-activity.mjs —
// ADMIN_UID env OR user_profiles.{uid}.isAdmin === true.

import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const DEFAULT_DAYS = 7;
const MAX_DAYS = 60;
const MAX_DOCS = 5000;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-signin-errors auth error:', err.message);
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
      console.error('admin-signin-errors profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  const url = new URL(request.url);
  const daysRaw = parseInt(url.searchParams.get('days') || '', 10);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(MAX_DAYS, daysRaw)) : DEFAULT_DAYS;
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

  try {
    // Range query on `timestamp` — composite index unnecessary for a
    // single-field order. If volume ever pushes past MAX_DOCS the cap
    // protects the response size; we can grow it later.
    const snap = await db.collection('signin_errors')
      .where('timestamp', '>=', new Date(sinceMs))
      .orderBy('timestamp', 'desc')
      .limit(MAX_DOCS)
      .get();

    const docs = snap.docs.map(d => d.data() || {});

    // Bucketers — keep them small so the response is human-scannable.
    const byCode = new Map();
    const bySurface = new Map();
    const byMethod = new Map();
    const byInApp = new Map();
    const byCountry = new Map();
    const byBrowser = new Map();
    // Cross-cut: code × inApp so we can see how much of each error is
    // explained by the in-app browser problem versus regular browsers.
    const codeByInApp = new Map();

    function bump(map, key, n = 1) {
      if (!key) key = '(unknown)';
      map.set(key, (map.get(key) || 0) + n);
    }

    // Tiny UA classifier — buckets users into 6-ish browser families.
    // Imperfect; good enough to know if iOS Safari is the bulk of failures.
    function classifyUA(ua) {
      if (!ua) return '(unknown)';
      const s = String(ua);
      if (/Instagram/i.test(s)) return 'Instagram in-app';
      if (/FBAN|FBAV|FB_IAB/i.test(s)) return 'Facebook in-app';
      if (/TikTok|Musical_ly|BytedanceWebview/i.test(s)) return 'TikTok in-app';
      if (/LinkedInApp/i.test(s)) return 'LinkedIn in-app';
      if (/Snapchat/i.test(s)) return 'Snapchat in-app';
      if (/(iPhone|iPad|iPod).*Safari/.test(s) && !/CriOS|FxiOS/.test(s)) return 'iOS Safari';
      if (/CriOS/.test(s)) return 'iOS Chrome';
      if (/FxiOS/.test(s)) return 'iOS Firefox';
      if (/Android/.test(s) && /Chrome/.test(s) && !/wv/.test(s)) return 'Android Chrome';
      if (/Android/.test(s) && /wv/.test(s)) return 'Android WebView';
      if (/Edg\//.test(s)) return 'Edge';
      if (/Firefox/.test(s)) return 'Firefox desktop';
      if (/Chrome/.test(s) && !/Edg\//.test(s)) return 'Chrome desktop';
      if (/Safari/.test(s)) return 'Safari desktop';
      return 'Other';
    }

    for (const d of docs) {
      bump(byCode, d.code);
      bump(bySurface, d.surface);
      bump(byMethod, d.method);
      bump(byInApp, d.inApp ? 'in-app' : 'regular');
      bump(byCountry, d.country);
      bump(byBrowser, classifyUA(d.userAgent));
      const cik = (d.code || '(unknown)') + '|' + (d.inApp ? 'in-app' : 'regular');
      bump(codeByInApp, cik);
    }

    function toTop(map, limit = 12) {
      return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([key, count]) => ({ key, count, pct: docs.length ? +(100 * count / docs.length).toFixed(1) : 0 }));
    }

    // Pull the 10 most recent error messages verbatim. Useful when the
    // code is something generic like "auth/internal-error" — the
    // message text often reveals the actual underlying problem.
    const recentMessages = docs.slice(0, 10).map(d => ({
      code: d.code || '',
      message: (d.message || '').slice(0, 200),
      surface: d.surface || '',
      method: d.method || '',
      inApp: !!d.inApp,
      country: d.country || '',
      timestamp: d.timestamp && typeof d.timestamp.toDate === 'function'
        ? d.timestamp.toDate().toISOString()
        : null,
    }));

    return jsonResponse({
      windowDays: days,
      totalErrors: docs.length,
      truncated: docs.length >= MAX_DOCS,
      byCode: toTop(byCode),
      bySurface: toTop(bySurface),
      byMethod: toTop(byMethod),
      byInApp: toTop(byInApp, 2),
      byCountry: toTop(byCountry, 12),
      byBrowser: toTop(byBrowser, 12),
      codeByInApp: toTop(codeByInApp, 20),
      recentMessages,
    }, 200, request);
  } catch (err) {
    console.error('admin-signin-errors fatal:', err.message);
    return errorResponse('Aggregation failed: ' + err.message, 500, request);
  }
};

export const config = { path: '/api/admin-signin-errors' };
