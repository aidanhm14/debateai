// POST /api/voice-session-end { sessionId }
//
// The client tells us a realtime session is over. It carries NO duration:
// the server stamped the mint and stamps this call, and the charge is the
// elapsed wall time capped at the session's reserve (lib/voice-minutes).
// So this call can only ever make a session cost LESS than the reserve
// it would otherwise settle at on the next mint, never more, and only for
// the session that is actually open on the caller's own row. That is why
// it needs a Firebase token and nothing else.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { endVoiceSession } from './lib/voice-usage.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('POST only', 405, request);
  const token = extractBearerToken(request);
  let decoded = null;
  if (token) { try { decoded = await verifyIdToken(token); } catch (e) { decoded = null; } }
  const uid = decoded && decoded.sub;
  if (!uid) return errorResponse('Sign in required', 401, request);
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const sessionId = String(body.sessionId || '').slice(0, 120);
  if (!sessionId) return errorResponse('Missing sessionId', 400, request);
  try {
    const out = await endVoiceSession(getDb(), uid, sessionId);
    return jsonResponse({ ok: true, matched: out.matched, chargedMinutes: out.charged }, 200, request);
  } catch (e) {
    console.warn('[voice-session-end]', e && e.message);
    return jsonResponse({ ok: false }, 200, request);
  }
};
export const config = { path: '/api/voice-session-end' };
