import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);

  if (request.method === 'GET') {
    return jsonResponse({
      ok: true,
      retired: true,
      message: 'Brand poll retired. Canonical brand is DebateIt; live domain is debateai.com.',
    }, 200, request);
  }

  return errorResponse('Brand poll retired', 410, request);
};

export const config = {
  path: '/api/poll',
};
