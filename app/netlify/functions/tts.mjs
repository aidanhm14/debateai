// Text-to-Speech proxy
// - Premium (default): ElevenLabs turbo_v2_5 streaming — expressive, voice-matched to debater personalities
// - Premium + opt-in Cartesia: pass body.provider === 'cartesia' to A/B-test Sonic (faster, cheaper, flatter)
// - Free + fallback: OpenAI gpt-4o-mini-tts with per-persona `instructions` steering
//   (March-2025 model — supports natural-language delivery direction; massively
//    closes the gap to the premium providers without changing the voice list).
//   Override the model with env OPENAI_TTS_MODEL=tts-1 if a rollback is needed.
import { checkAppCheck } from './lib/appcheck.mjs';
import { humanizeForTTS } from './lib/tts-humanize.mjs';

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
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 60;

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

const MAX_TEXT_LENGTH = 5000;

// ElevenLabs voice ID mapping — matched per-personality. Mix of American
// and British accents now to widen the range of opponents users hear.
const ELEVENLABS_VOICES = {
  professor:   'pNInz6obpgDQGcFmaJgB',  // Adam — dominant, firm, American male
  closer:      'EXAVITQu4vr4xnSDxMaL',  // Sarah — mature, confident, American female
  surgeon:     'cjVigY5qzO86Huf0OWal',   // Eric — smooth, trustworthy, American male
  veteran:     'nPczCjzI2devNBz1zQrb',   // Brian — deep, resonant, American male
  firebrand:   'TX3LPaxmHKxFdv7VOQHJ',  // Liam — energetic, young, American male
  diplomat:    'XrExE9yKIg1WjnnlVkGX',   // Matilda — professional, American female
  debater:     'jsCqWAovK2LkecY7zXl4',   // Freya — quick, sharp, American female
  philosopher: 'IKne3meq5aSn9XLyUdCD',   // Charlie — thoughtful, calm, American male
  prosecutor:  'bIHbv24MWmeRgasZH58o',   // Will — intense, direct, American male
  storyteller: 'FGY2WhTYpPnrIDTdsKH5',   // Laura — warm, narrative, American female
  // Expansion pack — broader range of debate archetypes:
  statesman:   'JBFqnCBsd6RMkjVDRZzb',   // George — warm British, gravitas
  barrister:   'onwK4e9ZLuTAKqWW03F9',   // Daniel — British authoritative, courtroom
  upstart:     'pFZP5JQG7iQjIQuC4Bku',   // Lily — youthful British female, sharp
  heckler:     'CwhRBWXzGAHq8TQ4Fs17',   // Roger — gravelly older male, sardonic
  disruptor:   'cgSgspJ2msm6clMCkdW9',   // Jessica — youthful female, high-energy
  tactician:   'pqHfZKP75CvOlQylNhV4',   // Bill — calm narrator male, measured
  // Counter (oral exam) extension default persona. Indian-English
  // examiner. ElevenLabs voice ID is a placeholder — falls back to the
  // measured-narrator voice until an Indian-English voice ID is dropped
  // in via env override (ELEVENLABS_VOICE_EXAMINER) or hard-set here.
  // Free tier (OpenAI gpt-4o-mini-tts) gets the accent steering via
  // OPENAI_PERSONA_INSTRUCTIONS below, which is more important than the
  // ElevenLabs swap given who's actually using oral exam mode.
  examiner:    process.env.ELEVENLABS_VOICE_EXAMINER || 'pqHfZKP75CvOlQylNhV4',
};

// Free-tier fallback. OpenAI only ships 10 voices, so new personas reuse
// the closest match. Keys here MUST mirror ELEVENLABS_VOICES — anything
// unmapped falls through to 'onyx'. Used by the handler when premium=false
// or when the ElevenLabs provider returns non-OK.
const PERSONA_TO_OPENAI = {
  professor: 'onyx',
  closer: 'echo',
  surgeon: 'fable',
  veteran: 'alloy',
  firebrand: 'nova',
  diplomat: 'shimmer',
  debater: 'coral',
  philosopher: 'sage',
  prosecutor: 'ash',
  storyteller: 'ballad',
  statesman: 'onyx',     // closest match: deep, authoritative
  barrister: 'ash',      // closest match: intense, direct
  upstart: 'coral',      // closest match: quick, sharp
  heckler: 'alloy',      // closest match: rich baritone, dry
  disruptor: 'nova',     // closest match: high-energy
  tactician: 'sage',     // closest match: thoughtful, measured
  examiner: 'sage',      // measured academic; Indian-English steered via instructions
};

