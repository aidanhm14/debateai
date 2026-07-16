// Server-side distillation injection. Reads the nightly-computed
// learning_distillations/{format} doc (produced by scheduled-distill.mjs)
// and appends a "PATTERNS THAT WORK" block to body.system at runtime.
//
// Distillations are the compounding half of the learning loop:
//  - exemplars.mjs gives the model raw reference rounds (whole speeches)
//  - this gives it the EXTRACTED PATTERNS that made those rounds land
//
// Both run on the same brain functions. Distillation is cheap (one read
// per format with 1hr cache) so it's safe to enable broadly.

import { getDb } from './firestore.mjs';

// Cache distillations 1hr — they change nightly, so an hour is plenty
// fresh while keeping per-request reads near zero.
const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;

// Fast-fail: with Firestore quota blown/down, the SDK retries ~10s before
// throwing. A prompt-enrichment read is never worth stalling the request;
// on deadline the catch below caches null so the instance stays fast.
const withDeadline = (p, ms) => Promise.race([
  p,
  new Promise((_, reject) => setTimeout(() => reject(new Error('firestore-deadline')), ms)),
]);

// Same feature set as exemplars — only debate-generation features get
// "PATTERNS THAT WORK" injected. Judge/philosophy/casual don't.
const DISTILL_FEATURES = new Set([
  'case', 'tightblock', 'opp_attack', 'opponent', 'rebuttal', 'sneaky',
]);

async function getDistillation(format) {
  if (!format) return null;
  const hit = cache.get(format);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  try {
    const db = getDb();
    const doc = await withDeadline(db.collection('learning_distillations').doc(format).get(), 2000);
    if (!doc.exists) {
      cache.set(format, { data: null, at: Date.now() });
      return null;
    }
    const data = doc.data();
    const text = (data && data.distillation) ? String(data.distillation).slice(0, 4000) : null;
    cache.set(format, { data: text, at: Date.now() });
    return text;
  } catch (err) {
    console.warn('[distillations] read failed:', err.message);
    cache.set(format, { data: null, at: Date.now() });
    return null;
  }
}

// Returns the formatted LEARNED PATTERNS block for a (format, feature), or
// '' when none applies. Shared per format, changes nightly — a perfect
// member of the cacheable prefix. Used by the split-path caller (claude.mjs)
// that assembles body.system explicitly rather than via applyDistillations.
export async function getDistillationBlock(format, feature) {
  if (!DISTILL_FEATURES.has(feature)) return '';
  if (!format) return '';
  try {
    const distillation = await getDistillation(format);
    if (!distillation) return '';
    return [
      '',
      '─── LEARNED PATTERNS (from top-rated rounds on this format) ───',
      distillation,
      '─── END LEARNED PATTERNS ───',
      '',
    ].join('\n');
  } catch (err) {
    console.warn('[getDistillationBlock]', err.message);
    return '';
  }
}

export async function applyDistillations(body) {
  if (!body || typeof body !== 'object') return;
  const feature = body._voiceFeature || body._feature || '';
  const format = body._voiceFormat || '';
  const block = await getDistillationBlock(format, feature);
  if (!block) return;
  // Append AFTER exemplars (which prepended). Order: exemplars +
  // base system + voice guidelines + distillation. Voice rules come
  // before patterns because format-specific rules must win conflicts.
  body.system = (body.system || '') + block;
}

export function _resetDistillationCache() {
  cache.clear();
}
