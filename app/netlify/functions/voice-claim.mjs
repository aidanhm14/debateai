import { checkAppCheck } from './lib/appcheck.mjs';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { sanitizeTopic } from './lib/topic-isolation.mjs';
import { checkContent } from './lib/content-guard.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Spoken tool proposals pass the same motion boundary as typed setup before
// the client displays or locks them. This endpoint creates no session or bill.
export default async request => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('POST only', 405, request);
  if (!(await checkAppCheck(request)).ok) return errorResponse('Reload the page and try again.', 401, request);
  try {
    const user = await verifyIdToken(extractBearerToken(request));
    if (!isNamedAccount(user)) return errorResponse('Sign in to choose a topic.', 401, request);
  } catch { return errorResponse('Sign in to choose a topic.', 401, request); }
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid topic', 400, request); }
  const claim = sanitizeTopic(typeof body?.claim === 'string' ? body.claim.slice(0, 500) : '', 160);
  const guard = checkContent({ text: claim, kind: 'motion', minLength: 3 });
  if (!guard.ok) return errorResponse(guard.reason, 422, request);
  if (claim.split(/\s+/).length < 3 || !['for', 'against'].includes(body.user_side)) return errorResponse('Choose one clear claim and a side.', 400, request);
  return jsonResponse({ ok: true, claim, user_side: body.user_side }, 200, request);
};
export const config = { path: '/api/voice-claim' };
