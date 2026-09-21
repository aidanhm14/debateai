import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { getDb } from './lib/firestore.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { spinRoomTopic } from './lib/room-topic-spin.mjs';

export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  if (!(await checkAppCheck(request)).ok) return errorResponse('Reload the page and try again.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(extractBearerToken(request)); } catch (_) {}
  if (!isNamedAccount(decoded)) return errorResponse('Sign in to choose a topic.', 401, request);
  let body;
  try { body = await request.json(); } catch (_) {}
  if (!body || !/^[a-zA-Z0-9-]{1,120}$/.test(body.room || '')) return errorResponse('Invalid room', 400, request);
  const uid = decoded.uid || decoded.sub;
  const rate = await checkLayers('room-topic-spin', uid, [{ window: 60000, max: 30, label: 'minute' }]);
  if (!rate.ok) return errorResponse('Please wait before spinning again.', 429, request);
  try { return jsonResponse(await spinRoomTopic(getDb(), uid, body), 200, request); }
  catch (error) {
    const expected = error.status === 403 || error.status === 409;
    return errorResponse(expected ? error.message : 'Could not find a topic. Try again.', expected ? error.status : 503, request);
  }
}
export const config = { path: '/api/room-topic-spin' };
