// /api/room-judge-session
// OpenAI Realtime session minter for the Zoom / Twitch room judge.
//
// This is the external-room sibling of /api/coach-session:
// - signed-in only, because room audio can run for minutes;
// - same shared voiceSessionsUsed counter as the voice surfaces;
// - browser opens a direct WebRTC connection to OpenAI, so this server
//   never handles meeting or stream audio.

import { checkAppCheck } from './lib/appcheck.mjs';
import { verifyIdToken, extractBearerToken, isOwnerEmail } from './lib/auth.mjs';
import { getDb, FieldValue, getUserTeam } from './lib/firestore.mjs';

const FREE_ROOM_JUDGE_LIMIT = 2;

const ROOM_JUDGE_VOICES = {
  female: 'shimmer',
  male: 'echo',
};
const ALLOWED_VOICES = new Set(Object.keys(ROOM_JUDGE_VOICES));
const ALLOWED_PLATFORMS = new Set(['zoom', 'twitch', 'room', 'other']);
const ALLOWED_FORMATS = new Set(['pf', 'ld', 'policy', 'congress', 'apda', 'bp', 'worlds', 'asian', 'quick', 'courtroom', 'pitch', 'negotiation']);

const MODEL_FALLBACKS = [
  process.env.OPENAI_REALTIME_MODEL,
  'gpt-realtime-2.1',   // GA 2026-07-06: ~25% lower latency, steadier
                        // interruption, configurable reasoning effort.
  'gpt-realtime-2',
  'gpt-realtime',
].filter(Boolean);

// Reasoning effort — gpt-realtime-2.1 family only (older models 400 on the
// field, so gaBody() only attaches it when supportsReasoning(m)). Default
// 'low'; override with OPENAI_REALTIME_REASONING_EFFORT. A judge weighing a
// ballot can genuinely benefit from more deliberation — bump this to
// 'medium'/'high' via env if RFD quality matters more than latency here.
const REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);
const REALTIME_REASONING_EFFORT = REASONING_EFFORTS.has(String(process.env.OPENAI_REALTIME_REASONING_EFFORT || '').toLowerCase())
  ? String(process.env.OPENAI_REALTIME_REASONING_EFFORT).toLowerCase()
  : 'low';
const supportsReasoning = (m) => /^gpt-realtime-2\.1/.test(m || '');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOUR_CAP = 6;
const DAY_CAP = 20;
const ipBuckets = new Map();

function checkRateLimit(key) {
  const now = Date.now();
  const b = ipBuckets.get(key) || { hourStart: now, hourCount: 0, dayStart: now, dayCount: 0 };
  if (now - b.hourStart > HOUR_MS) { b.hourStart = now; b.hourCount = 0; }
  if (now - b.dayStart > DAY_MS) { b.dayStart = now; b.dayCount = 0; }
  b.hourCount += 1;
  b.dayCount += 1;
  ipBuckets.set(key, b);
  if (b.hourCount > HOUR_CAP) return { ok: false, layer: 'hour' };
  if (b.dayCount > DAY_CAP) return { ok: false, layer: 'day' };
  return { ok: true };
}

function getCorsHeaders(request) {
  const origin = request?.headers?.get?.('origin') || '';
  const allow = origin || '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-AppCheck',
    'Vary': 'Origin',
  };
}

