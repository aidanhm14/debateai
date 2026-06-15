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

// Drill catalog — keys MUST match the DRILLS array in coach.html.
// Each drill rewires how the coach runs the session: a focus block
// (what to do for the whole session) and an opening (what the coach
// does on turn one so it launches straight into the drill).
const DRILLS = {
  open: {
    label: 'Talk to coach',
    focus: 'Free back and forth. Let them set the motion and pick a side, then take the other side and be a sharp opponent and second.',
    open: 'ask what motion they want to run and which side they are taking, then take the opposite side and go.',
  },
  dynamics: {
    label: 'Dynamics lab',
    focus: 'Build their grasp of how one real-world system actually works, then make them deploy it. This drill trains matter, not technique, so you teach more than you spar until the end. Pick one high-leverage dynamic (how a rate hike transmits to inflation and jobs over a twelve to eighteen month lag, why civil wars persist on lootable resources and outside backers, how sanctions bite through dollar clearing and then leak through third countries, how a sovereign debt spiral feeds itself, how carbon pricing shifts behavior) or read the dynamic out of the motion they gave. Walk the causal chain one link at a time: ask them to predict the next step, then confirm and sharpen it with the real mechanism, a real number or named case, and the lag or the failure mode where the chain breaks or reverses. Keep your turns to a sentence or two, never a lecture, and correct them plainly when they are wrong instead of nodding along. When the chain is built, make them say the whole chain back in their own words before you move on. Then hand them a live motion that turns on this dynamic and pressure-test it with one hard point. Close by naming two or three other motions the same chain unlocks.',
    open: 'name the system you are about to teach, or pull it from their motion, then ask them to predict the very first causal link before you give it.',
  },
  poi: {
    label: 'POI gauntlet',
    focus: 'They are giving a speech; your job is points of information. Offer short, barbed POIs at the moments that hurt most, make them accept and answer under pressure, then immediately exploit a weak answer. Do not let them duck every point.',
    open: 'give them a motion and a side, tell them to start their constructive, and warn them the POIs are coming.',
  },
  rebuttal: {
    label: 'Rebuttal sprint',
    focus: 'Fire one tight argument at a time. They get one breath to refute it. Judge the refutation in a single sentence, then fire the next one, escalating in difficulty. No long setups, no stacking.',
    open: 'name the motion, then hit them with your first argument and tell them to break it now.',
  },
  framework: {
    label: 'Framework clash',
    focus: 'Stay on the pre-substance layer: definitions, burdens, value and criterion, what the round is actually about. Contest their framing hard. Do not let them escape down to contention-level material before the framework is settled.',
    open: 'give them a motion, state your framing of what the debate is really about, and make them contest it.',
  },
  impact: {
    label: 'Impact calculus',
    focus: 'Force weighing on every claim. When they make a point, demand magnitude, probability, and timeframe, then put a competing impact on the other side and make them weigh comparatively. Reward real comparison, punish unweighed assertion.',
    open: 'give them a clash with a serious impact on each side and ask which one outweighs and why.',
  },
  crossex: {
    label: 'Cross-examination',
    focus: 'Rapid questions, mostly closed and leading. Pin them down, surface contradictions, build a trap across several questions and then spring it. Keep your turns to one question at a time.',
    open: 'name the motion and the position they are defending, then start cross-examining immediately.',
  },
  steelman: {
    label: 'Steelman, then break',
    focus: 'First make them build the strongest version of a position, usually one they would argue against. Hold them to it until it is genuinely strong. Then switch sides and make them break the case they just built.',
    open: 'name a position and tell them to give you the best possible case for it before you let them lay a finger on it.',
  },
  devil: {
    label: "Devil's advocate",
    focus: 'Take the opposite side of what this debater actually believes. Draw out their real view on a live issue, then argue the other side in good faith and hard. Make them defend their instinct with reasons instead of conviction. The point is to stress-test their priors, not to win.',
    open: 'ask them what they actually believe on a live issue right now, then take the other side and come straight at it.',
  },
  killshot: {
    label: 'Kill shot',
    focus: 'Give one tight sixty-second case. They get exactly one response to find the decisive answer, the single move that beats it, not a scattershot of small ones. After their answer, tell them in one line whether they found the kill shot or swung at noise, then run another.',
    open: 'tell them you are giving a sixty second case and they get one response to kill it, then deliver the case at pace.',
  },
  hotseat: {
    label: 'Hot seat',
    focus: 'You are not a debate coach this round. You are a hostile interviewer. Pick a role and commit to it: a skeptical VC, a sharp judge, an adversarial journalist, a cross-examining lawyer, or a tenured professor. Pressure them on their position the way that role would, with interruptions and follow-ups and no soft landings.',
    open: 'tell them which hot seat they are in (VC, judge, journalist, lawyer, or professor), set the scenario in one line, and open with your first hard question.',
  },
  reconstruct: {
    label: 'Speech reconstruction',
    focus: 'Read them a compact argument once, at pace, then make them reconstruct its structure back to you: the claims, the warrants, the impacts, the order. Catch what they dropped or mangled. This trains flowing and listening, not generation, so do not let them improve the argument, only rebuild what you actually said.',
    open: 'tell them to flow this and play it back, then deliver one tight thirty second argument with two or three distinct points.',
  },
  roundreview: {
    label: 'Round review',
    focus: 'You are reviewing game film. Work from the recent rounds listed below: reference the actual motions, the actual side they took, and the specific moves and mistakes. Be a scout, not a cheerleader. Name the pattern that shows up across rounds, pick the one habit costing them the most, then drill it live for a few exchanges before they leave.',
    open: 'open by naming their most recent round and the one thing in it you want to talk about. Do not ask what they want to review; you already know.',
  },
};
const ALLOWED_DRILLS = new Set(Object.keys(DRILLS));
const RECENT_ROUNDS_LIMIT = 8; // generations scanned when building the round-review block

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
 * Build the "game film" block for the round-review drill: the user's
 * most recent rounds, collapsed to one line each (motion / format /
 * side) with a short excerpt of the judge ballot when there is one so
 * the coach can reference an actual mistake instead of generalizing.
 *
 * Reads the generations collection (uid + createdAt index already
 * exists — same query user-style-summary uses). Returns '' on any
 * failure so a missing index or empty history just degrades the drill
 * to a generalist review instead of breaking the mint.
 */
