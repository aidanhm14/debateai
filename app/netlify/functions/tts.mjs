// Text-to-Speech proxy — ElevenLabs primary, OpenAI fallback

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

// ElevenLabs voice ID mapping
const ELEVENLABS_VOICES = {
  commanding: 'onwK4e9ZLuTAKqWW03F9',  // Daniel — deep, authoritative male
  persuasive: 'EXAVITQu4vr4xnSDxMaL',  // Bella — warm, engaging female
  analytical: 'TxGEqnHWrfWFTfGW9XjX',  // Josh — calm, measured male
  technical:  'VR6AewLTigWG4xSOukaG',   // Arnold — clear, neutral male
  passionate: 'jBpfAFnaylXS5aRNkGBq',  // Gigi — energetic, expressive female
  eloquent:   'pFZP5JQG7iQjIQuC4Bku',   // Lily — polished, articulate female
};

// Map old OpenAI voice keys to ElevenLabs personality keys
const OPENAI_TO_ELEVEN = {
  onyx: 'commanding',
  echo: 'persuasive',
  fable: 'analytical',
  alloy: 'technical',
  nova: 'passionate',
  shimmer: 'eloquent',
};

async function elevenLabsTTS(text, voice, speed, apiKey) {
  const personality = OPENAI_TO_ELEVEN[voice] || voice;
  const voiceId = ELEVENLABS_VOICES[personality] || ELEVENLABS_VOICES.commanding;

  // Map speed (0.75-2.0 range from OpenAI) to ElevenLabs stability/speed
  // Lower stability = more expressive, higher = more consistent
  const stability = Math.max(0.3, Math.min(0.8, 1.0 - (speed - 1.0) * 0.3));
  const similarity = 0.75;

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: stability,
        similarity_boost: similarity,
        style: 0.4, // Some expressiveness for debate delivery
        use_speaker_boost: true,
      },
    }),
  });

  return response;
}

async function openAITTS(text, voice, speed, hd, apiKey) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: hd ? 'tts-1-hd' : 'tts-1',
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
      JSON.stringify({ error: 'TTS not configured. Add ELEVENLABS_API_KEY or OPENAI_API_KEY to environment.' }),
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

    if (!text.trim()) {
      return new Response(
        JSON.stringify({ error: 'No text provided.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    let response;

    // Try ElevenLabs first, fall back to OpenAI
    if (elevenKey) {
      try {
        response = await elevenLabsTTS(text, voice, speed, elevenKey);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error('ElevenLabs TTS error:', response.status, errText);
          // Fall through to OpenAI
          response = null;
        }
      } catch (e) {
        console.error('ElevenLabs TTS exception:', e.message);
        response = null;
      }
    }

    // Fallback to OpenAI if ElevenLabs failed or not configured
    if (!response && openaiKey) {
      response = await openAITTS(text, voice, speed, body.hd, openaiKey);
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

    // Stream audio back to client
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
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