// Cartesia Sonic voice IDs — placeholder mapping for the opt-in A/B flag.
// Pick real IDs from play.cartesia.ai/voices before relying on this provider.
const CARTESIA_VOICES = {
  professor:   'a0e99841-438c-4a64-b679-ae501e7d6091',
  closer:      'b7d50908-b17c-442d-ad8d-810c63997ed9',
  surgeon:     '421b3369-f63f-4b03-8980-37a44df1d4e8',
  veteran:     '79743797-2087-422f-8dc7-86f9efca85f1',
  firebrand:   '41534ada-d9a3-4f24-b9d5-3a8e1f2f7fc0',
  diplomat:    'bf991597-6c13-47e4-8411-91ec2de5c466',
  debater:     'd46abd1d-2d02-43e8-819f-51fb652c1c61',
  philosopher: 'a167e0f3-df7e-4d52-a9c3-f949145efdab',
  prosecutor:  '820a3788-2b37-4d21-847a-b65d8a68c99a',
  storyteller: '248be419-c632-4f23-adf1-5324ed7dbf1d',
  // Expansion pack — placeholder IDs (Cartesia is opt-in; replace before relying on it):
  statesman:   'a0e99841-438c-4a64-b679-ae501e7d6091',
  barrister:   '820a3788-2b37-4d21-847a-b65d8a68c99a',
  upstart:     'd46abd1d-2d02-43e8-819f-51fb652c1c61',
  heckler:     '79743797-2087-422f-8dc7-86f9efca85f1',
  disruptor:   '41534ada-d9a3-4f24-b9d5-3a8e1f2f7fc0',
  tactician:   'a167e0f3-df7e-4d52-a9c3-f949145efdab',
  // Examiner (Counter ext default). Cartesia is opt-in; ID falls back
  // to the philosopher voice until an Indian-English Cartesia voice is
  // wired in via env override.
  examiner:    process.env.CARTESIA_VOICE_EXAMINER || 'a167e0f3-df7e-4d52-a9c3-f949145efdab',
};

// Map OpenAI voice keys to personality keys
const OPENAI_TO_PERSONALITY = {
  onyx: 'professor',
  echo: 'closer',
  fable: 'surgeon',
  alloy: 'veteran',
  nova: 'firebrand',
  shimmer: 'diplomat',
  coral: 'debater',
  sage: 'philosopher',
  ash: 'prosecutor',
  ballad: 'storyteller',
};

// Set of valid OpenAI voice keys. Any incoming `voice` that isn't in this
// set must be translated through PERSONA_TO_OPENAI before hitting OpenAI's
// API, otherwise the request 400s with "invalid_voice".
const OPENAI_VALID_VOICES = new Set(Object.keys(OPENAI_TO_PERSONALITY));
function resolveOpenAIVoice(voice){
  if (OPENAI_VALID_VOICES.has(voice)) return voice;
  return PERSONA_TO_OPENAI[voice] || 'onyx';
}

// ElevenLabs TTS with streaming for faster first-byte
// intensity: 0 = calm deliberate delivery, 1 = breathless sprint (tournament speed)
async function elevenLabsTTS(text, voice, speed, apiKey, intensity = 0) {
  const personality = OPENAI_TO_PERSONALITY[voice] || voice;
  const voiceId = ELEVENLABS_VOICES[personality] || ELEVENLABS_VOICES.professor;

  // At high intensity: lower stability → more variation/breathlessness, higher style → more expressive
  const stability = Math.max(0.15, Math.min(0.8, 0.7 - intensity * 0.55));
  const style = Math.min(1.0, 0.3 + intensity * 0.5);
  const similarityBoost = Math.max(0.55, 0.75 - intensity * 0.2);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: true,
      },
      optimize_streaming_latency: 3,
    }),
  });

  return response;
}

// Cartesia Sonic — opt-in via body.provider === 'cartesia'
async function cartesiaTTS(text, voice, speed, apiKey, intensity = 0) {
  const personality = OPENAI_TO_PERSONALITY[voice] || voice;
  const voiceId = CARTESIA_VOICES[personality] || CARTESIA_VOICES.professor;

  const speedParam = intensity > 0.6 ? 'fastest' : intensity > 0.3 ? 'fast' : 'normal';
  const emotionTags = intensity > 0.5 ? ['positivity:high', 'curiosity:high'] : [];

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': '2024-11-13',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-2',
      transcript: text,
      voice: {
        mode: 'id',
        id: voiceId,
        __experimental_controls: {
          speed: speedParam,
          emotion: emotionTags,
        },
      },
      output_format: {
        container: 'mp3',
        sample_rate: 44100,
        bit_rate: 128000,
      },
      language: 'en',
    }),
  });

  return response;
}

