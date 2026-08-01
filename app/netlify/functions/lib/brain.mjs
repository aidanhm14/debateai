// The debate brain: STORAGE. Reads and writes user_profiles/{uid}.brain
// and turns it into a system-prompt block.
//
// The schema, the validation and the block text live in the PURE half,
// brain-schema.mjs, which imports nothing and is therefore testable
// without the Firestore SDK (same split as judge-charter.mjs). Everything
// there is re-exported from here, so callers only import this module.
//
// WHERE IT LIVES AND WHY IT IS NOT prefs
// prefs-sync.js already mirrors the `da-brain-*` localStorage keys onto
// user_profiles/{uid}.prefs, which is genuinely per-user and survives a
// second device. It is the wrong shape to READ from, for three reasons:
// every value is wrapped in {v,t} for last-write-wins, the push is
// debounced ~1.8s behind the click so a round started right after
// answering can miss it, and it only lands on pages where the Firebase
// SDK actually loaded. So the brain gets its own field on the same
// document, written server-side through the admin SDK on an explicit
// POST. prefs keeps mirroring the same keys and stays the cross-device
// merge for the CLIENT; this field is what the SERVER reads. They can
// disagree for a second or two after an edit, and the newer POST always
// wins, because the POST is the thing the user just did.
//
// ANONYMOUS USERS ARE NOT STORED, deliberately. Firebase anonymous
// accounts are free and unlimited to mint (see the 2026-07-28 rate-limit
// entry), so keying stored documents to one invites junk at no cost to
// the writer. Guests keep their brain in localStorage and it uploads on
// their first named sign-in, which is when the record becomes worth
// keeping. /api/brain enforces that; this module never sees the token.

import { getDb, withDeadline } from './firestore.mjs';
import { sanitizeBrain, renderBrainBlock } from './brain-schema.mjs';

export {
  BRAIN_FIELDS, BRAIN_KEYS, sanitizeBrain, hasBrain, renderBrainBlock,
} from './brain-schema.mjs';

// Per-uid cache. A brain changes when someone opens /brain and answers
// six questions, which is rare, so 10 minutes is generous freshness and
// keeps every turn of one round down to a single read. Bounded, so a
// long-lived instance serving many users cannot grow without limit.
const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

export function invalidateBrain(uid) {
  if (uid) cache.delete(uid);
}

function cachePut(uid, data) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(uid, { data, at: Date.now() });
}

/**
 * Read a user's stored brain. Returns {} for anonymous callers, unknown
 * users, or any failure: prompt enrichment is never worth failing a
 * round over, so every error path degrades to "no brain" rather than
 * throwing into the caller's request.
 */
export async function getBrain(uid) {
  if (!uid) return {};
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  try {
    const db = getDb();
    const doc = await withDeadline(db.collection('user_profiles').doc(uid).get(), 2000);
    const brain = doc.exists ? sanitizeBrain((doc.data() || {}).brain) : {};
    cachePut(uid, brain);
    return brain;
  } catch (err) {
    console.warn('[brain] read failed:', err.message);
    cachePut(uid, {});
    return {};
  }
}

/**
 * Write a user's brain. Merges into the existing profile document so it
 * sits alongside prefs rather than replacing them.
 */
export async function saveBrain(uid, input) {
  const brain = sanitizeBrain(input);
  const db = getDb();
  await db.collection('user_profiles').doc(uid).set(
    { brain: { ...brain, updatedAt: Date.now() } },
    { merge: true },
  );
  invalidateBrain(uid);
  return brain;
}

/**
 * One call for the common case: uid in, block out.
 */
export async function getBrainBlock(uid, feature) {
  if (!uid) return '';
  const brain = await getBrain(uid);
  return renderBrainBlock(brain, feature);
}

/**
 * Brain-function entry point. Same shape and same call site as
 * applyUserFingerprint, so the six proxies gain one line each.
 *
 * The block sits BEFORE base system, next to the fingerprint: the two
 * answer the same question from opposite directions. The fingerprint is
 * what we INFERRED from their rounds; this is what they TOLD us. Stated
 * intent goes first so a fingerprint built from ten old rounds cannot
 * outrank the person changing their mind on /brain this morning.
 */
export async function applyBrain(body, uid) {
  if (!body || typeof body !== 'object') return;
  const feature = body._voiceFeature || body._feature || '';
  const block = await getBrainBlock(uid, feature);
  if (!block) return;
  body.system = block + (body.system || '');
}

export function _resetBrainCache() {
  cache.clear();
}