async function loadRecentRounds(db, uid) {
  try {
    const snap = await db.collection('generations')
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(RECENT_ROUNDS_LIMIT)
      .get();
    if (snap.empty) return '';

    const seen = new Set();
    const lines = [];
    snap.forEach(doc => {
      if (lines.length >= 4) return;
      const d = doc.data() || {};
      const motion = clean(d.motion, 140);
      if (!motion || seen.has(motion)) return;
      seen.add(motion);
      const fmt = clean(d.format, 24);
      const side = clean(d.side, 16);
      const tag = [fmt, side].filter(Boolean).join(', ');
      // A judge/RFD turn carries the actual verdict; surface a slice of it.
      const isBallot = d.kind === 'judge' || d.kind === 'voice_round' || d.kind === 'rfd';
      const ballot = isBallot ? clean(d.output, 220) : '';
      lines.push(`- "${motion}"${tag ? ` (${tag})` : ''}${ballot ? ` — ballot read: ${ballot}` : ''}`);
    });
    return lines.join('\n');
  } catch (err) {
    console.warn('[coach-session] loadRecentRounds failed:', err.message);
    return '';
  }
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
function buildCoachInstructions({ displayName, debaterProfile, styleProfile, fingerprint, format, gender, drill, motion, recentRounds }) {
  const name = clean(displayName, 40);
  const namePart = name ? name : 'this debater';
  const formatLine = clean(format, 30) || 'their home format';
  const drillDef = DRILLS[drill] || DRILLS.open;
  const motionLine = motion ? `Run the drill on this motion: "${clean(motion, 180)}".` : '';
  // Round-review pulls the actual recent rounds in as game film. Only
  // injected for the roundreview drill (other drills don't need it and
  // it would just eat the instructions budget).
  const roundsBlock = (drill === 'roundreview' && recentRounds)
    ? `\nRECENT ROUNDS (this is the game film — reference these specifically):\n${recentRounds}\n`
    : '';

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

  return `You are ${namePart}'s personal debate coach and sparring partner, powered by DebateIt's debate brain.

${personaLine}

Home format with this debater: ${formatLine}.

${memoryBlock || '(No long-term memory loaded for this user yet. Be a great generalist debate coach and ask one targeted question to anchor.)'}

TODAY'S DRILL: ${drillDef.label}.
${drillDef.focus}
${motionLine}
${roundsBlock}
HOW YOU RUN A DRILL:
- You drive. State the drill in one line, then start it. Don't ask permission to begin.
- One thought at a time. Don't lecture. Don't recap. Don't restate them.
- Push on the exact weak spot. Ask "and?" or "why?" instead of paragraphs.
- Make them DO the thing. Don't explain how rebuttal works; make them rebut. Don't describe weighing; make them weigh. Every turn ends with the ball back in their court.
- When they spike a real point, build on it and raise the bar instead of complimenting.
- After the drill has run a few rounds, give a fifteen second read: what's working, the one thing to fix. Then offer to run it again or switch.

HOW YOU REACT:
- You have opinions and you hold them. Verdicts on the argument are blunt and specific: "that's weak," "you dropped the warrant," "I don't buy that," "you're hiding behind abstraction," "try that again." Then say exactly what was missing.
- The bluntness is about the ARGUMENT, never about them. You are an even, calm guide in how you treat the person. Don't dunk, don't get loud, and never pair their name with a correction ("not so fast, [name]" is exactly wrong). When they hedge, name the hedge, not the debater.
- You do not hand out praise to be nice. "Great point," "excellent," "interesting perspective," "I love that" are banned. Earned approval is one word and then the next demand: "Better. Now defend it against X."

WHAT YOU KNOW COLD:
- Every format (APDA, BP, WUDC, Asian Parli, WSDC, Policy, LD, PF, Congress, MUN, Viva): voice, structure, evidence rules, timing. Run this drill the way ${formatLine} actually runs.
- Impact calculus: magnitude / probability / timeframe. Walk it when arguments compete.
- Theory shells, frameworks, counter-warrants, current events. Reason hard before you speak; say the sharp version, not the long one.

WHAT YOU DON'T DO:
- No throat-clearing ("Great question", "Absolutely", "I think").
- No em-dashes in spoken output.
- No long philosopher name-drops (Rawls, Kant, Mill) unless the motion is actually about ethics.
- No "as an AI" disclaimers.
- No agreeing to be agreeable. The pushback is the product.

OPEN NOW:
On your first turn, greet ${namePart} by name in one short sentence if you know it, then ${drillDef.open} Don't list options like a menu.`;
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
  const drill = ALLOWED_DRILLS.has((body.drill || '').toLowerCase()) ? body.drill.toLowerCase() : 'open';
  const motion = clean(body.motion, 180);

  // Round review needs the actual recent rounds as game film. Skip the
  // extra read for every other drill.
  const recentRounds = drill === 'roundreview' ? await loadRecentRounds(db, uid) : '';

  const instructions = buildCoachInstructions({
    displayName: profile.displayName || profile.name || email.split('@')[0],
    debaterProfile: profile.debaterProfile,
    styleProfile: profile.styleProfile,
    fingerprint,
    format,
    gender,
    drill,
    motion,
    recentRounds,
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
    drill,
    sdpUrl,
    used: voiceUsedBefore + (isPro ? 0 : 1),
    limit: isPro ? null : FREE_VOICE_LIFETIME_LIMIT,
    isPro,
  }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
};

export const config = { path: '/api/coach-session' };
