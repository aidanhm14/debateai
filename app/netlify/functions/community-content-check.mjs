import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { checkAll } from './lib/content-guard.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Screening gate for community writes that still use Firestore's realtime
// client after the check. This keeps the existing listeners and optimistic UI
// intact while making the normal write path fail closed on objectionable text.
// Firestore rules remain the authorization boundary; this endpoint is the
// content-safety boundary used by the first-party clients.
const SURFACES = {
  composer: [
    { field: 'content', kind: 'message', minLength: 2, maxLength: 1200 },
  ],
  case_comment: [
    { field: 'text', kind: 'message', minLength: 1, maxLength: 1200 },
  ],
  thread: [
    { field: 'title', kind: 'message', minLength: 4, maxLength: 200 },
    { field: 'content', kind: 'case', minLength: 10, maxLength: 51200 },
  ],
  reply: [
    { field: 'content', kind: 'case', minLength: 4, maxLength: 51200 },
  ],
  channel: [
    { field: 'text', kind: 'message', minLength: 1, maxLength: 2000 },
  ],
};

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('POST only', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in before posting.', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Your sign-in expired. Sign in again.', 401, request); }

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON', 400, request); }

  const surface = typeof body.surface === 'string' ? body.surface : '';
  const rules = SURFACES[surface];
  if (!rules) return errorResponse('Unknown community surface.', 400, request);

  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
  const result = checkAll(rules.map((rule) => ({
    ...rule,
    text: typeof fields[rule.field] === 'string' ? fields[rule.field] : '',
  })));

  if (!result.ok) {
    console.warn('[community-content-check] blocked', {
      uid: decoded.sub,
      surface,
      field: result.field,
      category: result.category,
    });
    const reason = String(result.reason || 'Content blocked by the safety filter.')
      .replace(/\s*—\s*/g, '. ');
    return jsonResponse({ error: reason, field: result.field }, 422, request);
  }

  return jsonResponse({ ok: true }, 200, request);
};

export const config = { path: '/api/community-content-check' };
