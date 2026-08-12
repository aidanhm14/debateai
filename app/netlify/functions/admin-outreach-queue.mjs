// Admin read + triage for the outreach queue that scheduled-reddit-watch
// fills. GET lists pending drafts; POST marks one posted or dismissed.
//
// This is the half that makes the watcher worth having. A queue nobody can
// open is the "built but never used" failure this repo keeps logging, so
// the endpoint and the /admin card ship in the same commit as the cron.
//
// POST deliberately cannot post to Reddit. It only records what the human
// did after they posted (or did not) by hand. Marking a row 'posted' is a
// bookkeeping act, not an action, which is why this file contains no
// Reddit call at all.

import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const COLLECTION = 'outreach_queue';
const VALID_STATUS = new Set(['pending', 'posted', 'dismissed']);

async function requireAdminUid(request) {
  const token = extractBearerToken(request);
  if (!token) return { error: errorResponse('Authorization required', 401, request) };

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (err) {
    console.error('admin-outreach-queue auth error:', err.message);
    return { error: errorResponse('Authentication failed. Please sign in again.', 401, request) };
  }

  const uid = decoded.sub;
  const db = getDb();
  let isAdmin = uid === ADMIN_UID || isAdminEmail(decoded.email);
  if (!isAdmin) {
    try {
      const doc = await db.collection('user_profiles').doc(uid).get();
      if (doc.exists && doc.data().isAdmin === true) isAdmin = true;
    } catch (e) { /* fall through to the refusal */ }
  }
  if (!isAdmin) return { error: errorResponse('Not authorized', 403, request) };
  return { uid, db };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  const gate = await requireAdminUid(request);
  if (gate.error) return gate.error;
  const { db, uid } = gate;

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'pending';
    if (!VALID_STATUS.has(status)) return errorResponse('Bad status', 400, request);

    try {
      // Ordered by score so the best candidate is the one you read first.
      // Deliberately NOT cached: the whole value is that it is current, and
      // it is a handful of documents twice a day.
      const snap = await db.collection(COLLECTION)
        .where('status', '==', status)
        .limit(50)
        .get();

      const rows = [];
      snap.forEach((d) => {
        const v = d.data() || {};
        rows.push({
          key: d.id,
          subreddit: v.subreddit || '',
          title: v.title || '',
          excerpt: v.excerpt || '',
          url: v.url || '',
          author: v.author || '',
          score: v.score || 0,
          numComments: v.numComments || 0,
          draft: v.draft || '',
          status: v.status || 'pending',
          createdUtc: v.createdUtc || 0,
        });
      });
      rows.sort((a, b) => (b.score - a.score) || (b.createdUtc - a.createdUtc));

      return jsonResponse({ ok: true, status, count: rows.length, rows }, 200, request);
    } catch (err) {
      console.error('admin-outreach-queue read error:', err.message);
      return errorResponse('Could not read the queue', 500, request);
    }
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); }
    catch (e) { return errorResponse('Invalid JSON', 400, request); }

    const key = String(body?.key || '').trim();
    const status = String(body?.status || '').trim();
    if (!key) return errorResponse('Missing key', 400, request);
    if (status !== 'posted' && status !== 'dismissed') {
      // 'pending' is not settable: rows only move forward, so a mis-click
      // cannot silently resurrect something already handled.
      return errorResponse('Status must be posted or dismissed', 400, request);
    }

    try {
      await db.collection(COLLECTION).doc(key).set({
        status,
        triagedBy: uid,
        triagedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return jsonResponse({ ok: true, key, status }, 200, request);
    } catch (err) {
      console.error('admin-outreach-queue write error:', err.message);
      return errorResponse('Could not update that row', 500, request);
    }
  }

  return errorResponse('Method not allowed', 405, request);
};

export const config = {
  path: '/api/admin/outreach-queue',
};
