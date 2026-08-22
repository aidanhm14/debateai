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
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { sendToManyUsers, pushConfigured } from './lib/webpush.mjs';

const VALID_FORMATS = ['quick', 'apda', 'bp', 'worlds', 'asian', 'ld', 'pf', 'policy', 'congress', 'casual'];
const FORMAT_LABEL = {
  quick: 'General', apda: 'APDA', bp: 'BP', worlds: 'Worlds', asian: 'Asian Parli',
  ld: 'LD', pf: 'PF', policy: 'Policy', congress: 'Congress', casual: 'a casual round',
};
const BROADCAST_COOLDOWN_MS = 10 * 60 * 1000; // one broadcast per debater per 10 min
// Guests broadcast too (2026-08-22): most queue joiners are anonymous, and a
// broadcast only named accounts can fire almost never fires. But anonymous
// uids are free and unlimited to mint, so a per-uid cooldown alone would be
// no cooldown at all — anonymous broadcasts share ONE global gate on top of
// the per-uid one, bounding worst-case spam to a pool member at 12/hour no
// matter how many guest accounts exist.
const ANON_GLOBAL_COOLDOWN_MS = 5 * 60 * 1000;
const ANON_META_DOC = '_anon_broadcast_meta';  // live_now/{doc} — gate, not presence
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
  let format = String((body && body.format) || 'quick').toLowerCase();
  if (VALID_FORMATS.indexOf(format) < 0) format = 'quick';
  const named = isNamedAccount(decoded);
  // The notification text is server-constructed, and for a guest the name is
  // too — a client-supplied name here would be a phishing surface.
  const name = named
    ? String((decoded.name || '').split(/\s+/)[0] || 'A debater').slice(0, 40)
    : 'Someone';

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

  // Anonymous callers additionally share one global gate (see the constant's
  // comment). A transaction so two guests joining in the same second cannot
  // both claim the slot.
  if (canBroadcast && !named) {
    try {
      const metaRef = db.collection('live_now').doc(ANON_META_DOC);
      canBroadcast = await db.runTransaction(async (tx) => {
        const snap = await tx.get(metaRef);
        const last = snap.exists && snap.data() && snap.data().lastAnonBroadcastAt;
        const lastMs = last && last.toMillis ? last.toMillis() : 0;
        if (lastMs && (Date.now() - lastMs) < ANON_GLOBAL_COOLDOWN_MS) return false;
        tx.set(metaRef, { lastAnonBroadcastAt: FieldValue.serverTimestamp() }, { merge: true });
        return true;
      });
    } catch (e) { canBroadcast = false; } // fail closed: no gate read, no guest blast
  }

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
    title: name + ' is live on Debatable',
    body: 'Looking for a ' + (FORMAT_LABEL[format] || format) + ' round. Tap to jump in.',
    url: '/spar?from=live-alert',
    // Guests share one tag so back-to-back guest broadcasts replace the
    // notification instead of stacking (sw.js sets renotify:true, so a
    // replaced notification still alerts).
    tag: named ? 'da-live-' + uid : 'da-live-guest',
  };
  const r = await sendToManyUsers(targets, payload);
  return jsonResponse({ ok: true, broadcast: true, ...r }, 200, request);
};
