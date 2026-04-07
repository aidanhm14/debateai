import { getDb, FieldValue } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

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
