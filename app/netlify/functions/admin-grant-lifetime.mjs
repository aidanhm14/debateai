// Admin-only endpoint: grants a lifetime plan to the team belonging to a given
// email. Use this to reconcile Stripe Payment Link purchases — those don't
// carry teamId metadata, so the webhook can't auto-upgrade. Paste the buyer's
// email here and their team flips to lifetime.
//
// POST /api/admin/grant-lifetime
// body: { "email": "user@example.com" }
//
// Auth: admin only (ADMIN_UID env var OR user_profiles.{uid}.isAdmin === true).
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
    console.error('admin-grant-lifetime auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  // Admin gate — same pattern as admin-subscribers.mjs / admin-analytics.mjs.
  let isAdmin = uid === ADMIN_UID;
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-grant-lifetime profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400, request); }
  const rawEmail = (body.email || '').trim().toLowerCase();
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return errorResponse('Valid email required', 400, request);
  }

  try {
    // Find the team_member record by email. Gmail normalizes case-insensitively
    // and usually with lowercase, but Firebase stores whatever was passed at
    // signup — try both the raw and a Titlecase fallback would be fragile.
    // Instead, pull by email field directly; for robustness we also try the
    // lowercase form.
    let memberSnap = await db.collection('team_members').where('email', '==', rawEmail).limit(1).get();
    if (memberSnap.empty) {
      // Also try the original casing the user provided (in case pre-normalized).
      memberSnap = await db.collection('team_members').where('email', '==', body.email.trim()).limit(1).get();
    }
    if (memberSnap.empty) {
      return errorResponse(`No team found for ${rawEmail}. The user must sign in to the app at least once before they can be upgraded.`, 404, request);
    }

    const member = memberSnap.docs[0].data();
    const teamId = member.teamId;
    const teamRef = db.collection('teams').doc(teamId);
    const teamDoc = await teamRef.get();
    if (!teamDoc.exists) {
      return errorResponse(`Team ${teamId} exists in team_members but not in teams collection. Data inconsistency — check Firestore.`, 500, request);
    }

    const prev = teamDoc.data();
    await teamRef.update({
      plan: 'lifetime',
      status: 'active',
      usageLimit: 250,
      maxMembers: 3,
      lifetimePurchasedAt: FieldValue.serverTimestamp(),
      lifetimeGrantedBy: uid,
      lifetimeGrantedReason: (body.reason || 'manual admin grant').slice(0, 200),
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`[admin-grant-lifetime] ${uid} granted lifetime to team ${teamId} (${rawEmail}). Previous plan: ${prev.plan}`);

    return jsonResponse({
      ok: true,
      email: rawEmail,
      teamId,
      teamName: prev.name,
      previousPlan: prev.plan,
      newPlan: 'lifetime',
    }, 200, request);
  } catch (err) {
    console.error('admin-grant-lifetime error:', err);
    return errorResponse('Failed to grant lifetime: ' + (err.message || err), 500, request);
  }
};

export const config = {
  path: '/api/admin/grant-lifetime',
};
