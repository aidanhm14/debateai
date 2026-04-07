import { getDb } from './lib/firestore.mjs';
import { verifyToken } from './lib/auth.mjs';
import { cors, json, error } from './lib/response.mjs';
import { FieldValue } from './lib/firestore.mjs';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors();
  if (event.httpMethod !== 'POST') return error('Method not allowed', 405);

  try {
    const uid = await verifyToken(event);
    const body = JSON.parse(event.body || '{}');
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
      return json({ ok: true, type: 'debater_profile' });
    }

    // Writing style profile
    if (body.type === 'style_profile') {
      await db.collection('user_profiles').doc(uid).set({
        styleProfile: body.profile || {},
      }, { merge: true });
      return json({ ok: true, type: 'style_profile' });
    }

    // Referral tracking
    if (body.type === 'referral_credit') {
      const referrerUid = body.referrerUid;
      if (!referrerUid) return error('Missing referrer UID', 400);

      // Check if already credited
      const existing = await db.collection('referral_credits')
        .where('referredUid', '==', uid)
        .where('referrerUid', '==', referrerUid)
        .limit(1)
        .get();

      if (!existing.empty) return json({ ok: true, alreadyCredited: true });

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

      return json({ ok: true, credited: true, bonusRequests: 3 });
    }

    return error('Unknown profile type', 400);
  } catch (e) {
    return error(e.message || 'Server error', 500);
  }
}
