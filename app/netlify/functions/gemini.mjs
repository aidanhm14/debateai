// Gemini (Google) proxy — streams SSE back in Gemini format
import { applyPromptLibrary } from './lib/prompts.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { applyVoiceGuidelines } from './lib/voice-guidelines.mjs';

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
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

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 5; // anon IP-rate limit — tightened from 15 since
                          // this proxy has no auth gate at all.

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

const ALLOWED_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-pro-preview-05-06',
  'gemini-2.5-flash-preview-04-17',
];
const MAX_TOKENS_CAP = 16000;

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Gemini not configured. Add GEMINI_API_KEY to Netlify environment variables.' }),
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
  if (!checkRateLimit('gemini_' + ip)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please wait.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  try {
    const body = await request.json();

    if (JSON.stringify(body).length > 200_000) {
      return new Response(
        JSON.stringify({ error: 'Request too large.' }),
        { status: 413, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // Resolve server-side prompt library references before building the
    // Gemini-shaped request. After this, body.system holds the full text.
    applyPromptLibrary(body);
    // Then inject the voice-guidelines block (strips _voiceFeature, appends
    // to body.system) so the IP stays server-side.
    applyVoiceGuidelines(body);

    const model = ALLOWED_MODELS.includes(body.model) ? body.model : 'gemini-2.0-flash';
    const maxTokens = Math.min(body.max_tokens || 4000, MAX_TOKENS_CAP);

    // Build Gemini request format
    const contents = [];
    if (body.messages) {
      for (const m of body.messages) {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        });
      }
    }

    // System instruction (Gemini uses systemInstruction field)
    const systemInstruction = body.system
      ? { parts: [{ text: body.system }] }
      : undefined;

    const geminiBody = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 1.0,
      },
    };
    if (systemInstruction) geminiBody.systemInstruction = systemInstruction;

    const useStream = !!body.stream;
    const endpoint = useStream ? 'streamGenerateContent' : 'generateContent';
    const streamParam = useStream ? '&alt=sse' : '';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?key=${apiKey}${streamParam}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return new Response(
        JSON.stringify({ error: 'Gemini API error: ' + response.status + ' ' + errText }),
        { status: response.status, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // Stream the response back
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': useStream ? 'text/event-stream' : 'application/json',
        'Cache-Control': 'no-cache',
        ...CORS,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Gemini request failed: ' + err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
};

export const config = {
  path: '/api/gemini',
};
