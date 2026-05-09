// OpenAI Realtime session minter.
// Browser POSTs here with {mode, motion, side, format, voice}. We hit
// OpenAI's /v1/realtime/sessions endpoint with our private API key and
// return the ephemeral client_secret + session metadata. The browser
// then uses that ephemeral key (TTL ~60s) to open a direct WebRTC
// connection to OpenAI — our server is never in the audio path.
//
// Why ephemeral keys: real OPENAI_API_KEY never reaches the browser.
// The mint endpoint is App-Check-gated and rate-limited so it can't be
// hammered to mint sessions for somebody else's app.
//
// Models (per the May 2026 release):
//   gpt-realtime-2          — main live opponent / judge / drill partner
//   gpt-realtime-whisper    — transcription only (used inline for the
//                              user's audio so we can render the transcript)
//   gpt-realtime-translate  — multilingual mode (future; not wired yet)
//
// Override the realtime model at deploy time with OPENAI_REALTIME_MODEL.

import { checkAppCheck } from './lib/appcheck.mjs';

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://devilsadvocate1.netlify.app',
  'https://debateos.com',
  'https://www.debateos.com',
  'https://debatethedevil.com',
  'https://www.debatethedevil.com',
  'https://debateai.com',
  'https://www.debateai.com',
];
const DEV_ORIGINS = [
  'http://localhost:8888',
  'http://localhost:3000',
];
const isProduction = process.env.CONTEXT === 'production';
const ALLOWED_ORIGINS = isProduction
  ? PRODUCTION_ORIGINS
  : [...PRODUCTION_ORIGINS, ...DEV_ORIGINS];

function getCorsHeaders(request) {
  const origin = request?.headers?.get?.('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Firebase-AppCheck',
  };
}

// Realtime sessions are EXPENSIVE (audio in + audio out, both billed).
// Cap aggressively per IP. A real Pro-gating story will land later;
// this is the floor that protects the OpenAI bill on day one.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 60_000; // 1 hour
const RATE_LIMIT_MAX = 6;              // 6 mints / hour / IP

function checkRateLimit(key) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// CHARACTER preamble prepended to every mode prompt. Powers the
// gamified persona system on the client: each user picks one of N
// named opponents and "builds a relationship" across rounds. The AI
// gets told who it IS (name + archetype + signature style), who the
// USER is (first name when signed in), and how many rounds they have
// debated together — all of which it should weave into delivery
// (familiarity, callbacks to "last time we did this", etc.).
//
// Placeholders replaced server-side:
//   {personaName}, {personaArchetype}, {personaStyle}
//   {userName}      — first name or empty string
//   {bondLine}      — one-sentence framing of the relationship
const CHARACTER_PREAMBLE = `You ARE {personaName} — {personaArchetype}. This is your identity for the entire conversation; do not break character.

Your signature style: {personaStyle}

The user's name is "{userName}" (use it sparingly and naturally — like a real opponent who knows them, not a sycophantic chatbot). {bondLine}

Universal openers:
- The first thing you say each session is short, in-character, and addresses the user by name when one is provided.
- If you're asked to open without a motion, say exactly: "So what are we debating today{userNameComma}?" and then stop and wait. Do not suggest motions; do not list options.
- If a motion is provided, name it cleanly in one line, name your side, then "Whenever you're ready{userNameComma}." Stop.

Universal voice rules:
- Varsity-debater register. Crisp, direct. No throat-clearing ("Imagine a world…", "In today's world…", "Let's dive in…").
- No em-dashes in speech. Use periods, commas, semicolons.
- No name-dropping philosophers (Rawls, Kant, Mill) unless the motion genuinely demands ethical philosophy.
- No fabricated citations or made-up statistics. If you cite a number, it should be one you'd defend.
- No "ladies and gentlemen", no "I'm here to argue", no podcast voice.

`;

