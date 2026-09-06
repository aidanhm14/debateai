import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
// Public clock only. No room data, account lookup or provider call.
export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);
  const response = jsonResponse({ now: Date.now() }, 200, request);
  response.headers.set('Cache-Control', 'no-store');
  return response;
};
export const config = { path: '/api/room-clock' };
