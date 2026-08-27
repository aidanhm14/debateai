// Compatibility for already-open /spar tabs that still call the retired
// first-message endpoint. Resolve the latest message id, then hand it to the
// authenticated, deduplicated notifier. New clients call /api/notify-dm.

import notifyDm from './notify-dm.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Invalid token', 401, request); }

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Bad JSON', 400, request); }
  const threadId = String(body && body.threadId || '');
  if (!threadId || threadId.length > 200 || threadId.includes('/')) {
    return errorResponse('Valid threadId required', 400, request);
  }

  const snap = await getDb().collection('dm_threads').doc(threadId)
    .collection('messages').orderBy('createdAt', 'desc').limit(1).get();
  if (snap.empty) return errorResponse('Message not found', 404, request);
  const latest = snap.docs[0];
  if ((latest.data() || {}).fromUid !== decoded.sub) {
    return errorResponse('Not the message sender', 403, request);
  }

  const forwarded = new Request(request.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Origin': request.headers.get('origin') || 'https://itsdebatable.com',
    },
    body: JSON.stringify({ threadId, messageId: latest.id }),
  });
  return notifyDm(forwarded);
};

export const config = { path: '/api/notify-dm-accept' };
