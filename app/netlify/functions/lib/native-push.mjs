// Native (FCM) push token registry + per-user native send.
//
// Parallels the Web Push subscription store in webpush.mjs, but for native
// app FCM tokens. Tokens live under push_subscriptions/{uid}/native/{hash}
// so a single user's web + native devices sit side by side. sendToUser()
// (webpush.mjs) calls sendToUserNative() so every push — DM or go-live —
// reaches the native app too, with zero extra work at the call sites.
import { createHash } from 'crypto';
import { getDb, FieldValue } from './firestore.mjs';
import { sendToFcmTokens, fcmConfigured } from './fcm.mjs';

function tokDocId(token) { return createHash('sha256').update(String(token)).digest('hex').slice(0, 40); }
function nativeCol(uid) { return getDb().collection('push_subscriptions').doc(uid).collection('native'); }

export async function saveNativeToken(uid, token, platform) {
  if (!uid || !token) return;
  await nativeCol(uid).doc(tokDocId(token)).set({
    token: String(token),
    platform: String(platform || 'ios').slice(0, 12),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function deleteNativeToken(uid, token) {
  if (!uid || !token) return;
  await nativeCol(uid).doc(tokDocId(token)).delete().catch(() => {});
}

// Deliver to every native device the user has registered, pruning any tokens
// FCM reports as unregistered. Best-effort; never throws.
export async function sendToUserNative(uid, payload) {
  try {
    if (!uid || !fcmConfigured()) return { sent: 0, configured: fcmConfigured() };
    const snap = await nativeCol(uid).get();
    if (snap.empty) return { sent: 0, tokens: 0 };
    const byToken = new Map();
    snap.docs.forEach((d) => { const t = d.data() && d.data().token; if (t) byToken.set(t, d.ref); });
    const tokens = Array.from(byToken.keys());
    const r = await sendToFcmTokens(tokens, payload);
    await Promise.all((r.dead || []).map((t) => { const ref = byToken.get(t); return ref ? ref.delete().catch(() => {}) : null; }));
    return { sent: r.sent, tokens: tokens.length };
  } catch (e) {
    return { sent: 0, error: true };
  }
}
