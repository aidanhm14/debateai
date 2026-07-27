// Video-room safety: reports, machine flags, strikes, bans, ejection.
//
// The client-side layer (app/js/nsfw-guard.js) runs an on-device NSFW
// classifier over the debater's OWN outgoing camera feed and cuts the
// video before anything explicit reaches the room. Only score numbers
// ever reach this endpoint — no frames, no images. Peers can also file
// manual reports (explicit / not serious / harassment / other).
//
// Actions (POST JSON):
//   { action:'self_flag', room, sessionId?, scores:{porn,sexy,hentai,neutral,drawing} }
//       The caller's own client tripped the detector. Always a strike
//       (machine-corroborated, from the offender's own device+IP).
//       Server ejects the session from Daily as belt-and-braces.
//   { action:'report', room, category, offender:{sessionId?, userName?}, sessionId?, note? }
//       Peer report. category 'nsfw' ejects immediately; behavior
//       categories ('not_serious'|'harassment'|'other') eject at 2+
//       distinct reporters within 15 min. Strikes only land when the
//       offender's identity is attributed (they joined with a meeting
//       token minted by create-daily-room, so presence.userId is set)
//       AND 2+ distinct reporters agree — a single angry opponent can
//       eject-from-room but can never ban.
//   { action:'check' }
//       → { banned, until, reason } for the caller's identity.
//
// Identity = Firebase uid when an Authorization bearer token verifies
// (named or anonymous auth), else a salted hash of the caller IP. Bans
// escalate by strike count in the last 30 days: 24h → 7d → 30d.
//
// Firestore (admin SDK only — firestore.rules default-denies clients):
//   video_reports/{auto}  evidence log (also feeds /admin review later)
//   video_strikes/{auto}  one per confirmed violation
//   video_bans/{key}      key = 'uid:<uid>' | 'ip:<hash>'; { until, reason }

import { getDb, FieldValue, withDeadline } from './lib/firestore.mjs';
import { verifyIdToken } from './lib/auth.mjs';
import { jsonResponse, corsResponse } from './lib/response.mjs';

const DAILY_API = 'https://api.daily.co/v1';
const REPORT_WINDOW_MS = 15 * 60 * 1000;
const STRIKE_WINDOW_MS = 30 * 24 * 3600 * 1000;
const BAN_LADDER_MS = [24 * 3600e3, 7 * 24 * 3600e3, 30 * 24 * 3600e3];

// Best-effort per-instance rate limit (same posture as ANON_LAYERS in
// claude.mjs: an abuse throttle, not a security boundary).
const rl = new Map();
function limited(key, max) {
  const now = Date.now();
  const rec = rl.get(key) || { n: 0, reset: now + 3600e3 };
  if (now > rec.reset) { rec.n = 0; rec.reset = now + 3600e3; }
  rec.n++;
  rl.set(key, rec);
  return rec.n > max;
}

