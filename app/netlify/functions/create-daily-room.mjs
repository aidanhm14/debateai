// Daily.co room creation. Replaces the meet.jit.si popup workaround
// (which hit the 5-min embed cap + the moderator-required gate).
//
// Contract:
//   POST /api/create-daily-room { name: "Debate AI-c123" }
//   → { url: "https://<sub>.daily.co/Debate AI-c123", name }
//
// The room is created idempotently — if it already exists with that
// name, we fetch and return the URL instead of erroring.
//
// Env vars (set in Netlify):
//   DAILY_API_KEY  — Bearer token from daily.co (Developers section)
//   DAILY_DOMAIN   — subdomain only ("debateai"), not full host
//
// Rooms expire 24h after creation so we don't accumulate stale state
// in Daily's room list. max_participants is intentionally low (8) so
// a stranger guessing the URL can't flood a private debate.

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
  const name = safeRoomName(body && body.name);
  if (!name || name.length < 3) return jsonResponse(400, { error: 'name required (>=3 chars, alphanumeric/hyphen)' });

  // Room expires in 24h. Adjust if you want longer-lived rooms.
  const expSec = Math.floor(Date.now() / 1000) + 24 * 3600;
  const properties = {
    exp: expSec,
    max_participants: 8,
    enable_prejoin_ui: false,       // skip the "set name + cam" prejoin
    enable_screenshare: true,
    enable_chat: true,
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
  // room.url is the canonical URL (e.g., https://debateai.daily.co/Debate AI-c123).
  // We return both name + url so callers can either iframe-embed the
  // URL or reconstruct it from name + DAILY_DOMAIN if needed.
  return jsonResponse(200, {
    name: room.name || name,
    url: room.url || ('https://' + domain + '.daily.co/' + name),
  });
};

export const config = {
  path: '/api/create-daily-room',
};
