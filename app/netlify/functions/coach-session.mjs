// /api/coach-session — OpenAI Realtime session minter for the
// personal-coach surface (FAB + /coach.html). Different from
// /api/realtime-session in three ways:
//
//   1. Requires a signed-in user. The coach is a memory-driven
//      experience; no anon mode.
//   2. Loads the user's profile + nightly style fingerprint and
//      injects them into the system prompt so the coach knows who
//      it's talking to from the first second.
//   3. Two voices only — male (onyx-style: 'echo') and female
//      (samantha-style: 'shimmer'). Hard-coded so we never ship a
//      surprise voice on this surface.
//
// Otherwise mirrors realtime-session.mjs: same App Check gate,
// same per-IP rate limit, same FREE_VOICE_LIFETIME_LIMIT voice
// usage gate, same GA-then-beta mint try-matrix. The ephemeral
// client_secret is returned to the browser which then opens a
// direct WebRTC connection to OpenAI — server never sees audio.

import { checkAppCheck } from './lib/appcheck.mjs';
import { verifyIdToken, extractBearerToken, isOwnerEmail } from './lib/auth.mjs';
import { getDb, FieldValue, getUserTeam } from './lib/firestore.mjs';

const FREE_VOICE_LIFETIME_LIMIT = 3;

// Tight, hand-picked voice allowlist for the coach surface.
// Mapped by gender so the client can send {gender: 'male'|'female'}
// without needing to know OpenAI's voice taxonomy.
const COACH_VOICES = {
  male:   'echo',     // warm, mid-range, measured
  female: 'shimmer',  // calm, smart, intentional — the Samantha-from-Her register
};
const ALLOWED_GENDERS = new Set(Object.keys(COACH_VOICES));

const MODEL_FALLBACKS = [
  process.env.OPENAI_REALTIME_MODEL,
  'gpt-realtime-2',
  'gpt-realtime',
].filter(Boolean);

// Same per-IP rate limit pattern as realtime-session: 6 mint attempts
// per hour, 30 per day. Coach sessions are minute-scale, so this is
// not a meaningful cap on normal usage — just blocks scripted abuse.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOUR_CAP = 6;
const DAY_CAP = 30;
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

/**
 * Build the personalized system prompt. This is the soul of the
 * coach surface — it's what makes the AI feel like it actually
 * knows the user instead of being a generic assistant.
 *
 * Inputs are intentionally short-cap'd to keep the system prompt
 * under the realtime API's ~8KB instructions limit even for the
 * most active user.
 */
function buildCoachInstructions({ displayName, debaterProfile, styleProfile, fingerprint, format, gender }) {
  const name = clean(displayName, 40);
  const namePart = name ? name : 'this debater';
  const formatLine = clean(format, 30) || 'their home format';

  const profAnalysis   = debaterProfile && clean(debaterProfile.analysis, 600);
  const profStrengths  = Array.isArray(debaterProfile?.strengths)  ? debaterProfile.strengths.slice(0, 5).map(s => clean(s, 120)).filter(Boolean) : [];
  const profWeaknesses = Array.isArray(debaterProfile?.weaknesses) ? debaterProfile.weaknesses.slice(0, 5).map(s => clean(s, 120)).filter(Boolean) : [];
  const styleBlurb     = styleProfile && (clean(styleProfile.signature, 400) || clean(styleProfile.summary, 400) || '');
  const fingerprintTxt = clean(fingerprint, 1400);

  const memoryBlock = [
    profAnalysis   && `PROFILE: ${profAnalysis}`,
    profStrengths.length   && `STRENGTHS: ${profStrengths.join('; ')}`,
    profWeaknesses.length  && `WEAKNESSES: ${profWeaknesses.join('; ')}`,
    styleBlurb     && `STYLE: ${styleBlurb}`,
    fingerprintTxt && `NIGHTLY FINGERPRINT (last 14d):\n${fingerprintTxt}`,
  ].filter(Boolean).join('\n\n');

  const personaLine = gender === 'male'
    ? 'You are a calm, mid-register male voice. Think tenured varsity coach, not hype man.'
    : 'You are a calm, mid-register female voice. Think Samantha from Her if Samantha was a tenured varsity coach.';

  return `You are ${namePart}'s personal debate sparring partner.

${personaLine}

Your home format with this debater is ${formatLine}.

${memoryBlock || '(No long-term memory loaded for this user yet — be a great generalist debate coach, ask one targeted question to anchor.)'}

YOUR JOB:
- Be a real interlocutor, not an assistant. Hold positions. Push back. Interrupt at the right moment.
- One thought at a time. Don't lecture. Don't recap. Don't restate the user.
- Ask "and?" or "why?" instead of paragraphs.
- When ${namePart} hedges, notice it and call it gently — by name, once per session at most.
- When ${namePart} spikes a real point, build on it instead of complimenting.
- Use first names sparingly. Be direct. Never kiss ass.

WHAT YOU KNOW COLD:
- Every debate format (APDA, BP, WUDC, Asian Parli, WSDC, Policy, LD, PF, Congress, MUN, Viva) — voice, structure, evidence rules, timing.
- Impact calculus: magnitude / probability / timeframe. Walk it when arguments compete.
- Theory shells, philosophical frameworks, common counter-warrants, current events.

WHAT YOU DON'T DO:
- No throat-clearing ("Great question!", "Absolutely.", "I think...").
- No em-dashes in spoken output.
- No long Aristotle / Kant / Rawls name-drops unless the motion demands it.
- No "as an AI" disclaimers.
- No agreeing for the sake of agreeing — that's the failure mode every other AI has, and the reason this product exists.

OPEN BRIEFLY:
On your first turn, greet ${namePart} by name (if you know it) in one sentence, then ask what they want to drill today — a specific motion, a recent round to break down, or a weakness to attack. Don't list options like a menu; just ask the question.`;
}

