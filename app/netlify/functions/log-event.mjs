import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const VALID_EVENTS = new Set([
  'case_generated',
  'battle_started',
  'feedback_requested',
  'philosophy_explored',
  'market_vote',
  'forum_post',
  'motion_rolled',
  'speech_practiced',
  'round_mapped',
  'page_view',
]);

// In-memory rate limiting: uid -> { count, windowStart }
const rateLimits = new Map();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

function isRateLimited(uid) {
  const now = Date.now();
  const entry = rateLimits.get(uid);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(uid, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT) return true;
  return false;
}

// Periodically clean up stale entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rateLimits) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) {
      rateLimits.delete(uid);
    }
  }
}, 5 * 60 * 1000);

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('log-event auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;

  // Rate limiting
  if (isRateLimited(uid)) {
    return errorResponse('Rate limit exceeded. Try again shortly.', 429, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, request);
  }

  const { event, metadata } = body;

  if (!event || typeof event !== 'string') {
    return errorResponse('Missing or invalid event type', 400, request);
  }

  if (!VALID_EVENTS.has(event)) {
    return errorResponse('Unknown event type: ' + event, 400, request);
  }

  if (metadata && (typeof metadata !== 'object' || Array.isArray(metadata))) {
    return errorResponse('metadata must be a plain object', 400, request);
  }

  // Sanitize metadata: only allow string/number/boolean values, limit size
  const sanitizedMetadata = {};
  if (metadata) {
    const keys = Object.keys(metadata).slice(0, 20); // max 20 fields
    for (const key of keys) {
      const val = metadata[key];
      if (typeof val === 'string') {
        sanitizedMetadata[key] = val.slice(0, 500); // max 500 chars per value
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        sanitizedMetadata[key] = val;
      }
    }
  }

  try {
    const db = getDb();
    await db.collection('events').add({
      uid,
      event,
      metadata: sanitizedMetadata,
      timestamp: FieldValue.serverTimestamp(),
    });

    return jsonResponse({ ok: true }, 200, request);
  } catch (err) {
    console.error('log-event error:', err);
    return errorResponse('Failed to log event', 500, request);
  }
};

export const config = {
  path: '/api/log-event',
};