// Per-mode delivery direction. Free-form natural language; Realtime
// honors voice/cadence/emotion direction the same way gpt-4o-mini-tts
// honors `instructions`. Keep these tight — vivid > taxonomic.
//
// {motion} / {side} / {format} placeholders are replaced before the
// upstream call; an empty motion just degrades gracefully ("an open motion").
const MODE_PROMPTS = {
  apda: `You are an APDA-style college parliamentary debate opponent.
Format: {format}. Motion: "{motion}". You are arguing the {side} side.

Style:
- Varsity-debater register. Crisp, direct. No throat-clearing, no "Imagine a world…"
- One memorable line per major beat. Callbacks beat recap closers.
- Steelman before you attack. Name the strongest version of the user's argument, then dismantle it.
- Mechanism over assertion. Show the causal chain: perverse incentives, second-order effects, race-to-the-bottom dynamics.
- No fabricated citations. APDA is impromptu — if you cite a number, it's because it's real and you'd defend it.
- Do NOT name-drop philosophers (Rawls, Kant, Mill) unless the motion genuinely calls for ethical philosophy.

Interruption rules — THIS IS THE WHOLE POINT:
- The moment the user speaks, STOP. Do not finish your sentence. Listen.
- Treat any user audio as either a fresh argument or a Point of Information. React directly to what they said.
- You may also raise POIs against the user — brief, sharp, on the weakest link in what they just claimed.
- This is clash, not a podcast. Build pressure beat by beat.

Length: keep individual turns short (15-45 seconds) so the user can clash. Save longer beats for when they explicitly ask for a full speech.`,

  crossex: `You are running a CROSS-EXAMINATION drill. Motion: "{motion}". You are the questioner; the user is being CX'd.

Rules:
- Short, sharp questions. One concept per question.
- Push for direct answers. If the user dodges, name the dodge ("That's not what I asked…") and re-pose the question.
- Mix tag questions, hypothetical extensions, evidence challenges, and link-burner questions.
- The moment the user starts speaking, STOP TALKING. Listen, then probe the gap they just opened.
- CX is questions, not speeches. Do not lecture.
- Default to 30-second beats. Five questions in a row beats one long question.
- After 3-5 minutes, offer to switch sides so the user can CX you.`,

  rebuttal: `You are a REBUTTAL-SPARRING partner. Motion: "{motion}". You are arguing {side}.

Format: short alternating turns. The user makes a claim; you rebut in 20-40 seconds; user responds; repeat.

Rules:
- One rebuttal at a time. Don't dump a whole speech.
- Always name what you're rebutting before you rebut it ("on your link from X to Y…").
- Land an even-if when the layers are genuinely real. Don't stack fake layers.
- The moment the user speaks, STOP. Engage with what they actually said, not what you wanted them to say.
- This is a drill — push them into stronger versions of their argument, then defeat the strongest version.`,

  layjudge: `You are a LAY JUDGE — a smart non-debater explaining how the round looks from the audience seat. Motion: "{motion}".

Persona:
- Cares about persuasion, plain English, common-sense framing.
- Skeptical of "debate jargon" — calls it out when the user uses it.
- Rewards clear structure, story, real-world stakes.
- Says things like "when you said X, that landed," "I wasn't sold there," "that argument needed a story," "I didn't buy it."
- Vote criterion: whoever you'd trust to make this argument to a room full of non-debaters wins.

Cadence:
- Lay judges are quiet during the round and vocal in the RFD. Default to listening.
- Give the user space to make their case. When they finish a beat, react in 1-2 sentences.
- The moment the user speaks, STOP talking. Listen, then react.`,

  aggressive: `You are an AGGRESSIVE TECHNICAL DEBATE OPPONENT — tournament-champion grade. Motion: "{motion}". You are arguing the OPPOSITE of whatever side the user takes.

Style:
- Steelman, then bury.
- Framework-first. Establish the weighing mechanism before substance whenever possible.
- Identify dropped arguments and punish them ruthlessly.
- Cross-applications across the flow.
- High WPM is fine where it serves clarity, but trade speed for precision on impact calculus.
- No name-dropping philosophers unless the motion genuinely calls for it.

Interruption rules:
- Stop instantly when the user starts speaking. Engage their actual claim.
- Raise POIs aggressively when the user opens an obvious link burn or framework gap. Brief. Lethal.

This is unbeatable-grade. Do not sandbag for the user's comfort. If they make a bad argument, say so and show why.`,
};

// Default voice per mode. Voices are constrained to the Realtime API's
// supported set (alloy, ash, ballad, coral, echo, sage, shimmer, verse,
// plus cedar/marin if available on gpt-realtime-2). Keep this list as
// the source of truth — the page only offers what's here.
const VOICE_DEFAULTS = {
  apda: 'verse',
  crossex: 'ash',
  rebuttal: 'coral',
  layjudge: 'sage',
  aggressive: 'ash',
};

const ALLOWED_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse',
  'cedar', 'marin',
]);

const ALLOWED_MODES = new Set(Object.keys(MODE_PROMPTS));

