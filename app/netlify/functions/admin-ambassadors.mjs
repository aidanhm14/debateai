// /api/admin/ambassadors  →  Every ambassador application, newest first.
//
// The /ambassadors page writes one doc per applicant to
// ambassador_applications/{emailHash} via ambassador-apply.mjs and
// emails the founder a copy. Until now the only way to browse the full
// list was the Firebase console. This endpoint backs the
// /admin/ambassadors page: a simple gated table of every application.
//
// No cache — the collection is small (one doc per applicant) and you
// want a new application visible the moment it lands, not up to a TTL
// later. Read cost is one query returning all docs.
//
// Auth gate: same admin-only pattern as the rest of /admin endpoints
// (ADMIN_UID env match, or user_profiles/{uid}.isAdmin === true).

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';

// Backstop so a runaway collection can't fan out into a huge read.
// Real applicant volume lives well under this.
const MAX_DOCS = 2000;

function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : t;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-ambassadors auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  let isAdmin = uid === ADMIN_UID;
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-ambassadors profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  try {
    // Fetch all and sort in JS: some legacy docs may lack createdAt, and
    // an orderBy would silently drop those. The collection is tiny.
    const snap = await db.collection('ambassador_applications').limit(MAX_DOCS).get();
    const rows = snap.docs.map((doc) => {
      const d = doc.data() || {};
      const createdMs = toMillis(d.createdAt);
      const updatedMs = toMillis(d.updatedAt);
      return {
        id: doc.id,
        name: d.name || '',
        email: d.email || '',
        school: d.school || '',
        circuit: d.circuit || '',
        gradYear: d.gradYear || '',
        link: d.link || '',
        firstRoom: d.firstRoom || '',
        ip: d.ip || '',
        createdAt: createdMs != null ? new Date(createdMs).toISOString() : null,
        updatedAt: updatedMs != null ? new Date(updatedMs).toISOString() : null,
        createdMs: createdMs || 0,
      };
    });
    // Newest first; docs missing createdAt (createdMs 0) sink to the bottom.
    rows.sort((a, b) => b.createdMs - a.createdMs);

    return jsonResponse(
      {
        rows,
        summary: { total: rows.length },
        timestamp: new Date().toISOString(),
      },
      200,
      request,
    );
  } catch (err) {
    console.error('admin-ambassadors error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/ambassadors',
};
