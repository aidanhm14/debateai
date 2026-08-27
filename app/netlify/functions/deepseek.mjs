// DeepSeek proxy — DeepSeek's API is OpenAI-compatible, so this is a
// near-clone of openai-chat.mjs with the base URL + model allowlist swapped.
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

// THE REAL IDS, verified against api.deepseek.com/models on 2026-08-22.
// The account serves exactly three: deepseek-v4-pro, deepseek-v4-flash,
// and a vision experiment we do not use.
//
// `deepseek-chat` and `deepseek-reasoner` are LEGACY ALIASES and both now
// resolve server-side to deepseek-v4-flash. They are kept callable so a
// cached client bundle does not start 400ing, but they must not be the
// pin: "reasoner" resolving to flash means the picker was offering a
// reasoning model and delivering a fast one, which is a claim about what
// argued against someone that stopped being true when V4 shipped. A
// preview or alias id is a rental, not a pin.
//
// Both V4 models reason by default and bill thinking against max_tokens.
// That is correct HERE, unlike in lib/cheap.mjs where it is disabled: a
// debate turn is exactly the kind of work thinking helps, and this path
// has a 16k cap rather than a tight structured budget.
const ALLOWED_MODELS = ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'];
const DEFAULT_MODEL = 'deepseek-v4-flash';
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

  const ip = request.headers.get('x-nf-client-connection-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon';  // nf ip is Netlify-set + unforgeable; XFF (client-settable) only as fallback
  if (!checkRateLimit('deepseek_' + ip)) {
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
      JSON.stringify({ error: 'DeepSeek request failed.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
};

export const config = {
  path: '/api/deepseek',
};
