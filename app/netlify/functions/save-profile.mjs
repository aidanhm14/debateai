import { getDb, FieldValue } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse();
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const token = extractBearerToken(request);
    if (!token) return errorResponse('Authorization required', 401);
    const decoded = await verifyIdToken(token);
    const uid = decoded.sub;
    const body = await request.json();
    const db = getDb();

    // Debater thinking profile
    if (body.type === 'debater_profile') {
      await db.collection('user_profiles').doc(uid).set({
        debaterProfile: {
          analysis: body.analysis || '',
          strengths: body.strengths || [],
          weaknesses: body.weaknesses || [],
          updatedAt: FieldValue.serverTimestamp(),
        }
      }, { merge: true });
      return jsonResponse({ ok: true, type: 'debater_profile' });
    }

    // Writing style profile
    if (body.type === 'style_profile') {
      await db.collection('user_profiles').doc(uid).set({
        styleProfile: body.profile || {},
      }, { merge: true });
      return jsonResponse({ ok: true, type: 'style_profile' });
    }

    // Referral tracking
    if (body.type === 'referral_credit') {
      const referrerUid = body.referrerUid;
      if (!referrerUid) return errorResponse('Missing referrer UID', 400);

      // Check if already credited
      const existing = await db.collection('referral_credits')
        .where('referredUid', '==', uid)
        .where('referrerUid', '==', referrerUid)
        .limit(1)
        .get();

      if (!existing.empty) return jsonResponse({ ok: true, alreadyCredited: true });

      // Credit the referrer with 3 bonus requests
      await db.collection('referral_credits').add({
        referrerUid,
        referredUid: uid,
        bonusRequests: 3,
        creditedAt: FieldValue.serverTimestamp(),
      });

      // Update the referrer's team usage limit
      const { getDb: gd, getUserTeam } = await import('./lib/firestore.mjs');
      const referrerTeam = await getUserTeam(referrerUid);
      if (referrerTeam) {
        await referrerTeam.teamRef.update({
          usageLimit: FieldValue.increment(3),
        });
      }

      return jsonResponse({ ok: true, credited: true, bonusRequests: 3 });
    }

    return errorResponse('Unknown profile type', 400);
  } catch (e) {
    return errorResponse('Server error', 500);
  }
};

export const config = { path: '/api/save-profile' };
