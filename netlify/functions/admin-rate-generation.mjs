// /api/admin/rate-generation  POST { generationId, rating, boring, notes }
//
// Admin-only. Writes a 1-5 rating + boring flag + optional notes directly
// onto a generation doc so scheduled-distill.mjs picks it up on the next
// run (it queries `rating >= 4 OR saved`). Also drops a row in
// generation_signals for audit. Unlike /api/log-generation (which gates
// signal writes to the generation's OWNER), this endpoint allows any
// admin to rate ANY generation across the corpus — that's the whole
// point of an admin rating tool.
//
// Auth: ADMIN_UID env var OR user_profiles.{uid}.isAdmin === true.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-rate-generation auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const adminUid = decoded.sub;
  const db = getDb();

  let isAdmin = adminUid === ADMIN_UID;
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(adminUid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-rate-generation profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400, request); }

  const { generationId, rating, boring, notes } = body;
  if (!generationId || typeof generationId !== 'string') {
    return errorResponse('Missing generationId', 400, request);
  }
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    return errorResponse('Rating must be a number 1-5', 400, request);
  }
  const intRating = Math.round(rating);
  const boringFlag = boring === true;
  const trimmedNotes = typeof notes === 'string' ? notes.slice(0, 600) : '';

  try {
    const genRef = db.collection('generations').doc(generationId);
    const genDoc = await genRef.get();
    if (!genDoc.exists) {
      return errorResponse('Generation not found', 404, request);
    }

    // Update generation doc — these fields feed scheduled-distill directly.
    await genRef.update({
      rating: intRating,
      boring: boringFlag,
      adminNotes: trimmedNotes,
      ratedAt: FieldValue.serverTimestamp(),
      ratedBy: adminUid,
    });

    // Audit row in generation_signals so the full rating history is
    // preserved if a rating gets overwritten later.
    await db.collection('generation_signals').add({
      uid: adminUid,
      generationId,
      signal: 'admin_rate',
      value: intRating,
      meta: { boring: boringFlag, notes: trimmedNotes },
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log('[admin-rate-generation]', generationId, 'rating=', intRating, 'boring=', boringFlag, 'by=', adminUid.slice(0, 6));
    return jsonResponse({ ok: true, generationId, rating: intRating, boring: boringFlag }, 200, request);
  } catch (err) {
    console.error('admin-rate-generation error:', err.message, err.code || '');
    return errorResponse('Failed to rate generation: ' + (err.message || 'unknown'), 500, request);
  }
};

export const config = {
  path: '/api/admin/rate-generation',
};
