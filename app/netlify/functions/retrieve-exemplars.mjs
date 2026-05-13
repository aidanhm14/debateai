// HTTP wrapper around the shared exemplar-retrieval logic in
// lib/exemplars.mjs. Same scoring (admin weight × motion-token overlap ×
// recency × side bonus) the brain functions use at runtime — so admin
// tooling that hits /api/retrieve-exemplars sees exactly what the AI sees.
//
// POST /api/retrieve-exemplars
// body: { motion: string, format: string, side: string }
// returns: { exemplars: [{ motion, side, sideLabel, userSpeech, formatName }] }
//
// Public (no auth) — only surfaces opt-in admin rounds.
import { getExemplars } from './lib/exemplars.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid body', 400, request); }

  const motion = (body.motion || '').trim();
  const format = (body.format || '').trim();
  const side = (body.side || '').trim();
  if (!motion || !format) return jsonResponse({ exemplars: [] }, 200, request);

  try {
    const exemplars = await getExemplars({ motion, format, side });
    return jsonResponse({ exemplars }, 200, request);
  } catch (err) {
    return jsonResponse({ exemplars: [], error: err.message }, 200, request);
  }
};

export const config = { path: '/api/retrieve-exemplars' };
