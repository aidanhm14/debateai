// Claude API proxy — strips _feature before forwarding to Anthropic
import { verifyIdToken, extractBearerToken, isOwnerEmail } from './lib/auth.mjs';
import { getUserTeam, logUsage, PLANS } from './lib/firestore.mjs';
import { PROMPT_LIBRARY, applyPromptLibrary } from './lib/prompts.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { buildVoiceSegments, pickSpice } from './lib/voice-guidelines.mjs';
import { checkMotionBody } from './lib/content-guard.mjs';
import { getExemplarBlock } from './lib/exemplars.mjs';
import { getDistillationBlock } from './lib/distillations.mjs';
import { getFingerprintBlock } from './lib/user-fingerprints.mjs';

// Allowed models — only permit specific, cost-controlled models
const ALLOWED_MODELS = [
  'claude-sonnet-4-6',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
];

// Hard cap on max_tokens — competition cases need up to 32k (authenticated users)
const MAX_TOKENS_CAP = 32000;
// Tighter cap for anonymous requests: enough for most learn/debate-ai flows
// but small enough that abuse can't drain the account in a handful of calls.
const MAX_TOKENS_CAP_ANON = 8000;

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://debateos.com',
  'https://www.debateos.com',
];

const DEV_ORIGINS = [
  'http://localhost:8888',
  'http://localhost:3000',
];

// Only allow localhost origins outside production
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Rate limiter: prefers Upstash Redis (persistent across cold starts) with
// in-memory fallback if Upstash env vars aren't set.
//
// Upstash setup:
//   1. Create a Redis DB at https://console.upstash.com (free tier is plenty)
//   2. Set these Netlify env vars from the REST API tab:
//        UPSTASH_REDIS_REST_URL
//        UPSTASH_REDIS_REST_TOKEN
//   3. Redeploy — the function picks them up automatically.
//
// If env vars are absent, falls back to in-memory Maps (same behavior as
// before; counters reset on cold start but layered limits still apply).
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const HAS_UPSTASH = !!(UPSTASH_URL && UPSTASH_TOKEN);

async function upstashPipeline(commands) {
  // Upstash REST pipeline: POST [[cmd, ...args], ...] → [{result}, ...]
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  return res.json();
}

// Fixed-window counter in Upstash. Returns the post-increment count.
async function upstashIncr(key, windowSeconds) {
  try {
    const results = await upstashPipeline([
      ['INCR', key],
      ['EXPIRE', key, windowSeconds, 'NX'], // set TTL only if key is new
    ]);
    return Number(results?.[0]?.result ?? 0);
  } catch (err) {
    console.warn('[rate-limit] Upstash error, falling back to in-memory:', err.message);
    return null; // signal to fall back
  }
}

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 15; // authenticated users
const RATE_LIMIT_MAX_ANON = 5; // unauthenticated callers (per minute)

// Layered anon caps. One attacker rotating through requests on a single IP
// can't hit more than these in each window. Authed users skip these (their
// usage is metered + billed through Stripe).
// Tightened 2026-05-18 in two passes (150/day → 60 → 30 same day) on a
// credit-burn audit. The user-facing soft cap is 5/anon and 10/signed-in,
// so legit users hit the friendly paywall well before these layers fire;
// the hour + day caps exist only to throttle bot abuse rotating on a single IP.
const ANON_LAYERS = [
  { window: 60_000,    max: 5,   label: 'minute' },
  { window: 3_600_000, max: 15,  label: 'hour'   },
  { window: 86_400_000,max: 30,  label: 'day'    },
];
const anonHistory = new Map(); // ip → array of request timestamps

async function checkRateLimit(userId, max = RATE_LIMIT_MAX) {
  if (HAS_UPSTASH) {
    const count = await upstashIncr(`rl:user:${userId || 'anon'}`, 60);
    if (count !== null) return count <= max;
    // fall through on Upstash error
  }
  const now = Date.now();
  const key = userId || 'anon';
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > max) return false;
  return true;
}

