import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam, logUsage, PLANS } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// In-memory rate limiter (resets on cold start — a persistent store would be better)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // max requests per minute per user

function checkRateLimit(userId) {
  const now = Date.now();
  const key = userId || 'anon';
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  // Require Firebase authentication
  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authentication required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const userId = decoded.sub;

  // Rate limit per user
  if (!checkRateLimit(userId)) {
    return errorResponse('Too many requests. Please wait a moment and try again.', 429, request);
  }

  // Team membership check — user must belong to a team
  const teamResult = await getUserTeam(userId);
  if (!teamResult) {
    return errorResponse('No team found. Create or join a team first.', 403, request);
  }

  const { team } = teamResult;

  // Check subscription status
  if (!['active', 'trialing'].includes(team.status)) {
    return errorResponse('Subscription inactive. Please update your billing.', 402, request);
  }

  // Check usage limits
  const planLimits = PLANS[team.plan] || PLANS.trial;
  if (team.usageThisPeriod >= planLimits.requests) {
    return errorResponse('Monthly usage limit reached. Upgrade your plan for more requests.', 429, request);
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return errorResponse('API not configured', 500, request);

  try {
    const body = await request.json();
    const query = (body.query || '').trim();

    // Input validation
    if (!query) return errorResponse('Missing query', 400, request);
    if (query.length > 500) return errorResponse('Query too long (max 500 characters)', 400, request);
    if (query.length < 3) return errorResponse('Query too short', 400, request);

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a news research assistant. Provide detailed, factual summaries of recent news developments. Focus on stories with genuine ethical, policy, or philosophical tensions that would make good debate topics. Include specific details: names, dates, places, stakes. Be thorough but concise.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      return errorResponse('News search temporarily unavailable. Please try again.', response.status, request);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Log usage (fire-and-forget, don't block response)
    logUsage(team.id, userId, 'perplexity_search').catch(err =>
      console.error('perplexity logUsage failed:', err)
    );

    return jsonResponse({ text }, 200, request);
  } catch (e) {
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = { path: '/api/perplexity' };
