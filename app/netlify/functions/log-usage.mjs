import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam, logUsage } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse();
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    return errorResponse('Invalid token: ' + err.message, 401);
  }

  const result = await getUserTeam(decoded.sub);
  if (!result) return errorResponse('No team found', 404);

  const { team } = result;
  const userId = decoded.sub;

  try {
    const body = await request.json();
    const feature = body.feature || 'unknown';
    await logUsage(team.id, userId, feature);
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('log-usage error:', err);
    return errorResponse('Server error: ' + err.message, 500);
  }
};

export const config = {
  path: '/api/teams/log-usage',
};
