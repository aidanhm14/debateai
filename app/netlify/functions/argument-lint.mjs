// Argument linter — "Grammarly for debate."
// Takes a passage and returns a structured JSON critique: the claim it's
// making, the warrants holding it up (with strength), the impact chain at
// the end, what's missing, two suggested rephrasings, and the angles an
// opponent would attack.
//
// HARD CONSTRAINT: the linter NEVER adds facts, statistics, citations,
// or named cases. It rewrites STRUCTURE only. This is intentional — the
// extension surface needs to be coaching, not cheating. (See soul.md §4
// and the AGENTS.md decision log around the Counter extension.)
//
// Auth mirrors /api/claude: bearer token for signed-in users (team usage
// counted), App Check + layered IP caps for anonymous callers. Anonymous
// linting is allowed because the extension's primary entry point is the
// "drop in on any Wikipedia / news / Docs page and tighten my argument"
// use case, where the user hasn't necessarily authenticated yet.

import { verifyIdToken, extractBearerToken, isOwnerEmail } from './lib/auth.mjs';
import { getUserTeam, logUsage, PLANS } from './lib/firestore.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';

const MODEL = process.env.ARG_LINT_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1400;
const MAX_INPUT_CHARS = 6000;

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://debateos.com',
  'https://www.debateos.com',
  'https://debateai.com',
  'https://www.debateai.com',
  'https://debateit.com',
  'https://www.debateit.com',
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Per-IP minute cap for anonymous callers. Linter calls are small (Haiku,
// ~1.4k output tokens) so this can be more permissive than /api/claude.
const anonHits = new Map();
const ANON_WINDOW = 60_000;
const ANON_MAX = 10;
function checkAnon(ip) {
  const now = Date.now();
  const arr = (anonHits.get(ip) || []).filter((t) => now - t < ANON_WINDOW);
  if (arr.length >= ANON_MAX) return false;
  arr.push(now);
  anonHits.set(ip, arr);
  if (anonHits.size > 5000) {
    const e = Array.from(anonHits.entries()).slice(-2500);
    anonHits.clear();
    for (const [k, v] of e) anonHits.set(k, v);
  }
  return true;
}

// The linter contract. The model returns JSON matching this shape; the
// client renders it. Kept tight on purpose: more fields = more drift in
// the model's structured output, fewer fields = a UI that loads fast and
// reads clean in a side panel.
const SYSTEM_PROMPT = `You are an argument linter for competitive debaters.
You inspect a passage and return a STRUCTURAL critique only.

ABSOLUTE RULES — violating any of these makes the response useless:
1. NEVER add facts, statistics, dates, names, cases, citations, or
   country-specific data the user didn't already write. Coaching only.
2. NEVER write a rebuttal for the user. You may name the ANGLE an
   opponent would attack ("turn on probability", "case-by-case takeout"),
   but do NOT spell out the rebuttal itself.
3. Rephrasings preserve the user's claim and warrants exactly. You only
   tighten structure, register, and signposting. If the user wrote
   "kids learn worse on phones" your rephrasing cannot become "studies
   show kids learn 30% worse" — that would invent evidence.
4. No em-dashes in any user-facing text. Use periods, commas, or
   semicolons.
5. No throat-clearing ("Let's unpack…", "In today's world…", "It's
   important to note"). Direct register.

Return ONLY valid JSON matching this exact schema, no prose around it:

{
  "claim": "One-sentence statement of the main claim the passage makes.",
  "warrants": [
    {
      "text": "Short paraphrase of one reason the passage gives.",
      "strength": "strong" | "medium" | "weak",
      "issue": "What's structurally weak about this warrant, if anything. Empty string if it's solid."
    }
  ],
  "impact": {
    "text": "What harm or benefit the passage lands on at the end.",
    "missing": ["Which impact-calc dimensions are absent. Pick from: magnitude, probability, timeframe, reversibility, comparative weighing. Empty array if all four are present."]
  },
  "missing_moves": ["Up to 3 short notes on structural moves the passage skips. E.g. 'no signposting between the two reasons', 'jumps from cause to harm without naming the mechanism', 'asserts the link without warranting it'."],
  "rephrasings": [
    {
      "label": "Tighter",
      "text": "The same passage rewritten in claim / warrant / impact form. Keep the user's facts; just tighten."
    },
    {
      "label": "Debate-formal",
      "text": "The same passage rewritten for a formal round (signposted, weighed at the end)."
    }
  ],
  "opposition_hooks": ["Up to 3 short angles an opponent could attack — name the angle, never write the rebuttal. E.g. 'turn on probability — link is unwarranted', 'magnitude minimization — affects a small subset', 'counter-impact on autonomy'."]
}

Hold every string to one sentence unless the schema marks it otherwise.
Hold warrants and opposition_hooks to at most 4 items each. Be terse.`;

function buildUserMessage(text, format) {
  const fmtLine = format ? `Format hint: ${format}. Weigh suggestions for that format's conventions.` : '';
  return `${fmtLine}

Passage to lint:
"""
${text}
"""

Return ONLY the JSON object. No code fences, no commentary.`;
}

export default async (request) => {
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured on server' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  // Auth path: signed-in users get usage metered against their team plan;
  // anonymous callers must clear App Check + the per-IP cap.
  const bearerToken = extractBearerToken(request);
  let teamId = null;
  let userId = null;

  if (bearerToken) {
    try {
      const decoded = await verifyIdToken(bearerToken);
      userId = decoded.sub;
      const result = await getUserTeam(userId);
      if (!result) {
        return new Response(JSON.stringify({ error: 'No team found. Create or join a team first.' }), {
          status: 403, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      const { team } = result;
      teamId = team.id;
      const SUB_PLANS = new Set(['byok', 'individual', 'team']);
      const KNOWN_INACTIVE = new Set(['canceled','cancelled','incomplete_expired','unpaid']);
      if (SUB_PLANS.has(team.plan) && KNOWN_INACTIVE.has(team.status)) {
        return new Response(JSON.stringify({ error: 'Subscription inactive. Please update your billing.', code: 'SUBSCRIPTION_INACTIVE' }), {
          status: 402, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      const planLimits = PLANS[team.plan] || PLANS.trial;
      if (!isOwnerEmail(decoded.email) && team.usageThisPeriod >= planLimits.requests) {
        return new Response(JSON.stringify({
          error: 'Monthly usage limit reached. Upgrade your plan for more requests.',
          code: 'USAGE_LIMIT_REACHED',
          usage: team.usageThisPeriod,
          limit: planLimits.requests,
        }), { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Authentication failed. Please sign in again.' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
  } else {
    const appCheckResult = await checkAppCheck(request);
    if (!appCheckResult.ok) {
      return new Response(JSON.stringify({ error: 'App verification failed. Reload the page and try again.', code: 'APP_CHECK_' + appCheckResult.reason.toUpperCase() }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-nf-client-connection-ip') || 'anon';
    if (!checkAnon(ip)) {
      return new Response(JSON.stringify({ error: 'Too many lint requests. Wait a minute and try again.', code: 'ANON_LIMIT_MINUTE' }), {
        status: 429, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
  }

  let body;
  try { body = await request.json(); } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const text = String(body?.text || '').trim();
  const format = String(body?.format || '').trim().slice(0, 40);
  if (!text) {
    return new Response(JSON.stringify({ error: 'No passage provided.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
  if (text.length > MAX_INPUT_CHARS) {
    return new Response(JSON.stringify({ error: `Passage too long. Limit is ${MAX_INPUT_CHARS} characters.` }), { status: 413, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(text, format) }],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.warn('[argument-lint] anthropic non-2xx', upstream.status, errText.slice(0, 200));
      return new Response(JSON.stringify({ error: 'Lint failed upstream. Try again.' }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const data = await upstream.json();
    const raw = data?.content?.[0]?.text || '';
    // The model sometimes wraps JSON in ```json fences despite the prompt
    // saying not to; strip them defensively.
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsed = null;
    try { parsed = JSON.parse(stripped); } catch (e) {
      console.warn('[argument-lint] JSON parse failed', e?.message, raw.slice(0, 200));
      return new Response(JSON.stringify({
        error: 'The linter returned an unexpected response. Try again or shorten the passage.',
        raw: raw.slice(0, 500),
      }), { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    if (teamId && userId) {
      logUsage(teamId, userId, 'argumentLint').catch((e) => console.error('logUsage failed:', e));
    }

    return new Response(JSON.stringify({ ok: true, result: parsed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...CORS },
    });
  } catch (err) {
    console.warn('[argument-lint] failed', err?.message);
    return new Response(JSON.stringify({ error: 'Something went wrong. Try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
};

export const config = {
  path: '/api/argument-lint',
};
