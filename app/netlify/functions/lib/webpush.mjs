// Web Push (VAPID) helper.
//
// Stores a browser's push subscription and sends notifications through the
// Web Push protocol so a user gets pinged even when the tab is closed (and,
// on iOS, when the installed PWA is closed). Dormant until the VAPID env
// vars are set: sendToUser() no-ops cleanly, so nothing errors or throws
// before the keys are configured in Netlify.
//
// Env (set in the Netlify dashboard):
//   VAPID_PRIVATE_KEY  — required to send (secret).
//   VAPID_SUBJECT      — optional, a mailto: or https: contact (defaults below).
//   VAPID_PUBLIC_KEY   — optional; the public key is also baked below so the
//                        client can read it from /api/push-subscribe.
import webpush from 'web-push';
import { createHash } from 'crypto';
import { getDb, FieldValue } from './firestore.mjs';

// The public key is safe to ship (it's the application server key the browser
// subscribes against). The matching private key lives only in the env.
export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ||
  'BAdwbZkEl8RmNE1BT01QtVdlCJCF9b6B4uiQTr4Jr_txO170WqePABtMaFbJztyI-VqAnMo8GHx-l_FUpy6M1NA';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contact@devilsadvocateteam.com';

export function pushConfigured() { return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY); }

let _vapidSet = false;
function ensureVapid() {
  if (_vapidSet) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  _vapidSet = true;
}

function subDocId(endpoint) { return createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 40); }
function subsCol(uid) { return getDb().collection('push_subscriptions').doc(uid).collection('subs'); }

export async function saveSubscription(uid, sub) {
  if (!uid || !sub || !sub.endpoint || !sub.keys) return;
  await subsCol(uid).doc(subDocId(sub.endpoint)).set({
    endpoint: String(sub.endpoint),
    keys: { p256dh: String(sub.keys.p256dh || ''), auth: String(sub.keys.auth || '') },
    ua: String(sub.ua || '').slice(0, 200),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function deleteSubscription(uid, endpoint) {
  if (!uid || !endpoint) return;
  await subsCol(uid).doc(subDocId(endpoint)).delete().catch(() => {});
}

// Fan a single notification out to many users (a "go live" broadcast).
// Reuses sendToUser per recipient with a small concurrency cap so a pool
// of opted-in debaters can all be pinged without a burst of parallel
// connections. Best-effort and never throws — returns a tally.
export async function sendToManyUsers(uids, payload, concurrency = 8) {
  if (!Array.isArray(uids) || !uids.length || !pushConfigured()) {
    return { recipients: 0, sent: 0, configured: pushConfigured() };
  }
  const queue = uids.slice();
  let sent = 0, recipients = 0;
  async function worker() {
    while (queue.length) {
      const uid = queue.shift();
      const r = await sendToUser(uid, payload);
      if (r && r.sent) sent += r.sent;
      recipients++;
    }
  }
  const n = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(Array.from({ length: n }, worker));
  return { recipients, sent, configured: true };
}

// Send a notification to every device the user has subscribed. Prunes dead
// endpoints (404/410). Never throws — push is best-effort, it must never
// fail the caller (e.g. the matchmaker).
export async function sendToUser(uid, payload) {
  try {
    if (!uid || !pushConfigured()) return { sent: 0, configured: pushConfigured() };
    ensureVapid();
    const snap = await subsCol(uid).get();
    if (snap.empty) return { sent: 0, subs: 0 };
    const body = JSON.stringify(payload || {});
    let sent = 0;
    await Promise.all(snap.docs.map(async (d) => {
      const s = d.data();
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 1800 });
        sent++;
      } catch (e) {
        const code = e && e.statusCode;
        if (code === 404 || code === 410) await d.ref.delete().catch(() => {});
      }
    }));
    return { sent, subs: snap.size };
  } catch (e) {
    return { sent: 0, error: true };
  }
}
