// Daily.co room creation + role-aware meeting tokens. Replaces the
// meet.jit.si popup workaround (which hit the 5-min embed cap + the
// moderator-required gate).
//
// Contract:
//   POST /api/create-daily-room { name: "DebateIt-c123", role: "debater"|"viewer" }
//   Optional Authorization: Bearer <firebase id token>
//   → { name, url, token? }
//
// Streaming model (WS2 Phase 5): rooms are created with
// owner_only_broadcast, so anyone who joins WITHOUT a token is a
// watch-only viewer — no cam, no mic, no participant tile. Debaters
// get an owner meeting token (returned as `token`; client appends
// ?t=<token> to the iframe URL) which unlocks send permissions.
//
// Debater verification: if the live_rounds/{name} doc carries
// proUid/conUid, the bearer token must match one of them to receive
// an owner token. Rounds without seat UIDs (anon / direct-entry)
// grant the owner token to any claimed debater — the shared URL is
// the entry control there, same trust level the round itself runs on.
//
// The room is created idempotently — if it already exists with that
// name, we fetch and return the URL instead of erroring.
//
// Env vars (set in Netlify):
//   DAILY_API_KEY           — Bearer token from daily.co (Developers section)
//   DAILY_DOMAIN            — subdomain only ("debateai"), not full host
//   DAILY_MAX_PARTICIPANTS  — optional, default 100 (viewers count)
//
// Rooms expire 24h after creation so we don't accumulate stale state
// in Daily's room list.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';

const DAILY_API = 'https://api.daily.co/v1';

function safeRoomName(s){
  return String(s || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
}

function jsonResponse(status, body){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Decide whether this requester gets an owner (send-capable) token.
// Fail open on infrastructure errors: a Firestore blip shouldn't
// silence a debater mid-round — that matches the URL-as-entry-control
// trust level the round already runs on.
async function debaterAllowed(rawName, request){
  let round = null;
  try {
    const snap = await getDb().collection('live_rounds').doc(rawName).get();
    if (snap.exists) round = snap.data() || {};
  } catch (e) {
    console.warn('[create-daily-room] round lookup failed, allowing:', e.message);
    return true;
  }
  const proUid = round && round.proUid;
  const conUid = round && round.conUid;
  if (!proUid && !conUid) return true; // unseated round — URL is the gate
  const bearer = extractBearerToken(request);
  if (!bearer) return false;
  try {
    const decoded = await verifyIdToken(bearer);
    return decoded.sub === proUid || decoded.sub === conUid;
  } catch {
    return false;
  }
}

async function mintOwnerToken(roomName, headers, expSec, userName){
  const properties = { room_name: roomName, is_owner: true, exp: expSec };
  if (userName) properties.user_name = String(userName).slice(0, 60);
  const resp = await fetch(DAILY_API + '/meeting-tokens', {
    method: 'POST',
    headers,
    body: JSON.stringify({ properties }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.token || null;
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

  let body;
  try { body = await req.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  const rawName = String((body && body.name) || '');
  const name = safeRoomName(rawName);
  if (!name || name.length < 3) return jsonResponse(400, { error: 'name required (>=3 chars, alphanumeric/hyphen)' });
  const role = body.role === 'viewer' ? 'viewer' : 'debater';

  const maxParticipants = Math.min(200, parseInt(process.env.DAILY_MAX_PARTICIPANTS, 10) || 100);

  // Room expires in 24h. Adjust if you want longer-lived rooms.
  const expSec = Math.floor(Date.now() / 1000) + 24 * 3600;
  const properties = {
    exp: expSec,
    max_participants: maxParticipants,
    owner_only_broadcast: true,     // tokenless joiners are watch-only viewers
    enable_prejoin_ui: false,       // skip the "set name + cam" prejoin
    enable_screenshare: true,
    enable_chat: true,              // viewers can chat even though they can't send AV
    start_video_off: false,
    start_audio_off: false,
    eject_at_room_exp: true,
  };

  // Try create first. If 400 ("already exists"), fall through to GET.
  const headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
  };
  let resp = await fetch(DAILY_API + '/rooms', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, privacy: 'public', properties }),
  });

  if (resp.status === 400 || resp.status === 409) {
    // Room exists — fetch it. Daily returns 400 for "already exists",
    // 409 isn't standard but we handle it just in case.
    resp = await fetch(DAILY_API + '/rooms/' + encodeURIComponent(name), { headers });
  }

  if (!resp.ok) {
    let detail = '';
    try { detail = await resp.text(); } catch {}
    return jsonResponse(resp.status, { error: 'Daily API error', detail: detail.slice(0, 500) });
  }

  const room = await resp.json();
  const url = room.url || ('https://' + domain + '.daily.co/' + name);

  // Viewers never need a token — owner_only_broadcast keeps them
  // watch-only by default.
  if (role === 'viewer') {
    return jsonResponse(200, { name: room.name || name, url });
  }

  let token = null;
  if (await debaterAllowed(rawName, req)) {
    token = await mintOwnerToken(room.name || name, headers, expSec, body.userName);
    if (!token) console.warn('[create-daily-room] owner token mint failed for', name);
  }

  return jsonResponse(200, {
    name: room.name || name,
    url,
    token,
    ...(token ? {} : { tokenError: 'no send token — joining as viewer' }),
  });
};

export const config = {
  path: '/api/create-daily-room',
};
