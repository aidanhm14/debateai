import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { runTopicStrikes } from './lib/topic-strikes.mjs';

export default async request => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  let user;
  try { user = await verifyIdToken(extractBearerToken(request)); } catch (_) {}
  if (!isNamedAccount(user)) return errorResponse('Sign in to choose topics.', 401, request);
  let body;
  try { body = await request.json(); } catch (_) {}
  if (!body || !/^[a-zA-Z0-9-]{1,120}$/.test(body.room || '')) return errorResponse('Invalid room.', 400, request);
  const gate = await checkLayers('topic-strikes', user.sub, [{ window: 60000, max: 30, label: 'minute' }]);
  if (!gate.ok) return errorResponse('Please wait before trying again.', 429, request);
  try { return jsonResponse(await runTopicStrikes(getDb(), user.sub, body, FieldValue), 200, request); }
  catch (error) { return errorResponse(error.status ? error.message : 'Could not save that choice. Try again.', error.status || 503, request); }
};
export const config = { path: '/api/room-topic-strikes' };
