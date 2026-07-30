// Open Lab brain proxy — routes to OpenRouter for open-weights models
// that aren't shipped by the four big labs (Anthropic / OpenAI / Google
// / xAI). Default stays Nous Hermes 4 405B: a Llama-3.1-405B fine-tune
// known for character-rich prose and low refusal rates, the
// "human-sounding, less guardrail-nag" register the brand voice calls
// for. The model is env-overrideable (OPENLAB_MODEL) so the slug can
// be swapped without a redeploy if the underlying availability shifts.
//
// THE ROSTER LIVES IN lib/engines.mjs, not here. This file used to
// carry its own ALLOWED_MODELS array, which then had to agree with the
// picker in three HTML files; it did not. The allow-list is now derived
// from the shared roster, so a new engine is one edit in one file and
// the proxy, the picker, and /engines cannot disagree about what is
// callable.
//
// The client may send either a roster key ('kimi-k3') or a raw slug
// ('moonshotai/kimi-k3'). Anything unrecognized falls back to the
// default rather than erroring: a stale cached bundle asking for a
// retired slug should still get a round, not a 400.
//
// Translates the same Claude-style request shape (system + messages)
// the other proxies accept. OpenRouter is OpenAI-compatible, so the
// translation is a flat-map onto chat/completions.
import { checkAppCheck } from './lib/appcheck.mjs';
import { applyPromptLibrary } from './lib/prompts.mjs';
import { applyVoiceGuidelines } from './lib/voice-guidelines.mjs';
import { checkMotionBody } from './lib/content-guard.mjs';
import { applyExemplars } from './lib/exemplars.mjs';
import { applyDistillations } from './lib/distillations.mjs';
import { applyUserFingerprint } from './lib/user-fingerprints.mjs';
import { requirePaidPlan } from './lib/auth.mjs';
import { applyAdjudicationForFeature } from './lib/adjudication.mjs';
import { resolveOpenSlug, DEFAULT_OPEN_SLUG } from './lib/engines.mjs';

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
// through the proxy. Both the roster and the legacy fallbacks come from
// lib/engines.mjs; OPENLAB_ALLOWED_MODELS still overrides the whole set
// and OPENLAB_MODEL still overrides the default, so ops can pin or
// unpin without a deploy.
const DEFAULT_MODEL = process.env.OPENLAB_MODEL || DEFAULT_OPEN_SLUG;
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
    await Promise.all([
      applyExemplars(body),
      applyDistillations(body),
      applyUserFingerprint(body, paidCheck.uid),
    ]);
    applyVoiceGuidelines(body);

    // `engine` is the roster key the picker sends; `model` is the raw
    // slug older callers send. Either resolves through the shared
    // allow-list. An unrecognized value is not an error: it falls back
    // to the configured default so a stale bundle still gets a round.
    //
    // Precedence, deliberately: OPENLAB_MODEL is an OUTAGE LEVER and
    // wins over the user's pick when set, because the reason to set it
    // is that a specific engine is failing. Unset (the normal case), the
    // user's pick decides and DEFAULT_OPEN_SLUG catches the rest.
    const requested = body.engine || body.model;
    const model = process.env.OPENLAB_MODEL
      || resolveOpenSlug(requested, process.env.OPENLAB_ALLOWED_MODELS);
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
        'HTTP-Referer': 'https://itsdebatable.com',
        'X-Title': 'Debatable · Open Lab',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: !!body.stream,
      }),
    });

    // Echo the engine that actually ran. The client labels the output
    // with this rather than with what it asked for, so a fallback or an
    // ops pin shows up in the UI instead of being invisible.
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Debatable-Engine': model,
        'Access-Control-Expose-Headers': 'X-Debatable-Engine',
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
