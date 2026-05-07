// Admin-only one-shot: scans `debate_rounds`, writes a slim leaderboard
// entry to `leaderboard_entries` for every round that has a numeric
// speakerPoints.user. Idempotent — doc id is `${uid}_${roundId}` so
// re-running just merges. Use this once after deploying the leaderboard
// rules so the board isn't empty on launch.
//
// POST /api/admin/backfill-leaderboard
// body: { "dryRun": true }   // optional, default false
//
// Auth: admin only (ADMIN_UID env var OR user_profiles.{uid}.isAdmin === true).
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';

// Match the runtime hook in app/debate-ai.html so backfilled and live
// entries display identically: first name + last-initial, e.g. "Alex H."
function shortenName(fullName) {
  const fn = (fullName || '').trim();
  if (!fn) return 'Anonymous';
  const parts = fn.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const initial = (parts[parts.length - 1][0] || '').toUpperCase();
    return `${parts[0]} ${initial}.`;
  }
  return parts[0] || 'Anonymous';
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('admin-backfill-leaderboard auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  const db = getDb();

  // Admin gate — same pattern as admin-grant-lifetime / admin-analytics.
  let isAdmin = uid === ADMIN_UID;
  if (!isAdmin) {
    try {
      const profileDoc = await db.collection('user_profiles').doc(uid).get();
      if (profileDoc.exists && profileDoc.data().isAdmin === true) isAdmin = true;
    } catch (err) {
      console.error('admin-backfill-leaderboard profile check error:', err.message);
    }
  }
  if (!isAdmin) return errorResponse('Forbidden: admin access required', 403, request);

  let body = {};
  try { body = await request.json(); } catch {}
  const dryRun = !!body.dryRun;

  try {
    const roundsSnap = await db.collection('debate_rounds').get();
    const totalRounds = roundsSnap.size;

    // Collect unique uids first; then batch the displayName lookups so we
    // don't hammer user_profiles with one read per round (most users have
    // multiple rounds so the dedupe pays off).
    const uidsSeen = new Set();
    const candidates = [];
    for (const doc of roundsSnap.docs) {
      const r = doc.data();
      const sp = r && r.speakerPoints;
      const score = sp && typeof sp === 'object' ? Number(sp.user) : NaN;
      if (!isFinite(score)) continue;

      // Doc ID convention: `${uid}_${roundId}`. Pull uid from the id since
      // the round payload itself doesn't always carry uid as a field.
      const docId = doc.id;
      const sep = docId.indexOf('_');
      if (sep <= 0) continue;
      const ownerUid = docId.slice(0, sep);
      const roundId = docId.slice(sep + 1);
      if (!ownerUid || !roundId) continue;

      uidsSeen.add(ownerUid);
      candidates.push({ ownerUid, roundId, round: r, score });
    }

    // Look up displayName for each unique uid via user_profiles.
    const nameByUid = new Map();
    await Promise.all(Array.from(uidsSeen).map(async (u) => {
      try {
        const p = await db.collection('user_profiles').doc(u).get();
        const name = p.exists ? (p.data().displayName || '') : '';
        nameByUid.set(u, shortenName(name));
      } catch {
        nameByUid.set(u, 'Anonymous');
      }
    }));

    if (dryRun) {
      return jsonResponse({
        ok: true,
        dryRun: true,
        totalRounds,
        eligible: candidates.length,
        uniqueUsers: uidsSeen.size,
        sampleNames: Array.from(nameByUid.values()).slice(0, 5),
      }, 200, request);
    }

    // Write in chunks of 400 (Firestore batch cap is 500; leave headroom).
    let written = 0;
    for (let i = 0; i < candidates.length; i += 400) {
      const chunk = candidates.slice(i, i + 400);
      const batch = db.batch();
      for (const c of chunk) {
        const r = c.round;
        // Use the round's original date so the leaderboard's
        // `orderBy('completedAt','desc')` and "this week" filter respect
        // chronology. Firestore auto-converts JS Date on write; falls back
        // to serverTimestamp if the round had no parseable date.
        let completedAt;
        if (r.date) {
          const d = new Date(r.date);
          if (!isNaN(d.getTime())) completedAt = d;
        }
        if (!completedAt) completedAt = FieldValue.serverTimestamp();

        const entry = {
          uid: c.ownerUid,
          displayName: nameByUid.get(c.ownerUid) || 'Anonymous',
          score: c.score,
          won: r.userWon === true,
          motion: (r.motion || '').slice(0, 1024),
          format: r.format || 'apda',
          formatName: r.formatName || 'APDA',
          side: r.side || '',
          sideLabel: r.sideLabel || '',
          completedAt,
          roundId: r.id || c.roundId,
          backfilled: true,
        };

        const ref = db.collection('leaderboard_entries').doc(`${c.ownerUid}_${c.roundId}`);
        batch.set(ref, entry, { merge: true });
      }
      await batch.commit();
      written += chunk.length;
    }

    console.log(`[admin-backfill-leaderboard] ${uid} backfilled ${written} of ${totalRounds} rounds across ${uidsSeen.size} users.`);

    return jsonResponse({
      ok: true,
      totalRounds,
      written,
      uniqueUsers: uidsSeen.size,
    }, 200, request);
  } catch (err) {
    console.error('admin-backfill-leaderboard error:', err);
    return errorResponse('Backfill failed: ' + (err.message || err), 500, request);
  }
};

export const config = {
  path: '/api/admin/backfill-leaderboard',
};
