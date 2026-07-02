// Admin-only endpoint: marks a user as an "exemplar author" so their past
// debate_rounds get retrieved as few-shot examples for future AI opponents.
// Higher weight = more influence on the AI's style.
//
// POST /api/admin/grant-exemplar
// body: { "email": "user@example.com", "weight": 3 }   // weight 0 revokes
//
// Auth: admin only (same pattern as admin-grant-lifetime.mjs).
import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
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
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch {}
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }

  const rawEmail = (body.email || '').trim().toLowerCase();
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return errorResponse('Valid email required', 400, request);
  }

  const weight = Number.isFinite(body.weight) ? Math.max(0, Math.min(5, Math.floor(body.weight))) : 3;

  try {
    // Resolve email → uid via team_members (same lookup as grant-lifetime).
    let memberSnap = await db.collection('team_members').where('email', '==', rawEmail).limit(1).get();
    if (memberSnap.empty) {
      memberSnap = await db.collection('team_members').where('email', '==', body.email.trim()).limit(1).get();
    }
    if (memberSnap.empty) {
      return errorResponse(`No account found for ${rawEmail}. User must sign in at least once first.`, 404, request);
    }

    const targetUid = memberSnap.docs[0].data().userId;
    if (!targetUid) return errorResponse('Membership row missing userId.', 500, request);

    await db.collection('user_profiles').doc(targetUid).set({
      email: rawEmail,
      exemplarWeight: weight,
      exemplarGrantedAt: FieldValue.serverTimestamp(),
      exemplarGrantedBy: uid,
    }, { merge: true });

    return jsonResponse({ ok: true, email: rawEmail, uid: targetUid, weight }, 200, request);
  } catch (err) {
    return errorResponse('Failed to grant exemplar: ' + (err.message || err), 500, request);
  }
};

export const config = { path: '/api/admin/grant-exemplar' };
