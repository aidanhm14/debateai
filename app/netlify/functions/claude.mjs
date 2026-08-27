// Claude API proxy — strips _feature before forwarding to Anthropic
import { verifyIdToken, extractBearerToken, isOwnerEmail, isNamedAccount } from './lib/auth.mjs';
import { getUserTeam, logUsage, PLANS, withDeadline } from './lib/firestore.mjs';
import { PROMPT_LIBRARY, applyPromptLibrary } from './lib/prompts.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { buildVoiceSegments, pickSpice } from './lib/voice-guidelines.mjs';
import { checkMotionBody } from './lib/content-guard.mjs';
import { getExemplarBlock } from './lib/exemplars.mjs';
import { getDistillationBlock } from './lib/distillations.mjs';
import { getDiscourseBlock } from './lib/discourse.mjs';
import { getFingerprintBlock } from './lib/user-fingerprints.mjs';
import { getBrainBlock } from './lib/brain.mjs';
import { buildAdjudicationBlock, isJudgeFeature } from './lib/adjudication.mjs';
import { deliveryBlock, takeDelivery } from './lib/judge-delivery.mjs';
import { recordTrip } from './lib/rate-limit.mjs';
import { withSseHeartbeat } from './lib/sse-heartbeat.mjs';

// Allowed models — only permit specific, cost-controlled models
// Reasoning-model note that bit the async panel and will bite here next:
// on these models thinking tokens are billed against max_tokens, so a
// caller passing a cap tuned for a pre-reasoning model gets a truncated
// response and blames its own parser. Callers wanting a long structured
// output (a ballot, a case) should ask for 8000+.
const ALLOWED_MODELS = [
  'claude-opus-5',
  'claude-fable-5',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
];

// Hard cap on max_tokens — competition cases need up to 32k (authenticated users)
const MAX_TOKENS_CAP = 32000;
// Tighter cap for anonymous requests: enough for most learn/practice flows
// but small enough that abuse can't drain the account in a handful of calls.
const MAX_TOKENS_CAP_ANON = 8000;

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-AppCheck, X-Warm',
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
// Anonymous callers have no identity but their IP, so the IP is the only
// thing to meter them on. The numbers below were set on the 2026-05-18
// credit-burn audit, when App Check was soft-passing and this counter was
// therefore the ONLY thing between a script and the Anthropic bill. That
// made them necessarily brutal.
//
// Raised 2026-08-18, together with APP_CHECK_REQUIRED=true. With App Check
// hard-enforcing, a caller must be a real browser on a real origin clearing
// a reCAPTCHA Enterprise score before it ever reaches this counter, so the
// IP layer no longer has to carry the anti-bot job alone. It goes back to
// being a blast-radius limit.
//
// Why it had to move: an IP is not a person. A school, a campus, or a
// mobile carrier on CGNAT puts hundreds of people behind one address. At
// 15/hour, and roughly 5 requests per free round, that was three anonymous
// visitors per hour for an entire building — the fourth was told they had
// hit a "free-trial cap" they had never used. realtime-session.mjs hit the
// same wall on 2026-07-28 and fixed it by moving NAMED users to per-UID
// metering; that escape hatch does not exist here, because this lane is
// anonymous by definition. So the ceiling itself had to rise.
//
// Sized for a school: 30/min absorbs a class starting together, 200/hour is
// ~40 anonymous visitors an hour from one address, 800/day is ~160 a day.
// Signed-in users are metered per-uid below and never touch these.
//
// Day cap cut 800 -> 300 on 2026-08-19, when the anonymous-uid lane below
// took over the job of metering the free round. This lane is now the
// exception path, not the main one: App Check is hard-enforced, App Check
// needs the Firebase SDK, and any page that loaded the Firebase SDK has
// already minted an anonymous uid via js/notifications.js. So a caller who
// clears App Check but carries no token is mostly a timing race, not a
// population. The minute and hour caps are untouched, because those are what
// absorb a class starting a round together.
const ANON_LAYERS = [
  { window: 60_000,    max: 30,  label: 'minute' },
  { window: 3_600_000, max: 200, label: 'hour'   },
  { window: 86_400_000,max: 300, label: 'day'    },
];
const anonHistory = new Map(); // ip → array of request timestamps

