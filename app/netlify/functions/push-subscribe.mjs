// Store / remove a device's push registration for the signed-in user.
// Handles BOTH a browser Web Push subscription (body.subscription) and a native
// app FCM token (body.nativeToken + platform). GET returns the VAPID public key
// + whether push is configured server-side, so the client knows whether to
// subscribe at all.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { saveSubscription, deleteSubscription, VAPID_PUBLIC_KEY, pushConfigured } from './lib/webpush.mjs';
import { saveNativeToken, deleteNativeToken } from './lib/native-push.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  if (request.method === 'GET') {
    return jsonResponse({ publicKey: VAPID_PUBLIC_KEY, configured: pushConfigured() }, 200, request);
  }
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return errorResponse('Method not allowed', 405, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); } catch (e) { return errorResponse('Invalid token', 401, request); }
  const uid = decoded.sub;

  let body;
  try { body = await request.json(); } catch (e) { return errorResponse('Bad JSON', 400, request); }

  if (request.method === 'DELETE') {
    if (body && body.endpoint) await deleteSubscription(uid, body.endpoint);
    if (body && body.nativeToken) await deleteNativeToken(uid, body.nativeToken);
    return jsonResponse({ ok: true }, 200, request);
  }

  // Native app (Capacitor) registers an FCM token instead of a Web Push sub.
  if (body && body.nativeToken) {
    await saveNativeToken(uid, body.nativeToken, body.platform);
    return jsonResponse({ ok: true, native: true }, 200, request);
  }

  const sub = body && body.subscription;
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return errorResponse('Missing subscription', 400, request);
  }
  await saveSubscription(uid, { endpoint: sub.endpoint, keys: sub.keys, ua: body.ua });
  return jsonResponse({ ok: true }, 200, request);
};
