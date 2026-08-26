import { verifyIdToken, extractBearerToken, isOwnerEmail, isNamedAccount } from './lib/auth.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { getUserTeam, logUsage, PLANS } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';

// Rate limits, shared-counter via lib/rate-limit.mjs (a module-scope Map is
// per-isolate: the count resets on cold start and differs per instance).
// NAMED accounts get the per-user lane; anonymous Firebase uids are free and
// unlimited to mint, so an anonymous token meters against the IP like any
// tokenless caller. Anon limits are tighter because there's no team usage
// backstop.
const USER_LAYERS = [
  { window: 60_000, max: 10, label: 'minute' },
  { window: 3_600_000, max: 60, label: 'hour' },
  { window: 86_400_000, max: 200, label: 'day' },
];
const IP_LAYERS = [
  { window: 60_000, max: 4, label: 'minute' },
  { window: 3_600_000, max: 20, label: 'hour' },
  { window: 86_400_000, max: 60, label: 'day' },
];

// Mode-specific prompt + model. 'news' is the legacy news-research path used
// by the motion designer. 'evidence' is debate-research with cited sources,
// fed into the Evidence Finder tab on the high-school app.
const MODES = {
  news: {
    model: 'sonar',
    maxTokens: 2000,
    system:
      'You are a news research assistant. Provide detailed, factual summaries of recent news developments. Focus on stories with genuine ethical, policy, or philosophical tensions that would make good debate topics. Include specific details: names, dates, places, stakes. Be thorough but concise.',
  },
  evidence: {
    model: 'sonar-pro',
    maxTokens: 3500,
    system:
      'You are a debate research assistant. Given a topic and a side (Pro/Con/Both), return 6–8 distinct pieces of evidence a debater could deploy in a round. For EACH piece, format as:\n\n**[N]. SOURCE** — publication / institution + year\n**FINDING:** the specific claim, statistic, or quotation (with the number when applicable)\n**TAG:** one-sentence read-aloud tag a debater would say in-round\n**HOW TO USE IT:** which contention this supports and the link chain it completes\n**SEARCH TIP:** exact query to find this or similar evidence\n\nPrioritize peer-reviewed studies, government reports, major think tanks, and reputable journalism from 2022–2026. Mix quantitative (data, stats) with qualitative (expert testimony, case studies). When a finding is contested, say so. Do not invent sources — if you are uncertain a source exists, mark it [verify before round].',
  },
};

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  // Every caller must be a real browser running our Firebase app; every
  // request here is a paid Perplexity call. The calling pages (/app,
  // /high-school) mint App Check tokens sitewide.
  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) {
    return jsonResponse({
      error: 'App verification failed. Reload the page and try again.',
      code: 'APP_CHECK_' + String(appCheck.reason || '').toUpperCase(),
    }, 401, request);
  }

  // Auth is optional. A NAMED account gets the higher per-user limit + its
  // team's usage logger; an anonymous-uid token meters per IP like a
  // tokenless caller. This keeps free-tier surfaces (Evidence Finder on
  // /high-school, motion designer on /app news fetch) working.
  let userId = null;
  let named = false;
  let userEmail = null;
  let team = null;
  const token = extractBearerToken(request);
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      userId = decoded.sub;
      named = isNamedAccount(decoded);
      userEmail = decoded.email || null;
      if (named) {
        const teamResult = await getUserTeam(userId);
        if (teamResult) team = teamResult.team;
      }
    } catch (_) { /* fall through to anon */ }
  }

  // Per-user / per-IP rate limit
  if (named && userId) {
    const limited = await checkLayers('perplexity', 'uid_' + userId, USER_LAYERS);
    if (!limited.ok) {
      return errorResponse('Too many requests. Please wait a moment and try again.', 429, request);
    }
  } else {
    const limited = await checkLayers('perplexity', 'ip_' + callerIp(request), IP_LAYERS);
    if (!limited.ok) {
      return errorResponse('Research limit reached. Sign in for more searches.', 429, request);
    }
  }

  // For authenticated team callers we still respect plan caps. Lifetime
  // is paid-once-forever; trial is free-tier. Both bypass the status
  // check. For subscriptions, only block on explicit Stripe-bad statuses
  // (canceled/unpaid/etc); 'past_due' is a grace state and 'inactive'/null
  // are legacy/race writes that shouldn't lock out paying customers.
  if (team) {
    const SUB_PLANS = new Set(['byok', 'individual', 'team', 'voice']);
    const KNOWN_INACTIVE = new Set(['canceled','cancelled','incomplete_expired','unpaid']);
    if (SUB_PLANS.has(team.plan) && KNOWN_INACTIVE.has(team.status)) {
      return errorResponse('Subscription inactive. Please update your billing.', 402, request);
    }
    const planLimits = PLANS[team.plan] || PLANS.trial;
    if (!isOwnerEmail(userEmail) && team.usageThisPeriod >= planLimits.requests) {
      return errorResponse('Monthly usage limit reached. Upgrade your plan for more requests.', 429, request);
    }
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return errorResponse('Research API not configured', 500, request);

  let body;
  try { body = await request.json(); }
  catch (_) { return errorResponse('Invalid JSON', 400, request); }

  const query = (body.query || '').trim();
  if (!query) return errorResponse('Missing query', 400, request);
  if (query.length > 1000) return errorResponse('Query too long (max 1000 characters)', 400, request);
  if (query.length < 3) return errorResponse('Query too short', 400, request);

  const modeKey = (body.mode || 'news');
  const mode = MODES[modeKey] || MODES.news;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: mode.model,
        messages: [
          { role: 'system', content: mode.system },
          { role: 'user', content: query },
        ],
        max_tokens: mode.maxTokens,
        // Bias towards more recent sources for debate research / news
        search_recency_filter: 'year',
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('perplexity upstream', response.status, detail.slice(0, 200));
      return errorResponse('Research search temporarily unavailable. Please try again.', response.status, request);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Perplexity returns either `citations: [url, ...]` (older sonar) or
    // `search_results: [{title,url,...}]` (sonar-pro). Normalize both into
    // [{title?, url}] so the client can render a single Sources list.
    let citations = [];
    if (Array.isArray(data.search_results)) {
      citations = data.search_results
        .filter(r => r && r.url)
        .map(r => ({ title: r.title || r.url, url: r.url }));
    } else if (Array.isArray(data.citations)) {
      citations = data.citations
        .filter(u => typeof u === 'string')
        .map(u => ({ title: u, url: u }));
    }

    // Log to team usage if we know the team. Fire-and-forget.
    if (team && userId) {
      logUsage(team.id, userId, 'perplexity_' + modeKey).catch(err =>
        console.error('perplexity logUsage failed:', err)
      );
    }

    return jsonResponse({ text, citations, mode: modeKey }, 200, request);
  } catch (e) {
    console.error('perplexity handler error', e);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = { path: '/api/perplexity' };
