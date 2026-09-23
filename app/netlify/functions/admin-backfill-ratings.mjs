// Admin-only: build the initial Debate Rating ladder from rounds that
// already happened.
//
// ORDER MATTERS. Glicko-2 is path dependent: rating a March round after
// a July one produces a different, wrong ladder. This sorts every
// eligible round by completion time and applies them oldest first.
//
// Replays the affected suffix when older results were missed, archives
// the previous ratings, and commits atomically. Dry run by DEFAULT.
//
// POST /api/admin/backfill-ratings   body: { "dryRun": false }
import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { reconcileRatings } from './lib/rating-reconcile-run.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authentication required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed', 401, request); }

  const db = getDb();
  const uid = decoded.sub;
  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const p = await db.collection('users').doc(uid).get();
      if (p.exists && p.data().isAdmin === true) isAdmin = true;
    } catch {}
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  let body = {};
  try { body = await request.json(); } catch {}
  const dryRun = body.dryRun !== false;

  try {
    const result = await reconcileRatings(db, { apply: !dryRun });
    return jsonResponse({ ok: true, dryRun, ...result }, 200, request);
  } catch (err) {
    console.error('[backfill-ratings]', err.message);
    return jsonResponse({ ok: false, dryRun, error: err.message }, 500, request);
  }
};

export const config = { path: '/api/admin/backfill-ratings' };