// Per-persona delivery direction — passed as the `instructions` field to
// gpt-4o-mini-tts. The model honors free-form natural-language steering
// (tone, cadence, emotional weight, accent hints), which is what closes
// the perceived gap to ElevenLabs without changing the voice list.
// Keep these tight: 1–2 sentences max. The model takes vivid, concrete
// direction better than long taxonomies.
const OPENAI_PERSONA_INSTRUCTIONS = {
  professor:   'Speak like a tenured lecturer commanding a hall — deep, deliberate, every word weighted. No hesitation, no hedging.',
  closer:      'Speak with the calm confidence of a closer who already knows she has won the round. Smooth, persuasive, slightly satisfied.',
  surgeon:     'Speak with cold surgical precision — measured pauses between clauses, dissecting each claim with care.',
  veteran:     'Speak in the rich baritone of a 500-round veteran. Unhurried, unsurprised, dryly authoritative.',
  firebrand:   'Speak with relentless conviction — emphatic, forward-leaning, every claim hot to the touch. Build pressure beat by beat.',
  diplomat:    'Speak with polished diplomatic poise — warm, composed, making sharp attacks sound entirely reasonable.',
  debater:     'Speak fast and sharp like a college circuit debater — quick wit, crisp consonants, slight upward energy on impact lines.',
  philosopher: 'Speak slowly and reflectively, like leading a Socratic seminar. Long internal pauses, gentle emphasis on key terms.',
  prosecutor:  'Speak with prosecutorial intensity — clipped, accusatory, building toward each conclusion like a closing argument.',
  storyteller: 'Speak warmly and narratively, like opening a documentary. Land emotional beats softly; let the story do the persuasion.',
  statesman:   'Speak with British parliamentary gravitas — warm baritone, measured cadence, the senior MP closing for the Crown.',
  barrister:   'Speak with crisp British courtroom precision — exacting, deliberate, picking apart claims one by one.',
  upstart:     'Speak with hungry youthful British energy — quick, sharp, like the freshman who read every paper before the round.',
  heckler:     'Speak gravelly and sardonic — older, world-weary, like you have heard this argument fifty times and stopped pretending otherwise.',
  disruptor:   'Speak with high-energy challenger cadence — interruptive, slightly irreverent, thriving on chaos in the round.',
  tactician:   'Speak quietly and three moves ahead — calm, tactical, never raising the voice but always landing the point.',
  examiner:    'Speak in measured Indian-English with senior-academic cadence. Even pacing, slight musical lift on probe questions, no theatrics. Patient between question and answer, warm but not eager. The register of a senior school panel examiner conducting a viva. No rhotic American R, no British clipping; standard Indian-English vowels.',
};

function buildOpenAIInstructions(voice, intensity) {
  const personality = OPENAI_TO_PERSONALITY[voice] || voice;
  const base = OPENAI_PERSONA_INSTRUCTIONS[personality] || OPENAI_PERSONA_INSTRUCTIONS.professor;
  // Intensity overlay: at high values, ask for urgent stakes + faster
  // cadence; at the low end leave the calm baseline alone. Same dial the
  // ElevenLabs path uses — keeps cross-provider behavior coherent.
  if (intensity > 0.6) {
    return base + ' Elevated emotion — urgent stakes, faster cadence, breath audible on emphasis.';
  }
  if (intensity > 0.3) {
    return base + ' Lean into rhetorical peaks; clear emotional inflection on big claims.';
  }
  return base;
}

