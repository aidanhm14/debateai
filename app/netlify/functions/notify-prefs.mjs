// Store / read a signed-in user's "live round" notification preference.
//
// Separate from the per-device push subscription (push-subscribe.mjs): a
// device can be subscribed for DMs without wanting a ping every time some
// random debater goes live. This is the explicit opt-in for the go-live
// broadcast — `liveAlerts` plus an optional `formats` filter (empty = all
// formats). Written here, read by go-live.mjs when it fans out.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';

const VALID_FORMATS = ['quick', 'apda', 'bp', 'worlds', 'asian', 'ld', 'pf', 'policy', 'casual'];

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse('Method not allowed', 405, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); } catch (e) { return errorResponse('Invalid token', 401, request); }
  const uid = decoded.sub;
  const db = getDb();
  const ref = db.collection('notify_prefs').doc(uid);

  if (request.method === 'GET') {
    const snap = await ref.get();
    const d = snap.exists ? snap.data() : {};
    return jsonResponse({ liveAlerts: !!(d && d.liveAlerts), formats: (d && d.formats) || [] }, 200, request);
  }

  let body;
  try { body = await request.json(); } catch (e) { return errorResponse('Bad JSON', 400, request); }
  const liveAlerts = !!(body && body.liveAlerts);
  let formats = Array.isArray(body && body.formats) ? body.formats : [];
  formats = formats.filter((f) => VALID_FORMATS.indexOf(String(f).toLowerCase()) >= 0).slice(0, 12);

  await ref.set({
    uid,
    liveAlerts,
    formats,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return jsonResponse({ ok: true, liveAlerts, formats }, 200, request);
};