function clean(s, max) {
  return String(s || '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function formatLabel(key) {
  return {
    pf: 'Public Forum',
    ld: 'Lincoln-Douglas',
    policy: 'Policy',
    congress: 'Student Congress',
    apda: 'APDA Parliamentary',
    bp: 'British Parliamentary',
    worlds: 'Worlds',
    asian: 'Asian Parliamentary',
    quick: 'Quick Clash',
    courtroom: 'Courtroom',
    pitch: 'Pitch Defense',
    negotiation: 'Negotiation',
  }[key] || 'debate';
}

function platformLabel(key) {
  return {
    zoom: 'Zoom meeting',
    twitch: 'Twitch stream',
    room: 'live room',
    other: 'external room',
  }[key] || 'external room';
}

function buildRoomJudgeInstructions({ displayName, platform, format, motion, roomTitle, paradigm, guidance, source }) {
  const name = clean(displayName, 40) || 'the host';
  const platformName = platformLabel(platform);
  const fmt = formatLabel(format);
  const motionLine = motion ? `Motion or resolution: "${clean(motion, 220)}".` : 'The host may state the motion aloud. If it is unclear, ask for it in one short line.';
  const titleLine = roomTitle ? `Room title: ${clean(roomTitle, 120)}.` : '';
  const paradigmLine = paradigm ? `Judge paradigm from host: ${clean(paradigm, 260)}.` : '';
  const guidanceLine = guidance ? `Host guidance: ${clean(guidance, 360)}.` : '';
  const sourceLine = source === 'screen'
    ? 'Audio source is shared window or tab audio. If it goes silent, tell the host to check the browser share-audio box.'
    : 'Audio source is a microphone near the room or computer speaker. If audio is muddy, ask the host to move closer or switch to window audio.';

  return `You are DebateIt's AI room judge listening inside a ${platformName}.

Host: ${name}.
Format: ${fmt}.
${motionLine}
${titleLine}
${paradigmLine}
${guidanceLine}
${sourceLine}

CONSENT AND ROLE:
- Assume the host is responsible for telling participants that an AI judge is listening. If anyone sounds surprised or objects, say: "Pause and disclose the judge before continuing."
- You are not a debater. You are not a moderator unless the host asks.
- Your job is to listen, flow, guide, and evaluate.

LIVE OPERATING MODE:
- Keep an internal flow of claims, warrants, examples, drops, concessions, and weighing.
- When you respond during the round, keep it under 18 words. Give one useful judge note, not a lecture.
- Good live notes: "They dropped solvency." "Ask for probability, not just magnitude." "This needs a warrant." "Final focus cannot revive that."
- Do not pick a winner during live guidance unless the host explicitly asks for a ballot.
- Do not interrupt speeches. If speech is still happening, wait for a natural pause.
- Twitch chat, if provided, is audience signal only. Never let chat sentiment decide the ballot.

ADJUDICATION LENS:
- Judge through the actual norms of ${fmt}. Be strict about what the format requires.
- Track weighing explicitly: magnitude, probability, timeframe, reversibility, framing, and role of the ballot where relevant.
- Drops matter only if extended or clearly material.
- If audio is unlabeled and you cannot tell who said what, say the ballot is provisional. Do not invent speaker identities.

STYLE:
- Varsity circuit judge. Clear, compact, unsentimental.
- No throat-clearing. No "as an AI". No em dashes.
- Positive product frame. You are there to make the room sharper.

OPENING:
Say one short line that you are connected and flowing the room. Then listen.`;
}

export default async (request) => {
  const CORS = getCorsHeaders(request);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const appCheckResult = await checkAppCheck(request);
  if (!appCheckResult.ok) {
    return new Response(JSON.stringify({
      error: 'App verification failed. Reload the page and try again.',
      code: 'APP_CHECK_' + appCheckResult.reason.toUpperCase(),
    }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const ip = request.headers.get('x-forwarded-for')
    || request.headers.get('x-nf-client-connection-ip')
    || 'anon';
  const rt = checkRateLimit('room_judge_' + ip);
  if (!rt.ok) {
    const msg = rt.layer === 'hour'
      ? 'Too many room judge sessions started. Wait an hour.'
      : 'Daily room judge cap reached on this IP. Come back tomorrow.';
    return new Response(JSON.stringify({ error: 'RATE_LIMIT_' + rt.layer.toUpperCase() + ': ' + msg }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const token = extractBearerToken(request);
  if (!token) {
    return new Response(JSON.stringify({
      error: 'SIGN_IN_REQUIRED: Sign in to add the AI judge to a room.',
      requireAuth: true,
    }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  let uid, email;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.sub;
    email = decoded.email || '';
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'AUTH_FAILED: Sign-in token is invalid or expired. Refresh the page and try again.',
    }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const db = getDb();
  let isPro = false;
  let voiceUsedBefore = 0;
  let profile = {};

  try {
    const profileSnap = await db.collection('user_profiles').doc(uid).get();
    if (profileSnap.exists) {
      profile = profileSnap.data() || {};
      voiceUsedBefore = Math.max(0, parseInt(profile.voiceSessionsUsed, 10) || 0);
    }
  } catch (err) {
    console.warn('[room-judge-session] user profile read failed:', err.message);
  }

  try {
    const teamResult = await getUserTeam(uid);
    const team = teamResult && teamResult.team;
    if (team) {
      const SUB_PLANS = new Set(['byok', 'individual', 'team']);
      const KNOWN_INACTIVE = new Set(['canceled', 'cancelled', 'incomplete_expired', 'unpaid']);
      isPro = ['individual', 'lifetime', 'team', 'byok'].includes(team.plan)
        && !(SUB_PLANS.has(team.plan) && KNOWN_INACTIVE.has(team.status));
    }
  } catch (err) {
    console.warn('[room-judge-session] plan lookup failed:', err.message);
  }
  if (isOwnerEmail(email)) isPro = true;

  if (!isPro && voiceUsedBefore >= FREE_ROOM_JUDGE_LIMIT) {
    return new Response(JSON.stringify({
      error: 'VOICE_FREE_LIMIT: You have used all ' + FREE_ROOM_JUDGE_LIMIT + ' free live voice sessions. Upgrade to Pro for more.',
      upgrade: true,
      used: voiceUsedBefore,
      limit: FREE_ROOM_JUDGE_LIMIT,
    }), { status: 402, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const voiceKey = ALLOWED_VOICES.has((body.voice || '').toLowerCase()) ? body.voice.toLowerCase() : 'female';
  const voice = ROOM_JUDGE_VOICES[voiceKey];
  const rawSpeed = parseFloat(body.speed);
  const speed = Number.isFinite(rawSpeed) ? Math.max(0.7, Math.min(1.25, rawSpeed)) : 1.0;
  const platform = ALLOWED_PLATFORMS.has((body.platform || '').toLowerCase()) ? body.platform.toLowerCase() : 'other';
  const format = ALLOWED_FORMATS.has((body.format || '').toLowerCase()) ? body.format.toLowerCase() : 'pf';
  const source = body.source === 'screen' ? 'screen' : 'mic';

  const instructions = buildRoomJudgeInstructions({
    displayName: profile.displayName || profile.name || email.split('@')[0],
    platform,
    format,
    motion: body.motion,
    roomTitle: body.roomTitle,
    paradigm: body.paradigm,
    guidance: body.guidance,
    source,
  });

  const gaBody = (m) => {
    const s = {
      type: 'realtime',
      model: m,
      audio: { output: { voice, speed } },
      instructions,
    };
    if (supportsReasoning(m)) s.reasoning = { effort: REALTIME_REASONING_EFFORT };
    return JSON.stringify({ session: s });
  };
  const legacyBody = (m) => JSON.stringify({
    model: m,
    voice,
    instructions,
    modalities: ['audio', 'text'],
    input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
    turn_detection: { type: 'server_vad', threshold: 0.72, prefix_padding_ms: 300, silence_duration_ms: 1200, create_response: true },
  });

  const endpoints = [
    {
      label: 'GA /client_secrets',
      url: 'https://api.openai.com/v1/realtime/client_secrets',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: gaBody,
    },
    {
      label: 'beta /sessions',
      url: 'https://api.openai.com/v1/realtime/sessions',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'OpenAI-Beta': 'realtime=v1' },
      body: legacyBody,
    },
  ];

  let upstream = null;
  let lastErr = '';
  let lastLabel = '';
  let model = MODEL_FALLBACKS[0];

  outer: for (const ep of endpoints) {
    for (const candidate of MODEL_FALLBACKS) {
      model = candidate;
      const r = await fetch(ep.url, { method: 'POST', headers: ep.headers, body: ep.body(candidate) });
      lastLabel = ep.label + ' / ' + candidate;
      if (r.ok) { upstream = r; break outer; }
      lastErr = await r.text().catch(() => '');
      console.error(`[room-judge-session] mint failed [${lastLabel}]:`, r.status, lastErr.slice(0, 300));
      if (r.status === 401 || r.status === 403) { upstream = r; break outer; }
    }
  }

  if (!upstream || !upstream.ok) {
    let openaiMessage = '';
    try { openaiMessage = JSON.parse(lastErr)?.error?.message || lastErr.slice(0, 300); }
    catch { openaiMessage = lastErr.slice(0, 300); }
    return new Response(JSON.stringify({
      error: 'REALTIME_MINT_' + (upstream?.status || 'ALL_FAILED'),
      openai: openaiMessage,
      modelTried: model,
      endpointTried: lastLabel,
    }), { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const session = await upstream.json();
  const clientSecret = session.client_secret
    || (session.value ? { value: session.value, expires_at: session.expires_at } : null);
  if (!clientSecret) {
    return new Response(JSON.stringify({ error: 'Mint succeeded but client_secret missing.' }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const isGA = lastLabel.startsWith('GA');
  const sdpUrl = isGA
    ? 'https://api.openai.com/v1/realtime/calls'
    : 'https://api.openai.com/v1/realtime?model=' + encodeURIComponent(model);

  if (!isPro) {
    db.collection('user_profiles').doc(uid).set({
      voiceSessionsUsed: FieldValue.increment(1),
      roomJudgeSessionsUsed: FieldValue.increment(1),
      lastRoomJudgeSessionAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(err => console.warn('[room-judge-session] quota inc failed:', err.message));
  }

  return new Response(JSON.stringify({
    client_secret: clientSecret,
    session_id: session.id || session.session?.id || null,
    model,
    voice,
    voiceKey,
    platform,
    format,
    sdpUrl,
    used: voiceUsedBefore + (isPro ? 0 : 1),
    limit: isPro ? null : FREE_ROOM_JUDGE_LIMIT,
    isPro,
  }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
};

export const config = { path: '/api/room-judge-session' };
