// Cache for the heavy admin-dashboard + public-aggregate endpoints.
//
// TWO layers:
//   1. In-memory (getCached / setCached) — per-Lambda-instance. Free,
//      but lives only on ONE warm instance.
//   2. Shared (getCachedShared / setCachedShared) — Firestore-backed
//      (admin_cache/{key}), survives cold starts and is visible across
//      every instance.
//
// Why the shared layer exists (2026-06-15 read-quota blowout):
// On a low-traffic deploy the keep-alive cron is gone, so consecutive
// /admin polls almost always land on DIFFERENT cold instances. The
// in-memory cache then NEVER hits, and every poll re-runs the
// multi-thousand-doc event scan behind it. A single /admin open fanned
// out to ~7 of these endpoints, each scanning up to MAX_DOCS, = ~34K
// Firestore reads in one click = 68% of the Spark free daily read
// budget. Once the 50K/day read quota blows, EVERY Firestore read
// returns 429 — including the public proof-strip count() queries, which
// then degrade to 0 (the "viewsWeek / liveSearchesWeek = 0" symptom).
//
// The shared layer makes the expensive recompute happen at most ONCE
// per TTL across ALL instances: a cache hit costs 1 document read
// instead of thousands. Any Firestore error in the cache path degrades
// to a miss (the caller just recomputes) — the dashboard never breaks,
// worst case it is as costly as before.
//
// History: an earlier in-memory-only version (2026-05-19) already cut
// an auto-refreshing /admin tab from ~1M reads/hour to ~5K/hour when it
// hit a warm instance — but cold starts defeated it, which is what this
// shared layer fixes.

import { getDb, FieldValue, withDeadline } from './firestore.mjs';

const store = new Map();

// Circuit breaker: after a failed/slow shared-cache op, skip Firestore
// for 60s on this instance (serve in-memory only). Keeps pollers fast
// during a quota outage instead of re-paying the deadline every call.
let sharedDownUntil = 0;
const SHARED_BREAKER_MS = 60_000;

// ── Layer 1: in-memory (per-instance) ──────────────────────────────
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

// ── Layer 2: shared (Firestore-backed, cold-start-surviving) ────────
const SHARED_COLL = 'admin_cache';
// Firestore doc ids can't contain '/', and our keys carry ':' (e.g.
// 'power-users:30:10'). Normalize to a safe id; the raw key collides
// only if two keys differ ONLY by a non-[A-Za-z0-9_.-] char, which
// none of ours do.
function sharedDocId(key) {
  return String(key).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 1400) || '_';
}
// Firestore doc hard limit is ~1 MiB; skip the shared write for any
// payload that serializes larger (keep it in the in-memory layer only).
const MAX_SHARED_BYTES = 900_000;

// Read-through: in-memory first (free), then the shared Firestore doc.
// Returns null on miss OR on any error → caller recomputes.
export async function getCachedShared(key) {
  const local = getCached(key);
  if (local !== null) return local;
  if (Date.now() < sharedDownUntil) return null;
  try {
    const snap = await withDeadline(getDb().collection(SHARED_COLL).doc(sharedDocId(key)).get());
    if (!snap.exists) return null;
    const d = snap.data() || {};
    if (typeof d.expiresAt !== 'number' || Date.now() > d.expiresAt) return null;
    if (typeof d.json !== 'string') return null;
    const value = JSON.parse(d.json);
    // Backfill the in-memory layer so subsequent warm hits on this
    // instance skip the Firestore read entirely.
    store.set(key, { value, expires: d.expiresAt });
    return value;
  } catch {
    sharedDownUntil = Date.now() + SHARED_BREAKER_MS;
    return null; // degrade to a miss; the dashboard recomputes
  }
}

