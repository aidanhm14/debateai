import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getUserTeam } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('team-analytics auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const result = await getUserTeam(decoded.sub);
  if (!result) return errorResponse('No team found', 404, request);

  const { team } = result;

  try {
    const { getDb } = await import('./lib/firestore.mjs');
    const db = getDb();
    let snap;
    try {
      // Requires composite index on teamId + timestamp
      snap = await db.collection('usage_logs')
        .where('teamId', '==', team.id)
        .orderBy('timestamp', 'desc')
        .limit(200)
        .get();
    } catch (indexErr) {
      // Fallback: query without ordering if composite index doesn't exist
      console.warn('Composite index missing, falling back:', indexErr.message);
      snap = await db.collection('usage_logs')
        .where('teamId', '==', team.id)
        .limit(200)
        .get();
    }

    const logs = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        feature: data.feature || 'unknown',
        userId: data.userId,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp || null,
        inputTokens: data.inputTokens || 0,
        outputTokens: data.outputTokens || 0,
      };
    });

    return jsonResponse({ logs }, 200, request);
  } catch (err) {
    console.error('team-analytics error:', err);
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = {
  path: '/api/teams/analytics',
};
