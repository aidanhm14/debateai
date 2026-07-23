// Admin-only one-shot: migrate `live_challenges` into `challenges`.
//
// The old board was two fields (motion + an accepter slot). The arena
// needs the full Challenge object, so this maps every legacy doc into
// the new shape via fromLiveChallenge() and writes it under a
// deterministic id. Nothing is deleted: live_challenges stays readable
// until the arena carries real traffic.
//
// Idempotent — the target doc id is `lc_${legacyId}`, so re-running
// merges rather than duplicating. Contact details are deliberately NOT
// carried over: they live in live_challenge_contacts and are readable
// only by the two matched parties.
//
// POST /api/admin/backfill-challenges
// body: { "dryRun": true }   // optional, default TRUE (opt in to writing)
//
// Auth: admin only (ADMIN_UID env var OR user_profiles.{uid}.isAdmin).
import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { fromLiveChallenge } from './lib/challenge.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const BATCH = 400;

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
  // Default to a dry run. A migration that writes by accident on a
  // curl typo is worse than one that needs an explicit flag.
  const dryRun = body.dryRun !== false;

  const now = Date.now();
  const stats = { scanned: 0, migrated: 0, skippedNoMotion: 0, alreadyPresent: 0, errors: 0 };
  const samples = [];

  try {
    const snap = await db.collection('live_challenges').get();
    let batch = db.batch();
    let pending = 0;

    for (const doc of snap.docs) {
      stats.scanned++;
      const d = doc.data();
      if (!d.motion || !String(d.motion).trim()) { stats.skippedNoMotion++; continue; }

      const targetId = 'lc_' + doc.id;
      const targetRef = db.collection('challenges').doc(targetId);

      // Never clobber a challenge that has moved on since migration.
      const existing = await targetRef.get();
      if (existing.exists && existing.data().updatedAt > (d.acceptedAt || d.createdAt || 0)) {
        stats.alreadyPresent++;
        continue;
      }

      const mapped = fromLiveChallenge(doc.id, d, now);
      if (samples.length < 5) {
        samples.push({ id: targetId, claim: mapped.claim.slice(0, 80), status: mapped.status, sides: mapped.accepted.length });
      }

      if (!dryRun) {
        batch.set(targetRef, mapped, { merge: true });
        pending++;
        if (pending >= BATCH) { await batch.commit(); batch = db.batch(); pending = 0; }
      }
      stats.migrated++;
    }

    if (!dryRun && pending > 0) await batch.commit();
  } catch (err) {
    stats.errors++;
    return jsonResponse({ ok: false, dryRun, stats, error: err.message }, 500, request);
  }

  return jsonResponse({
    ok: true,
    dryRun,
    stats,
    samples,
    note: dryRun
      ? 'Dry run. Nothing was written. POST { "dryRun": false } to commit.'
      : 'Migration written. live_challenges was not modified.',
  }, 200, request);
};

export const config = { path: '/api/admin/backfill-challenges' };