// Write-through: in-memory + the shared Firestore doc. The value is
// stored as a JSON string to sidestep every Firestore nested-field /
// undefined-value quirk. Awaited so the cache write completes before
// the function returns (un-awaited async work can be killed on return).
export async function setCachedShared(key, value, ttlMs) {
  setCached(key, value, ttlMs);
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    return; // non-serializable; in-memory layer still holds it
  }
  if (json.length > MAX_SHARED_BYTES) return;
  if (Date.now() < sharedDownUntil) return;
  try {
    await withDeadline(getDb().collection(SHARED_COLL).doc(sharedDocId(key)).set({
      json,
      expiresAt: Date.now() + ttlMs,
      updatedAt: FieldValue.serverTimestamp(),
    }));
  } catch {
    sharedDownUntil = Date.now() + SHARED_BREAKER_MS;
    // Cache write failed (quota / creds). The value is still in the
    // in-memory layer for this instance; just no cross-instance share.
  }
}

// Explicit invalidation for endpoints with a cheap read cache but
// user-visible write freshness requirements. Best effort: callers should
// never fail a product action because deleting a cache doc failed.
export async function deleteCachedShared(key) {
  store.delete(key);
  try {
    await getDb().collection(SHARED_COLL).doc(sharedDocId(key)).delete();
  } catch {
    // Cache delete failed (quota / creds). The cached doc still expires on
    // its normal TTL, so the caller can safely continue.
  }
}

// Last-known-good read that IGNORES expiry. Used by the dashboard
// endpoints to serve the previous payload when a fresh recompute throws
// (e.g. Firestore RESOURCE_EXHAUSTED during a daily-quota blowout) so the
// panel degrades to slightly-stale data instead of a hard 500. Returns
// { value, ageMs } or null; never throws. The in-memory layer is checked
// first (free, can survive even when fresh Firestore reads are quota-
// blocked on a warm instance); the shared doc is a best-effort fallback.
export async function getStaleShared(key) {
  const local = store.get(key);
  if (local && local.value !== undefined) {
    return { value: local.value, ageMs: Math.max(0, Date.now() - (local.expires - TTL_HEAVY)) };
  }
  try {
    const snap = await getDb().collection(SHARED_COLL).doc(sharedDocId(key)).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    if (typeof d.json !== 'string') return null;
    const value = JSON.parse(d.json);
    const ageMs = typeof d.expiresAt === 'number' ? Math.max(0, Date.now() - (d.expiresAt - TTL_HEAVY)) : 0;
    return { value, ageMs };
  } catch {
    return null;
  }
}

// Force a recompute past a live cache entry: /api/admin/x?fresh=1.
//
// This is what makes a long TTL_HEAVY safe. Without it, raising the TTL
// would mean the only way to see current numbers is to wait it out. The
// dashboard's Refresh button sends this, so the default path is cheap
// and the expensive path is the one you explicitly ask for.
//
// Read-only endpoints only. Never wire this into a write path — it is an
// unauthenticated-shaped query param, and the admin gate is what protects
// these endpoints, not this flag.
export function wantsFresh(request) {
  try {
    const v = new URL(request.url).searchParams.get('fresh');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

// Common TTLs for the dashboard surfaces. Imported by each admin
// endpoint so the cadence is consistent and adjusted in one place.
// 2026-06-27: TTL_HEAVY 10 → 20 min and TTL_TAIL 30 → 90s after another
// read-quota blowout — fewer cold recomputes of the multi-thousand-doc
// event scans.
//
// 2026-07-22: TTL_HEAVY 20 min → 4 h, after measuring where the reads
// actually go. One cold /admin open fans out to ~7 panels scanning
// 600-4,000 event docs each = ~12,600 reads per open. At a 20 min TTL
// every separate sitting paid that again, so four visits in a day was
// ~50K reads — the entire free-tier daily allowance — while real user
// traffic ran at 100-500 reads/hour. The dashboard was the dominant
// cost of running the product, by an order of magnitude.
//
// These panels are 60-90 day trend windows; they do not meaningfully
// move in 20 minutes, so the short TTL bought nothing. Paired with
// wantsFresh() above, the Refresh button now genuinely recomputes
// (before this it re-fetched and got handed the same cached payload),
// so nothing is actually less fresh than it was — you just choose when
// to pay for it.
export const TTL_HEAVY = 4 * 60 * 60 * 1000;  // analytics, cohorts, heatmap, power-users
export const TTL_TAIL  = 90 * 1000;           // realtime tail (still fresh-feeling)
