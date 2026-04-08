import { getDb, FieldValue } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// In-memory rate limiter (resets on cold start — a persistent store would be better)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // max requests per minute per user

function checkRateLimit(userId) {
  const now = Date.now();
  const key = userId || 'anon';
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

/**
 * Recursive Learning System — collects anonymized debate insights
 * from user interactions to improve the system over time.
 */
export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  try {
    const token = extractBearerToken(request);
    if (!token) return errorResponse('Authorization required', 401, request);
    const decoded = await verifyIdToken(token);
    const uid = decoded.sub;

    if (!checkRateLimit(uid)) {
      return errorResponse('Too many requests. Please wait a moment and try again.', 429, request);
    }

    const body = await request.json();
    const db = getDb();

    const { type, data } = body;
    if (!type || !data) return errorResponse('Missing type or data', 400, request);

    const allowed = ['motion_feedback', 'case_feedback', 'argument_pattern', 'judge_pattern', 'opp_strategy'];
    if (!allowed.includes(type)) return errorResponse('Invalid insight type', 400, request);

    // Store the insight — anonymized (only uid hash, not full uid)
    const uidHash = uid.substring(0, 8);
    await db.collection('learning_insights').add({
      type,
      data: sanitize(data),
      uidHash,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Aggregate counters for quick access
    const counterRef = db.collection('learning_counters').doc(type);
    await counterRef.set({
      count: FieldValue.increment(1),
      lastUpdated: FieldValue.serverTimestamp(),
    }, { merge: true });

    return jsonResponse({ ok: true }, 200, request);
  } catch (e) {
    return errorResponse('Server error', 500, request);
  }
};

// Strip any PII or overly long content
function sanitize(data) {
  const clean = {};
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'string') {
      clean[key] = val.substring(0, 500);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      clean[key] = val;
    } else if (Array.isArray(val)) {
      clean[key] = val.slice(0, 10).map(v => typeof v === 'string' ? v.substring(0, 200) : v);
    }
  }
  return clean;
}

export const config = { path: '/api/insights' };
