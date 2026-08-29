// Tournament livestream control. Admin-only start/stop plus cohost invite
// minting for the public stream shown on the homepage, /tournaments, the
// Open event lobby, and /watch.
//
// Contract:
//   POST /api/stream-control  (Authorization: Bearer <admin firebase token>)
//     { action: 'start', title?: 'The Open finals' }
//       → creates a Daily broadcast room (owner_only_broadcast), mints an
//         owner token for the admin (with cloud recording auto-start when
//         the Daily plan supports it), writes site_stream/current, and
//         returns { live, url, token, studioUrl } — studioUrl is the room
//         URL with the owner token appended, ready to open in a tab and
//         go on camera.
//     { action: 'cohost', userName?: 'Friend' }
//       → mints a second owner token for the current room and returns a
//         studioUrl that can publish camera, mic, and screen share. It never
//         contains the RTMP key and never starts a second recording.
//     { action: 'stop' }
//       → flips site_stream/current to live:false and asks Daily to stop
//         any in-flight recording for the room.
//
// Viewers never hit this endpoint: the public read path is
// /api/stream-status (cached), and tokenless joins to the room are
// watch-only because of owner_only_broadcast.
//
// Env vars: DAILY_API_KEY, DAILY_DOMAIN (same as create-daily-room),
// optional DAILY_RECORD=0 to disable cloud-recording auto-start.

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { jsonResponse, errorResponse, corsResponse } from './lib/response.mjs';
import { ownerTokenProperties, streamerName, studioPath } from './lib/stream-studio.mjs';
import { createHash, randomBytes } from 'node:crypto';
import {
  publicPlatforms,
  publicRestreamLinks,
  safeStudioTargets,
  streamTargets,
} from './lib/stream-targets.mjs';

const DAILY_API = 'https://api.daily.co/v1';
const STREAM_DOC = 'current';