// One free round, then sign in. -------------------------------------------
//
// The IP layers above are a blast-radius limit, not a free tier. The free
// tier was supposed to be the client-side counter (ANON_LIMIT = 1 round in
// practice.html), but that counter lives in localStorage: clear it, open a
// private window, or just call the endpoint directly and you are a brand new
// visitor with a fresh round, forever. Nothing server-side ever said no
// until the 800/day IP ceiling, which is ~160 rounds. That is the drain.
//
// The fix is to meter the free round against an identity the client cannot
// reset by clearing storage. Every visitor already has one: js/notifications
// .js calls signInAnonymously() on nearly every page, so a guest is holding a
// real Firebase uid before they ever reach a round. js/app-check.js now sends
// that token on brain calls, and isNamedAccount() below tells the two apart.
//
// So there are three lanes now, tightest first:
//   named account   → per-uid metering, team plan, the real product
//   anonymous uid   → ANON_FREE_CALLS, then 401 SIGN_IN_REQUIRED
//   no token at all → IP layers only (see below)
//
// Sized at 6 because a round is roughly 5 calls: one full round with slack,
// which is exactly the taste the client already promises at ANON_LIMIT = 1.
const ANON_FREE_CALLS = Number(process.env.ANON_FREE_CALLS || 6);
const ANON_FREE_WINDOW_MS = 86_400_000;
const anonUidHistory = new Map(); // anon uid → array of request timestamps

const SIGNED_IN_BETA_DAILY_MAX = Number(process.env.SIGNED_IN_BETA_DAILY_MAX || 20);
const signedInBetaHistory = new Map(); // uid -> array of request timestamps

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

// The free round, metered against the anonymous Firebase uid. Returns
// {ok, count}; ok:false means the taste is spent and the caller has to make
// an account. Mirrors checkSignedInBetaLimit's shape (Upstash first, in-memory
// fallback) so both lanes behave the same across cold starts.
async function checkAnonFreeRound(anonUid) {
  if (!anonUid) return { ok: true, count: 0 };

  if (HAS_UPSTASH) {
    const count = await upstashIncr(`rl:anon-uid:day:${anonUid}`, Math.ceil(ANON_FREE_WINDOW_MS / 1000));
    if (count !== null) return { ok: count <= ANON_FREE_CALLS, count };
  }

  const now = Date.now();
  const history = (anonUidHistory.get(anonUid) || []).filter(t => now - t < ANON_FREE_WINDOW_MS);
  history.push(now);
  anonUidHistory.set(anonUid, history);
  if (anonUidHistory.size > 5000) {
    const entries = Array.from(anonUidHistory.entries());
    anonUidHistory.clear();
    entries.slice(-2500).forEach(([k, v]) => anonUidHistory.set(k, v));
  }
  return { ok: history.length <= ANON_FREE_CALLS, count: history.length };
}

