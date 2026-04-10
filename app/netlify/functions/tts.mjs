// Text-to-Speech proxy — ElevenLabs for premium users, OpenAI for free

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://debateos.com',
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

// Simple rate limiter
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

// ElevenLabs voice ID mapping — all American accent
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
};

// Map OpenAI voice keys to ElevenLabs personality keys
const OPENAI_TO_ELEVEN = {
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

// ElevenLabs TTS with streaming for faster first-byte
// intensity: 0 = calm deliberate delivery, 1 = breathless sprint (tournament speed)
async function elevenLabsTTS(text, voice, speed, apiKey, intensity = 0) {
  const personality = OPENAI_TO_ELEVEN[voice] || voice;
  const voiceId = ELEVENLABS_VOICES[personality] || ELEVENLABS_VOICES.commanding;

  // At high intensity: lower stability → more variation/breathlessness, higher style → more expressive
  const stability = Math.max(0.15, Math.min(0.8, 0.7 - intensity * 0.55));
  const style = Math.min(1.0, 0.3 + intensity * 0.5);            // 0.3 calm → 0.8 intense
  const similarityBoost = Math.max(0.55, 0.75 - intensity * 0.2); // slightly looser at high speed

  // Use /stream endpoint for faster first-byte delivery
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_turbo_v2_5',  // Turbo model — fastest latency
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: true,
      },
      optimize_streaming_latency: 3, // Max latency optimization (0-4, higher = faster but slightly lower quality)
    }),
  });

  return response;
}

// OpenAI TTS for free users — fast, good enough quality
async function openAITTS(text, voice, speed, apiKey) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',  // Standard model — faster than tts-1-hd
      input: text,
      voice: voice,
      speed: speed,
      response_format: 'mp3',
    }),
  });
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
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!elevenKey && !openaiKey) {
    return new Response(
      JSON.stringify({ error: 'TTS not configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-nf-client-connection-ip') || 'anon';
  if (!checkRateLimit('tts_' + ip)) {
    return new Response(
      JSON.stringify({ error: 'RATE_LIMIT: Too many TTS requests. Wait a moment.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  try {
    const body = await request.json();
    const text = (body.text || '').slice(0, MAX_TEXT_LENGTH);
    const voice = body.voice || 'onyx';
    const speed = Math.max(0.75, Math.min(2.0, body.speed || 1.0));
    const intensity = Math.max(0, Math.min(1, body.intensity || 0)); // 0=calm, 1=breathless
    const premium = !!body.premium; // Premium users get ElevenLabs

    if (!text.trim()) {
      return new Response(
        JSON.stringify({ error: 'No text provided.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    let response;

    if (premium && elevenKey) {
      // Premium users → ElevenLabs streaming (turbo model, lowest latency)
      try {
        response = await elevenLabsTTS(text, voice, speed, elevenKey, intensity);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error('ElevenLabs TTS error:', response.status, errText);
          response = null; // Fall through to OpenAI
        }
      } catch (e) {
        console.error('ElevenLabs exception:', e.message);
        response = null;
      }
    }

    // Free users → OpenAI tts-1 (fast standard model)
    // Also fallback if ElevenLabs failed for premium
    if (!response && openaiKey) {
      response = await openAITTS(text, voice, speed, openaiKey);
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error('OpenAI TTS error:', response.status, errText);
        return new Response(
          JSON.stringify({ error: 'TTS_ERROR ' + response.status }),
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

    // Stream audio back — chunked transfer for faster playback start
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
