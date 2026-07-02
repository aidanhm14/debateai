// Shared admin-auth helper. Every /api/admin/* function does the same
// "verify Firebase token → check ADMIN_UID env or user_profiles/{uid}.isAdmin
// === true" dance. This consolidates it so a single auth gate is the
// source of truth and the route handlers can focus on the data shape.

import { verifyIdToken, extractBearerToken, isAdminEmail } from './auth.mjs';
import { getDb } from './firestore.mjs';
import { errorResponse } from './response.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';

const cache = new Map();
const TTL_MS = 60_000;

export async function requireAdmin(request) {
  const token = extractBearerToken(request);
  if (!token) return { error: errorResponse('Authorization required', 401, request) };

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return { error: errorResponse('Authentication failed. Please sign in again.', 401, request) };
  }

  const uid = decoded.sub;
  const db = getDb();
  const cached = cache.get(uid);
  if (cached && Date.now() - cached.at < TTL_MS) {
    if (!cached.isAdmin) return { error: errorResponse('Forbidden: admin access required', 403, request) };
    return { uid, db };
  }

  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-auth profile check error:', err.message);
    }
  }

  cache.set(uid, { isAdmin, at: Date.now() });
  if (!isAdmin) return { error: errorResponse('Forbidden: admin access required', 403, request) };
  return { uid, db };
}

// ── User-agent parsing (lightweight, no external dep) ───────────────
// Returns a short, human-readable label. Used by admin-heatmap and
// admin-user-activity to bucket the session_start UA into a small set
// of slices that fit on a dashboard.
export function parseUA(ua) {
  if (!ua) return { browser: 'unknown', os: 'unknown', device: 'desktop' };
  const s = String(ua);

  let browser = 'other';
  if (/Edg\//.test(s)) browser = 'Edge';
  else if (/OPR\//.test(s) || /Opera/.test(s)) browser = 'Opera';
  else if (/Chrome\//.test(s) && !/Edg\//.test(s)) browser = 'Chrome';
  else if (/Firefox\//.test(s)) browser = 'Firefox';
  else if (/Safari\//.test(s) && !/Chrome\//.test(s)) browser = 'Safari';
  else if (/MSIE|Trident/.test(s)) browser = 'IE';

  let os = 'other';
  if (/Windows NT/.test(s)) os = 'Windows';
  else if (/Mac OS X/.test(s) && !/iPhone|iPad/.test(s)) os = 'macOS';
  else if (/iPhone|iPad|iPod/.test(s)) os = 'iOS';
  else if (/Android/.test(s)) os = 'Android';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Linux/.test(s)) os = 'Linux';

  let device = 'desktop';
  if (/Mobi|iPhone|iPod|Android.*Mobile/.test(s)) device = 'mobile';
  else if (/iPad|Tablet|Android(?!.*Mobile)/.test(s)) device = 'tablet';

  let surface = 'browser';
  if (/(Instagram|FBAN|FBAV|FB_IAB)/.test(s)) surface = 'in-app';
  else if (/(Twitter|LinkedIn|TikTok|MicroMessenger|Line\/)/.test(s)) surface = 'in-app';

  return { browser, os, device, surface };
}

// Normalize a path for "top pages" rollup — strips trailing slashes,
// query strings, and obvious user-id segments so /story/abc123 and
// /story/def456 don't fragment the chart.
export function normalizePath(p) {
  if (!p) return '/';
  let s = String(p).split('?')[0].split('#')[0];
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  // Collapse 24+ char hex/uuid-ish segments to :id
  s = s.replace(/\/[a-f0-9-]{20,}/gi, '/:id');
  return s || '/';
}
