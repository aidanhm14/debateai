// Tournament livestream control. Admin-only start/stop plus cohost invite
// minting for the public stream shown on /tournaments and /watch.
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

const DAILY_API = 'https://api.daily.co/v1';
const STREAM_DOC = 'current';

// ── Restream to YouTube Live ────────────────────────────────────────────────
// Every viewer who watches through the Daily room is a PARTICIPANT in it,
// so the audience is capped by max_participants and costs participant
// minutes. Daily's own live streaming does not solve that by itself: it
// pushes to an endpoint you own and hands back no player.
//
// So the room restreams over RTMP to YouTube Live, and the homepage
// embeds YouTube's player. Viewers pull from YouTube's CDN, which is
// uncapped and free, and nobody but the debaters ever joins the room.
// The trade is latency: WebRTC is sub-second, an HLS restream is roughly
// ten to twenty seconds behind. For watching a debate that is invisible.
//
// STREAM_RTMP_URL is the full ingest URL INCLUDING the stream key
// (rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx-xxxx-xxxx-xxxx). It is a
// credential: it lives in env, is handed only to the authenticated admin
// opening the studio, and is never written to Firestore or returned to a
// public endpoint.
//
// STREAM_YOUTUBE_CHANNEL_ID is public and PERSISTENT. YouTube's
// `embed/live_stream?channel=` form resolves to whatever that channel is
// currently broadcasting, so nothing has to be re-entered per stream and
// there is no per-broadcast video id to keep in sync.
//
// Neither set: no restream. Everything falls back to the direct-join
// player, which is exactly today's behaviour.
const RTMP_URL = process.env.STREAM_RTMP_URL || '';
const YT_CHANNEL = process.env.STREAM_YOUTUBE_CHANNEL_ID || '';

// Twitch restream. YouTube refuses to serve LIVE embeds on external
// sites unless the channel is monetized with a linked AdSense account,
// which this one is not, so the YouTube path above cannot actually put
// a player on the homepage today. Twitch has no such gate: the player
// embeds freely as long as every domain that serves it is named as a
// `parent` query param. Set STREAM_TWITCH_CHANNEL to the channel LOGIN
// (the twitch.tv/<this> part) and point STREAM_RTMP_URL at Twitch
// ingest (rtmp://live.twitch.tv/app/<stream key>).
const TWITCH_CHANNEL = process.env.STREAM_TWITCH_CHANNEL || '';
const TWITCH_PARENTS = (process.env.STREAM_TWITCH_PARENTS
  || 'itsdebatable.com,www.itsdebatable.com,debateos1.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Escape hatch for any other HLS provider (Cloudflare Stream, Mux, a
// self-hosted player page): a full player URL, embedded verbatim.
const EMBED_URL = process.env.STREAM_EMBED_URL || '';

function watchEmbedUrl(){
  // An embed only makes sense when a restream is actually feeding it.
  if (!RTMP_URL) return null;
  if (EMBED_URL) return EMBED_URL;
  if (TWITCH_CHANNEL){
    return 'https://player.twitch.tv/?channel=' + encodeURIComponent(TWITCH_CHANNEL)
         + TWITCH_PARENTS.map((p) => '&parent=' + encodeURIComponent(p)).join('')
         + '&autoplay=true&muted=true';
  }
  if (YT_CHANNEL){
    return 'https://www.youtube.com/embed/live_stream?channel='
         + encodeURIComponent(YT_CHANNEL) + '&autoplay=1&mute=1&playsinline=1';
  }
  return null;
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
      // The RTMP target rides only to the lead studio, which is where
      // daily-js starts the restream. It never enters a cohost invite.
      rtmp: RTMP_URL,
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
      restream: !!RTMP_URL,
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
      restream: !!RTMP_URL,
      watchEmbedUrl: watchEmbedUrl(),
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
    if (cur.roomName) await stopRoomRecording(cur.roomName);
    await ref.set({
      live: false,
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
