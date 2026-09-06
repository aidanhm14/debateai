import { createHash } from 'node:crypto';
import { withDeadline } from './firestore.mjs';
import { getCachedShared, setCachedShared } from './admin-cache.mjs';
import { fetchRatingRows } from './rating-board.mjs';
import { STANDINGS_VERSION } from './standings-version.mjs';

// Both public boards consume one snapshot. Read the cheap revision document
// on each request so a warm Lambda cannot keep serving a pre-result cache.
// Revision-specific keys keep a late old computation out of the new cache.
export async function fetchStandingsSnapshot(db, {
  readRows = fetchRatingRows, readCache = getCachedShared,
  writeCache = setCachedShared, now = Date.now,
} = {}) {
  const marker = await withDeadline(db.collection('admin_cache').doc(STANDINGS_VERSION).get(), 2500);
  const version = marker.exists ? String(marker.data().version || 'initial') : 'initial';
  const revision = createHash('sha256').update(version).digest('hex').slice(0, 24);
  const key = 'standings-v2-' + revision;
  const cached = await readCache(key);
  if (cached && cached.revision === revision && Array.isArray(cached.rows)) return cached;
  const rows = await readRows(db, { limit: 100 });
  const snapshot = { rows, revision, at: now() };
  await writeCache(key, snapshot, 5 * 60 * 1000);
  return snapshot;
}
