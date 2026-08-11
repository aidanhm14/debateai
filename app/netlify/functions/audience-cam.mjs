// /api/audience-cam — mints a video-only Daily meeting token so a
// verified spectator can appear ON CAMERA in a live round while their
// mic stays impossible to open.
//
//   GET  → { siteKey }            Turnstile site key (null when unset)
//   POST { room, turnstileToken } + Authorization: Bearer <firebase idToken>
//        → { token, name }        Daily meeting token, video-send only
//        → 401 named sign-in required · 403 banned/round disallows
//        → 409 audience cam slots full · 429 rate limited
//
// Why the gate is layered the way it is (anti-creep posture):
//   1. NAMED account required — anonymous Firebase accounts are free to
//      mint (see the 2026-07-28 rate-limit entry), so an anonymous
//      camera would be an unaccountable camera. sign_in_provider must
//      not be 'anonymous'.
//   2. Cloudflare Turnstile when configured (TURNSTILE_SITE_KEY +
//      TURNSTILE_SECRET_KEY env). Without keys the layer is skipped —
//      the named-account, ban, and rate layers still hold, and the
//      keys can be added later with zero redeploy.
//   3. video_bans — same identity derivation as create-daily-room, so
//      a strike earned anywhere in the video system blocks the camera
//      here too.
//   4. The token itself: permissions.canSend = ['video'] is enforced by
//      Daily's media server, not our UI. A hostile client with this
//      token cannot publish audio no matter what it runs.
//   5. The on-device NSFW watchdog (nsfw-guard.js) runs client-side on
//      the outgoing feed, same as debater cameras.
//
// Cap: MAX_CAMS concurrent camera spectators per round, counted from
// fresh `camAt` heartbeats on the watchers subcollection (the same
// 75s liveness window the watch count uses). Keeps 2 debaters + 4
// cams inside the room's max_participants of 8.
//
// The debaters hold a kill switch: allowAudienceCams:false on the
// round doc refuses new tokens, and live camera spectators shut off
// client-side when the flag flips.

