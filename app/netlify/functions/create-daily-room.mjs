// Daily.co room creation. Replaces the meet.jit.si popup workaround
// (which hit the 5-min embed cap + the moderator-required gate).
//
// Contract:
//   POST /api/create-daily-room { name: "Debatable-c123" }
//   Optional header: Authorization: Bearer <firebase idToken>
//   → { url, name, token? }
//   → 403 { banned:true, until, reason } when the caller is video-banned
//
// The room is created idempotently — if it already exists with that
// name, we fetch and return the URL instead of erroring.
//
// Safety layer (2026-07-27): callers are checked against video_bans
// (written by video-moderate.mjs) before a room URL is issued, and a
// Daily meeting token is minted carrying the caller's identity
// (uid, or a salted IP hash for tokenless guests) as user_id. That
// attribution is what lets peer reports turn into strikes, and lets
// eject use Daily's ban:true so removed users can't rejoin the live
// session. Casual rooms stay public and the token is OPTIONAL on join,
// so stale cached clients keep working. Their safety checks fail OPEN: a
// Firestore outage must never take casual video down. Tournament rooms
// are the deliberate exception. They are private, the server admission
// record decides participant vs viewer, and missing admission fails closed.
//
// Env vars (set in Netlify):
//   DAILY_API_KEY  — Bearer token from daily.co (Developers section)
//   DAILY_DOMAIN   — subdomain only ("debateai"), not full host
//
// Rooms expire 24h after creation so we don't accumulate stale state
// in Daily's room list. See the max_participants comment below for why
// that ceiling is not a debater count: spectators share this room.
// Note the create-or-fetch shape means an EXISTING room keeps the
// properties it was made with, so a ceiling change reaches live rooms
// as they expire (within 24h), not instantly.

import { getDb, withDeadline } from './lib/firestore.mjs';
import { verifyIdToken } from './lib/auth.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { parseTournamentRoom } from './lib/tournament-round.mjs';

const DAILY_API = 'https://api.daily.co/v1';

function recordingEnabled(){
  return process.env.DAILY_RECORD !== '0';
}

