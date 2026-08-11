// Live-discourse injection. The language half of the X pulse.
//
// scheduled-x-pulse.mjs harvests fault lines from X; an admin approves
// them on /admin; approved ones get folded into topic_pulse/current.
// This module reads that doc and, when the motion in play matches a live
// fault line, appends a LIVE DISCOURSE block to the system prompt.
//
// Why this matters separately from the motions themselves: an LLM
// arguing "should AI be regulated" reaches for the framing that was
// dominant in its training data. It says "stifling innovation" and
// "guardrails" because that is how the argument sounded a few years ago.
// The actual argument has moved, acquired new terms, and shifted to new
// examples. A debater who practises against stale framing walks into a
// round prepared for an argument nobody is making.
//
// This file is the I/O half only: read the doc, cache it, hand it to the
// pure matcher. Every decision worth getting right (which features may
// see the block, how strong a match must be, what the block says) lives
// in discourse-match.mjs and is covered by scripts/test-discourse.mjs.
//
// Read cost: one Firestore read per instance per hour, then pure local
// matching. Same shape as distillations.mjs.

import { getDb } from './firestore.mjs';
import { buildDiscourseBlock } from './discourse-match.mjs';

const cache = { data: null, at: 0 };
const CACHE_MS = 60 * 60 * 1000;

// Same fast-fail as distillations: prompt enrichment is never worth
// stalling a user's round when Firestore is degraded.
const withDeadline = (p, ms) => Promise.race([
  p,
  new Promise((_, reject) => setTimeout(() => reject(new Error('firestore-deadline')), ms)),
]);

async function getPulse() {
  if (cache.data !== null && Date.now() - cache.at < CACHE_MS) return cache.data;

  try {
    const db = getDb();
    const doc = await withDeadline(db.collection('topic_pulse').doc('current').get(), 2000);
    const data = doc.exists ? (doc.data() || {}) : {};
    cache.data = Array.isArray(data.faultLines) ? data.faultLines : [];
    cache.at = Date.now();
    return cache.data;
  } catch (err) {
    console.warn('[discourse] read failed:', err.message);
    // Cache the empty result too. A Firestore outage should cost one slow
    // request per hour, not one per call.
    cache.data = [];
    cache.at = Date.now();
    return cache.data;
  }
}

/**
 * Block for a (motion, feature), or '' when nothing matches.
 * Used by the split-path caller (claude.mjs) that assembles body.system
 * explicitly. Per-motion, so it belongs in the UNCACHED tail alongside
 * exemplars, never in the shared cacheable prefix.
 */
export async function getDiscourseBlock({ motion, feature } = {}) {
  if (!motion || !feature) return '';
  try {
    const faultLines = await getPulse();
    if (!faultLines.length) return '';
    return buildDiscourseBlock({ motion, feature, faultLines });
  } catch (err) {
    console.warn('[getDiscourseBlock]', err.message);
    return '';
  }
}

/**
 * @param {object} body
 * @param {string} [motionOverride] REQUIRED when called inside the same
 *   Promise.all as applyExemplars. applyExemplars deletes body._motion
 *   SYNCHRONOUSLY, before its first await, so by the time this function
 *   is invoked as the next argument in that array the field is already
 *   gone and this would silently no-op forever. Callers capture
 *   body._motion before the Promise.all and pass it here.
 */
export async function applyDiscourse(body, motionOverride) {
  if (!body || typeof body !== 'object') return;
  const feature = body._voiceFeature || body._feature || '';
  const motion = motionOverride || body._motion || '';
  const block = await getDiscourseBlock({ motion, feature });
  if (!block) return;
  // Appended after exemplars and distillations, before voice guidelines
  // run. Voice rules are applied last by design and still win conflicts.
  body.system = (body.system || '') + block;
}

export function _resetDiscourseCache() {
  cache.data = null;
  cache.at = 0;
}