async function sha16(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

function clientIp(req) {
  return req.headers.get('x-nf-client-connection-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '0.0.0.0';
}

// Resolve caller identity: prefer verified Firebase uid, fall back to
// salted IP hash. Never throws.
async function identify(req) {
  const ip = clientIp(req);
  const ipKey = 'ip:' + await sha16((process.env.MOD_IP_SALT || 'debatable-mod-1') + ip);
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (m) {
    try {
      const payload = await verifyIdToken(m[1]);
      return { key: 'uid:' + payload.sub, uid: payload.sub, ipKey };
    } catch (e) { /* tokenless flows (casual-room) are expected */ }
  }
  return { key: ipKey, uid: null, ipKey };
}

function safeRoom(s) { return String(s || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80); }

async function dailyFetch(path, opts) {
  const key = process.env.DAILY_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(DAILY_API + path, {
      ...opts,
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', ...(opts && opts.headers) },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// Eject from the live Daily session. ids = session ids; userIds ride
// with ban:true so token-attributed identities can't rejoin the room
// at Daily's layer either.
async function eject(room, ids, userIds) {
  const body = {};
  if (ids && ids.length) body.ids = ids.slice(0, 10);
  if (userIds && userIds.length) { body.user_ids = userIds.slice(0, 10); body.ban = true; }
  if (!body.ids && !body.user_ids) return false;
  const res = await dailyFetch('/rooms/' + encodeURIComponent(room) + '/eject', {
    method: 'POST', body: JSON.stringify(body),
  });
  return !!res;
}

// Find the offender in live presence. Match by session id first, then
// exact userName, then "the only participant that isn't the reporter"
// (the casual 1v1 case).
async function resolveOffender(room, offender, reporterSessionId) {
  const pres = await dailyFetch('/rooms/' + encodeURIComponent(room) + '/presence', { method: 'GET' });
  const list = (pres && pres.data) || [];
  const off = offender || {};
  let hit = null;
  if (off.sessionId) hit = list.find(p => p.id === off.sessionId) || { id: off.sessionId };
  if (!hit && off.userName) hit = list.find(p => (p.userName || '') === off.userName);
  if (!hit && reporterSessionId) {
    const others = list.filter(p => p.id !== reporterSessionId);
    if (others.length === 1) hit = others[0];
  }
  return hit; // { id, userId?, userName? } | null
}

async function activeBan(db, keys) {
  const reads = keys.filter(Boolean).map(k =>
    db.collection('video_bans').doc(k).get().then(d => (d.exists ? d.data() : null), () => null));
  const docs = await withDeadline(Promise.all(reads), 2500).catch(() => []);
  const now = Date.now();
  for (const b of docs || []) {
    if (b && b.until && b.until > now) return b;
  }
  return null;
}

// One confirmed violation → strike → recompute the ban ladder for that
// identity. Returns the ban record written (or null).
async function strike(db, keys, meta) {
  const now = Date.now();
  await db.collection('video_strikes').add({
    keys, ...meta, at: now, createdAt: FieldValue.serverTimestamp(),
  }).catch(() => {});
  let count = 1;
  try {
    const q = await withDeadline(
      db.collection('video_strikes')
        .where('keys', 'array-contains-any', keys.slice(0, 10))
        .where('at', '>', now - STRIKE_WINDOW_MS)
        .get(), 3000);
    count = Math.max(1, q.size);
  } catch (e) { /* quota-blown days: treat as first strike */ }
  const dur = BAN_LADDER_MS[Math.min(count - 1, BAN_LADDER_MS.length - 1)];
  const ban = { until: now + dur, strikes: count, reason: meta.reason || 'violation', updatedAt: FieldValue.serverTimestamp() };
  await Promise.all(keys.filter(Boolean).map(k =>
    db.collection('video_bans').doc(k).set(ban, { merge: true }).catch(() => {})));
  return ban;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, req);

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400, req); }
  const action = String(body.action || '');
  const who = await identify(req);

  let db = null;
  try { db = getDb(); } catch (e) { /* fail-open below */ }

  // ── check ─────────────────────────────────────────────────────────
  if (action === 'check') {
    if (!db) return jsonResponse({ banned: false }, 200, req);
    const ban = await activeBan(db, [who.key, who.ipKey]);
    return jsonResponse(ban
      ? { banned: true, until: ban.until, reason: ban.reason || 'violation' }
      : { banned: false }, 200, req);
  }

  const room = safeRoom(body.room);
  if (!room || room.length < 3) return jsonResponse({ error: 'room required' }, 400, req);

  // ── self_flag: the caller's own detector tripped ──────────────────
  if (action === 'self_flag') {
    if (limited('sf:' + who.ipKey, 4)) return jsonResponse({ error: 'rate limited' }, 429, req);
    const scores = body.scores && typeof body.scores === 'object' ? body.scores : {};
    const keys = who.uid ? [who.key, who.ipKey] : [who.ipKey];
    let ban = null;
    if (db) {
      await db.collection('video_reports').add({
        kind: 'self_flag', room, roundId: String(body.roundId || '').slice(0, 120),
        offenderKeys: keys, scores, action: 'ejected',
        createdAt: FieldValue.serverTimestamp(), at: Date.now(),
      }).catch(() => {});
      ban = await strike(db, keys, { reason: 'nsfw_auto', room, scores });
    }
    // The client already cut its own video and leaves the call; the
    // eject makes it stick even if that client is tampered with.
    const ids = body.sessionId ? [String(body.sessionId).slice(0, 80)] : [];
    const userIds = who.uid ? [who.uid] : [who.ipKey];
    await eject(room, ids, userIds).catch(() => {});
    return jsonResponse({ ok: true, removed: true, banned: !!ban, until: ban ? ban.until : 0 }, 200, req);
  }

  // ── report: a peer filed a report ─────────────────────────────────
  if (action === 'report') {
    if (limited('rp:' + who.ipKey, 8)) return jsonResponse({ error: 'rate limited' }, 429, req);
    const cats = ['nsfw', 'not_serious', 'harassment', 'other'];
    const category = cats.includes(body.category) ? body.category : 'other';
    const offender = body.offender && typeof body.offender === 'object' ? body.offender : {};
    const reporterSessionId = body.sessionId ? String(body.sessionId).slice(0, 80) : '';

    const hit = await resolveOffender(room, {
      sessionId: offender.sessionId ? String(offender.sessionId).slice(0, 80) : '',
      userName: offender.userName ? String(offender.userName).slice(0, 80) : '',
    }, reporterSessionId);
    const offKey = hit && hit.userId ? (hit.userId.indexOf('ip:') === 0 ? hit.userId : 'uid:' + hit.userId) : null;

    // Count distinct reporters for this room+offender inside the window.
    let distinct = 1;
    if (db) {
      await db.collection('video_reports').add({
        kind: 'report', room, roundId: String(body.roundId || '').slice(0, 120), category,
        offenderKeys: offKey ? [offKey] : [], offenderName: (hit && hit.userName) || offender.userName || '',
        offenderSession: (hit && hit.id) || '', reporterKey: who.key,
        note: String(body.note || '').slice(0, 400),
        createdAt: FieldValue.serverTimestamp(), at: Date.now(),
      }).catch(() => {});
      try {
        const q = await withDeadline(
          db.collection('video_reports')
            .where('room', '==', room)
            .where('at', '>', Date.now() - REPORT_WINDOW_MS)
            .get(), 3000);
        const reporters = new Set();
        q.forEach(d => {
          const r = d.data();
          if (r.kind !== 'report') return;
          // same target: match on session, key, or name — whichever exists
          const sameTarget =
            (hit && r.offenderSession && r.offenderSession === hit.id) ||
            (offKey && (r.offenderKeys || []).includes(offKey)) ||
            (!hit && r.offenderName && r.offenderName === (offender.userName || ''));
          if (sameTarget) reporters.add(r.reporterKey);
        });
        reporters.add(who.key);
        distinct = reporters.size;
      } catch (e) { /* keep distinct = 1 */ }
    }

    const shouldEject = category === 'nsfw' || distinct >= 2;
    let ejected = false;
    if (shouldEject && hit) {
      ejected = await eject(room, hit.id ? [hit.id] : [], offKey ? [offKey.replace(/^uid:/, '')] : []).catch(() => false);
    }
    // Strikes need identity attribution + corroboration.
    let struck = false;
    if (db && offKey && distinct >= 2) {
      await strike(db, [offKey], { reason: 'peer_' + category, room });
      struck = true;
    }
    return jsonResponse({ ok: true, ejected, struck, reports: distinct }, 200, req);
  }

  return jsonResponse({ error: 'unknown action' }, 400, req);
};

export const config = { path: '/api/video-moderate' };
