// Admin-only: build the initial Debate Rating ladder from rounds that
// already happened.
//
// ORDER MATTERS. Glicko-2 is path dependent: rating a March round after
// a July one produces a different, wrong ladder. This sorts every
// eligible round by completion time and applies them oldest first.
//
// Idempotent via rating_changes ids, so a re-run only picks up rounds
// added since. Dry run by DEFAULT.
//
// POST /api/admin/backfill-ratings   body: { "dryRun": false }
import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { applyRoundRating, eligibility } from './lib/rating-apply.mjs';

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
      const p = await db.collection('user_profiles').doc(uid).get();
      if (p.exists && p.data().isAdmin === true) isAdmin = true;
    } catch {}
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  let body = {};
  try { body = await request.json(); } catch {}
  const dryRun = body.dryRun !== false;

  const stats = { scannedAsync: 0, scannedLive: 0, eligible: 0, applied: 0, skipped: {}, errors: 0 };
  const bump = (r) => { stats.skipped[r] = (stats.skipped[r] || 0) + 1; };
  const queue = [];

  try {
    const [aSnap, lSnap] = await Promise.all([
      db.collection('async_rounds').where('state', '==', 'complete').get(),
      db.collection('live_rounds').get(),
    ]);

    for (const doc of aSnap.docs) {
      stats.scannedAsync++;
      const d = doc.data();
      const e = eligibility('async', d);
      if (!e.ok) { bump(e.reason); continue; }
      queue.push({ source: 'async', id: doc.id, d, at: d.completedAt || (d.ballot && d.ballot.at) || d.createdAt || 0 });
    }
    for (const doc of lSnap.docs) {
      stats.scannedLive++;
      const d = doc.data();
      const e = eligibility('live', d);
      if (!e.ok) { bump(e.reason); continue; }
      queue.push({ source: 'live', id: doc.id, d, at: (d.ballot && d.ballot.at) || d.completedAt || d.createdAt || 0 });
    }

    // Oldest first. Without this the ladder is a different, wrong ladder.
    queue.sort((x, y) => x.at - y.at);
    stats.eligible = queue.length;

    if (!dryRun) {
      for (const item of queue) {
        try {
          const r = await applyRoundRating(db, {
            source: item.source, eventId: item.id, roundData: item.d, now: item.at || Date.now(),
          });
          if (r.applied) stats.applied++; else bump(r.reason);
        } catch (err) {
          stats.errors++;
          console.error('[backfill-ratings]', item.source, item.id, err.message);
        }
      }
    }
  } catch (err) {
    return jsonResponse({ ok: false, dryRun, stats, error: err.message }, 500, request);
  }

  return jsonResponse({
    ok: true,
    dryRun,
    stats,
    oldest: queue.length ? new Date(queue[0].at).toISOString() : null,
    newest: queue.length ? new Date(queue[queue.length - 1].at).toISOString() : null,
    note: dryRun
      ? 'Dry run. Nothing written. POST { "dryRun": false } to build the ladder.'
      : 'Ladder built, oldest round first.',
  }, 200, request);
};

export const config = { path: '/api/admin/backfill-ratings' };
