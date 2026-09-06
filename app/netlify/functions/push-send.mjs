// Compatibility for DM composers that also call the old device notifier.
//
// Security: the caller is token-verified, and BOTH the caller and the
// recipient must be participants of the named dm_thread — so you can only
// push someone you already share a thread with. The notification text is
// SERVER-CONSTRUCTED (never caller-supplied), so there is no phishing /
// spoofing vector. Shares per-message device deduplication with notify-dm;
// existing opted-in SMS delivery stays on this compatibility route.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { deliverDmPush, DM_NOTIFY_RATE_LAYERS } from './lib/dm-push.mjs';
import { isRecentDmMessage } from './lib/dm-email.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { sendSmsToUser } from './lib/sms.mjs';
import { getDb } from './lib/firestore.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); } catch (e) { return errorResponse('Invalid token', 401, request); }
  const callerUid = decoded.sub;
  if (!callerUid) return errorResponse('Invalid token', 401, request);
  const rate = await checkLayers('dm-notify', `uid_${callerUid}`, DM_NOTIFY_RATE_LAYERS);
  if (!rate.ok) return errorResponse('Message notification rate limit reached', 429, request);

  let body;
  try { body = await request.json(); } catch (e) { return errorResponse('Bad JSON', 400, request); }
  const recipientUid = body && body.recipientUid;
  const threadId = body && body.threadId;
  if (!recipientUid || typeof recipientUid !== 'string' || recipientUid.length > 200 || recipientUid.includes('/') || recipientUid === callerUid) {
    return errorResponse('Bad recipient', 400, request);
  }
  if (!threadId || typeof threadId !== 'string' || threadId.length > 200 || threadId.includes('/')) return errorResponse('Valid threadId required', 400, request);

  // Both sides must be participants of this thread.
  const db = getDb();
  const threadRef = db.collection('dm_threads').doc(threadId);
  const t = await threadRef.get();
  if (!t.exists) return errorResponse('No thread', 403, request);
  const data = t.data() || {};
  const parts = Array.isArray(data.participants) ? data.participants : [];
  if (parts.indexOf(callerUid) === -1 || parts.indexOf(recipientUid) === -1) {
    return errorResponse('Not a participant', 403, request);
  }

  // Older open tabs supplied only a thread. New callers name the exact
  // message. Both paths must prove a recent message by this caller.
  let message;
  if (body.messageId !== undefined) {
    if (typeof body.messageId !== 'string' || !body.messageId || body.messageId.length > 200 || body.messageId.includes('/')) return errorResponse('Valid messageId required', 400, request);
    message = await threadRef.collection('messages').doc(body.messageId).get();
  } else {
    const latest = await threadRef.collection('messages').orderBy('createdAt', 'desc').limit(1).get();
    message = latest.docs[0];
  }
  if (!message || !message.exists) return errorResponse('Message not found', 404, request);
  if (message.data().fromUid !== callerUid) return errorResponse('Not the message sender', 403, request);
  if (!isRecentDmMessage(message.data())) return errorResponse('Message is too old to notify', 409, request);

  // A muted thread makes no noise on any of the recipient's devices.
  // Read before the payload is built so a mute costs one read and no
  // send. Failure here falls through to sending: a preferences read that
  // errors must not silently swallow someone's messages.
  try {
    const prefs = await db.collection('notify_prefs').doc(recipientUid).get();
    const muted = (prefs.exists && prefs.data().mutedThreads) || [];
    if (Array.isArray(muted) && muted.indexOf(threadId) !== -1) {
      return jsonResponse({ ok: true, muted: true, sent: 0 }, 200, request);
    }
  } catch (e) { /* prefs unreadable — send rather than drop */ }

  const info = (data.participantInfo && data.participantInfo[callerUid]) || {};
  const callerName = String(info.name || 'Someone').slice(0, 40);
  // The same participant check above gates both lanes, so the text can
  // only ever reach someone the sender already shares a thread with. The
  // message TEXT is never included: a DM's contents belong in the app, not
  // on a lock screen and not in a carrier's logs.
  const [r, smsR] = await Promise.all([
    deliverDmPush({ db, threadRef, thread: data, messageId: message.id, callerUid, recipientUid }),
    sendSmsToUser(recipientUid, {
      kind: 'dm',
      body: `${callerName} messaged you on Debatable. https://itsdebatable.com/spar?thread=${encodeURIComponent(threadId)}\n\nReply STOP to stop.`,
    }).catch(() => ({ sent: 0 })),
  ]);
  return jsonResponse({ ok: r.status !== 'failed', ...r, sms: smsR }, r.status === 'failed' ? 502 : 200, request);
};
