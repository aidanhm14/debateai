// Push a friend request without creating a direct-message thread.
//
// The friendship document is the authority: the caller must be the recorded
// requester, the recipient must be the other member of the pair, and the
// recipient must still have a decision to make. Notification text and the
// destination URL are constructed here so this cannot become a push relay.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { getDb } from './lib/firestore.mjs';
import { sendToUser } from './lib/webpush.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Invalid token', 401, request); }
  const callerUid = decoded.sub;

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Bad JSON', 400, request); }
  const pairId = String(body?.pairId || '');
  const recipientUid = String(body?.recipientUid || '');
  if (!pairId || pairId.length > 260 || pairId.includes('/')) {
    return errorResponse('Valid pairId required', 400, request);
  }
  if (!recipientUid || recipientUid === callerUid || recipientUid.length > 160) {
    return errorResponse('Valid recipient required', 400, request);
  }

  const limit = await checkLayers('notify-friend-request', `uid_${callerUid}`, [
    { label: 'hour', window: 60 * 60 * 1000, max: 20 },
    { label: 'day', window: 24 * 60 * 60 * 1000, max: 60 },
  ]);
  if (!limit.ok) return errorResponse('Too many friend requests', 429, request);

  const db = getDb();
  const snap = await db.collection('friendships').doc(pairId).get();
  if (!snap.exists) return errorResponse('Friend request not found', 404, request);
  const friendship = snap.data() || {};
  const uids = Array.isArray(friendship.uids) ? friendship.uids : [];
  const state = friendship.state || {};
  if (friendship.requestedBy !== callerUid ||
      uids.length !== 2 ||
      uids.indexOf(callerUid) === -1 ||
      uids.indexOf(recipientUid) === -1 ||
      state[callerUid] !== 'accepted' ||
      state[recipientUid] === 'accepted') {
    return errorResponse('No pending request for this recipient', 403, request);
  }

  let callerName = `Debater ${String(callerUid).slice(-4).toUpperCase()}`;
  try {
    const profile = await db.collection('public_profiles').doc(callerUid).get();
    const savedName = profile.exists && profile.data() && profile.data().name;
    if (savedName) callerName = String(savedName).trim().slice(0, 60) || callerName;
  } catch { /* the stable alias above is enough */ }

  const result = await sendToUser(recipientUid, {
    title: `${callerName} sent you a friend request`,
    body: 'Accept or deny it in Notifications.',
    url: '/notifications?filter=friends',
    tag: `da-friend-${pairId}`,
  });
  return jsonResponse({ ok: true, ...result }, 200, request);
};

export const config = { path: '/api/notify-friend-request' };
