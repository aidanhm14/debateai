// Admin one-shot: scrub posterEmail / accepterEmail / accepterContact off
// existing live_challenges docs, copying them to the private companion
// (live_challenge_contacts/{id}) first. Idempotent — safe to re-run.
//
// Why: today's privacy fix (commit 7472d18) moved emails off the public
// live_challenges doc into a private companion. New challenges land in
// the right place; pre-fix challenges still leak. This scrub closes
// that loop.
//
// POST /api/admin-scrub-challenge-contacts
// body: { dryRun?: boolean }   // default false; if true, reports what
//                                would change without writing
//
// Auth: admin only (ADMIN_UID env OR user_profiles.{uid}.isAdmin === true).
//
// Returns: {
//   scanned, eligible, copied, stripped, alreadyClean, errors, dryRun
// }
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';

// Fields we're scrubbing from the public doc. Keep posterUid /
// accepterUid intact — those are NOT contact info, and the rest of
// the live.html flow (matched-card detection, room name derivation,
// etc.) reads them every paint.
const LEAK_FIELDS = ['posterEmail', 'accepterEmail', 'accepterContact'];

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (err) {
    console.error('admin-scrub auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  // Same admin gate as admin-backfill-leaderboard / seed-round.
  let isAdmin = uid === ADMIN_UID;
  if (!isAdmin){
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err){
      console.error('admin-scrub profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  let body = {};
  try { body = await request.json(); } catch {}
  const dryRun = !!body.dryRun;

  const stats = {
    scanned: 0,
    eligible: 0,         // had at least one leak field
    copied: 0,           // companion doc written/merged
    stripped: 0,         // leak fields deleted from live_challenges
    alreadyClean: 0,     // no leak fields present, nothing to do
    errors: [],
    dryRun,
  };

  try {
    const snap = await db.collection('live_challenges').get();
    stats.scanned = snap.size;

    for (const doc of snap.docs){
      const id = doc.id;
      const d = doc.data() || {};

      const hasLeak = LEAK_FIELDS.some(f => d[f] !== undefined && d[f] !== null && d[f] !== '');
      if (!hasLeak){ stats.alreadyClean++; continue; }
      stats.eligible++;

      if (dryRun) continue;

      // 1) Merge the leak fields into the private companion. Also write
      //    posterUid / accepterUid since the read rule keys off them.
      const companionPayload = {
        challengeId: id,
        posterUid: d.posterUid || null,
        // posterContact lives on the profile in the new flow; legacy
        // docs don't have it, so we don't synthesize one here.
      };
      LEAK_FIELDS.forEach(f => {
        if (d[f] !== undefined && d[f] !== null && d[f] !== '') {
          companionPayload[f] = d[f];
        }
      });
      if (d.accepterUid) companionPayload.accepterUid = d.accepterUid;

      try {
        await db.collection('live_challenge_contacts').doc(id).set(companionPayload, { merge: true });
        stats.copied++;
      } catch (e) {
        stats.errors.push(id + ' (copy): ' + (e.message || e));
        continue;  // don't strip if the copy failed
      }

      // 2) Strip the leak fields off the public doc.
      const updateOps = {};
      LEAK_FIELDS.forEach(f => {
        if (d[f] !== undefined) updateOps[f] = FieldValue.delete();
      });
      try {
        await doc.ref.update(updateOps);
        stats.stripped++;
      } catch (e) {
        stats.errors.push(id + ' (strip): ' + (e.message || e));
      }
    }
  } catch (err) {
    console.error('admin-scrub fatal:', err.message);
    return jsonResponse({ ok: false, error: err.message, stats }, 500, request);
  }

  return jsonResponse({ ok: true, stats }, 200, request);
};

export const config = { path: '/api/admin-scrub-challenge-contacts' };