async function openAITTS(text, voice, speed, apiKey, intensity = 0, customInstructions = null) {
  // Translate persona keys (statesman, barrister, etc.) to a valid OpenAI
  // voice key before calling. Without this, free-tier requests for new
  // personas would get rejected by OpenAI with invalid_voice.
  const safeVoice = resolveOpenAIVoice(voice);

  // Model try-list. We attempt the highest-quality first and fall back
  // through known-good models so a hiccup with one (model not yet
  // available on this account, instructions field rejected, etc.)
  // doesn't black-hole the audio for the user. tts-1 is the proven
  // floor — every account that has Audio API access can call it.
  const envModel = process.env.OPENAI_TTS_MODEL;
  const candidates = [envModel, 'gpt-4o-mini-tts', 'tts-1'].filter(Boolean);

  let lastErr = null;
  for (const model of candidates) {
    const supportsInstructions = model !== 'tts-1' && model !== 'tts-1-hd';
    const body = {
      model,
      input: text,
      voice: safeVoice,
      speed: speed,
      response_format: 'mp3',
    };
    if (supportsInstructions) {
      // Caller can override the auto-built persona instructions by
      // passing a string in the request body. Used by the landing
      // orb, which wants a casual conversational register instead of
      // the in-round prosecutorial / professorial defaults.
      body.instructions = customInstructions || buildOpenAIInstructions(voice, intensity);
    }
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return response;
    // Capture and continue. Status-code logic: 4xx is usually
    // model/param-specific so trying another model can help; 5xx is
    // usually upstream-wide so trying again won't help — but the cost
    // is one extra fetch, fine.
    lastErr = { model, status: response.status, text: await response.text().catch(() => '') };
    console.error(`[tts] openai model "${model}" failed:`, response.status, (lastErr.text || '').slice(0, 240));
  }
  // All candidates failed — synthesize a Response object the outer
  // handler can inspect. status=502 makes the surrounding code treat
  // this as an upstream failure and surface a clear error to the user.
  return new Response(
    JSON.stringify({ error: 'OPENAI_TTS_ALL_FAILED', last: lastErr }),
    { status: lastErr?.status || 502, headers: { 'Content-Type': 'application/json' } }
  );
}

// Inworld TTS — opt-in via body.provider === 'inworld' for Pro users.
// Sub-200ms latency, fully multilingual, "#1 ranked TTS" per their pitch.
// Field names follow the Inworld v1 spec exactly: snake_case for body
// keys, "voice_id" + "model_id", audio_config wrapper, Basic auth.
// Voice names map our debater personalities → Inworld's stock voices.
// Fallback for unknown personality is "Sarah" (the platform's default
// example voice — bright American female).
const INWORLD_VOICES = {
  professor:   'Christopher',  // Deep authoritative male
  closer:      'Sarah',        // Mature confident female
  surgeon:     'Adam',         // Smooth trustworthy male
  veteran:     'Eric',         // Resonant gravitas
  firebrand:   'Liam',         // Energetic young male
  diplomat:    'Matilda',      // Professional female
  debater:     'Freya',        // Sharp quick female
  philosopher: 'Charlie',      // Thoughtful calm male
  prosecutor:  'Will',         // Intense direct male
  storyteller: 'Laura',        // Warm narrative female
  statesman:   'George',       // Warm British male
  barrister:   'Daniel',       // British authoritative
  upstart:     'Lily',         // Youthful British female
  heckler:     'Roger',        // Gravelly older male
  disruptor:   'Jessica',      // Youthful energy female
  tactician:   'Bill',         // Calm narrator male
  // Examiner (Counter ext default). Inworld is Pro opt-in; falls back
  // to the calm-narrator voice until an Indian-English Inworld voice
  // is wired in via INWORLD_VOICE_EXAMINER. Accent direction comes
  // from the system prompt either way.
  examiner:    process.env.INWORLD_VOICE_EXAMINER || 'Bill',
};
async function inworldTTS(text, voice, speed, apiKey) {
  const personality = OPENAI_TO_PERSONALITY[voice] || voice;
  const voiceId = INWORLD_VOICES[personality] || 'Sarah';
  // Inworld uses Basic auth with the raw key as the credential (no
  // base64 encoding). The "Basic " prefix is part of their format —
  // see the Make Your First API Call page on inworld.ai. If a future
  // deploy needs base64-encoded credentials, set INWORLD_AUTH_BASE64=1.
  const useBase64 = process.env.INWORLD_AUTH_BASE64 === '1';
  const cred = useBase64 ? Buffer.from(apiKey).toString('base64') : apiKey;
  const auth = `Basic ${cred}`;
  const response = await fetch('https://api.inworld.ai/tts/v1/voice', {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      model_id: 'inworld-tts-1.5-max',
      audio_config: {
        audio_encoding: 'MP3',
      },
    }),
  });
  // Inworld responds with a JSON envelope: { audioContent: "<base64>" }
  // — repackage it as a raw mp3 byte response so it matches the shape
  // the other providers (ElevenLabs/Cartesia/OpenAI) return. The client
  // expects to consume `response.body` as an audio blob; staying
  // byte-stream parity here means no client-side branching per provider.
  if (response.ok) {
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await response.json().catch(() => ({}));
      const b64 = j.audioContent || j.audio || j.audio_content;
      if (b64) {
        const buf = Buffer.from(b64, 'base64');
        return new Response(buf, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        });
      }
    }
  }
  return response;
}

