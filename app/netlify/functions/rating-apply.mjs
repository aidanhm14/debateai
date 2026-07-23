// POST /api/rating/apply  { source: 'async'|'live', eventId }
//
// Ask the server to rate a finished round. The caller does not supply a
// result: the server reads the round itself and derives the winner,
// so a client can only ask for a round it took part in to be evaluated,
// never assert who won.
//
// Idempotent. Safe to call from a client retry, the sweep, and the
// backfill over the same round.
import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { getDb, withDeadline } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { applyRoundRating, SOURCES } from './lib/rating-apply.mjs';
import { displayRating } from './lib/rating.mjs';

const COLLECTION = { async: 'async_rounds', live: 'live_rounds' };

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in first.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed.', 401, request); }
  const uid = decoded.sub;

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid request body', 400, request); }

  const source = String(body.source || '');
  const eventId = String(body.eventId || '').slice(0, 100);
  if (!SOURCES.includes(source)) return errorResponse('Unknown source', 400, request);
  if (!eventId) return errorResponse('Missing eventId', 400, request);

  const db = getDb();
  let snap;
  try {
    snap = await withDeadline(db.collection(COLLECTION[source]).doc(eventId).get(), 2500);
  } catch (err) {
    console.error('[rating-apply] read failed', source, eventId, err.message);
    return errorResponse('Could not load that round. Try again.', 503, request);
  }
  if (!snap.exists) return errorResponse('Round not found', 404, request);
  const d = snap.data();

  // You may only ask for a round you were in. Admins can rate anything,
  // which is what the backfill and any repair pass run as.
  const parties = source === 'async'
    ? [d.prop && d.prop.uid, d.opp && d.opp.uid]
    : [d.proUid, d.conUid];
  if (!parties.includes(uid) && !isAdminEmail(decoded.email)) {
    return errorResponse('You were not in this round.', 403, request);
  }

  let result;
  try {
    result = await applyRoundRating(db, { source, eventId, roundData: d });
  } catch (err) {
    console.error('[rating-apply] apply failed', source, eventId, err.message);
    return errorResponse('Could not apply the rating. Try again.', 503, request);
  }

  if (!result.applied) {
    // Not an error: "already applied" and "your opponent has not
    // consented yet" are both normal states a client polls through.
    return jsonResponse({ applied: false, reason: result.reason }, 200, request);
  }

  const mine = result.changes.find((c) => c.uid === uid) || null;
  const after = mine ? await db.collection('user_ratings').doc(uid).get() : null;
  return jsonResponse({
    applied: true,
    change: mine ? { delta: mine.delta, result: mine.result, before: Math.round(mine.before.rating), after: Math.round(mine.after.rating) } : null,
    rating: after && after.exists ? displayRating(after.data()) : null,
  }, 200, request);
};

export const config = { path: '/api/rating/apply' };