// ── Outbound simulcast ─────────────────────────────────────────────────────
// Each platform URL contains a private stream key. The lead Studio receives
// only a one-time control token and safe platform names. /api/stream-restream
// reads these targets server-side and sends them directly to Daily's REST API.
// The keys never enter the Studio URL, Firestore's public response, or a
// cohost link. STREAM_RTMP_URL remains a backwards-compatible single target.
const TARGETS = streamTargets(process.env);
const YT_CHANNEL = process.env.STREAM_YOUTUBE_CHANNEL_ID || '';
const TWITCH_CHANNEL = process.env.STREAM_TWITCH_CHANNEL || '';
const TWITCH_PARENTS = (process.env.STREAM_TWITCH_PARENTS
  || 'itsdebatable.com,www.itsdebatable.com,debateos1.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Native is the public-site default. It gives Debatable its own player
// while Daily remains an invisible receive-only transport. Set this to
// `embed` only when the on-site audience needs the CDN restream too.
// Twitch still receives the RTMP output in either mode.
const SITE_PLAYER = process.env.STREAM_SITE_PLAYER === 'embed' ? 'embed' : 'native';

// Escape hatch for any other HLS provider (Cloudflare Stream, Mux, a
// self-hosted player page): a full player URL, embedded verbatim.
const EMBED_URL = process.env.STREAM_EMBED_URL || '';

function watchEmbedUrl(){
  if (!TARGETS.length) return null;
  if (EMBED_URL) return EMBED_URL;
  if (TWITCH_CHANNEL && TARGETS.some((t) => t.platform === 'twitch')){
    return 'https://player.twitch.tv/?channel=' + encodeURIComponent(TWITCH_CHANNEL)
         + TWITCH_PARENTS.map((p) => '&parent=' + encodeURIComponent(p)).join('')
         + '&autoplay=true&muted=true';
  }
  if (YT_CHANNEL && TARGETS.some((t) => t.platform === 'youtube')){
    return 'https://www.youtube.com/embed/live_stream?channel='
         + encodeURIComponent(YT_CHANNEL) + '&autoplay=1&mute=1&playsinline=1';
  }
  return null;
}

function externalWatchLinks(){
  return publicRestreamLinks(TARGETS, process.env);
}

function restreamTokenHash(token){
  return createHash('sha256').update(token).digest('hex');
}

function dailyHeaders(){
  return {
    'Authorization': 'Bearer ' + process.env.DAILY_API_KEY,
    'Content-Type': 'application/json',
  };
}

function recordingEnabled(){
  return process.env.DAILY_RECORD !== '0';
}

// Create the broadcast room. Timestamped name so every stream session
// maps to its own Daily room (and therefore its own recording). Retries
// without enable_recording if the Daily plan rejects it — a free plan
// should still be able to stream, just without the cloud recording.
async function createStreamRoom(name){
  const properties = {
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    max_participants: Math.min(300, parseInt(process.env.DAILY_MAX_PARTICIPANTS, 10) || 200),
    owner_only_broadcast: true,
    // Direct viewers make this a multiparty WebRTC room even though only
    // the owner seats publish. Keep a three-layer adaptive path available
    // for them, including when no RTMP restream is configured.
    enable_adaptive_simulcast: true,
    enable_multiparty_adaptive_simulcast: true,
    // Tokenless public viewers stay out of the participant grid and can
    // receive only owner media. The lead and cohost both join as owners.
    enable_hidden_participants: true,
    enable_prejoin_ui: false,
    enable_screenshare: true,
    enable_chat: true,
    eject_at_room_exp: true,
  };
  const attempt = (props) => fetch(DAILY_API + '/rooms', {
    method: 'POST',
    headers: dailyHeaders(),
    body: JSON.stringify({ name, privacy: 'public', properties: props }),
  });
  let resp;
  if (recordingEnabled()){
    resp = await attempt({ ...properties, enable_recording: 'cloud' });
    if (resp.ok) return { room: await resp.json(), recording: true };
    // Plan may not include cloud recording — retry bare.
    console.warn('[stream-control] room create with recording failed (' + resp.status + '), retrying without');
  }
  resp = await attempt(properties);
  if (!resp.ok){
    let detail = '';
    try { detail = await resp.text(); } catch {}
    throw new Error('Daily room create failed: ' + resp.status + ' ' + detail.slice(0, 300));
  }
  return { room: await resp.json(), recording: false };
}

async function mintOwnerToken(roomName, withRecording, userName, role = 'lead'){
  const properties = ownerTokenProperties(roomName, {
    withRecording,
    userName,
    role,
  });
  const resp = await fetch(DAILY_API + '/meeting-tokens', {
    method: 'POST',
    headers: dailyHeaders(),
    body: JSON.stringify({ properties }),
  });
  if (!resp.ok){
    // start_cloud_recording needs a recording-capable plan; retry bare
    // so the stream itself still goes out.
    if (withRecording) return mintOwnerToken(roomName, false, userName, role);
    return null;
  }
  const data = await resp.json();
  return data.token || null;
}

async function stopRoomRecording(roomName){
  try {
    const resp = await fetch(DAILY_API + '/rooms/' + encodeURIComponent(roomName) + '/recordings/stop', {
      method: 'POST',
      headers: dailyHeaders(),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function stopRoomRestream(roomName){
  try {
    const resp = await fetch(DAILY_API + '/rooms/' + encodeURIComponent(roomName) + '/live-streaming/stop', {
      method: 'POST',
      headers: dailyHeaders(),
    });
    // A non-success simply means no external stream was running.
    return resp.ok;
  } catch {
    return false;
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return errorResponse('POST only', 405, req);

  if (!process.env.DAILY_API_KEY || !process.env.DAILY_DOMAIN){
    return errorResponse('Daily.co not configured (DAILY_API_KEY / DAILY_DOMAIN)', 503, req);
  }

  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
  const { uid, db } = gate;

  let body;
  try { body = await req.json(); } catch { return errorResponse('Invalid JSON', 400, req); }
  const action = body && body.action;
  const ref = db.collection('site_stream').doc(STREAM_DOC);

  if (action === 'start'){
    const title = String(body.title || 'Live from the arena').slice(0, 140);
    const userName = streamerName(body.userName, 'Host');
    const name = 'debatable-live-' + Date.now().toString(36);
    let created;
    try {
      created = await createStreamRoom(name);
    } catch (e) {
      return errorResponse(e.message, 502, req);
    }
    const url = created.room.url || ('https://' + process.env.DAILY_DOMAIN + '.daily.co/' + name);
    const token = await mintOwnerToken(name, created.recording, userName, 'lead');
    if (!token) return errorResponse('Could not create the lead studio token', 502, req);
    const simulcastToken = TARGETS.length ? randomBytes(32).toString('base64url') : '';
    const platforms = publicPlatforms(TARGETS);
    const watchLinks = externalWatchLinks();
    // studioUrl points at OUR studio page, not the raw Daily room. The
    // raw room opens Daily prebuilt at its default send settings, which
    // are tuned for a many-person meeting and look soft when they are
    // the only thing on screen. Send quality can only be set through
    // daily-js, so the host needs a page. rawRoomUrl is kept as the
    // escape hatch if /studio ever fails to load.
    const studioUrl = studioPath({
      url,
      token,
      title,
      userName,
      role: 'lead',
      roomName: name,
      restreamToken: simulcastToken,
      restreams: safeStudioTargets(TARGETS),
    });

    await ref.set({
      live: true,
      roomName: name,
      url,
      title,
      recording: created.recording,
      // Where VIEWERS should watch. When a restream target is configured
      // the homepage embeds that player instead of joining the Daily
      // room, which is the difference between an audience capped at
      // max_participants and an uncapped one. Null means "no restream,
      // fall back to joining the room".
      watchEmbedUrl: watchEmbedUrl(),
      restream: TARGETS.length > 0,
      restreamActive: false,
      restreamPlatforms: platforms,
      restreamTokenHash: simulcastToken ? restreamTokenHash(simulcastToken) : null,
      sitePlayer: SITE_PLAYER,
      externalWatchUrl: watchLinks[0] ? watchLinks[0].url : null,
      externalWatchLinks: watchLinks,
      startedAt: FieldValue.serverTimestamp(),
      startedBy: uid,
      endedAt: null,
    });

    return jsonResponse({
      live: true,
      roomName: name,
      url,
      title,
      token,
      recording: created.recording,
      restream: TARGETS.length > 0,
      restreamPlatforms: platforms,
      watchEmbedUrl: watchEmbedUrl(),
      sitePlayer: SITE_PLAYER,
      externalWatchUrl: watchLinks[0] ? watchLinks[0].url : null,
      externalWatchLinks: watchLinks,
      studioUrl,
      rawRoomUrl: token ? url + '?t=' + encodeURIComponent(token) : url,
    }, 200, req);
  }

  if (action === 'cohost'){
    const snap = await ref.get();
    const cur = snap.exists ? (snap.data() || {}) : {};
    if (!cur.live || !cur.roomName || !cur.url){
      return errorResponse('Start the stream before creating a cohost invite', 409, req);
    }

    const userName = streamerName(body.userName, 'Cohost');
    const token = await mintOwnerToken(cur.roomName, false, userName, 'cohost');
    if (!token) return errorResponse('Could not create the cohost studio token', 502, req);

    return jsonResponse({
      live: true,
      roomName: cur.roomName,
      title: cur.title || 'Live from the arena',
      studioUrl: studioPath({
        url: cur.url,
        token,
        title: cur.title || 'Live from the arena',
        userName,
        role: 'cohost',
      }),
    }, 200, req);
  }

  if (action === 'stop'){
    const snap = await ref.get();
    const cur = snap.exists ? (snap.data() || {}) : {};
    if (cur.roomName) await Promise.all([
      stopRoomRecording(cur.roomName),
      stopRoomRestream(cur.roomName),
    ]);
    await ref.set({
      live: false,
      restreamActive: false,
      restreamTokenHash: null,
      endedAt: FieldValue.serverTimestamp(),
      endedBy: uid,
    }, { merge: true });
    return jsonResponse({ live: false }, 200, req);
  }

  return errorResponse('Unknown action (start | cohost | stop)', 400, req);
};

export const config = {
  path: '/api/stream-control',
};
