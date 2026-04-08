import { getDb, FieldValue } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// In-memory rate limiter (resets on cold start — a persistent store would be better)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max requests per minute per user

function checkRateLimit(userId) {
  const now = Date.now();
  const key = userId || 'anon';
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  try {
    const token = extractBearerToken(request);
    if (!token) return errorResponse('Authorization required', 401, request);
    const decoded = await verifyIdToken(token);
    const uid = decoded.sub;

    if (!checkRateLimit(uid)) {
      return errorResponse('Too many requests. Please wait a moment and try again.', 429, request);
    }
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
      return jsonResponse({ ok: true, type: 'debater_profile' }, 200, request);
    }

    // Writing style profile
    if (body.type === 'style_profile') {
      await db.collection('user_profiles').doc(uid).set({
        styleProfile: body.profile || {},
      }, { merge: true });
      return jsonResponse({ ok: true, type: 'style_profile' }, 200, request);
    }

    // Referral tracking
    if (body.type === 'referral_credit') {
      const referrerUid = body.referrerUid;
      if (!referrerUid) return errorResponse('Missing referrer UID', 400, request);

      // Block self-referral
      if (referrerUid === uid) return errorResponse('Cannot refer yourself', 400, request);

      // Check that the referred user's account was created within the last 24 hours.
      // decoded.auth_time is the Firebase token's auth_time (seconds since epoch).
      // decoded.iat (issued-at) is a fallback proxy for account age.
      const accountCreatedAt = decoded.auth_time || decoded.iat || 0;
      const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 86400;
      if (accountCreatedAt < twentyFourHoursAgo) {
        return errorResponse(
          'Referral credits are only available for accounts created in the last 24 hours',
          403,
          request
        );
      }

      // Check if already credited (this referred user + this referrer)
      const existing = await db.collection('referral_credits')
        .where('referredUid', '==', uid)
        .where('referrerUid', '==', referrerUid)
        .limit(1)
        .get();

      if (!existing.empty) return jsonResponse({ ok: true, alreadyCredited: true }, 200, request);

      // Rate limit: max 1 referral credit per minute per referred user.
      // Check if this referred user has any credit in the last 60 seconds.
      const oneMinuteAgo = new Date(Date.now() - 60000);
      const recentCredits = await db.collection('referral_credits')
        .where('referredUid', '==', uid)
        .where('creditedAt', '>=', oneMinuteAgo)
        .limit(1)
        .get();

      if (!recentCredits.empty) {
        return errorResponse('Too many referral requests. Please wait a moment.', 429, request);
      }

      // Global cap: each referrer can receive max 15 bonus requests total
      // (5 referrals x 3 bonus each).
      const referrerCredits = await db.collection('referral_credits')
        .where('referrerUid', '==', referrerUid)
        .get();

      const totalBonusGranted = referrerCredits.docs.reduce(
        (sum, doc) => sum + (doc.data().bonusRequests || 0),
        0
      );

      if (totalBonusGranted >= 15) {
        return errorResponse(
          'This referrer has reached the maximum referral bonus (15 requests)',
          403,
          request
        );
      }

      // Cap the bonus so it never exceeds the 15-request ceiling
      const bonusRequests = Math.min(3, 15 - totalBonusGranted);

      // Credit the referrer
      await db.collection('referral_credits').add({
        referrerUid,
        referredUid: uid,
        bonusRequests,
        creditedAt: FieldValue.serverTimestamp(),
      });

      // Update the referrer's team usage limit
      const { getUserTeam } = await import('./lib/firestore.mjs');
      const referrerTeam = await getUserTeam(referrerUid);
      if (referrerTeam) {
        await referrerTeam.teamRef.update({
          usageLimit: FieldValue.increment(bonusRequests),
        });
      }

      return jsonResponse({ ok: true, credited: true, bonusRequests }, 200, request);
    }

    return errorResponse('Unknown profile type', 400, request);
  } catch (e) {
    return errorResponse('Server error', 500, request);
  }
};

export const config = { path: '/api/save-profile' };