export default async (request, context) => {
  const CORS = getCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const cartesiaKey = process.env.CARTESIA_API_KEY;
  const inworldKey = process.env.INWORLD_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!elevenKey && !cartesiaKey && !inworldKey && !openaiKey) {
    return new Response(
      JSON.stringify({ error: 'TTS not configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  const appCheckResult = await checkAppCheck(request);
  if (!appCheckResult.ok) {
    return new Response(
      JSON.stringify({ error: 'App verification failed. Reload the page and try again.', code: 'APP_CHECK_' + appCheckResult.reason.toUpperCase() }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-nf-client-connection-ip') || 'anon';
  if (!checkRateLimit('tts_' + ip)) {
    return new Response(
      JSON.stringify({ error: 'RATE_LIMIT: Too many TTS requests. Wait a moment.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  try {
    const body = await request.json();
    const rawText = (body.text || '').slice(0, MAX_TEXT_LENGTH);
    const voice = body.voice || 'onyx';
    const speed = Math.max(0.75, Math.min(2.0, body.speed || 1.0));
    // Humanizer strips stage directions, normalizes pause markers, and
    // auto-detects intensity if the caller didn't specify one. Callers that
    // set `humanize: false` get the old raw-text behavior (useful for short
    // UI chimes where pause injection would sound weird).
    const shouldHumanize = body.humanize !== false;
    const callerIntensity = typeof body.intensity === 'number' ? body.intensity : undefined;
    const humanized = shouldHumanize
      ? humanizeForTTS(rawText, { intensity: callerIntensity })
      : { text: rawText, intensity: callerIntensity || 0 };
    const text = humanized.text;
    const intensity = Math.max(0, Math.min(1, humanized.intensity || 0));
    const premium = !!body.premium;
    const provider = (body.provider || '').toLowerCase(); // 'cartesia' opts into the A/B flag

    if (!text.trim()) {
      return new Response(
        JSON.stringify({ error: 'No text provided.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    let response;

    // Premium + explicit opt-in → Cartesia Sonic (A/B flag, not default)
    if (premium && provider === 'cartesia' && cartesiaKey) {
      try {
        response = await cartesiaTTS(text, voice, speed, cartesiaKey, intensity);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error('Cartesia TTS error:', response.status, errText);
          response = null;
        }
      } catch (e) {
        console.error('Cartesia exception:', e.message);
        response = null;
      }
    }

    // Premium + explicit opt-in → Inworld TTS 1.5 Max (Pro provider option)
    if (!response && premium && provider === 'inworld' && inworldKey) {
      try {
        response = await inworldTTS(text, voice, speed, inworldKey);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error('Inworld TTS error:', response.status, errText);
          response = null;
        }
      } catch (e) {
        console.error('Inworld exception:', e.message);
        response = null;
      }
    }

    // Premium default → ElevenLabs turbo_v2_5
    if (!response && premium && elevenKey) {
      try {
        response = await elevenLabsTTS(text, voice, speed, elevenKey, intensity);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error('ElevenLabs TTS error:', response.status, errText);
          response = null;
        }
      } catch (e) {
        console.error('ElevenLabs exception:', e.message);
        response = null;
      }
    }

    // Free users + fallback when premium providers fail. openAITTS
    // walks its own model try-list internally (gpt-4o-mini-tts → tts-1)
    // so by the time we get a !ok response here, every OpenAI model
    // attempt failed — surface the actual upstream error.
    if (!response && openaiKey) {
      // Caller can pass `instructions` (string, max 600 chars) to
      // override the per-voice persona prompt. Used by the landing
      // orb to ask for a casual conversational register rather than
      // the in-round prosecutorial defaults that ship with the
      // 16 personas.
      const customInstr = (typeof body.instructions === 'string' && body.instructions.trim())
        ? body.instructions.slice(0, 600)
        : null;
      response = await openAITTS(text, voice, speed, openaiKey, intensity, customInstr);
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error('OpenAI TTS error:', response.status, errText);
        let openaiMessage = '';
        try {
          const parsed = JSON.parse(errText);
          openaiMessage = parsed?.last?.text || parsed?.error?.message || parsed?.error || '';
          if (typeof openaiMessage !== 'string') openaiMessage = JSON.stringify(openaiMessage).slice(0, 240);
        } catch(e) { openaiMessage = errText.slice(0, 240); }
        return new Response(
          JSON.stringify({ error: 'TTS_ERROR ' + response.status, openai: openaiMessage }),
          { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }
    }

    if (!response) {
      return new Response(
        JSON.stringify({ error: 'All TTS providers failed.' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
        ...CORS,
      },
    });
  } catch (err) {
    console.error('TTS handler error:', err);
    return new Response(
      JSON.stringify({ error: 'TTS failed.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
};

export const config = {
  path: '/api/tts',
};
