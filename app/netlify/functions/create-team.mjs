import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getUserTeam } from './lib/firestore.mjs';
import { createWorkspace } from './lib/workspace.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// In-memory rate limiter (resets on cold start — a persistent store would be better)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 3; // max requests per minute per user

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

  try {
    // Authenticate
    const token = extractBearerToken(request);
    if (!token) return errorResponse('Authorization required', 401, request);

    let decoded;
    try {
      decoded = await verifyIdToken(token);
    } catch (err) {
      console.error('create-team auth error:', err.message);
      return errorResponse('Authentication failed. Please sign in again.', 401, request);
    }

    if (!isNamedAccount(decoded)) {
      return errorResponse('A permanent account is required to create a workspace.', 403, request);
    }

    const uid = decoded.sub;
    console.log('create-team: uid =', uid);

    if (!checkRateLimit(uid)) {
      return errorResponse('Too many requests. Please wait a moment and try again.', 429, request);
    }
    const email = decoded.email || '';
    const name = decoded.name || '';

    // Check user isn't already on a team
    let existing;
    try {
      existing = await getUserTeam(uid);
      console.log('create-team: existing team =', existing ? existing.team.id : 'none');
    } catch (err) {
      console.error('create-team: getUserTeam failed:', err.message, err.stack);
      return errorResponse('Database error checking existing team. Please try again.', 500, request);
    }
    if (existing) return errorResponse('You already belong to a team', 409, request);

    const body = await request.json();
    const teamName = (body.name || '').trim().slice(0, 100);
    if (!teamName) return errorResponse('Team name is required', 400, request);

    let created;
    try {
      created = await createWorkspace(decoded, teamName);
    } catch (err) {
      console.error('create-team: workspace creation failed:', err.message);
      return errorResponse('Billing setup failed. Please try again.', 500, request);
    }
    const { team: teamData, teamRef } = created;
    const periodEnd = teamData.currentPeriodEnd;

    return jsonResponse({
      teamId: teamRef.id,
      teamName: teamName,
      plan: teamData.plan,
      status: teamData.status,
      role: 'owner',
      usageThisPeriod: 0,
      usageLimit: teamData.usageLimit,
      memberCount: 1,
      maxMembers: teamData.maxMembers,
      stripeSubscriptionId: null,
      currentPeriodEnd: periodEnd.toISOString(),
      trialEndsAt: null,
    }, 201, request);
  } catch (err) {
    console.error('create-team error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/teams',
};
