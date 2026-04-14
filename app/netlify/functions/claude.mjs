// Claude API proxy — strips _feature before forwarding to Anthropic
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam, logUsage, PLANS } from './lib/firestore.mjs';
import { PROMPT_LIBRARY } from './lib/prompts.mjs';

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

// Simple in-memory rate limiter (resets per function cold start)
// TODO 2026-04-15: replace with Upstash KV for persistence across cold starts.
// Until then: layered windows (minute/hour/day) so cold starts don't erase
// longer-horizon protection at the same rate as short-horizon protection.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 15; // authenticated users
const RATE_LIMIT_MAX_ANON = 5; // unauthenticated callers (per minute)

// Layered anon caps. One attacker rotating through requests on a single IP
// can't hit more than these in each window. Authed users skip these (their
// usage is metered + billed through Stripe).
const ANON_LAYERS = [
  { window: 60_000,    max: 5,   label: 'minute' },
  { window: 3_600_000, max: 40,  label: 'hour'   },
  { window: 86_400_000,max: 150, label: 'day'    },
];
const anonHistory = new Map(); // ip → array of request timestamps

function checkRateLimit(userId, max = RATE_LIMIT_MAX) {
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

// Layered check for anonymous IPs. Returns {ok, layer} — on failure, `layer`
// names the window that was exceeded so we can tell the user what happened.
function checkAnonLayers(ip) {
  const now = Date.now();
  const maxWindow = Math.max(...ANON_LAYERS.map(l => l.window));
  const history = (anonHistory.get(ip) || []).filter(t => now - t < maxWindow);
  for (const layer of ANON_LAYERS) {
    const count = history.filter(t => now - t < layer.window).length;
    if (count >= layer.max) return { ok: false, layer: layer.label };
  }
  history.push(now);
  anonHistory.set(ip, history);
  // Opportunistic cleanup: if the map has gotten huge, drop the oldest half.
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
      if (!checkRateLimit(userId)) {
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

      // Check subscription status
      if (!['active', 'trialing'].includes(team.status)) {
        return new Response(
          JSON.stringify({ error: 'Subscription inactive. Please update your billing.', code: 'SUBSCRIPTION_INACTIVE' }),
          { status: 402, headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }

      // Check usage limits
      const planLimits = PLANS[team.plan] || PLANS.trial;
      if (team.usageThisPeriod >= planLimits.requests) {
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
    // Layered rate limits (minute/hour/day) per client IP.
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-nf-client-connection-ip') || 'anon';
    const check = checkAnonLayers(ip);
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

    // Input validation — reject suspiciously large payloads
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 200_000) {
      return new Response(
        JSON.stringify({ error: 'Request too large.' }),
        { status: 413, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // Extract and strip _feature before forwarding to Anthropic
    const feature = body._feature || 'unknown';
    delete body._feature;

    // Prompt library: client may request server-side prompt injection via _promptId.
    // Unknown ids are ignored (graceful degradation).
    const promptId = body._promptId;
    delete body._promptId;
    if (promptId && PROMPT_LIBRARY[promptId]) {
      const libText = PROMPT_LIBRARY[promptId];
      if (typeof body.system === 'string') {
        body.system = libText + '\n\n' + body.system;
      } else if (Array.isArray(body.system)) {
        body.system = [{ type: 'text', text: libText }, ...body.system];
      } else {
        body.system = libText;
      }
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    // Log usage for authenticated requests (fire-and-forget, don't block response)
    if (teamId && userId) {
      logUsage(teamId, userId, feature).catch(err => console.error('logUsage failed:', err));
    }

    // Stream the response through to the client
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
      JSON.stringify({ error: 'Something went wrong. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
};

export const config = {
  path: '/api/claude',
};
