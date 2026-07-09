import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

async function deleteRef(db, ref) {
  if (typeof db.recursiveDelete === 'function') return db.recursiveDelete(ref);
  return ref.delete();
}

async function deleteQuery(db, query) {
  const snap = await query.limit(500).get();
  await Promise.all(snap.docs.map((doc) => deleteRef(db, doc.ref)));
  return snap.size;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (e) { return errorResponse('Invalid token', 401, request); }

  const uid = decoded.sub;
  const db = getDb();
  const requestRef = db.collection('deletion_requests').doc(uid);
  await requestRef.set({
    uid,
    email: String(decoded.email || '').slice(0, 220),
    status: 'processing',
    requestedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const directCollections = [
    'user_profiles',
    'user_fingerprints',
    'matchmaking_queue',
    'push_subscriptions',
    'user_blocks',
    'floor_users',
  ];
  const directJobs = directCollections.map((name) => deleteRef(db, db.collection(name).doc(uid)));
  const queryJobs = [
    deleteQuery(db, db.collection('generations').where('uid', '==', uid)),
    deleteQuery(db, db.collection('leaderboard_entries').where('uid', '==', uid)),
    deleteQuery(db, db.collection('team_members').where('userId', '==', uid)),
    deleteQuery(db, db.collection('dm_threads').where('participants', 'array-contains', uid)),
  ];

  const results = await Promise.allSettled([...directJobs, ...queryJobs]);
  const failed = results.filter((result) => result.status === 'rejected').length;
  await requestRef.set({
    status: failed ? 'needs_cleanup' : 'data_removed',
    failedJobs: failed,
    processedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return jsonResponse({ ok: true, pendingCleanup: failed > 0 }, 200, request);
};

export const config = { path: '/api/delete-account-data' };
