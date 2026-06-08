// Per-user style summary — the "Your Style" surface.
//
// The 2026-05-13 learning loop ship made the AI compound on every
// user's prior rounds (captureTurn → generations → exemplars +
// distillations). It's working server-side but invisible to the user.
// This endpoint exposes the server-truth so the client can say
// "The AI has read N of your previous rounds — it's tuning to your style."
//
// Returns:
//   - totalRounds:    aggregation count of generations for this uid
//   - recentMotions:  top 5 distinct motions, most recent first
//   - formats:        format counts (apda: 3, bp: 2, pf: 1)
//   - firstSeenAt:    when the AI first started learning this user
//   - lastSeenAt:     when the last turn was captured
//
// historyRounds in the client is localStorage-only; that count breaks
// the moment the user clears storage or switches devices. This endpoint
// is the cross-device truth.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const RECENT_LIMIT = 30;
const MOTIONS_RETURNED = 5;

// In-memory cache: { uid: { fetchedAt, data } }. 5 min TTL keeps the
// /debate-it page load cheap when users refresh or hop between tabs.
const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed.', 401, request); }

  const uid = decoded.sub;

  const cached = cache.get(uid);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return jsonResponse(cached.data, 200, request);
  }

  const db = getDb();
  const col = db.collection('generations').where('uid', '==', uid);

  // Three parallel reads:
  //  1. count() aggregation — cross-device truth on round count.
  //  2. limit(30) most-recent — fuel for the motion + format breakdown.
  //  3. user_fingerprints/{uid} — the nightly Haiku-generated style
  //     fingerprint (signature moves / strengths / weaknesses). May be
  //     null for users who haven't been fingerprinted yet (≥3 rounds
  //     required, FRESH_DAYS staleness window).
  let totalRounds = 0;
  let recentDocs = [];
  let fingerprintData = null;
  try {
    const [countSnap, recentSnap, fingerprintSnap] = await Promise.all([
      col.count().get().catch(err => {
        // count() requires Firestore Node SDK 7+; if it isn't available
        // we fall back to the recent-only query and use its size as a
        // floor (it's a floor because limit=30 caps it).
        console.warn('user-style-summary count() failed:', err.message);
        return null;
      }),
      col.orderBy('createdAt', 'desc').limit(RECENT_LIMIT).get(),
      db.collection('user_fingerprints').doc(uid).get().catch(err => {
        console.warn('user-style-summary fingerprint read failed:', err.message);
        return null;
      }),
    ]);
    totalRounds = countSnap?.data?.()?.count ?? recentSnap.size;
    recentDocs = recentSnap.docs;
    if (fingerprintSnap?.exists) {
      const fd = fingerprintSnap.data();
      fingerprintData = {
        text: fd.fingerprint || null,
        updatedAt: fd.updatedAt?.toDate?.()?.toISOString?.() || null,
        sampleCount: fd.sampleCount || null,
      };
    }
  } catch (err) {
    console.error('user-style-summary query failed:', err.message);
    return errorResponse('Could not load style summary.', 500, request);
  }

  // Collapse to distinct motions in recency order.
  const seenMotions = new Set();
  const recentMotions = [];
  const formatCounts = {};
  let firstSeenAt = null;
  let lastSeenAt = null;

  for (const doc of recentDocs) {
    const d = doc.data();
    const ts = d.createdAt?.toDate?.()?.toISOString?.() || null;
    if (ts) {
      if (!lastSeenAt || ts > lastSeenAt) lastSeenAt = ts;
      if (!firstSeenAt || ts < firstSeenAt) firstSeenAt = ts;
    }
    if (d.format) {
      formatCounts[d.format] = (formatCounts[d.format] || 0) + 1;
    }
    const motion = (d.motion || '').trim();
    if (motion && !seenMotions.has(motion) && recentMotions.length < MOTIONS_RETURNED) {
      seenMotions.add(motion);
      recentMotions.push({
        motion: motion.slice(0, 200),
        format: d.format || null,
        side: d.side || null,
        at: ts,
      });
    }
  }

  const data = {
    totalRounds,
    recentMotions,
    formats: formatCounts,
    firstSeenAt,
    lastSeenAt,
    hasStyle: totalRounds >= 3, // 3 is the threshold below which we don't claim "tuning."
    fingerprint: fingerprintData,  // null until scheduled-user-fingerprint.mjs runs for this uid.
  };

  cache.set(uid, { fetchedAt: Date.now(), data });
  return jsonResponse(data, 200, request);
};

export const config = {
  path: '/api/user/style-summary',
};
