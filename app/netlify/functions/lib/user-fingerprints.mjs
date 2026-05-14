// Per-user style fingerprint injection. Reads the nightly-computed
// user_fingerprints/{uid} doc (produced by scheduled-user-fingerprint.mjs)
// and prepends a "USER STYLE" block to body.system at runtime.
//
// This is the personalization layer of the learning loop:
//  - exemplars.mjs        — raw reference rounds (anyone's best work)
//  - distillations.mjs    — extracted PATTERNS by format (anyone's)
//  - user-fingerprints.mjs — THIS user's argumentation tics + tendencies
//
// The fingerprint makes the AI play differently against THIS user than
// against anyone else. That's the "AI that gets sharper from your usage"
// wedge in concrete form — and the reason a power user retains, because
// the AI keeps adapting to how they actually argue.
//
// Cheap: one Firestore read per request, 1hr cache per uid. Skipped
// entirely for anonymous traffic (no uid to look up).

import { getDb } from './firestore.mjs';

// Cache fingerprints 1hr — they only update nightly so an hour stays
// fresh while keeping per-request reads near zero.
const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;

// Feature gate. Same as exemplars + distillations for the generation
// path, PLUS 'judge' — the RFD writer benefits even more from knowing
// the user's pattern history. A ballot that says "you dropped
// counter-warrants again, same as last week" reads as coaching, not
// just judging. Philosophy / casual / Vision stay excluded — those
// aren't the user arguing or being judged.
const FINGERPRINT_FEATURES = new Set([
  'case', 'tightblock', 'opp_attack', 'opponent', 'rebuttal', 'sneaky',
  'judge',
]);

async function getFingerprint(uid) {
  if (!uid) return null;
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  try {
    const db = getDb();
    const doc = await db.collection('user_fingerprints').doc(uid).get();
    if (!doc.exists) {
      cache.set(uid, { data: null, at: Date.now() });
      return null;
    }
    const data = doc.data();
    const text = (data && data.fingerprint) ? String(data.fingerprint).slice(0, 1800) : null;
    cache.set(uid, { data: text, at: Date.now() });
    return text;
  } catch (err) {
    console.warn('[user-fingerprints] read failed:', err.message);
    cache.set(uid, { data: null, at: Date.now() });
    return null;
  }
}

// Caller passes the uid (resolved upstream from the Firebase token).
// We expose this as a separate helper rather than re-verifying inside
// because the brain functions already have the decoded uid in scope.
export async function applyUserFingerprint(body, uid) {
  if (!body || typeof body !== 'object') return;
  if (!uid) return;
  const feature = body._voiceFeature || body._feature || '';
  if (!FINGERPRINT_FEATURES.has(feature)) return;

  try {
    const fingerprint = await getFingerprint(uid);
    if (!fingerprint) return;
    // Block sits BEFORE base system (like exemplars) so the model reads
    // "here's how THIS user argues" up front, then the format-specific
    // rules can reinforce or override on the way down. Format rules
    // still win conflicts because voice-guidelines.mjs appends last.
    //
    // Instruction varies by feature: opponents pressure-test the habits,
    // judges reference recurring patterns by name in the ballot.
    const isJudge = feature === 'judge';
    const instruction = isJudge
      ? [
          'You are judging a round by this debater. When their CURRENT round',
          'demonstrates one of the patterns above (a recurring strength or',
          'weakness), call it out by name in the ballot. Coaching > judging.',
          'Don\'t invent patterns the fingerprint doesn\'t name.',
        ].join('\n')
      : [
          'Use this to pressure-test their habits — push back hardest where',
          'they\'re weakest, don\'t reward moves the fingerprint flags as crutches.',
        ].join('\n');
    const block = [
      '─── USER STYLE (this debater\'s patterns from prior rounds) ───',
      fingerprint,
      instruction,
      '─── END USER STYLE ───',
      '',
    ].join('\n');
    body.system = block + (body.system || '');
  } catch (err) {
    console.warn('[applyUserFingerprint]', err.message);
  }
}

export function _resetFingerprintCache() {
  cache.clear();
}
