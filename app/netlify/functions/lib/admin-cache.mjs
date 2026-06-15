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

import { getDb, FieldValue } from './firestore.mjs';

const store = new Map();

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
  try {
    const snap = await getDb().collection(SHARED_COLL).doc(sharedDocId(key)).get();
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
    return null; // degrade to a miss; the dashboard recomputes
  }
}

// Last-resort read: return the shared value IGNORING expiry. Called only
// on a recompute FAILURE (e.g. the daily read quota is blown, so the
// fresh recompute threw) — serving slightly-stale numbers beats a 500.
// On a low-traffic Spark deploy a single cold recompute is thousands of
// reads, so once the 50K/day quota blows the dashboard would otherwise
// hard-fail every panel until midnight reset. The stale doc read is one
// document, which may still succeed when a thousand-doc recompute can't.
// Returns null if the doc is missing or the read itself also fails.
export async function getCachedSharedStale(key) {
  const entry = store.get(key);
  if (entry) return entry.value; // in-memory copy, expiry ignored
  try {
    const snap = await getDb().collection(SHARED_COLL).doc(sharedDocId(key)).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    if (typeof d.json !== 'string') return null;
    return JSON.parse(d.json);
  } catch {
    return null;
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
  try {
    await getDb().collection(SHARED_COLL).doc(sharedDocId(key)).set({
      json,
      expiresAt: Date.now() + ttlMs,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // Cache write failed (quota / creds). The value is still in the
    // in-memory layer for this instance; just no cross-instance share.
  }
}

// Common TTLs for the dashboard surfaces. Imported by each admin
// endpoint so the cadence is consistent and adjusted in one place.
// TTL_HEAVY widened 5 → 10 min (2026-06-15): with the shared layer a
// longer window means an actively-watched dashboard recomputes at most
// once per 10 min globally instead of per cold start. Still plenty
// fresh for analytics panels.
export const TTL_HEAVY = 10 * 60 * 1000;   // analytics, cohorts, heatmap, power-users
export const TTL_TAIL  = 30 * 1000;        // realtime tail (still fresh-feeling)
