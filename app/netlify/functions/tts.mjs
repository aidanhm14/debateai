// Text-to-Speech proxy — Cartesia Sonic for premium, OpenAI tts-1 for free + fallback
import { checkAppCheck } from './lib/appcheck.mjs';

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://devilsadvocate1.netlify.app',
  'https://debateos.com',
  'https://www.debateos.com',
  'https://debatethedevil.com',
  'https://www.debatethedevil.com',
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

// Cartesia Sonic voice IDs — mapped to each of the 10 debater personalities.
// Voice IDs are from Cartesia's public library (en-US). Swap in your dashboard
// if you want to fine-tune the character of any personality.
const CARTESIA_VOICES = {
  professor:   'a0e99841-438c-4a64-b679-ae501e7d6091', // Barbershop Man — dominant, firm
  closer:      'b7d50908-b17c-442d-ad8d-810c63997ed9', // California Girl — confident female
  surgeon:     '421b3369-f63f-4b03-8980-37a44df1d4e8', // Friendly Reading Man
  veteran:     '79743797-2087-422f-8dc7-86f9efca85f1', // Movieman — deep resonant male
  firebrand:   '41534ada-d9a3-4f24-b9d5-3a8e1f2f7fc0', // Energetic young male
  diplomat:    'bf991597-6c13-47e4-8411-91ec2de5c466', // Newslady — professional female
  debater:     'd46abd1d-2d02-43e8-819f-51fb652c1c61', // Newsman — sharp, quick
  philosopher: 'a167e0f3-df7e-4d52-a9c3-f949145efdab', // Salesman — thoughtful male
  prosecutor:  '820a3788-2b37-4d21-847a-b65d8a68c99a', // Polite Man — intense direct
  storyteller: '248be419-c632-4f23-adf1-5324ed7dbf1d', // Narrator Lady — warm female
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

// Cartesia Sonic — /tts/bytes endpoint. MP3 out, ~90ms TTFB.
// intensity: 0 = calm deliberate, 1 = breathless tournament speed
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

// OpenAI TTS — free tier + fallback if Cartesia fails
async function openAITTS(text, voice, speed, apiKey) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
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

  const cartesiaKey = process.env.CARTESIA_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!cartesiaKey && !openaiKey) {
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
    const intensity = Math.max(0, Math.min(1, body.intensity || 0));
    const premium = !!body.premium;

    if (!text.trim()) {
      return new Response(
        JSON.stringify({ error: 'No text provided.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    let response;

    // Premium users → Cartesia Sonic (fastest, most natural)
    if (premium && cartesiaKey) {
      try {
        response = await cartesiaTTS(text, voice, speed, cartesiaKey, intensity);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error('Cartesia TTS error:', response.status, errText);
          response = null; // Fall through to OpenAI
        }
      } catch (e) {
        console.error('Cartesia exception:', e.message);
        response = null;
      }
    }

    // Free users + fallback when Cartesia fails
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
