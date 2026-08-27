// Email every recipient of a newly written private message.
//
// The browser sends only { threadId, messageId }. The server confirms the
// authenticated caller wrote that message in a thread they belong to, then
// sends a generic notification. No message text, sender identity, group name,
// or thread identifier is sent to the email provider. Each recipient is
// deduplicated by message id, and an age gate blocks historical replay.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getAuthUserByUid } from './lib/auth-admin.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { sendEmail, isOptedOut } from './lib/email.mjs';
import { buildDmEmail, isRecentDmMessage } from './lib/dm-email.mjs';

const MAX_PARTICIPANTS = 12;
const CLAIM_LEASE_MS = 2 * 60 * 1000;
const RATE_LAYERS = [
  { window: 60_000, max: 20, label: 'minute' },
  { window: 24 * 60 * 60_000, max: 100, label: 'day' },
];

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/');
}

async function claimDelivery(db, ref) {
  let claimed = false;
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() || {}) : {};
    if (data.status === 'sent' || data.status === 'skipped') return;
    if (data.status === 'sending' && now - Number(data.claimedAtMs || 0) < CLAIM_LEASE_MS) return;
    tx.set(ref, {
      status: 'sending',
      claimedAtMs: now,
      attempts: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    claimed = true;
  });
  return claimed;
}

async function finishDelivery(ref, status, details = {}) {
  await ref.set({
    status,
    ...details,
    updatedAt: FieldValue.serverTimestamp(),
    ...(status === 'sent' ? { sentAt: FieldValue.serverTimestamp() } : {}),
  }, { merge: true });
}

async function deliverToRecipient({ db, threadRef, messageId, recipientUid }) {
  const deliveryRef = threadRef.collection('messages').doc(messageId)
    .collection('email_notifications').doc(recipientUid);
  const claimed = await claimDelivery(db, deliveryRef);
  if (!claimed) return { recipientUid, status: 'skipped', reason: 'already handled' };

  try {
    const profileSnap = await db.doc(`user_profiles/${recipientUid}`).get();
    if (profileSnap.exists && isOptedOut(profileSnap.data() || {}, 'dm')) {
      await finishDelivery(deliveryRef, 'skipped', { reason: 'opted-out' });
      return { recipientUid, status: 'skipped', reason: 'opted-out' };
    }

    const authUser = await getAuthUserByUid(recipientUid);
    if (!authUser || !authUser.email) {
      await finishDelivery(deliveryRef, 'skipped', { reason: 'no-email' });
      return { recipientUid, status: 'skipped', reason: 'no-email' };
    }

    const { subject, html } = buildDmEmail({ uid: recipientUid });
    const from = process.env.RESEND_FROM || process.env.EMAIL_FROM || undefined;
    const result = await sendEmail({
      to: authUser.email,
      subject,
      html,
      uid: recipientUid,
      stream: 'dm',
      from,
    });
    if (!result.ok) {
      await finishDelivery(deliveryRef, 'failed', { reason: result.reason || 'send-failed' });
      return { recipientUid, status: 'failed', reason: result.reason || 'send-failed' };
    }

    await finishDelivery(deliveryRef, 'sent', { providerId: result.id || null });
    return { recipientUid, status: 'sent' };
  } catch (error) {
    const reason = String(error && error.message || 'delivery-failed').slice(0, 180);
    try { await finishDelivery(deliveryRef, 'failed', { reason }); } catch { /* keep original error */ }
    return { recipientUid, status: 'failed', reason };
  }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Invalid token', 401, request); }
  const callerUid = decoded && decoded.sub;
  if (!callerUid) return errorResponse('Invalid token', 401, request);

  const rate = await checkLayers('dm-email', `uid_${callerUid}`, RATE_LAYERS);
  if (!rate.ok) return errorResponse('Email notification rate limit reached', 429, request);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Bad JSON', 400, request); }
  const threadId = body && body.threadId;
  const messageId = body && body.messageId;
  if (!validId(threadId) || !validId(messageId)) {
    return errorResponse('Valid threadId and messageId required', 400, request);
  }

  const db = getDb();
  const threadRef = db.collection('dm_threads').doc(threadId);
  const messageRef = threadRef.collection('messages').doc(messageId);
  let threadSnap, messageSnap;
  try {
    [threadSnap, messageSnap] = await Promise.all([threadRef.get(), messageRef.get()]);
  } catch (error) {
    console.error('[notify-dm] Firestore read failed:', error.message);
    return errorResponse('Could not verify message', 500, request);
  }
  if (!threadSnap.exists || !messageSnap.exists) return errorResponse('Message not found', 404, request);

  const thread = threadSnap.data() || {};
  const message = messageSnap.data() || {};
  const participants = Array.isArray(thread.participants)
    ? [...new Set(thread.participants.filter(validId))]
    : [];
  if (!participants.includes(callerUid) || message.fromUid !== callerUid) {
    return errorResponse('Not the message sender', 403, request);
  }
  if (participants.length < 2 || participants.length > MAX_PARTICIPANTS) {
    return errorResponse('Invalid thread participants', 400, request);
  }
  if (!isRecentDmMessage(message)) {
    return errorResponse('Message is too old to notify', 409, request);
  }

  const recipients = participants.filter((uid) => uid !== callerUid);
  const results = await Promise.all(recipients.map((recipientUid) => deliverToRecipient({
    db,
    threadRef,
    messageId,
    recipientUid,
  })));

  const sent = results.filter((r) => r.status === 'sent').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.length - sent - failed;
  if (failed) {
    console.warn('[notify-dm] delivery failures:', results.filter((r) => r.status === 'failed'));
    return jsonResponse({ ok: false, sent, skipped, failed }, 502, request);
  }
  return jsonResponse({ ok: true, sent, skipped, failed: 0 }, 200, request);
};

export const config = { path: '/api/notify-dm' };
