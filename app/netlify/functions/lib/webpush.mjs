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
import { createHash, createECDH } from 'crypto';
import { getDb, FieldValue } from './firestore.mjs';
import { sendToUserNative } from './native-push.mjs';

// The public key is safe to ship (it's the application server key the browser
// subscribes against). The matching private key lives only in the env.
const BAKED_PUBLIC_KEY =
  'BAdwbZkEl8RmNE1BT01QtVdlCJCF9b6B4uiQTr4Jr_txO170WqePABtMaFbJztyI-VqAnMo8GHx-l_FUpy6M1NA';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

// 2026-09-04: push had NEVER delivered. Measured against every one of the
// founder's five subscribed devices with the production keys: FCM
// "invalid JWT", Mozilla "InvalidSignature", Apple "BadJwtToken". The
// VAPID_PUBLIC_KEY in the env was from a different pair than
// VAPID_PRIVATE_KEY, so every browser since 2026-08-22 subscribed against
// a key the server cannot sign for, and the 404/410 pruner never sees a
// 403. Two env values that must agree will drift, so the served public
// key is now DERIVED from the private key and the env public key is only
// a cross-check that logs when it disagrees.
export function derivePublicKey(privateB64u) {
  try {
    if (!privateB64u) return '';
    const pad = '='.repeat((4 - privateB64u.length % 4) % 4);
    const raw = Buffer.from((privateB64u + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (raw.length !== 32) return '';
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(raw);
    return ecdh.getPublicKey().toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (e) { return ''; }
}
export function resolvePublicKey(privateKey, envPublic, baked) {
  const derived = derivePublicKey(privateKey);
  if (derived) {
    if (envPublic && envPublic !== derived) {
      console.error('[webpush] VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY; serving the key derived from the private key. Fix the env value.');
    }
    return derived;
  }
  return envPublic || baked || '';
}
export const VAPID_PUBLIC_KEY = resolvePublicKey(VAPID_PRIVATE_KEY, process.env.VAPID_PUBLIC_KEY || '', BAKED_PUBLIC_KEY);
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@itsdebatable.com';

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
  // recipients: users we tried. sent: devices the push service accepted.
  // delivered: users with at least one accepted device, which is the
  // number a waiting person can be told without overstating it.
  let sent = 0, recipients = 0, delivered = 0;
  async function worker() {
    while (queue.length) {
      const uid = queue.shift();
      const r = await sendToUser(uid, payload);
      if (r && r.sent) { sent += r.sent; delivered++; }
      recipients++;
    }
  }
  const n = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(Array.from({ length: n }, worker));
  return { recipients, sent, delivered, configured: true };
}

// Send a notification to every device the user has subscribed — Web Push
// (browser/PWA) AND native FCM (the iOS/Android app) in parallel. Prunes dead
// endpoints/tokens. Never throws — push is best-effort, it must never fail the
// caller (e.g. the matchmaker).
export async function sendToUser(uid, payload) {
  if (!uid) return { sent: 0 };
  const [web, native] = await Promise.all([sendWebPush(uid, payload), sendUserNativeSafe(uid, payload)]);
  return { sent: (web.sent || 0) + (native.sent || 0), web, native };
}

async function sendUserNativeSafe(uid, payload) {
  try { return await sendToUserNative(uid, payload); } catch (e) { return { sent: 0, error: true }; }
}

async function sendWebPush(uid, payload) {
  try {
    if (!pushConfigured()) return { sent: 0, configured: false };
    ensureVapid();
    const snap = await subsCol(uid).get();
    if (snap.empty) return { sent: 0, subs: 0 };
    const body = JSON.stringify(payload || {});
    let sent = 0, rejected = 0;
    await Promise.all(snap.docs.map(async (d) => {
      const s = d.data();
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 1800 });
        sent++;
      } catch (e) {
        const code = e && e.statusCode;
        if (code === 404 || code === 410) await d.ref.delete().catch(() => {});
        // 401/403 is the push service refusing OUR signature: the device
        // subscribed against a different application server key. The
        // client re-subscribes on its next visit (notifications.js compares
        // keys), so the row is left for it to replace, but it is counted
        // and logged: a silent 403 is how this stayed broken for months.
        else if (code === 401 || code === 403) rejected++;
      }
    }));
    if (rejected) console.warn('[webpush] ' + rejected + ' of ' + snap.size + ' sends rejected the VAPID signature (401/403) for uid ' + uid + '; those devices need to re-subscribe');
    return { sent, subs: snap.size, rejected };
  } catch (e) {
    return { sent: 0, error: true };
  }
}