async function checkSignedInBetaLimit(userId) {
  if (!userId) return { ok: false, count: 0 };

  if (HAS_UPSTASH) {
    const count = await upstashIncr(`rl:beta-user:day:${userId}`, 86_400);
    if (count !== null) return { ok: count <= SIGNED_IN_BETA_DAILY_MAX, count };
  }

  const now = Date.now();
  const windowMs = 86_400_000;
  const history = (signedInBetaHistory.get(userId) || []).filter(t => now - t < windowMs);
  history.push(now);
  signedInBetaHistory.set(userId, history);
  if (signedInBetaHistory.size > 5000) {
    const entries = Array.from(signedInBetaHistory.entries());
    signedInBetaHistory.clear();
    entries.slice(-2500).forEach(([k, v]) => signedInBetaHistory.set(k, v));
  }
  return { ok: history.length <= SIGNED_IN_BETA_DAILY_MAX, count: history.length };
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

  // Prep-time warm ping from the client (see the prewarm effect in
  // practice.html). Same intent as X-Keepalive, but it has to be answered
  // BEFORE the metering lanes below, not after: the body-level `warm` check
  // further down only runs once the request has already been charged, and on
  // the anonymous lane that spends one of ANON_FREE_CALLS on a request that
  // never reaches Anthropic. Forging this header buys nothing — it returns
  // here without generating anything.
  if (request.headers.get('X-Warm') === '1') {
    return new Response(JSON.stringify({ ok: true, warm: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
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

  // Three lanes: named account, anonymous uid, no token. See ANON_FREE_CALLS.
  const bearerToken = extractBearerToken(request);
  let teamId = null;
  let userId = null;
  let anonUid = null;

  // Decode first, branch second. A token that fails verification falls DOWN
  // to the anonymous lane rather than 401-ing: js/app-check.js now attaches a
  // token automatically, so a stale one would hard-fail a round that used to
  // work, and the lane it falls into is the tighter one anyway. App Check
  // still has to pass there.
  let decoded = null;
  if (bearerToken) {
    try {
      decoded = await verifyIdToken(bearerToken);
    } catch (err) {
      console.warn('[claude] id token rejected, falling to anon lane:', err && err.message);
      decoded = null;
    }
    if (decoded && !isNamedAccount(decoded)) {
      anonUid = decoded.sub;
      decoded = null;
    }
  }

  if (decoded) {
    try {
      userId = decoded.sub;

      // Rate limit per user
      if (!(await checkRateLimit(userId))) {
        return new Response(
          JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
          { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }

      // Owner bypass BEFORE the Firestore lookup, and a deadline + fail-open
      // for everyone else: with the read quota blown, getUserTeam stalls
      // ~10s then throws, and the catch below converted that into a 401 the
      // client renders as "API key invalid" — signed-in users got a worse
      // experience than anon. On lookup failure we degrade to the no-team
      // beta path (in-memory daily cap), never a hard auth error.
      let result = null;
      if (!isOwnerEmail(decoded.email)) {
        try {
          result = await withDeadline(getUserTeam(userId), 2500);
        } catch (teamErr) {
          console.warn('[claude] team lookup failed, failing open to beta path:', teamErr && teamErr.message);
          result = null;
        }
      }
      if (!result) {
        const betaLimit = isOwnerEmail(decoded.email)
          ? { ok: true, count: 0 }
          : await checkSignedInBetaLimit(userId);
        if (!betaLimit.ok) {
          return new Response(
            JSON.stringify({
              error: 'Daily beta limit reached. Try again tomorrow or create a team for higher limits.',
              code: 'SIGNED_IN_BETA_LIMIT',
              usage: betaLimit.count,
              limit: SIGNED_IN_BETA_DAILY_MAX,
            }),
            { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } }
          );
        }
      } else {
        const { team } = result;
        teamId = team.id;

        // Subscription gate. Lifetime is paid-once-active-forever; trial is
        // the free tier. Both bypass the status check entirely and rely on
        // the usage cap for upsell. For paid subscriptions we only block on
        // EXPLICIT Stripe-bad statuses: 'past_due' is a grace state Stripe
        // retries through, and null/'inactive' from legacy/race-conditioned
        // writes shouldn't lock out users who actually paid. The previous
        // logic requiring 'active' | 'trialing' was a fake paywall hitting
        // paying customers.
        const SUB_PLANS = new Set(['byok', 'individual', 'team', 'voice']);
        const KNOWN_INACTIVE = new Set(['canceled','cancelled','incomplete_expired','unpaid']);
        if (SUB_PLANS.has(team.plan) && KNOWN_INACTIVE.has(team.status)) {
          return new Response(
            JSON.stringify({ error: 'Subscription inactive. Please update your billing.', code: 'SUBSCRIPTION_INACTIVE' }),
            { status: 402, headers: { 'Content-Type': 'application/json', ...CORS } }
          );
        }

        // Check usage limits. Owner allowlist bypasses.
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
      }
    } catch (err) {
      // The token already verified above, so this is no longer an auth
      // failure — it is the metering layer (Upstash, the beta counter)
      // throwing. Telling a signed-in user to sign in again sends them to
      // fix something that is not broken.
      console.warn('[claude] signed-in metering failed:', err && err.message);
      return new Response(
        JSON.stringify({ error: 'Could not check your usage just now. Try again in a moment.', code: 'METERING_UNAVAILABLE' }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }
  } else {
    // Anonymous path — one free round, then sign in.
    // App Check first (blocks scripted abuse from non-browser callers), then
    // the free-round budget on the anonymous uid when we have one, then the
    // layered per-IP limits as the blast-radius backstop.
    const appCheckResult = await checkAppCheck(request);
    if (!appCheckResult.ok) {
      return new Response(
        JSON.stringify({ error: 'App verification failed. Reload the page and try again.', code: 'APP_CHECK_' + appCheckResult.reason.toUpperCase() }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }
    // The free round. 401 rather than 429 because this is not congestion and
    // waiting will not clear it — there is exactly one thing the caller can do
    // about it, and SIGN_IN_REQUIRED tells the client to open the auth modal
    // instead of rendering a dead-end "try again later".
    const freeRound = await checkAnonFreeRound(anonUid);
    if (!freeRound.ok) {
      recordTrip('claude', 'sign_in_wall', 'anon'); // Cost-guard visibility: how often the wall fires
      return new Response(
        JSON.stringify({
          error: 'Your free round is done. Make an account to keep debating. Your rounds, ballots, and record start saving from here.',
          code: 'SIGN_IN_REQUIRED',
          usage: freeRound.count,
          limit: ANON_FREE_CALLS,
        }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const ip = request.headers.get('x-nf-client-connection-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon';  // nf ip is Netlify-set + unforgeable; XFF (client-settable) only as fallback
    const check = await checkAnonLayers(ip);
    if (!check.ok) {
      recordTrip('claude', check.layer, 'ip');
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
    const [distillBlock, fingerprintBlock, exemplarBlock, brainBlock, discourseBlock] = await Promise.all([
      getDistillationBlock(vFormat, vFeature),
      getFingerprintBlock(userId, vFeature),
      getExemplarBlock({ feature: vFeature, motion: vMotion, format: vFormat, side: vSide }),
      getBrainBlock(userId, vFeature),
      getDiscourseBlock({ motion: vMotion, feature: vFeature }),
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

    // Delivery (manner + length) is per REQUEST, so it lives in the
    // uncached tail rather than beside the adjudication core in the
    // cached prefix. Three manners times three lengths would otherwise
    // shard the shared prefix nine ways for a few hundred tokens, and
    // the core is the expensive part that caching exists to hold.
    // Stripped unconditionally: Anthropic rejects unknown top-level keys.
    const judgeDelivery = takeDelivery(body);
    const deliverySeg = isJudgeFeature(feature) ? deliveryBlock(judgeDelivery) : '';

    // Adjudication core — for client-built JUDGING prompts (live rooms, voice
    // RFD) that ship no server-side library text. Stable per judging feature,
    // so it rides the cached prefix. The typed 3-judge panel does NOT route
    // here for the core (it pulls ADJUDICATION_CORE in via prompts.mjs), so
    // JUDGE_FEATURES is scoped to the two client-built surfaces to avoid a
    // double-inject. See lib/adjudication.mjs.
    const adjudicateBlock = isJudgeFeature(feature) ? buildAdjudicationBlock({ format: vFormat }) : '';

    // CACHED prefix — shared per (feature, format, topic): adjudication core (judging only) + voice bank + nightly distillation.
    const cachedPrefix = [adjudicateBlock, voiceSeg && voiceSeg.stable, distillBlock].filter(Boolean).join('\n');
    // UNCACHED tail — per-round base system, per-motion reference rounds,
    // per-user style, random spice, then the voice-check reinforcement LAST.
    // brainBlock before fingerprintBlock: what they TOLD us outranks what
    // we INFERRED, so editing /brain this morning beats a fingerprint
    // built from ten older rounds. Both are per-user, so both stay in
    // the uncached tail and never contaminate the shared prefix.
    // discourseBlock sits in the tail, not the cached prefix: it is keyed
    // to the motion (like exemplars), so caching it would poison the
    // shared prefix for every other motion on the same format.
    const tail = [deliverySeg, baseSystem, exemplarBlock, discourseBlock, brainBlock, fingerprintBlock, spice, voiceSeg && voiceSeg.reinforcement]
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

    // Stream the response through to the client, with a heartbeat.
    //
    // WHY THE HEARTBEAT EXISTS, measured 2026-08-12 on a real /judge report.
    // A reasoning model opens a thinking block and then sends NOTHING for
    // several seconds while it reasons. Against api.anthropic.com directly
    // that is fine: the gap was 6.5s, Anthropic sent its own `ping` at 9.0s,
    // and the stream completed at 22.4s with message_stop. Proxied through
    // here, the same request died at 13.6s having last received bytes at
    // 3.0s: 639 bytes, message_start plus content_block_start, no ping, no
    // message_stop, and a 200 status. The edge drops a silent stream.
    //
    // The client cannot tell that apart from a bad ballot, so /judge told
    // users their transcript was malformed and they rewrote it, repeatedly,
    // for a fault that was ours. A comment line every few seconds keeps
    // bytes moving; SSE readers ignore any line that is not `data:`.
    //
    // Injected ONLY at an event boundary. Chunk boundaries can split an SSE
    // event mid-JSON, and a comment spliced into the middle of one would
    // corrupt the very payload this is protecting.
    return new Response(withSseHeartbeat(clientBody, body.stream === true && response.ok), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        // Netlify and any intermediary proxy: do not buffer this.
        'X-Accel-Buffering': 'no',
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
