// Admin-only endpoint: returns the `prospects` collection so the admin
// dashboard can render a searchable/exportable list of the email/phone
// leads captured from visitors who wouldn't sign in with Google.
//
// These leads are written by app/js/prospect-capture.js (client Firestore
// path) and app/netlify/functions/log-prospect.mjs (server fallback). Until
// this endpoint existed they were write-only — captured on production but
// readable by nothing. This is the read side that makes the feature whole.
//
// Gate pattern + cache mirror admin-subscribers.mjs (which reads the
// separate `email_signups` collection). The two stay distinct on purpose:
// email_signups = explicit "notify me" signups; prospects = soft leads
// captured at a sign-in/paywall wall, carrying source + page attribution.
import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY } from './lib/admin-cache.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const CACHE_KEY = 'prospects';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-prospects auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  // Admin gate: ADMIN_UID env var OR isAdmin profile flag.
  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-prospects profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  const cached = await getCachedShared(CACHE_KEY);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    // Newest-first. The collection should stay small enough that an
    // unpaginated pull is fine for a while; if it grows past a few
    // thousand, switch to cursor pagination like admin-subscribers notes.
    const snap = await db.collection('prospects').orderBy('createdAt', 'desc').limit(5000).get();
    const prospects = snap.docs.map(d => {
      const data = d.data() || {};
      let createdAt = null;
      try {
        if (data.createdAt?.toDate) createdAt = data.createdAt.toDate().toISOString();
        else if (data.createdAt instanceof Date) createdAt = data.createdAt.toISOString();
        else if (typeof data.createdAt === 'string') createdAt = data.createdAt;
        else if (typeof data.clientCreatedAt === 'number') createdAt = new Date(data.clientCreatedAt).toISOString();
      } catch (e) { /* leave null */ }
      return {
        id: d.id,
        email: data.email || '',
        phone: data.phone || '',
        source: data.source || '',
        page: data.page || '',
        locale: data.locale || '',
        via: data.via || '',
        createdAt,
      };
    });

    // De-dupe on email, keeping the newest (docs are already desc-sorted,
    // so the first occurrence wins). A single lead hitting two surfaces
    // shouldn't read as two prospects.
    const seen = new Set();
    const deduped = [];
    for (const p of prospects) {
      const key = (p.email || '').toLowerCase();
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      deduped.push(p);
    }

    const result = {
      count: deduped.length,
      total: prospects.length,
      prospects: deduped,
      timestamp: new Date().toISOString(),
    };
    await setCachedShared(CACHE_KEY, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-prospects fetch error:', err);
    return errorResponse('Failed to load prospects: ' + (err.message || err), 500, request);
  }
};

export const config = {
  path: '/api/admin/prospects',
};
