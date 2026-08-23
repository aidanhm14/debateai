// Store / read a signed-in user's notification preferences.
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
    return jsonResponse({
      liveAlerts: !!(d && d.liveAlerts),
      formats: (d && d.formats) || [],
      mutedThreads: (d && d.mutedThreads) || [],
    }, 200, request);
  }

  let body;
  try { body = await request.json(); } catch (e) { return errorResponse('Bad JSON', 400, request); }

  // Mute is its own single-thread write, on purpose. Sending the whole
  // list back would let a stale tab on one device resurrect a mute the
  // user just cleared on another.
  const muteThread = typeof (body && body.muteThread) === 'string' ? body.muteThread.slice(0, 128) : '';
  if (muteThread) {
    await ref.set({
      uid,
      mutedThreads: body.muted ? FieldValue.arrayUnion(muteThread) : FieldValue.arrayRemove(muteThread),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return jsonResponse({ ok: true, muteThread, muted: !!body.muted }, 200, request);
  }

  // Partial by key: a caller that only sends liveAlerts must not clear a
  // preference it never mentioned.
  const patch = { uid, updatedAt: FieldValue.serverTimestamp() };
  if (body && 'liveAlerts' in body) patch.liveAlerts = !!body.liveAlerts;
  if (body && Array.isArray(body.formats)) {
    patch.formats = body.formats.filter((f) => VALID_FORMATS.indexOf(String(f).toLowerCase()) >= 0).slice(0, 12);
  }
  await ref.set(patch, { merge: true });

  return jsonResponse({
    ok: true,
    liveAlerts: patch.liveAlerts !== undefined ? patch.liveAlerts : undefined,
    formats: patch.formats || undefined,
  }, 200, request);
};
