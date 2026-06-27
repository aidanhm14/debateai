// Firebase Cloud Messaging (HTTP v1) sender — for NATIVE app pushes.
//
// Web browsers/PWAs use VAPID Web Push (lib/webpush.mjs). A native iOS/Android
// Capacitor app can't use Web Push (WKWebView has no Push API), so it registers
// an FCM token instead and we deliver through FCM here. Reuses the SAME Firebase
// service account that powers Firestore (no new secret), minting a short-lived
// OAuth token via google-auth-library. Dormant + no-op until creds resolve, so
// nothing throws before the project is configured.
import { JWT } from 'google-auth-library';
import {
  PROJECT_ID as BAKED_PROJECT_ID,
  CLIENT_EMAIL as BAKED_CLIENT_EMAIL,
  PRIVATE_KEY_B64 as BAKED_PRIVATE_KEY_B64,
} from './_firestore-creds.mjs';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

// Resolve the service account the same way firestore.mjs does: build-baked
// creds first, then split env vars, then the legacy JSON blob.
function getServiceAccount() {
  if (BAKED_PROJECT_ID && BAKED_CLIENT_EMAIL && BAKED_PRIVATE_KEY_B64) {
    return {
      projectId: BAKED_PROJECT_ID,
      clientEmail: BAKED_CLIENT_EMAIL,
      privateKey: Buffer.from(BAKED_PRIVATE_KEY_B64, 'base64').toString('utf-8'),
    };
  }
  const p = process.env.GOOGLE_PROJECT_ID, c = process.env.GOOGLE_CLIENT_EMAIL, k = process.env.GOOGLE_PRIVATE_KEY;
  if (p && c && k) return { projectId: p, clientEmail: c, privateKey: k.replace(/\\n/g, '\n') };
  const blob = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (blob) {
    try {
      const j = JSON.parse(blob);
      if (j.project_id && j.client_email && j.private_key) {
        return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
      }
    } catch (e) {}
  }
  return null;
}

export function fcmConfigured() { return !!getServiceAccount(); }

let _jwt = null, _projectId = null;
async function getAccessToken() {
  const sa = getServiceAccount();
  if (!sa) return null;
  _projectId = sa.projectId;
  if (!_jwt) _jwt = new JWT({ email: sa.clientEmail, key: sa.privateKey, scopes: [FCM_SCOPE] });
  const { access_token } = await _jwt.authorize(); // cached + auto-refreshed by the client
  return access_token;
}

// Send one notification to many FCM tokens. Returns { sent, dead } where `dead`
// is the list of tokens FCM rejected as unregistered, so the caller can prune
// them. Best-effort, never throws.
export async function sendToFcmTokens(tokens, payload) {
  const out = { sent: 0, dead: [], configured: fcmConfigured() };
  try {
    if (!Array.isArray(tokens) || !tokens.length || !fcmConfigured()) return out;
    const accessToken = await getAccessToken();
    if (!accessToken) return out;
    const url = 'https://fcm.googleapis.com/v1/projects/' + _projectId + '/messages:send';
    const p = payload || {};
    await Promise.all(tokens.map(async (token) => {
      const message = {
        token,
        notification: { title: p.title || 'DebateIt', body: p.body || '' },
        data: { url: String(p.url || '/'), tag: String(p.tag || 'da-push') },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
          fcmOptions: {},
        },
        android: { notification: { sound: 'default' }, priority: 'high' },
      };
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        if (r.ok) { out.sent++; return; }
        // UNREGISTERED / invalid token → prune. Other errors are transient.
        if (r.status === 404 || r.status === 400) {
          let body = '';
          try { body = await r.text(); } catch (e) {}
          if (/UNREGISTERED|INVALID_ARGUMENT|registration-token-not-registered/i.test(body)) out.dead.push(token);
        }
      } catch (e) { /* transient; leave token in place */ }
    }));
    return out;
  } catch (e) {
    return out;
  }
}
