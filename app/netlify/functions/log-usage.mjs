import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam, logUsage } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

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
