// "Go live" broadcast. Called when a debater becomes available for a live
// round (the background-spar "Available" toggle, or the /spar queue join).
// Records lightweight presence in live_now/{uid} and fans a Web Push out to
// every user who opted into live-round alerts (notify_prefs.liveAlerts), so
// they get pinged even while they're in another app — the whole point.
//
// Guards against spam:
//   - Per-broadcaster cooldown (BROADCAST_COOLDOWN_MS): flipping Available
//     on/off, requeues, and the client heartbeat can't re-blast the pool.
//   - The notification text is SERVER-CONSTRUCTED, never caller-supplied, so
//     there's no phishing/spoofing vector.
//   - No-ops cleanly when push isn't configured (VAPID unset).
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { sendToManyUsers, pushConfigured } from './lib/webpush.mjs';

const VALID_FORMATS = ['quick', 'apda', 'bp', 'worlds', 'asian', 'ld', 'pf', 'policy', 'casual'];
const FORMAT_LABEL = {
  quick: 'Quick Clash', apda: 'APDA', bp: 'BP', worlds: 'Worlds', asian: 'Asian Parli',
  ld: 'LD', pf: 'PF', policy: 'Policy', casual: 'a casual round',
};
const BROADCAST_COOLDOWN_MS = 10 * 60 * 1000; // one broadcast per debater per 10 min
const MAX_RECIPIENTS = 500;                    // hard cap on a single fan-out

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); } catch (e) { return errorResponse('Invalid token', 401, request); }
  const uid = decoded.sub;

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  let format = String((body && body.format) || 'apda').toLowerCase();
  if (VALID_FORMATS.indexOf(format) < 0) format = 'apda';
  const name = String((decoded.name || '').split(/\s+/)[0] || 'A debater').slice(0, 40);

  const db = getDb();
  const liveRef = db.collection('live_now').doc(uid);

  // Cooldown: only broadcast if this debater hasn't already pinged the pool
  // recently. Presence is always refreshed regardless.
  let canBroadcast = true;
  try {
    const prev = await liveRef.get();
    if (prev.exists) {
      const last = prev.data() && prev.data().lastBroadcastAt;
      const lastMs = last && last.toMillis ? last.toMillis() : 0;
      if (lastMs && (Date.now() - lastMs) < BROADCAST_COOLDOWN_MS) canBroadcast = false;
    }
  } catch (e) {}

  const presence = {
    uid,
    displayName: name,
    format,
    mode: String((body && body.mode) || 'spar').slice(0, 24),
    startedAt: FieldValue.serverTimestamp(),
  };
  if (canBroadcast) presence.lastBroadcastAt = FieldValue.serverTimestamp();
  await liveRef.set(presence, { merge: true }).catch(() => {});

  if (!canBroadcast) return jsonResponse({ ok: true, broadcast: false, reason: 'cooldown' }, 200, request);
  if (!pushConfigured()) return jsonResponse({ ok: true, broadcast: false, configured: false }, 200, request);

  // Recipients: everyone opted into live alerts, minus the broadcaster,
  // minus anyone whose format filter excludes this round.
  let targets = [];
  try {
    const snap = await db.collection('notify_prefs').where('liveAlerts', '==', true).limit(MAX_RECIPIENTS).get();
    snap.forEach((d) => {
      if (d.id === uid) return;
      const f = d.data() && d.data().formats;
      if (Array.isArray(f) && f.length && f.indexOf(format) < 0) return; // filtered out
      targets.push(d.id);
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: 'query_failed' }, 200, request);
  }

  if (!targets.length) return jsonResponse({ ok: true, broadcast: true, recipients: 0, sent: 0 }, 200, request);

  const payload = {
    title: name + ' is live on DebateIt',
    body: 'Looking for a ' + (FORMAT_LABEL[format] || format) + ' round. Tap to jump in.',
    url: '/spar?from=live-alert',
    tag: 'da-live-' + uid,
  };
  const r = await sendToManyUsers(targets, payload);
  return jsonResponse({ ok: true, broadcast: true, ...r }, 200, request);
};