function safeRoomName(s){
  return String(s || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
}

function jsonResponse(status, body){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function sha16(s){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

// Same identity derivation as video-moderate.mjs — keep in sync.
async function identify(req){
  const ip = req.headers.get('x-nf-client-connection-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '0.0.0.0';
  const ipKey = 'ip:' + await sha16((process.env.MOD_IP_SALT || 'debatable-mod-1') + ip);
  const m = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (m){
    try {
      const payload = await verifyIdToken(m[1]);
      return { key: 'uid:' + payload.sub, uid: payload.sub, ipKey };
    } catch (e) { /* guests are fine */ }
  }
  return { key: ipKey, uid: null, ipKey };
}

async function banFor(keys){
  let db;
  try { db = getDb(); } catch (e) { return null; }
  try {
    const reads = keys.filter(Boolean).map(k =>
      db.collection('video_bans').doc(k).get().then(d => (d.exists ? d.data() : null), () => null));
    const docs = await withDeadline(Promise.all(reads), 2000);
    const now = Date.now();
    for (const b of docs || []) if (b && b.until && b.until > now) return b;
  } catch (e) { /* fail open */ }
  return null;
}

async function tournamentAdmission(name){
  if (!parseTournamentRoom(name)) return { tournament: false, data: null };
  let db;
  try { db = getDb(); }
  catch (e) { return { tournament: true, error: 'unavailable' }; }
  try {
    const snap = await withDeadline(db.collection('room_admissions').doc(name).get(), 2000);
    if (!snap || !snap.exists) return { tournament: true, error: 'missing' };
    const data = snap.data() || {};
    if (data.kind !== 'tournament' || data.room !== name) {
      return { tournament: true, error: 'invalid' };
    }
    return { tournament: true, data };
  } catch (e) {
    return { tournament: true, error: 'unavailable' };
  }
}

export default async (req) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'POST only' });

  const apiKey = process.env.DAILY_API_KEY;
  const domain = process.env.DAILY_DOMAIN;
  if (!apiKey || !domain) {
    return jsonResponse(503, {
      error: 'Daily.co not configured',
      hint: 'Set DAILY_API_KEY and DAILY_DOMAIN env vars in Netlify (Site config → Environment variables).',
    });
  }

  // Organizer kill switch. Blocks NEW room creation only; rooms that
  // already exist keep running (rejoin fetches an existing room, which
  // still routes through here, so the pause message names the fix).
  if (process.env.DAILY_ROOMS_DISABLED === '1') {
    return jsonResponse(503, {
      paused: true,
      error: 'Live video rooms are paused by the organizer. Check the event page for the schedule.',
    });
  }

  let body;
  try { body = await req.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  const name = safeRoomName(body && body.name);
  if (!name || name.length < 3) return jsonResponse(400, { error: 'name required (>=3 chars, alphanumeric/hyphen)' });
  const role = body && body.role === 'viewer' ? 'viewer' : 'debater';

  // Video-ban gate. uid ban and IP ban both block.
  const who = await identify(req);

  // Cost guards. Every participant calls this on join and rejoin
  // (idempotent re-create), so per-caller layers are generous: they
  // stop a loop, not a venue. Signed-in callers meter per uid so a
  // NAT'd school building never shares one counter (the 2026-07-28
  // realtime-session lesson). The global layer is a runaway backstop
  // for the whole site, sized above any real tournament burst and
  // overridable without a redeploy via DAILY_ROOM_HOURLY_CAP.
  const perCaller = await checkLayers('droom', who.uid ? ('uid_' + who.uid) : who.ipKey, [
    { window: 60_000, max: 12, label: 'min' },
    { window: 3_600_000, max: 90, label: 'hour' },
  ]);
  if (!perCaller.ok) {
    return jsonResponse(429, { error: 'Too many room requests. Wait a minute and rejoin.' });
  }
  const globalCap = Math.max(50, parseInt(process.env.DAILY_ROOM_HOURLY_CAP, 10) || 1200);
  const globalLayer = await checkLayers('droom', 'global', [
    { window: 3_600_000, max: globalCap, label: 'site_hour' },
  ]);
  if (!globalLayer.ok) {
    console.error('[create-daily-room] site-wide hourly room cap hit (' + globalCap + ')');
    return jsonResponse(503, { error: 'Video rooms are at capacity right now. Try again in a few minutes.' });
  }
  const ban = await banFor(who.uid ? [who.key, who.ipKey] : [who.ipKey]);
  if (ban) {
    return jsonResponse(403, {
      banned: true,
      until: ban.until,
      reason: ban.reason || 'violation',
      error: 'Removed from video rooms for a safety violation.',
    });
  }

  // A tournament is public to watch and private to enter. Pairing writes
  // this record before either link exists. Unlike the general safety reads
  // above, the admission check fails closed because guessing a room name
  // must never produce a participant token.
  const admission = await tournamentAdmission(name);
  if (admission.tournament) {
    if (!admission.data) {
      const invalid = admission.error === 'missing' || admission.error === 'invalid';
      return jsonResponse(invalid ? 403 : 503, {
        error: invalid
          ? 'This tournament room is not open.'
          : 'Tournament admission could not be verified. Try again.',
      });
    }
    if (role === 'viewer') {
      if (admission.data.spectatorAccess !== 'public') {
        return jsonResponse(403, { error: 'This tournament room is not open to spectators.' });
      }
    } else {
      const allowed = Array.isArray(admission.data.uids) ? admission.data.uids.map(String) : [];
      if (!who.uid || allowed.indexOf(String(who.uid)) === -1) {
        return jsonResponse(403, {
          rosterOnly: true,
          error: 'Only the people assigned to this tournament room can join with a camera and microphone.',
        });
      }
    }
  }

  // Room expires in 24h. Adjust if you want longer-lived rooms.
  const expSec = Math.floor(Date.now() / 1000) + 24 * 3600;
  const properties = {
    exp: expSec,
    // Every spectator joins this room too (receive-only, cam + mic
    // withheld at the iframe), so this ceiling was never "8 debaters" —
    // it was 2 debaters plus SIX watchers, and the seventh person to
    // open a live round got a full room. Audience cameras land in the
    // same room, so the old number would have made four camera slots
    // eat two thirds of the audience. 24 leaves real headroom; flooding
    // is handled where it belongs (unlisted rounds, the admission gate,
    // and /api/audience-cam's own cap of 4 concurrent cameras).
    max_participants: 24,
    enable_prejoin_ui: false,       // skip the "set name + cam" prejoin
    enable_screenshare: true,
    enable_chat: true,
    start_video_off: false,
    start_audio_off: false,
    eject_at_room_exp: true,
  };
  // Enabling cloud recording does not start capture. /api/round-recording
  // starts it only after every seated debater has opted in for this round.
  //
  // `allow_streaming_from_bucket` USED TO RIDE HERE AND IT IS NOT A ROOM
  // PROPERTY. Daily answers the whole create with
  // 400 invalid property name 'allow_streaming_from_bucket', which fell
  // into the "room already exists" branch below, found no room, and
  // retried BARE, stripping enable_recording. So every live room ever
  // created came out with recording disabled (verified 2026-08-15: all
  // five rooms on the account reported enable_recording: null), and
  // /api/round-recording could never start capture on any of them. Do
  // not add a property here without checking it against the live API;
  // one bad key silently disables the whole feature.
  if (recordingEnabled()) properties.enable_recording = 'cloud';

  // Try create first. If 400 ("already exists"), fall through to GET.
  const headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
  };
  const createRoom = (props) => fetch(DAILY_API + '/rooms', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, privacy: admission.tournament ? 'private' : 'public', properties: props }),
  });
  let recordingAvailable = recordingEnabled();
  let resp = await createRoom(properties);

  if (resp.status === 400 || resp.status === 409) {
    // Room exists — fetch it. Daily returns 400 for "already exists",
    // 409 isn't standard but we handle it just in case.
    let createErr = '';
    try { createErr = (await resp.text()).slice(0, 300); } catch {}
    resp = await fetch(DAILY_API + '/rooms/' + encodeURIComponent(name), { headers });
    if (resp.status === 404 && recordingAvailable){
      // A Daily plan without recording can reject enable_recording with
      // the same 400 used for "room already exists." Retry bare so the
      // debate still gets video even when recording is unavailable.
      // LOUDLY: this path silently disabled recording on every round for
      // as long as a bogus property sat in the create body, and nothing
      // reported it. If you see this line, recording is OFF and Daily's
      // own message says why.
      console.warn('[create-daily-room] create rejected and no such room exists; retrying WITHOUT recording. Daily said:', createErr);
      recordingAvailable = false;
      const { enable_recording, ...bare } = properties;
      resp = await createRoom(bare);
    }
  }

  if (!resp.ok) {
    let detail = '';
    try { detail = await resp.text(); } catch {}
    return jsonResponse(resp.status, { error: 'Daily API error', detail: detail.slice(0, 500) });
  }

  const room = await resp.json();

  // Create-or-fetch means an EXISTING room keeps the properties it was
  // made with, so every room made before the bogus-property fix above
  // would stay unrecordable until it expired (24h). Repair it in place
  // instead: one extra call, only when the room actually lacks the
  // setting. Never blocks the round; a failed repair just means this
  // room cannot record, which is where it already was.
  if (recordingAvailable && room && room.config && !room.config.enable_recording){
    try {
      const patched = await fetch(DAILY_API + '/rooms/' + encodeURIComponent(name), {
        method: 'POST',
        headers,
        body: JSON.stringify({ properties: { enable_recording: 'cloud' } }),
      });
      if (!patched.ok){
        recordingAvailable = false;
        console.warn('[create-daily-room] could not enable recording on existing room', name, patched.status);
      }
    } catch (e) {
      recordingAvailable = false;
      console.warn('[create-daily-room] recording repair threw for', name, String(e && e.message || e));
    }
  }

  // Mint a meeting token attributing this caller's identity to their
  // participant record (presence.userId). user_id caps at 36 chars —
  // a Firebase uid (28) and our 'ip:'+24-hex key both fit. Failure
  // here never blocks the room.
  //
  // Spectators (role:'viewer' from the client) join HIDDEN via the
  // token's `permissions`: no name tile in the grid, no people-list
  // row, and no send path even if the iframe's AV gate is stripped.
  // The page's own "N watching" pill is the audience count. Casual-room
  // roles remain client hints. Tournament roles were checked against the
  // server-written admission record above, and those rooms require tokens.
  // `permissions` is a documented MEETING-TOKEN property — this block
  // deliberately does NOT touch the room create body (see the loud
  // comment above about one bad room key silently killing recording),
  // and a rejected mint retries without it so identity attribution
  // survives on plans that lack the permissions API.
  const tokenProps = {
    room_name: name,
    user_id: (who.uid || who.ipKey).slice(0, 36),
    exp: expSec,
  };
  if (role === 'viewer') tokenProps.permissions = { hasPresence: false, canSend: false };
  const mintToken = (props) => fetch(DAILY_API + '/meeting-tokens', {
    method: 'POST',
    headers,
    body: JSON.stringify({ properties: props }),
  });
  let token = null;
  try {
    let tr = await mintToken(tokenProps);
    if (!tr.ok && tokenProps.permissions && !admission.tournament){
      console.warn('[create-daily-room] viewer permissions rejected (' + tr.status + '), reminting without');
      delete tokenProps.permissions;
      tr = await mintToken(tokenProps);
    }
    if (tr.ok) token = (await tr.json()).token || null;
  } catch (e) { /* tokenless join still works */ }

  if (admission.tournament && !token) {
    return jsonResponse(503, { error: 'Could not issue a secure tournament room token. Try again.' });
  }

  // room.url is the canonical URL (e.g., https://debateai.daily.co/Debatable-c123).
  // We return both name + url so callers can either iframe-embed the
  // URL or reconstruct it from name + DAILY_DOMAIN if needed.
  return jsonResponse(200, {
    name: room.name || name,
    url: room.url || ('https://' + domain + '.daily.co/' + name),
    token,
    recordingAvailable,
  });
};

export const config = {
  path: '/api/create-daily-room',
};
