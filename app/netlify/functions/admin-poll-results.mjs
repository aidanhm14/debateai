// /api/admin/poll-results → tallies micro-poll answers (poll_responses)
// by poll and A/B variant (qvariant), with the choice breakdown.
//
// Answer counts + distribution only. Show->answer RATE lives in GA4 (the
// micro_poll_shown / micro_poll_answer / micro_poll_dismiss events, split
// by qvariant), because "shown" is deliberately NOT written to Firestore —
// that would turn every poll impression into a write and bleed credits.
//
// Read cost: one query, capped at MAX_DOCS. Cached 5 min via admin-cache
// so refreshing the dashboard doesn't re-read.
//
// Auth gate: same admin-only pattern as the rest of /admin endpoints.

import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY, wantsFresh } from './lib/admin-cache.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const MAX_DOCS = 5000;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-poll-results auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-poll-results profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  const cacheKey = 'poll-results:v1';
  const cached = wantsFresh(request) ? null : await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    const snap = await db.collection('poll_responses')
      .orderBy('createdAt', 'desc')
      .limit(MAX_DOCS)
      .get();

    // polls[poll].variants[qvariant] = { answers, withText, choices:{val:count} }
    const polls = {};
    let total = 0;
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const poll = String(d.poll || 'unknown');
      const variant = String(d.qvariant || '(none)'); // pre-A/B answers land here
      const choice = String(d.choice || '(text only)');
      total++;
      const P = polls[poll] || (polls[poll] = { poll, total: 0, variants: {} });
      P.total++;
      const V = P.variants[variant] || (P.variants[variant] = { variant, answers: 0, withText: 0, choices: {} });
      V.answers++;
      if (d.text) V.withText++;
      V.choices[choice] = (V.choices[choice] || 0) + 1;
    });

    const pollList = Object.keys(polls).map((k) => {
      const P = polls[k];
      const variants = Object.keys(P.variants).map((vk) => {
        const V = P.variants[vk];
        const choices = Object.keys(V.choices)
          .map((c) => ({ choice: c, count: V.choices[c] }))
          .sort((a, b) => b.count - a.count);
        return { variant: V.variant, answers: V.answers, withText: V.withText, choices };
      }).sort((a, b) => b.answers - a.answers);
      return { poll: P.poll, total: P.total, variants };
    }).sort((a, b) => b.total - a.total);

    const result = {
      polls: pollList,
      total,
      sampled: snap.size,
      cap: MAX_DOCS,
      timestamp: new Date().toISOString(),
    };
    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-poll-results error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/poll-results',
};
