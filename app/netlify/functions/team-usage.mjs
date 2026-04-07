import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam, PLANS } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse();
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('team-usage auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401);
  }

  const result = await getUserTeam(decoded.sub);
  if (!result) return errorResponse('No team found', 404);

  const { team, membership } = result;
  const planLimits = PLANS[team.plan] || PLANS.trial;

  return jsonResponse({
    teamId: team.id,
    teamName: team.name,
    plan: team.plan,
    status: team.status,
    role: membership.role,
    usageThisPeriod: team.usageThisPeriod || 0,
    usageLimit: planLimits.requests,
    memberCount: team.memberCount || 1,
    maxMembers: planLimits.members,
    stripeSubscriptionId: team.stripeSubscriptionId || null,
    currentPeriodEnd: team.currentPeriodEnd?.toDate?.()?.toISOString()
      || team.currentPeriodEnd || null,
    trialEndsAt: team.trialEndsAt?.toDate?.()?.toISOString()
      || team.trialEndsAt || null,
  });
};

export const config = {
  path: '/api/teams/usage',
};