// Layered check for anonymous IPs. Returns {ok, layer}. Uses Upstash if
// configured (persistent across cold starts), falls back to in-memory.
async function checkAnonLayers(ip) {
  if (HAS_UPSTASH) {
    // Try each layer's counter. Increment them all in one pipeline so a
    // request that trips the minute cap still counts toward hour+day.
    try {
      const commands = [];
      for (const layer of ANON_LAYERS) {
        const key = `rl:anon:${layer.label}:${ip}`;
        commands.push(['INCR', key]);
        commands.push(['EXPIRE', key, Math.ceil(layer.window / 1000), 'NX']);
      }
      const results = await upstashPipeline(commands);
      // results[0], [2], [4] are the INCR results for each layer
      for (let i = 0; i < ANON_LAYERS.length; i++) {
        const count = Number(results?.[i * 2]?.result ?? 0);
        if (count > ANON_LAYERS[i].max) {
          return { ok: false, layer: ANON_LAYERS[i].label };
        }
      }
      return { ok: true };
    } catch (err) {
      console.warn('[rate-limit] Upstash pipeline failed, falling back:', err.message);
      // fall through to in-memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  const maxWindow = Math.max(...ANON_LAYERS.map(l => l.window));
  const history = (anonHistory.get(ip) || []).filter(t => now - t < maxWindow);
  for (const layer of ANON_LAYERS) {
    const count = history.filter(t => now - t < layer.window).length;
    if (count >= layer.max) return { ok: false, layer: layer.label };
  }
  history.push(now);
  anonHistory.set(ip, history);
  if (anonHistory.size > 5000) {
    const entries = Array.from(anonHistory.entries());
    anonHistory.clear();
    entries.slice(-2500).forEach(([k, v]) => anonHistory.set(k, v));
  }
  return { ok: true };
}

export default async (request, context) => {
  const CORS = getCorsHeaders(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Keep-alive ping from scheduled-keepalive.mjs. Module is now loaded
  // and the container stays warm; return 204 without hitting Anthropic.
  if (request.headers.get('X-Keepalive') === '1') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API key not configured on server' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  // Check for authenticated path (team subscription)
  const bearerToken = extractBearerToken(request);
  let teamId = null;
  let userId = null;

  if (bearerToken) {
    try {
      const decoded = await verifyIdToken(bearerToken);
      userId = decoded.sub;

      // Rate limit per user
      if (!(await checkRateLimit(userId))) {
        return new Response(
          JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
          { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }

      const result = await getUserTeam(userId);
      if (!result) {
        return new Response(
          JSON.stringify({ error: 'No team found. Create or join a team first.' }),
          { status: 403, headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }

      const { team } = result;
      teamId = team.id;

      // Subscription gate. Lifetime is paid-once-active-forever; trial is
      // the free tier. Both bypass the status check entirely and rely on
      // the usage cap for upsell. For paid subscriptions we only block on
      // EXPLICIT Stripe-bad statuses — 'past_due' is a grace state Stripe
      // retries through, and null/'inactive' from legacy/race-conditioned
      // writes shouldn't lock out users who actually paid. The previous
      // logic (allowlist requiring 'active' | 'trialing') was a fake paywall
      // hitting paying customers.
      const SUB_PLANS = new Set(['byok', 'individual', 'team']);
      const KNOWN_INACTIVE = new Set(['canceled','cancelled','incomplete_expired','unpaid']);
      if (SUB_PLANS.has(team.plan) && KNOWN_INACTIVE.has(team.status)) {
        return new Response(
          JSON.stringify({ error: 'Subscription inactive. Please update your billing.', code: 'SUBSCRIPTION_INACTIVE' }),
          { status: 402, headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }

      // Check usage limits — owner allowlist bypasses.
      const planLimits = PLANS[team.plan] || PLANS.trial;
      if (!isOwnerEmail(decoded.email) && team.usageThisPeriod >= planLimits.requests) {
        return new Response(
          JSON.stringify({
            error: 'Monthly usage limit reached. Upgrade your plan for more requests.',
            code: 'USAGE_LIMIT_REACHED',
            usage: team.usageThisPeriod,
            limit: planLimits.requests,
          }),
          { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed. Please sign in again.' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }
  } else {
    // Anonymous path — allow limited unauthenticated access for HS/debate-ai/learn pages.
    // App Check first (blocks scripted abuse from non-browser callers), then
    // layered rate limits (minute/hour/day) per client IP.
    const appCheckResult = await checkAppCheck(request);
    if (!appCheckResult.ok) {
      return new Response(
        JSON.stringify({ error: 'App verification failed. Reload the page and try again.', code: 'APP_CHECK_' + appCheckResult.reason.toUpperCase() }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-nf-client-connection-ip') || 'anon';
    const check = await checkAnonLayers(ip);
    if (!check.ok) {
      const msg = check.layer === 'minute'
        ? 'Too many requests — please wait a moment.'
        : check.layer === 'hour'
          ? 'Hourly free-trial cap reached. Come back in a bit or sign in for higher limits.'
          : 'Daily free-trial cap reached. Sign in or come back tomorrow.';
      return new Response(
        JSON.stringify({ error: msg, code: 'ANON_LIMIT_' + check.layer.toUpperCase() }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }
  }

  try {
    const body = await request.json();

    // Warm-up handshake (mirrors tts.mjs): client fires `warm:true`
    // when the prep phase loads so the Netlify function instance is
    // hot before the first AI speech actually needs the LLM. Short-
    // circuits before any Anthropic call, exemplar lookup, or
    // distillation read — no provider credit burned, no Firestore
    // read consumed. Saves the ~1-3s cold-start penalty on speech-1.
    if (body && body.warm === true) {
      return new Response(JSON.stringify({ ok: true, warm: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // Input validation — reject suspiciously large payloads
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 200_000) {
      return new Response(
        JSON.stringify({ error: 'Request too large.' }),
        { status: 413, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // Content guard on the explicit motion field. Fast regex-only check;
    // rejects slurs, sexual-explicit, and CP before any Firestore read,
    // exemplar lookup, or provider call. Older clients that don't send
    // _motion fall through (the check returns ok for empty motion).
    const motionGuard = checkMotionBody(body);
    if (!motionGuard.ok) {
      return new Response(
        JSON.stringify({ error: motionGuard.reason, category: motionGuard.category }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // Extract and strip _feature before forwarding to Anthropic
    const feature = body._feature || 'unknown';
    delete body._feature;

    // Prompt library: client may request server-side prompt injection via
    // _promptId (+ optional _promptVars for {{var}} substitution). Shared
    // helper so gemini.mjs and grok.mjs resolve the same way.
    applyPromptLibrary(body);
    // ── System-prompt assembly + prompt caching ─────────────────────────
    // The voice bank for a feature is enormous (the `case` block alone is
    // ~12K tokens) and IDENTICAL for every user on the same
    // (feature, format, topic). Distillations are shared per format. Those
    // two are the only genuinely shared, stable content, so they form the
    // CACHED prefix. Everything else is volatile and goes in the UNCACHED
    // tail: the client's base system (per round), reference rounds (per
    // motion), the user-style fingerprint (per user), and the random spice.
    //
    // This inversion is the whole fix. The old code prepended the per-user
    // fingerprint and per-motion exemplars and then cached "everything but
    // reference rounds" — so the cached prefix was unique per user and the
    // 20% random spice mutated it 1-in-5 calls. Net hit-rate was ~0; we paid
    // full input price on a 10K+ token system prompt nearly every call.
    //
    // The voice "VOICE CHECK" reinforcement is appended dead-last in the
    // tail so it stays the most-recent context the model reads, preserving
    // the prior voice-wins-conflicts intent even though the bulk of the
    // voice bank now leads.
    const vFeature = body._voiceFeature || ''; // matches old gate (body._feature was already deleted)
    const vFormat = body._voiceFormat || '';
    const vTopic = body._voiceTopic || '';
    const vMotion = body._motion || '';
    const vSide = body._side || '';
    const baseSystem = typeof body.system === 'string' ? body.system : '';

    const voiceSeg = buildVoiceSegments(vFeature, vFormat, vTopic);
    // Independent Firestore-backed reads, run in parallel (each is cached
    // 1hr/10min internally, so this is near-zero cost on warm caches).
    const [distillBlock, fingerprintBlock, exemplarBlock] = await Promise.all([
      getDistillationBlock(vFormat, vFeature),
      getFingerprintBlock(userId, vFeature),
      getExemplarBlock({ feature: vFeature, motion: vMotion, format: vFormat, side: vSide }),
    ]);
    let spice = voiceSeg ? pickSpice(vFeature) : '';
    // Don't double-inject a section the stable block already contains.
    if (spice && voiceSeg && voiceSeg.stable.indexOf(spice) !== -1) spice = '';

    // Strip all voice/exemplar meta now that we've read it — Anthropic
    // rejects unknown top-level keys, and these must never leave the proxy.
    delete body._voiceFeature;
    delete body._voiceFormat;
    delete body._voiceTopic;
    delete body._motion;
    delete body._side;

    // CACHED prefix — shared per (feature, format, topic): voice bank + nightly distillation.
    const cachedPrefix = [voiceSeg && voiceSeg.stable, distillBlock].filter(Boolean).join('\n');
    // UNCACHED tail — per-round base system, per-motion reference rounds,
    // per-user style, random spice, then the voice-check reinforcement LAST.
    const tail = [baseSystem, exemplarBlock, fingerprintBlock, spice, voiceSeg && voiceSeg.reinforcement]
      .filter(Boolean).join('\n\n');

    // Anthropic's minimum cacheable size is 1024 tokens (~4KB). Only mark a
    // cache breakpoint when the shared prefix clears that; otherwise ship a
    // single plain string. The big debate features clear it by ~10x.
    if (cachedPrefix && cachedPrefix.length > 4096) {
      body.system = [
        { type: 'text', text: cachedPrefix, cache_control: { type: 'ephemeral' } },
      ];
      if (tail) body.system.push({ type: 'text', text: tail });
    } else {
      const joined = [cachedPrefix, tail].filter(Boolean).join('\n\n');
      if (joined) body.system = joined;
      else delete body.system;
    }

    // Validate model — only whitelisted models allowed
    if (!body.model || !ALLOWED_MODELS.includes(body.model)) {
      return new Response(
        JSON.stringify({ error: `Model not allowed. Use one of: ${ALLOWED_MODELS.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // Cap max_tokens to prevent excessive usage. Anon callers get a tighter
    // cap than authenticated users (cost per request is bounded, so even if
    // the layered rate limits are somehow bypassed, damage stays small).
    const tokensCap = userId ? MAX_TOKENS_CAP : MAX_TOKENS_CAP_ANON;
    if (!body.max_tokens || body.max_tokens > tokensCap) {
      body.max_tokens = tokensCap;
    }

    // Strip tools field — clients should not be able to define tool use
    delete body.tools;
    delete body.tool_choice;

    // (Prompt-cache structuring already happened above, in the system-prompt
    // assembly step — body.system is a [cached prefix, uncached tail] array
    // when there's enough shared content, otherwise a plain string.)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Prompt-caching is GA on most models but the header is still
        // recommended to opt-in explicitly on older API versions.
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify(body),
    });

    // Log usage for authenticated requests (fire-and-forget, don't block response)
    if (teamId && userId) {
      logUsage(teamId, userId, feature).catch(err => console.error('logUsage failed:', err));
    }

    // Opt-in cache observability. Default prod path is byte-identical to
    // before (return response.body untouched). Set LOG_CACHE_USAGE=1 in the
    // Netlify env to tee the stream and log the Anthropic usage from the
    // first `message_start` event: input_tokens vs cache_read_input_tokens
    // vs cache_creation_input_tokens. When the cache works, cache_read climbs
    // and billed input collapses. Flip it off once confirmed. Fully wrapped +
    // fire-and-forget so it can never break or stall the client stream.
    let clientBody = response.body;
    if (clientBody && response.ok && process.env.LOG_CACHE_USAGE === '1') {
      try {
        const [forClient, forLog] = clientBody.tee();
        clientBody = forClient;
        (async () => {
          try {
            const reader = forLog.getReader();
            const dec = new TextDecoder();
            let buf = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const m = buf.match(/"usage"\s*:\s*\{[^}]*\}/);
              if (m) {
                try {
                  const u = JSON.parse('{' + m[0] + '}').usage || {};
                  const read = u.cache_read_input_tokens || 0;
                  const create = u.cache_creation_input_tokens || 0;
                  const hit = read > 0 ? 'HIT' : (create > 0 ? 'MISS(write)' : 'none');
                  console.log(`[cache] ${feature}/${vFormat || '-'} ${hit} read=${read} create=${create} input=${u.input_tokens || 0}`);
                } catch {}
                break;
              }
              if (buf.length > 65536) break; // message_start is early; bail if unseen
            }
            reader.cancel().catch(() => {});
          } catch {}
        })();
      } catch {}
    }

    // Stream the response through to the client
    return new Response(clientBody, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...CORS,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Something went wrong. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
};

export const config = {
  path: '/api/claude',
};
