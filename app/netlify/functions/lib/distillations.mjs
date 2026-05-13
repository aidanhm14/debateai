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
    const doc = await db.collection('learning_distillations').doc(format).get();
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

export async function applyDistillations(body) {
  if (!body || typeof body !== 'object') return;
  const feature = body._voiceFeature || body._feature || '';
  if (!DISTILL_FEATURES.has(feature)) return;
  const format = body._voiceFormat || '';
  if (!format) return;

  try {
    const distillation = await getDistillation(format);
    if (!distillation) return;
    const block = [
      '',
      '─── LEARNED PATTERNS (from top-rated rounds on this format) ───',
      distillation,
      '─── END LEARNED PATTERNS ───',
      '',
    ].join('\n');
    // Append AFTER exemplars (which prepended). Order: exemplars +
    // base system + voice guidelines + distillation. Voice rules come
    // before patterns because format-specific rules must win conflicts.
    body.system = (body.system || '') + block;
  } catch (err) {
    console.warn('[applyDistillations]', err.message);
  }
}

export function _resetDistillationCache() {
  cache.clear();
}