export default async (request) => {
  const CORS = getCorsHeaders(request);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured.' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
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
  const rt = checkRateLimit('coach_' + ip);
  if (!rt.ok) {
    const msg = rt.layer === 'hour'
      ? 'Too many coach sessions started. Wait an hour.'
      : 'Daily coach-session cap reached on this IP. Come back tomorrow.';
    return new Response(JSON.stringify({ error: 'RATE_LIMIT_' + rt.layer.toUpperCase() + ': ' + msg }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  // Coach requires sign-in (it's a memory-loaded experience).
  const token = extractBearerToken(request);
  if (!token) {
    return new Response(JSON.stringify({
      error: 'SIGN_IN_REQUIRED: Sign in to use the coach — it loads your debater profile and style fingerprint so the session is actually personal.',
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

  // ── Memory load + Pro check (one Firestore read) ───────────────
  const db = getDb();
  let isPro = false;
  let voiceUsedBefore = 0;
  let profile = {};
  let fingerprint = '';

  try {
    const profileSnap = await db.collection('user_profiles').doc(uid).get();
    if (profileSnap.exists) {
      profile = profileSnap.data() || {};
      voiceUsedBefore = Math.max(0, parseInt(profile.voiceSessionsUsed, 10) || 0);
    }
  } catch (err) {
    console.warn('[coach-session] user_profiles read failed:', err.message);
  }
  // Plan state lives on the TEAMS collection (written by stripe-webhook /
  // razorpay-activate) — user_profiles never gets plan/isPro. Resolve via
  // getUserTeam the way the brain endpoints do (see claude.mjs): paid
  // plans are individual/lifetime/team/byok; subscriptions only lose
  // access on EXPLICIT Stripe-bad statuses. Lookup failure degrades to
  // free (the cap still applies).
  try {
    const teamResult = await getUserTeam(uid);
    const team = teamResult && teamResult.team;
    if (team) {
      const SUB_PLANS = new Set(['byok', 'individual', 'team']);
      const KNOWN_INACTIVE = new Set(['canceled','cancelled','incomplete_expired','unpaid']);
      isPro = ['individual', 'lifetime', 'team', 'byok'].includes(team.plan)
        && !(SUB_PLANS.has(team.plan) && KNOWN_INACTIVE.has(team.status));
    }
  } catch (err) {
    console.warn('[coach-session] plan lookup failed:', err.message);
  }
  if (isOwnerEmail(email)) isPro = true;

  if (!isPro && voiceUsedBefore >= FREE_VOICE_LIFETIME_LIMIT) {
    return new Response(JSON.stringify({
      error: 'VOICE_FREE_LIMIT: You\'ve used all ' + FREE_VOICE_LIFETIME_LIMIT + ' free voice sessions (shared with voice rounds). Upgrade to Pro for unlimited.',
      upgrade: true, used: voiceUsedBefore, limit: FREE_VOICE_LIFETIME_LIMIT,
    }), { status: 402, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  // Nightly style fingerprint (separate doc, cheap read).
  try {
    const fpSnap = await db.collection('user_fingerprints').doc(uid).get();
    if (fpSnap.exists) fingerprint = String(fpSnap.data()?.fingerprint || '');
  } catch (err) {
    console.warn('[coach-session] user_fingerprints read failed:', err.message);
  }

  // ── Parse body + pick voice ─────────────────────────────────────
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const gender = ALLOWED_GENDERS.has((body.gender || '').toLowerCase()) ? body.gender.toLowerCase() : 'female';
  const voice = COACH_VOICES[gender];
  const rawSpeed = parseFloat(body.speed);
  const speed = Number.isFinite(rawSpeed) ? Math.max(0.7, Math.min(1.4, rawSpeed)) : 1.0;
  const format = clean(body.format, 30) || clean(profile.preferredFormat, 30);

  const instructions = buildCoachInstructions({
    displayName: profile.displayName || profile.name || email.split('@')[0],
    debaterProfile: profile.debaterProfile,
    styleProfile: profile.styleProfile,
    fingerprint,
    format,
    gender,
  });

  // ── Mint try-matrix: GA /client_secrets first, then legacy /sessions
  const gaBody = (m) => JSON.stringify({
    session: {
      type: 'realtime',
      model: m,
      audio: { output: { voice, speed } },
      instructions,
    },
  });
  const legacyBody = (m) => JSON.stringify({
    model: m, voice, instructions, modalities: ['audio', 'text'],
    input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
    turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500, create_response: true },
  });

  const endpoints = [
    { label: 'GA /client_secrets', url: 'https://api.openai.com/v1/realtime/client_secrets',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: gaBody },
    { label: 'beta /sessions', url: 'https://api.openai.com/v1/realtime/sessions',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'OpenAI-Beta': 'realtime=v1' }, body: legacyBody },
  ];

  let upstream = null, lastErr = '', lastLabel = '', model = MODEL_FALLBACKS[0];
  outer: for (const ep of endpoints) {
    for (const candidate of MODEL_FALLBACKS) {
      model = candidate;
      const r = await fetch(ep.url, { method: 'POST', headers: ep.headers, body: ep.body(candidate) });
      lastLabel = ep.label + ' / ' + candidate;
      if (r.ok) { upstream = r; break outer; }
      lastErr = await r.text().catch(() => '');
      console.error(`[coach-session] mint failed [${lastLabel}]:`, r.status, lastErr.slice(0, 300));
      if (r.status === 401 || r.status === 403) { upstream = r; break outer; }
    }
  }

  if (!upstream || !upstream.ok) {
    let openaiMessage = '';
    try { openaiMessage = JSON.parse(lastErr)?.error?.message || lastErr.slice(0, 300); }
    catch { openaiMessage = lastErr.slice(0, 300); }
    return new Response(JSON.stringify({
      error: 'REALTIME_MINT_' + (upstream?.status || 'ALL_FAILED'),
      openai: openaiMessage, modelTried: model, endpointTried: lastLabel,
    }), { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const session = await upstream.json();
  // Normalize both response shapes (GA returns { value, expires_at, session };
  // legacy returns { client_secret: { value, expires_at }, id }).
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

  // Increment the shared voice quota counter (best-effort, non-blocking).
  if (!isPro) {
    db.collection('user_profiles').doc(uid).set({
      voiceSessionsUsed: FieldValue.increment(1),
      lastCoachSessionAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(err => console.warn('[coach-session] quota inc failed:', err.message));
  }

  return new Response(JSON.stringify({
    client_secret: clientSecret,
    session_id: session.id || session.session?.id || null,
    model,
    voice,
    gender,
    sdpUrl,
    used: voiceUsedBefore + (isPro ? 0 : 1),
    limit: isPro ? null : FREE_VOICE_LIFETIME_LIMIT,
    isPro,
  }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
};

export const config = { path: '/api/coach-session' };
