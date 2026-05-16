// DeepSeek proxy — DeepSeek's API is OpenAI-compatible, so this is a
// near-clone of openai-chat.mjs with the base URL + model allowlist swapped.
import { checkAppCheck } from './lib/appcheck.mjs';
import { applyPromptLibrary } from './lib/prompts.mjs';
import { applyVoiceGuidelines } from './lib/voice-guidelines.mjs';
import { applyExemplars } from './lib/exemplars.mjs';
import { applyDistillations } from './lib/distillations.mjs';
import { applyUserFingerprint } from './lib/user-fingerprints.mjs';
import { requirePaidPlan } from './lib/auth.mjs';

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

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 5;

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

// deepseek-chat = V3 (general), deepseek-reasoner = R1 (chain-of-thought).
// R1 emits a `reasoning_content` channel separate from `content`; the
// client just reads the visible `content` channel today, so R1 falls back
// to plain text output from the user's perspective.
const ALLOWED_MODELS = ['deepseek-chat', 'deepseek-reasoner'];
const MAX_TOKENS_CAP = 16000;

export default async (request, context) => {
  const CORS = getCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.headers.get('X-Keepalive') === '1') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'DeepSeek API key not configured.' }),
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

  // Paid-plan gate — DeepSeek is Pro-tier only. Free users route to /api/claude.
  const paidCheck = await requirePaidPlan(request, 'DeepSeek');
  if (!paidCheck.ok) {
    return new Response(
      JSON.stringify({ error: paidCheck.error, code: paidCheck.code, currentPlan: paidCheck.currentPlan }),
      { status: paidCheck.status, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-nf-client-connection-ip') || 'anon';
  if (!checkRateLimit('deepseek_' + ip)) {
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

    applyPromptLibrary(body);
    await Promise.all([
      applyExemplars(body),
      applyDistillations(body),
      applyUserFingerprint(body, paidCheck.uid),
    ]);
    applyVoiceGuidelines(body);

    const model = ALLOWED_MODELS.includes(body.model) ? body.model : 'deepseek-chat';
    const maxTokens = Math.min(body.max_tokens || 4000, MAX_TOKENS_CAP);

    const messages = [];
    if (body.system) {
      messages.push({ role: 'system', content: body.system });
    }
    if (body.messages) {
      for (const m of body.messages) {
        messages.push({ role: m.role, content: m.content });
      }
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: !!body.stream,
      }),
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...CORS,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'DeepSeek request failed.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
};

export const config = {
  path: '/api/deepseek',
};
