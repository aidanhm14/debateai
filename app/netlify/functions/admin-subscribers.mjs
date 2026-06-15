// Admin-only endpoint: returns the email_signups collection so the
// admin dashboard can render a searchable/exportable subscriber list.
// Gate pattern matches admin-analytics.mjs (ADMIN_UID env var OR
// user_profiles.{uid}.isAdmin === true).
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY } from './lib/admin-cache.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const CACHE_KEY = 'subscribers';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-subscribers auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  // Admin gate: ADMIN_UID env var OR isAdmin profile flag.
  let isAdmin = uid === ADMIN_UID;
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-subscribers profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  // 2026-05-20: this listed up to 5000 docs uncached on every dashboard
  // load — one of three endpoints missed by the 2026-05-19 admin-cache
  // pass that let the free-tier Firestore read quota get exhausted.
  const cached = await getCachedShared(CACHE_KEY);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    // Pull the whole collection, ordered newest-first. email_signups should
    // stay small enough that this is fine without pagination for a while.
    // If it grows past a few thousand, switch to cursor pagination.
    const snap = await db.collection('email_signups').orderBy('createdAt', 'desc').limit(5000).get();
    const subs = snap.docs.map(d => {
      const data = d.data() || {};
      // createdAt is a Firestore Timestamp — convert to ISO string for the client.
      let createdAt = null;
      try {
        if (data.createdAt?.toDate) createdAt = data.createdAt.toDate().toISOString();
        else if (data.createdAt instanceof Date) createdAt = data.createdAt.toISOString();
        else if (typeof data.createdAt === 'string') createdAt = data.createdAt;
      } catch (e) { /* leave null */ }
      return {
        id: d.id,
        email: data.email || '',
        createdAt,
      };
    });

    const result = {
      count: subs.length,
      subscribers: subs,
      timestamp: new Date().toISOString(),
    };
    await setCachedShared(CACHE_KEY, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-subscribers fetch error:', err);
    return errorResponse('Failed to load subscribers: ' + (err.message || err), 500, request);
  }
};

export const config = {
  path: '/api/admin/subscribers',
};
