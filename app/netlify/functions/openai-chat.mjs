// OpenAI GPT proxy — translates Claude-style requests to OpenAI format
import { checkAppCheck } from './lib/appcheck.mjs';
import { applyPromptLibrary } from './lib/prompts.mjs';
import { applyVoiceGuidelines } from './lib/voice-guidelines.mjs';
import { checkMotionBody } from './lib/content-guard.mjs';
import { applyExemplars } from './lib/exemplars.mjs';
import { applyDistillations } from './lib/distillations.mjs';
import { applyDiscourse } from './lib/discourse.mjs';
import { applyUserFingerprint } from './lib/user-fingerprints.mjs';
import { applyBrain } from './lib/brain.mjs';
import { requirePaidPlan } from './lib/auth.mjs';
import { applyAdjudicationForFeature } from './lib/adjudication.mjs';
import { withSseHeartbeat } from './lib/sse-heartbeat.mjs';

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://debateos.com',
  'https://www.debateos.com',
  'https://itsdebatable.com',
  'https://www.itsdebatable.com',
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

// Allowed GPT models
// gpt-5.x is the current family. It is NOT a drop-in: the models reject
// `max_tokens` with a 400 and require `max_completion_tokens` instead,
// which is why adding an id here also needs the token-field switch below.
const ALLOWED_MODELS = ['gpt-5.5', 'gpt-5.4', 'gpt-4o', 'gpt-4o-mini'];
// Verified live 2026-08-11 against gpt-5.5.
const usesCompletionTokens = (m) => /^(gpt-5|gpt-6|o[0-9])/i.test(String(m || ''));
const MAX_TOKENS_CAP = 16000;

export default async (request, context) => {
  const CORS = getCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Keep-alive ping — see claude.mjs.
  if (request.headers.get('X-Keepalive') === '1') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured.' }),
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

  // Paid-plan gate — GPT is Pro-tier only. Free users route to /api/claude.
  const paidCheck = await requirePaidPlan(request, 'GPT');
  if (!paidCheck.ok) {
    return new Response(
      JSON.stringify({ error: paidCheck.error, code: paidCheck.code, currentPlan: paidCheck.currentPlan }),
      { status: paidCheck.status, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  const ip = request.headers.get('x-nf-client-connection-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon';  // nf ip is Netlify-set + unforgeable; XFF (client-settable) only as fallback
  if (!checkRateLimit('gpt_' + ip)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please wait.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  try {
    const body = await request.json();

    // Warm-up handshake — see claude.mjs for the full rationale.
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

    // Resolve server-side prompt library + voice guidelines before
    // translating. body.system holds the final text after these calls.
    // Content guard on the explicit motion field. Fast regex-only check;
    // rejects slurs, sexual-explicit, and CP before any Firestore read,
    // exemplar lookup, or provider call. See claude.mjs for the rationale.
    const motionGuard = checkMotionBody(body);
    if (!motionGuard.ok) {
      return new Response(
        JSON.stringify({ error: motionGuard.reason, category: motionGuard.category }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    applyPromptLibrary(body);
    applyAdjudicationForFeature(body);
    // Exemplar injection (learning-loop runtime): prepends 1–3 admin-weighted
    // reference rounds matching motion+format. Must run before
    // applyVoiceGuidelines, which strips _voiceFeature/_voiceFormat.
    // Parallel: both hit Firestore independently on cache miss. See
    // claude.mjs for the full rationale.
    // Captured BEFORE the Promise.all: applyExemplars deletes body._motion
    // synchronously, before its first await, so applyDiscourse would read
    // an already-deleted field and silently never fire.
    const pulseMotion = body._motion || '';
    await Promise.all([
      applyExemplars(body),
      applyDistillations(body),
      applyDiscourse(body, pulseMotion),
      applyUserFingerprint(body, paidCheck.uid),
      applyBrain(body, paidCheck.uid),
    ]);
    applyVoiceGuidelines(body);

    // Client sends Claude-style: { system, messages, model, max_tokens, stream }
    // We translate to OpenAI format
    const model = ALLOWED_MODELS.includes(body.model) ? body.model : 'gpt-4o-mini';
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        ...(usesCompletionTokens(model)
          ? { max_completion_tokens: maxTokens }
          : { max_tokens: maxTokens }),
        stream: !!body.stream,
      }),
    });

    return new Response(withSseHeartbeat(response.body, body.stream === true && response.ok), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        ...CORS,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'GPT request failed.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
};

export const config = {
  path: '/api/openai-chat',
};
