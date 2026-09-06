// Device delivery is independent of the six-hour email cooldown. Both the
// shared notifier and older push-send callers claim the same message, so a
// retry or an already-open page cannot buzz every device twice.
import { FieldValue } from './firestore.mjs';
import { sendToUser } from './webpush.mjs';

export const DM_NOTIFY_RATE_LAYERS = [
  { window: 60_000, max: 120, label: 'minute' },
  { window: 24 * 60 * 60_000, max: 2000, label: 'day' },
];
const CLAIM_LEASE_MS = 2 * 60 * 1000;

export function dmPushPayload({ threadId, thread, callerUid }) {
  // Only the public alias already carried by this thread. Never fall back
  // to the sender's Google/Apple name or expose the private message body.
  const alias = String(thread.participantInfo?.[callerUid]?.name || 'Someone').slice(0, 40);
  const group = thread.isGroup || thread.participants.length > 2;
  return {
    title: group ? `${alias} posted in ${String(thread.groupName || 'your group').slice(0, 60)}` : `New message from ${alias}`,
    body: 'Tap to reply on Debatable.',
    url: '/messages?thread=' + encodeURIComponent(threadId),
    tag: 'da-dm-' + threadId,
  };
}

export async function deliverDmPush({ db, threadRef, thread, messageId, callerUid, recipientUid }) {
  const ref = threadRef.collection('messages').doc(messageId)
    .collection('email_notifications').doc(recipientUid);
  let claimed = false;
  try {
    const prefs = await db.collection('notify_prefs').doc(recipientUid).get();
    const muted = prefs.exists && prefs.data()?.mutedThreads;
    if (Array.isArray(muted) && muted.includes(threadRef.id)) return { status: 'skipped', reason: 'muted', sent: 0 };
    claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() || {} : {};
      if (data.pushStatus === 'sent' || data.pushStatus === 'skipped') return false;
      if (data.pushStatus === 'sending' && Date.now() - Number(data.pushClaimedAtMs || 0) < CLAIM_LEASE_MS) return false;
      tx.set(ref, { pushStatus: 'sending', pushClaimedAtMs: Date.now() }, { merge: true });
      return true;
    });
    if (!claimed) return { status: 'skipped', reason: 'already handled', sent: 0 };

    // sendToUser fans out to both Web Push and native FCM. In particular,
    // native-only installations must not be gated on VAPID configuration.
    const result = await sendToUser(recipientUid, dmPushPayload({ threadId: threadRef.id, thread, callerUid }));
    const sent = result?.sent || 0;
    const failed = !sent && [result?.web, result?.native].some((lane) =>
      lane && (lane.error || lane.rejected || lane.subs > 0 || lane.tokens > 0));
    const status = sent ? 'sent' : failed ? 'failed' : 'skipped';
    await ref.set({ pushStatus: status, pushSent: sent, pushUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { status, sent };
  } catch (error) {
    if (claimed) {
      try { await ref.set({ pushStatus: 'failed', pushUpdatedAt: FieldValue.serverTimestamp() }, { merge: true }); } catch {}
    }
    return { status: 'failed', sent: 0 };
  }
}
