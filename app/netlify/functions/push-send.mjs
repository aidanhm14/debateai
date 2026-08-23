// Send a Web Push notification for a new DM.
//
// Security: the caller is token-verified, and BOTH the caller and the
// recipient must be participants of the named dm_thread — so you can only
// push someone you already share a thread with. The notification text is
// SERVER-CONSTRUCTED (never caller-supplied), so there is no phishing /
// spoofing vector. No-ops cleanly if push isn't configured (VAPID unset).
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { sendToUser, pushConfigured } from './lib/webpush.mjs';
import { sendSmsToUser, smsConfigured } from './lib/sms.mjs';
import { getDb } from './lib/firestore.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  // Either lane live is enough to be worth doing the participant checks.
  if (!pushConfigured() && !smsConfigured()) {
    return jsonResponse({ ok: false, configured: false }, 200, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); } catch (e) { return errorResponse('Invalid token', 401, request); }
  const callerUid = decoded.sub;

  let body;
  try { body = await request.json(); } catch (e) { return errorResponse('Bad JSON', 400, request); }
  const recipientUid = body && body.recipientUid;
  const threadId = body && body.threadId;
  if (!recipientUid || typeof recipientUid !== 'string' || recipientUid === callerUid) {
    return errorResponse('Bad recipient', 400, request);
  }
  if (!threadId || typeof threadId !== 'string') return errorResponse('Missing threadId', 400, request);

  // Both sides must be participants of this thread.
  const db = getDb();
  const t = await db.collection('dm_threads').doc(threadId).get();
  if (!t.exists) return errorResponse('No thread', 403, request);
  const data = t.data() || {};
  const parts = Array.isArray(data.participants) ? data.participants : [];
  if (parts.indexOf(callerUid) === -1 || parts.indexOf(recipientUid) === -1) {
    return errorResponse('Not a participant', 403, request);
  }

  const info = (data.participantInfo && data.participantInfo[callerUid]) || {};
  const callerName = String(info.name || (decoded.name || '').split(/\s+/)[0] || 'A debater').slice(0, 40);
  const payload = {
    title: 'New message from ' + callerName,
    body: 'Tap to reply on Debatable.',
    url: '/spar?thread=' + encodeURIComponent(threadId),
    tag: 'da-dm-' + threadId,
  };
  // The same participant check above gates both lanes, so the text can
  // only ever reach someone the sender already shares a thread with. The
  // message TEXT is never included: a DM's contents belong in the app, not
  // on a lock screen and not in a carrier's logs.
  const [r, smsR] = await Promise.all([
    sendToUser(recipientUid, payload),
    sendSmsToUser(recipientUid, {
      kind: 'dm',
      body: `${callerName} messaged you on Debatable. https://itsdebatable.com/spar?thread=${encodeURIComponent(threadId)}\n\nReply STOP to stop.`,
    }).catch(() => ({ sent: 0 })),
  ]);
  return jsonResponse({ ok: true, ...r, sms: smsR }, 200, request);
};
