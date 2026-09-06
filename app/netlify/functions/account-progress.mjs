import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { fetchAccountProgress } from './lib/account-progress.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);
  let auth;
  try { auth = await verifyIdToken(extractBearerToken(request)); }
  catch { return errorResponse('Sign in to see your progress', 401, request); }
  try { return jsonResponse(await fetchAccountProgress(getDb(), auth.sub), 200, request); }
  catch { return errorResponse('Your progress could not load. Try again.', 503, request); }
};
export const config = { path: '/api/account-progress' };
