// Open Lab brain proxy — routes to OpenRouter for open-weights models
// that aren't shipped by the four big labs (Anthropic / OpenAI / Google
// / xAI). Pinned default: Nous Hermes 4 405B — a Llama-3.1-405B
// fine-tune known for character-rich prose and low refusal rates, the
// "human-sounding, less guardrail-nag" register the brand voice calls
// for. The model is env-overrideable (OPENLAB_MODEL) so the slug can
// be swapped without a redeploy if the underlying availability shifts.
//
// Translates the same Claude-style request shape (system + messages)
// the other proxies accept. OpenRouter is OpenAI-compatible, so the
// translation is a flat-map onto chat/completions.
import { checkAppCheck } from './lib/appcheck.mjs';
import { applyPromptLibrary } from './lib/prompts.mjs';
import { applyVoiceGuidelines } from './lib/voice-guidelines.mjs';
import { applyExemplars } from './lib/exemplars.mjs';
import { applyDistillations } from './lib/distillations.mjs';
import { applyUserFingerprint } from './lib/user-fingerprints.mjs';
import { requirePaidPlan } from './lib/auth.mjs';

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://debateos.com',
  'https://www.debateos.com',
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
const RATE_LIMIT_MAX = 5; // matches the other paid-tier brains — Pro is
                          // already auth-gated, this is the abuse floor.

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

// Allow-list keeps a runaway client from billing an arbitrary model
// through the proxy. Env override lets ops swap defaults without a
// deploy. Slugs follow OpenRouter convention: <vendor>/<model>.
const DEFAULT_MODEL = process.env.OPENLAB_MODEL || 'nousresearch/hermes-4-405b';
const ALLOWED_MODELS = (
  process.env.OPENLAB_ALLOWED_MODELS
  || [
    'nousresearch/hermes-4-405b',
    'nousresearch/hermes-3-llama-3.1-405b', // fallback if Hermes 4 unavailable
    'mistralai/mistral-large-2407',
    'qwen/qwen3-235b-a22b',
    'meta-llama/llama-4-maverick',
    'meta-llama/llama-4-scout',
  ].join(',')
).split(',').map(s => s.trim()).filter(Boolean);
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

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Open Lab not configured — set OPENROUTER_API_KEY.' }),
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

  // Paid-plan gate — Open Lab is Pro-tier (matches GPT/Grok/Gemini).
  // Free users route to /api/claude.
  const paidCheck = await requirePaidPlan(request, 'Open Lab');
  if (!paidCheck.ok) {
    return new Response(
      JSON.stringify({ error: paidCheck.error, code: paidCheck.code, currentPlan: paidCheck.currentPlan }),
      { status: paidCheck.status, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-nf-client-connection-ip') || 'anon';
  if (!checkRateLimit('openlab_' + ip)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please wait.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  try {
    const body = await request.json();

    // Warm-up handshake — see claude.mjs for the full rationale.
    // (Note: openlab also runs a paid-plan check above this block, so
    // free users prewarming this endpoint get a 402 instead of the
    // 200/warm response — that's fine, they wouldn't be able to
    // generate via openlab anyway, so warming it is wasted.)
    if (body && body.warm === true) {
      return new Response(JSON.stringify({ ok: true, warm: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

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

    const model = ALLOWED_MODELS.includes(body.model) ? body.model : DEFAULT_MODEL;
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

    // OpenRouter recommends HTTP-Referer + X-Title for routing analytics
    // and provider attribution. Harmless if either's missing.
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://debateai.com',
        'X-Title': 'Debate AI · Open Lab',
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
      JSON.stringify({ error: 'Open Lab request failed.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
};

export const config = {
  path: '/api/openlab',
};
