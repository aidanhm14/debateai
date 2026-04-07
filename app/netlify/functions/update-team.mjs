import { getUserTeam, FieldValue } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
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

  const { teamRef, membership } = result;
  if (membership.role !== 'owner') return errorResponse('Only team owner can update', 403);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid request body', 400); }

  const updates = {};

  if (body.name && typeof body.name === 'string') {
    updates.teamName = body.name.trim().slice(0, 100);
  }
  if (typeof body.context === 'string') {
    updates.context = body.context.trim().slice(0, 500);
  }

  if (Object.keys(updates).length === 0) return errorResponse('Nothing to update', 400);

  updates.updatedAt = FieldValue.serverTimestamp();
  await teamRef.update(updates);

  return jsonResponse({ ok: true, ...updates });
};

export const config = {
  path: '/api/teams/update',
};
