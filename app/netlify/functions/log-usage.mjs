import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam, logUsage } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// In-memory rate limiter (resets on cold start — a persistent store would be better)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // max requests per minute per user

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

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('log-usage auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  if (!checkRateLimit(decoded.sub)) {
    return errorResponse('Too many requests. Please wait a moment and try again.', 429, request);
  }

  const result = await getUserTeam(decoded.sub);
  if (!result) return errorResponse('No team found', 404, request);

  const { team } = result;
  const userId = decoded.sub;

  try {
    const body = await request.json();
    const feature = body.feature || 'unknown';
    await logUsage(team.id, userId, feature);
    return jsonResponse({ ok: true }, 200, request);
  } catch (err) {
    console.error('log-usage error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/teams/log-usage',
};