import { getDb, withDeadline } from './lib/firestore.mjs';
import { verifyIdToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';

const DAILY_API = 'https://api.daily.co/v1';
const MAX_CAMS = 4;
const FRESH_MS = 75 * 1000;          // matches the watch-count window
const TOKEN_TTL_SEC = 2 * 3600;

function safeRoomName(s) {
  return String(s || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
}

async function sha16(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

// Same salted-IP derivation as create-daily-room / video-moderate.
async function ipKeyOf(request) {
  const ip = callerIp(request);
  return 'ip:' + await sha16((process.env.MOD_IP_SALT || 'debatable-mod-1') + ip);
}

async function banFor(db, keys) {
  try {
    const reads = keys.filter(Boolean).map(k =>
      db.collection('video_bans').doc(k).get().then(d => (d.exists ? d.data() : null), () => null));
    const docs = await withDeadline(Promise.all(reads), 2000);
    const now = Date.now();
    for (const b of docs || []) if (b && b.until && b.until > now) return b;
  } catch (e) { /* fail open, same posture as create-daily-room */ }
  return null;
}

async function verifyTurnstile(token, request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false };
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: callerIp(request) }),
    });
    const j = await res.json();
    return { ok: !!j.success };
  } catch (e) {
    // Cloudflare unreachable must not take the feature down; the other
    // layers (named auth, bans, rate, NSFW guard) still hold.
    console.warn('[audience-cam] turnstile verify failed open:', e.message);
    return { ok: true, skipped: true };
  }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  if (request.method === 'GET') {
    return jsonResponse({
      siteKey: process.env.TURNSTILE_SITE_KEY || null,
      enabled: !!process.env.DAILY_API_KEY,
      maxCams: MAX_CAMS,
    }, 200, request);
  }

  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const apiKey = process.env.DAILY_API_KEY;
  const domain = process.env.DAILY_DOMAIN;
  if (!apiKey || !domain) return errorResponse('Video is not configured', 503, request);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400, request); }
  const room = safeRoomName(body && body.room);
  if (!room || room.length < 3) return errorResponse('room required', 400, request);

  // 1. Named account only.
  const m = (request.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!m) return errorResponse('Sign in to join on camera', 401, request);
  let payload;
  try { payload = await verifyIdToken(m[1]); }
  catch (e) { return errorResponse('Sign in to join on camera', 401, request); }
  const provider = payload.firebase && payload.firebase.sign_in_provider;
  if (!provider || provider === 'anonymous') {
    return jsonResponse({ error: 'Camera spectating needs a named account. Sign in with Google or email first.', needNamed: true }, 401, request);
  }
  const uid = payload.sub;

  // 2. Rate limit per uid (per IP as backstop rides the same call).
  const ipKey = await ipKeyOf(request);
  const rl = await checkLayers('audcam', uid, [
    { window: 60 * 60 * 1000, max: 12, label: 'hour' },
    { window: 24 * 60 * 60 * 1000, max: 40, label: 'day' },
  ]);
  if (!rl.ok) return errorResponse('Too many camera joins. Try again later.', 429, request);

  // 3. Human check (when configured).
  const ts = await verifyTurnstile(body.turnstileToken, request);
  if (!ts.ok) return jsonResponse({ error: 'Verification failed. Reload and try the check again.', turnstile: true }, 403, request);

  let db;
  try { db = getDb(); } catch (e) { return errorResponse('Service unavailable', 503, request); }

  // 4. Video-ban gate — uid and IP both block.
  const ban = await banFor(db, ['uid:' + uid, ipKey]);
  if (ban) {
    return jsonResponse({
      banned: true, until: ban.until,
      error: 'Removed from video rooms for a safety violation.',
    }, 403, request);
  }

  // 5. Round must exist and allow audience cameras.
  let roundData;
  try {
    const snap = await withDeadline(db.collection('live_rounds').doc(room).get(), 2500);
    if (!snap.exists) return errorResponse('Round not found', 404, request);
    roundData = snap.data() || {};
  } catch (e) { return errorResponse('Round lookup failed', 503, request); }
  if (roundData.allowAudienceCams === false) {
    return jsonResponse({ error: 'The debaters turned audience cameras off for this round.', disabled: true }, 403, request);
  }
  // Camera spectators are already visible as watchers; a debater's own
  // camera path never comes through here.
  if (roundData.proUid === uid || roundData.conUid === uid) {
    return errorResponse('Debaters use the in-room camera controls', 400, request);
  }

  // 6. Concurrency cap over fresh camAt heartbeats.
  try {
    const camSnap = await withDeadline(
      db.collection('live_rounds').doc(room).collection('watchers')
        .where('camAt', '>', new Date(Date.now() - FRESH_MS))
        .limit(MAX_CAMS + 1)
        .get(), 2500);
    let live = 0;
    camSnap.forEach(d => { if (d.id !== uid) live++; });
    if (live >= MAX_CAMS) {
      return jsonResponse({ error: 'All ' + MAX_CAMS + ' audience camera slots are taken right now.', full: true }, 409, request);
    }
  } catch (e) { /* fail open — the cap is a courtesy, not a security line */ }

  // 7. Mint the video-only token. canSend:['video'] is the hard rule:
  // Daily's media server refuses an audio publish from this token.
  const firstName = String(payload.name || 'Guest').trim().split(/\s+/)[0].slice(0, 20) || 'Guest';
  try {
    const tr = await fetch(DAILY_API + '/meeting-tokens', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: {
        room_name: room,
        user_id: uid.slice(0, 36),
        user_name: 'Audience · ' + firstName,
        start_audio_off: true,
        start_video_off: false,
        permissions: { canSend: ['video'] },
        exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
      } }),
    });
    if (!tr.ok) {
      const detail = await tr.text().catch(() => '');
      console.warn('[audience-cam] token mint failed', tr.status, detail.slice(0, 300));
      return errorResponse('Could not set up the camera join. Try again.', 502, request);
    }
    const tj = await tr.json();
    return jsonResponse({ token: tj.token || null, name: 'Audience · ' + firstName }, 200, request);
  } catch (e) {
    return errorResponse('Could not reach the video service', 502, request);
  }
};

export const config = { path: '/api/audience-cam' };
