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
import { sendSmsToManyUsers, smsConfigured } from './lib/sms.mjs';

// SMS costs real money per message and lands on a handset, so the text lane
// is capped far below the push lane and drawn from its own opt-in. A push
// fan-out to 500 people is free and forgettable; a text fan-out to 500
// people is a bill and, if it is the third one today, a reason to leave.
// The per-user daily ceilings in lib/sms.mjs bound it a second time.
const MAX_SMS_RECIPIENTS = 60;

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
  // Either lane being live is enough to be worth broadcasting. Gating the
  // whole thing on push alone would have made the text lane dead on arrival
  // in exactly the configuration we expect first: SMS keys set, VAPID not.
  if (!pushConfigured() && !smsConfigured()) {
    return jsonResponse({ ok: true, broadcast: false, configured: false }, 200, request);
  }

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

  // The text lane draws its OWN recipient list rather than reusing the push
  // targets. Wanting a browser notification and wanting a text message are
  // different asks, and the phone record's kinds.live is where the second
  // one is expressed. Two equality filters, which Firestore serves off its
  // automatic single-field indexes; optedOut is filtered in memory so no
  // composite index has to be deployed for this to work.
  let smsTargets = [];
  if (smsConfigured()) {
    try {
      const snap = await db.collection('phone_numbers')
        .where('verified', '==', true)
        .where('kinds.live', '==', true)
        .limit(MAX_SMS_RECIPIENTS * 2)
        .get();
      snap.forEach((d) => {
        if (d.id === uid) return;
        const p = d.data() || {};
        if (p.optedOut) return;
        smsTargets.push(d.id);
      });
      smsTargets = smsTargets.slice(0, MAX_SMS_RECIPIENTS);
    } catch (e) {
      console.warn('[go-live] sms target query failed', e && e.message);
    }
  }

  if (!targets.length && !smsTargets.length) {
    return jsonResponse({ ok: true, broadcast: true, recipients: 0, sent: 0 }, 200, request);
  }

  const payload = {
    title: name + ' is live on Debatable',
    body: 'Looking for a ' + (FORMAT_LABEL[format] || format) + ' round. Tap to jump in.',
    url: '/spar?from=live-alert',
    // Guests share one tag so back-to-back guest broadcasts replace the
    // notification instead of stacking (sw.js sets renotify:true, so a
    // replaced notification still alerts).
    tag: named ? 'da-live-' + uid : 'da-live-guest',
  };
  // Both lanes concurrently: the caller is a debater standing in a queue
  // waiting for this to return, so the wall clock is the slower lane rather
  // than the sum. Neither can throw; both report their own tally.
  const [r, smsR] = await Promise.all([
    targets.length ? sendToManyUsers(targets, payload) : Promise.resolve({ recipients: 0, sent: 0 }),
    smsTargets.length
      ? sendSmsToManyUsers(smsTargets, {
        kind: 'live',
        // Server-constructed, same as the push text. Deliberately short: a
        // text is read on a lock screen, and the link is the whole point.
        body: `${name} is live on Debatable looking for a ${FORMAT_LABEL[format] || format} round. https://itsdebatable.com/spar?from=sms\n\nReply STOP to stop.`,
      })
      : Promise.resolve({ recipients: 0, sent: 0 }),
  ]);
  return jsonResponse({
    ok: true,
    broadcast: true,
    ...r,
    // Surfaced so /spar can honestly say how many people were reached
    // across both lanes rather than undercounting to the push number.
    sms: { recipients: smsR.recipients || 0, sent: smsR.sent || 0 },
    reached: (r.sent || 0) + (smsR.sent || 0),
  }, 200, request);
};
