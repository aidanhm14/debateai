// /api/admin/voice-drafts — admin-only endpoint that lists voice_drafts
// (drafts produced by the weekly distill-voice cron) and accepts a
// Mark-Reviewed mutation. Pairs with /voice-drafts.html.
//
// GET   → returns the most recent N drafts, with patch text, sample
//         counts, applied flag, reviewed flag.
// POST  → { action:'review', id } marks a draft reviewed
//         { action:'apply',  id } marks a draft as applied (after the
//                                  patch has been hand-merged into
//                                  voice-guidelines.mjs)

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const ADMIN_UID = process.env.ADMIN_UID || '';

async function isAdmin(uid, db) {
  if (!uid) return false;
  if (ADMIN_UID && uid === ADMIN_UID) return true;
  try {
    const profile = await db.collection('user_profiles').doc(uid).get();
    return !!(profile.exists && profile.data().isAdmin === true);
  } catch { return false; }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed.', 401, request); }
  const uid = decoded.sub;
  const db = getDb();
  if (!(await isAdmin(uid, db))) return errorResponse('Forbidden', 403, request);

  if (request.method === 'GET') {
    try {
      const snap = await db.collection('voice_drafts')
        .orderBy('createdAt', 'desc')
        .limit(40)
        .get();
      const drafts = snap.docs.map(d => {
        const x = d.data() || {};
        return {
          id: d.id,
          source: x.source || '',
          week: x.week || '',
          samples: x.samples || null,
          patch: x.patch || '',
          patchChars: typeof x.patch === 'string' ? x.patch.length : 0,
          reviewed: !!x.reviewed,
          applied: !!x.applied,
          reviewedAt: x.reviewedAt && x.reviewedAt.toMillis ? x.reviewedAt.toMillis() : null,
          appliedAt: x.appliedAt && x.appliedAt.toMillis ? x.appliedAt.toMillis() : null,
          createdAt: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : null,
        };
      });
      return jsonResponse({ ok: true, drafts }, 200, request);
    } catch (err) {
      console.error('[admin-voice-drafts] list error:', err.message);
      return errorResponse('Could not list drafts.', 500, request);
    }
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400, request); }
    const { action, id } = body || {};
    if (!id || typeof id !== 'string') return errorResponse('Missing id', 400, request);
    if (!['review', 'apply', 'unreview', 'unapply', 'delete'].includes(action)) {
      return errorResponse('Unknown action', 400, request);
    }
    try {
      const ref = db.collection('voice_drafts').doc(id);
      if (action === 'delete') {
        await ref.delete();
        return jsonResponse({ ok: true, deleted: true }, 200, request);
      }
      const update = {};
      if (action === 'review') { update.reviewed = true; update.reviewedAt = FieldValue.serverTimestamp(); update.reviewedBy = uid; }
      if (action === 'unreview') { update.reviewed = false; update.reviewedAt = null; }
      if (action === 'apply') { update.applied = true; update.appliedAt = FieldValue.serverTimestamp(); update.appliedBy = uid; update.reviewed = true; }
      if (action === 'unapply') { update.applied = false; update.appliedAt = null; }
      await ref.update(update);
      return jsonResponse({ ok: true, action }, 200, request);
    } catch (err) {
      console.error('[admin-voice-drafts] mutate error:', err.message);
      return errorResponse('Could not update draft.', 500, request);
    }
  }

  return errorResponse('Method not allowed', 405, request);
};

export const config = { path: '/api/admin/voice-drafts' };
