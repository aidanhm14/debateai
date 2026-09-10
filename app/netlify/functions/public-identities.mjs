import { getDb } from './lib/firestore.mjs';
import { publicNames } from './lib/public-identity.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async request => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);
  const uids = [...new Set((new URL(request.url).searchParams.get('uids') || '').split(',').filter(Boolean))];
  if (!uids.length || uids.length > 100 || uids.some(uid => !/^[A-Za-z0-9_-]{1,128}$/.test(uid))) {
    return errorResponse('Supply up to 100 account IDs', 400, request);
  }
  const names = await publicNames(getDb(), uids);
  const response = jsonResponse({ names: Object.fromEntries(names) }, 200, request);
  response.headers.set('Cache-Control', 'no-store');
  return response;
};
export const config = { path: '/api/public-identities' };
