// /api/presence-ping → POST. Records that a user/visitor is alive
// "right now" by upserting a single doc in the `presence` collection
// with serverTimestamp. The companion /api/online-count counts docs
// whose lastPing was within the last 5 minutes.
//
// Key strategy:
//   - Signed-in users (Firebase ID token in the Authorization header)
//     are keyed by their Firebase uid. One presence doc per uid, idempotent.
//   - Anonymous visitors are keyed by `pid` — a random short id the
//     client generates once per page-load and stores in sessionStorage.
//     The pid is a stable string for the duration of a tab; closing
//     the tab kills the heartbeat, so the doc TTLs out of the 5-min
//     window naturally.
//
// Body shape (all fields optional):
//   { pid?: string, fmt?: string }
//
// Returns: { ok: true, key: "<uid|pid>", at: <ms> }
//
// Cost: one Firestore write per heartbeat. Client heartbeats every
// 60s while the tab is visible, so a 5-minute active session = ~5
// writes. The collection auto-prunes by being TTL-indexed (set in
// the Firestore console — TTL field: lastPing, retention: 1 hour;
// or, with the TTL feature disabled, the count query just ignores
// stale docs).

import { getDb, FieldValue } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Tighten payload sanitation. The presence collection should never
// hold long strings, user-controlled keys, or anything PII.
const PID_RE = /^[A-Za-z0-9_-]{6,32}$/;
const FMT_RE = /^[a-z_]{2,20}$/;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let body = {};
  try { body = await request.json(); } catch (_) { /* allow empty body */ }

  // Try to identify the caller. Signed-in users beat anonymous.
  let key = null;
  let signedIn = false;
  try {
    const token = extractBearerToken(request);
    if (token) {
      const decoded = await verifyIdToken(token);
      if (decoded && decoded.uid) {
        key = 'u:' + decoded.uid;
        signedIn = true;
      }
    }
  } catch (_) { /* fall through to anon */ }

  if (!key) {
    const pid = typeof body.pid === 'string' ? body.pid : '';
    if (PID_RE.test(pid)) key = 'a:' + pid;
  }

  if (!key) return errorResponse('No identity', 400, request);

  const fmt = typeof body.fmt === 'string' && FMT_RE.test(body.fmt) ? body.fmt : null;

  let db;
  try { db = getDb(); }
  catch (err) {
    return jsonResponse({ ok: false, error: 'db unavailable' }, 200, request);
  }

  try {
    const payload = {
      lastPing: FieldValue.serverTimestamp(),
      signedIn,
    };
    if (fmt) payload.fmt = fmt;
    await db.collection('presence').doc(key).set(payload, { merge: true });
    return jsonResponse({ ok: true, key, at: Date.now() }, 200, request);
  } catch (err) {
    console.warn('[presence-ping] write failed', err && err.message);
    return jsonResponse({ ok: false, error: 'write failed' }, 200, request);
  }
};
