// In-memory cache for the heavy admin-dashboard endpoints. Lives across
// warm Lambda invocations on the same instance — different instances
// have independent caches, but staleness up to ~5 min on a dashboard
// surface is fine and prevents the read amplification that exhausted
// the Firestore quota on 2026-05-19.
//
// Before this lib existed, an open /admin tab with auto-refresh on
// fired ~1M Firestore reads/hour: analytics every 30s × ~5K reads/call
// (80+ parallel count queries) + realtime every 8s × 1200 docs/call.
// Combined with cohorts/heatmap/power-users at 30-50K MAX_DOCS, a
// single idle admin tab would blow the daily quota inside an hour.
//
// With cache (5 min on analytics/cohorts/heatmap/power-users, 30s on
// realtime) + slower client poll + reduced MAX_DOCS, that drops to
// ~5K reads/hour — three orders of magnitude lower.

const store = new Map();

export function getCached(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(key, value, ttlMs) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  // Defensive memory cap; in practice we expect ~10-20 keys
  // (one per endpoint × query-param variant).
  if (store.size > 50) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

// Common TTLs for the dashboard surfaces. Imported by each admin
// endpoint so the cadence is consistent and adjusted in one place.
export const TTL_HEAVY = 5 * 60 * 1000;   // analytics, cohorts, heatmap, power-users
export const TTL_TAIL  = 30 * 1000;        // realtime tail (still fresh-feeling)
