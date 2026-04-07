import { getDb, FieldValue } from './lib/firestore.mjs';
import { verifyToken } from './lib/auth.mjs';
import { cors, json, error } from './lib/response.mjs';

/**
 * Recursive Learning System — collects anonymized debate insights
 * from user interactions to improve the system over time.
 *
 * Types of insights:
 * - "motion_feedback": User rates a generated motion (good/bad/tight)
 * - "case_feedback": User rates case quality after using it in a round
 * - "argument_pattern": Common argument patterns that win/lose rounds
 * - "judge_pattern": Common judge feedback patterns
 * - "opp_strategy": Opposition strategies that worked against certain case types
 */
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors();
  if (event.httpMethod !== 'POST') return error('Method not allowed', 405);

  try {
    const uid = await verifyToken(event);
    const body = JSON.parse(event.body || '{}');
    const db = getDb();

    const { type, data } = body;
    if (!type || !data) return error('Missing type or data', 400);

    const allowed = ['motion_feedback', 'case_feedback', 'argument_pattern', 'judge_pattern', 'opp_strategy'];
    if (!allowed.includes(type)) return error('Invalid insight type', 400);

    // Store the insight — anonymized (only uid hash, not full uid)
    const uidHash = uid.substring(0, 8); // partial hash for grouping, not identification
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

    return json({ ok: true });
  } catch (e) {
    return error(e.message || 'Server error', 500);
  }
}

// Strip any PII or overly long content
function sanitize(data) {
  const clean = {};
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'string') {
      clean[key] = val.substring(0, 500); // Cap string length
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      clean[key] = val;
    } else if (Array.isArray(val)) {
      clean[key] = val.slice(0, 10).map(v => typeof v === 'string' ? v.substring(0, 200) : v);
    }
  }
  return clean;
}