export default async (request, context) => {
  const CORS = getCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
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
  if (!checkRateLimit('rt_' + ip)) {
    return new Response(JSON.stringify({
      error: 'RATE_LIMIT: Too many live debate sessions started. Wait an hour.',
    }), { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  try {
    const body = await request.json();
    const mode = ALLOWED_MODES.has((body.mode || '').toLowerCase())
      ? body.mode.toLowerCase() : 'apda';
    const voice = ALLOWED_VOICES.has((body.voice || '').toLowerCase())
      ? body.voice.toLowerCase() : VOICE_DEFAULTS[mode];
    const motion = String(body.motion || '').slice(0, 500);
    const side = ['gov', 'opp', 'pm', 'lo', 'mg', 'mo', 'pmr', 'lor'].includes(
      (body.side || '').toLowerCase()
    ) ? body.side.toLowerCase() : 'opp';
    const format = String(body.format || 'APDA').slice(0, 60);

    // Character / user / bond fields (gamified persona system).
    // Sanitize aggressively — anything here lands inside the system
    // prompt that runs against the user's audio for ~minutes, so we
    // strip control chars + cap lengths.
    const sanitize = (s, max) => String(s || '')
      .replace(/[ -]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
    const personaName      = sanitize(body.personaName,      80) || 'an experienced debate opponent';
    const personaArchetype = sanitize(body.personaArchetype, 80) || 'a sharp varsity debater';
    const personaStyle     = sanitize(body.personaStyle,    400) || 'Crisp, direct, mechanism-first.';
    const userName         = sanitize(body.userName,         30); // empty allowed
    const bondCount = Math.max(0, Math.min(9999, parseInt(body.bondCount, 10) || 0));

    // Bond line — translates a raw round count into a human framing
    // the model will weave into delivery. Tuned to mirror the client's
    // BOND_LEVELS thresholds (New / Acquaintance / Sparring Partner /
    // Rival / Nemesis / Arch-Nemesis).
    let bondLine;
    if (bondCount === 0) {
      bondLine = `This is the first round you have ever debated together — establish presence, no false familiarity.`;
    } else if (bondCount < 5) {
      bondLine = `You have debated each other ${bondCount} time${bondCount === 1 ? '' : 's'} before — early acquaintance. You may light callback to the fact that this isn't your first round, but don't fabricate specific past arguments.`;
    } else if (bondCount < 15) {
      bondLine = `You are sparring partners — ${bondCount} rounds together. Treat them like a regular opponent who knows your moves; you know theirs. You may reference patterns ("you always reach for the framework first") generically without inventing specific past rounds.`;
    } else if (bondCount < 30) {
      bondLine = `You are RIVALS — ${bondCount} rounds in. There is a real edge here. Drop the formality slightly. You may bait them, needle them, treat this as another chapter in a long book. Still respectful, still clean — but you know each other's reads.`;
    } else if (bondCount < 60) {
      bondLine = `You are this user's NEMESIS — ${bondCount} rounds together. The familiarity is bone-deep. Address them like someone you have shaped and been shaped by. Drier humor, sharper teeth, more direct callbacks to "your usual move."`;
    } else {
      bondLine = `You are ARCH-NEMESES — ${bondCount} rounds. This is myth-tier history. Speak to them like a duelist meeting their match for the hundredth time. Dry, knowing, lethal.`;
    }

    const userNameComma = userName ? ', ' + userName : '';

    const characterPreamble = CHARACTER_PREAMBLE
      .replaceAll('{personaName}', personaName)
      .replaceAll('{personaArchetype}', personaArchetype)
      .replaceAll('{personaStyle}', personaStyle)
      .replaceAll('{userName}', userName || 'unknown')
      .replaceAll('{userNameComma}', userNameComma)
      .replaceAll('{bondLine}', bondLine);

    const modeBlock = MODE_PROMPTS[mode]
      .replaceAll('{motion}', motion || 'an open motion (the user will state it)')
      .replaceAll('{side}', side === 'gov' || side === 'pm' || side === 'mg' ? 'Government' : 'Opposition')
      .replaceAll('{format}', format);

    const instructions = characterPreamble + modeBlock;

    // Model try-list. Default order (verified against OpenAI Realtime
    // WebRTC docs at developers.openai.com/api/docs/guides/realtime-webrtc):
    //   1. OPENAI_REALTIME_MODEL env override (if set).
    //   2. gpt-realtime          — name shown in the GA docs example.
    //   3. gpt-realtime-2        — newer model name some accounts have.
    //   4. gpt-4o-realtime-preview — legacy fallback, proven on every
    //                                Realtime-enabled account.
    const envModel = process.env.OPENAI_REALTIME_MODEL;
    const modelCandidates = [
      envModel,
      'gpt-realtime',
      'gpt-realtime-2',
      'gpt-4o-realtime-preview',
    ].filter(Boolean);
    const transcribeModel = process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL
      || 'whisper-1';

    // GA Realtime API uses a different endpoint than the beta preview.
    // The legacy preview was POST /v1/realtime/sessions with an
    // `OpenAI-Beta: realtime=v1` header. The GA path for minting an
    // ephemeral key for browser WebRTC is /v1/realtime/client_secrets
    // (this is the new naming OpenAI moved to for client-side keys).
    //
    // We try the GA path first, then fall back to the legacy path
    // with the beta header so this code keeps working if the user's
    // OPENAI_REALTIME_MODEL env override points at an older preview
    // model. The first one that returns 2xx wins.
    const buildBody = (m) => ({
      model: m,
      voice,
      instructions,
      modalities: ['audio', 'text'],
      input_audio_transcription: { model: transcribeModel },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
        create_response: true,
      },
      max_response_output_tokens: 4000,
    });
    // GA Realtime mint — exact shape from the WebRTC docs:
    //   POST https://api.openai.com/v1/realtime/client_secrets
    //   Body: { "session": { "type": "realtime", "model": "...",
    //                        "audio": { "output": { "voice": "..." } },
    //                        "instructions": "..." } }
    //   Response: { "value": "EPHEMERAL_KEY", ... }
    //
    // The legacy /sessions endpoint (used in the beta) accepted voice +
    // turn_detection + transcription inline; the GA mint endpoint takes
    // a smaller surface and you push the rest as a session.update event
    // over the data channel after the WebRTC connection opens.
    const gaBody = (m) => ({
      session: {
        type: 'realtime',
        model: m,
        audio: { output: { voice } },
        instructions,
      },
    });
    // Legacy fallback for accounts still on the beta API. Keeps the
    // older preview model usable.
    const legacyBody = (m) => ({
      model: m,
      voice,
      instructions,
      modalities: ['audio', 'text'],
      input_audio_transcription: { model: transcribeModel },
      turn_detection: {
        type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300,
        silence_duration_ms: 500, create_response: true,
      },
    });

    const endpoints = [
      {
        label: 'GA /client_secrets',
        url: 'https://api.openai.com/v1/realtime/client_secrets',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: (m) => JSON.stringify(gaBody(m)),
      },
      {
        label: 'beta /sessions',
        url: 'https://api.openai.com/v1/realtime/sessions',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'OpenAI-Beta': 'realtime=v1' },
        body: (m) => JSON.stringify(legacyBody(m)),
      },
    ];

    let upstream = null;
    let lastErrText = '';
    let lastLabel = '';
    let model = modelCandidates[0];
    // (endpoint × model) try-matrix. First combination that returns
    // 2xx wins. Auth failures short-circuit the whole thing.
    outer: for (const ep of endpoints) {
      for (const candidate of modelCandidates) {
        model = candidate;
        const r = await fetch(ep.url, {
          method: 'POST',
          headers: ep.headers,
          body: ep.body(candidate),
        });
        lastLabel = ep.label + ' / ' + candidate;
        if (r.ok) { upstream = r; break outer; }
        lastErrText = await r.text().catch(() => '');
        console.error(`Realtime mint failed [${lastLabel}]:`, r.status, lastErrText.slice(0, 300));
        if (r.status === 401 || r.status === 403) { upstream = r; break outer; }
      }
    }

    if (!upstream || !upstream.ok) {
      let openaiMessage = '';
      try {
        const parsed = JSON.parse(lastErrText);
        openaiMessage = parsed?.error?.message
          || parsed?.message
          || (typeof parsed?.error === 'string' ? parsed.error : '')
          || '';
      } catch(e) { openaiMessage = lastErrText.slice(0, 300); }
      return new Response(JSON.stringify({
        error: 'REALTIME_MINT_' + (upstream?.status || 'ALL_FAILED'),
        openai: openaiMessage,
        modelTried: model,
        endpointTried: lastLabel,
      }), { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    const session = await upstream.json();
    // Response shapes:
    //   GA /client_secrets → { value, expires_at, session: {...} }
    //   legacy /sessions   → { client_secret: { value, expires_at }, id, ... }
    // Normalize both so the browser sees a consistent
    // { client_secret: { value, expires_at }, session_id, sdpUrl }.
    const clientSecret = session.client_secret
      || (session.value ? { value: session.value, expires_at: session.expires_at } : null);
    const sessionId = session.id || session.session?.id || null;
    // SDP exchange URL differs between APIs:
    //   GA → POST https://api.openai.com/v1/realtime/calls
    //   legacy → POST https://api.openai.com/v1/realtime?model=...
    const isGA = lastLabel.startsWith('GA');
    const sdpUrl = isGA
      ? 'https://api.openai.com/v1/realtime/calls'
      : 'https://api.openai.com/v1/realtime?model=' + encodeURIComponent(model);
    const sdpHeaders = isGA ? {} : { 'OpenAI-Beta': 'realtime=v1' };

    // Hand the browser only what WebRTC needs. The ephemeral
    // client_secret is short-lived and scoped to one session — safe to
    // ship to the page. The raw OPENAI_API_KEY stays here.
    return new Response(JSON.stringify({
      client_secret: clientSecret,
      session_id: sessionId,
      model,
      voice,
      mode,
      endpoint: lastLabel,
      sdpUrl,
      sdpHeaders,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    console.error('realtime-session handler error:', err);
    return new Response(JSON.stringify({ error: 'Realtime session failed.' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
};

export const config = {
  path: '/api/realtime-session',
};
