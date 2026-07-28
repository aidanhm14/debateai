// /api/admin/clash-disputes  →  Every reader correction filed against a
// clash-map row, newest first.
//
// This is the labelled data the clash map exists to produce. A row the
// mapper got wrong is worth more than ten it got right: each dispute is a
// real (claim, response) pair with a human label on it, which is what a
// trained NLI model would need and what a prompt-only mapper can never
// generate for itself.
//
// The endpoint exists because the alternative is a write-only signal.
// Disputes would accumulate in a subcollection nobody opens, exactly the
// failure the nightly-distill card was built to fix. Read the confusion
// matrix here, then fix the prompt (or the four labels) against it.
//
// Read cost: one collection-group scan capped at MAX_DOCS. Cached 5 min.
//
// Deliberately NOT ordered in the query. A collection-group orderBy needs
// an index whose scope has to be added by hand, and at this volume an
// in-memory sort over the cap is free. If disputes ever outgrow MAX_DOCS
// the fix is that index plus a real orderBy, not a bigger cap: a silent
// truncation would read as "that is all of them".
import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY, wantsFresh } from './lib/admin-cache.mjs';
import { CLASH_LABELS } from './lib/clash-map.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const MAX_DOCS = 300;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-clash-disputes auth error:', err.message);
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
      console.error('admin-clash-disputes profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  const cacheKey = 'clash-disputes:v1';
  const cached = wantsFresh(request) ? null : await getCachedShared(cacheKey);
  if (cached) return jsonResponse(cached, 200, request);

  try {
    const snap = await db.collectionGroup('clashDisputes').limit(MAX_DOCS).get();
    const rows = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      rows.push({
        roundId: doc.ref.parent.parent ? doc.ref.parent.parent.id : null,
        row: Number(d.row) || 0,
        currentLabel: d.currentLabel || null,
        proposedLabel: CLASH_LABELS.has(d.proposedLabel) ? d.proposedLabel : null,
        claim: d.claim || '',
        claimQuote: d.claimQuote || '',
        responseQuote: d.responseQuote || '',
        by: d.by || null,
        format: d.format || '',
        motion: d.motion || '',
        // A debater correcting a mapping of their own round is the
        // best-informed source in the data and the most motivated one.
        // Keep the flag so the two populations can be read apart.
        participant: !!d.participant,
        at: Number(d.at) || 0,
      });
    });
    rows.sort((a, b) => b.at - a.at);

    // Confusion matrix: what the mapper said, against what a reader says
    // it should have been. The heavy cells are where the prompt is wrong.
    const matrix = {};
    let unsure = 0;
    for (const r of rows) {
      if (!r.currentLabel) continue;
      if (!r.proposedLabel) { unsure++; continue; }
      const key = r.currentLabel + '→' + r.proposedLabel;
      matrix[key] = (matrix[key] || 0) + 1;
    }

    const result = {
      rows,
      summary: {
        total: rows.length,
        truncated: rows.length >= MAX_DOCS,
        rounds: new Set(rows.map(r => r.roundId)).size,
        fromParticipants: rows.filter(r => r.participant).length,
        unlabelled: unsure,
      },
      matrix,
      timestamp: new Date().toISOString(),
    };
    await setCachedShared(cacheKey, result, TTL_HEAVY);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-clash-disputes error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/admin/clash-disputes',
};
