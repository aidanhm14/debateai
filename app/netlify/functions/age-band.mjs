import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';

// /api/age-band — the one-time age attestation behind live stranger
// matchmaking (2026-08-22). CHSSA's review named the hole exactly:
// nothing separated a 13-year-old from an unrelated adult in the live
// queue, because nothing anywhere collected age. Every account now
// answers ONCE — 13-17 ('minor') or 18+ ('adult') — and spar-pair.mjs
// only ever forms a pair inside one band.
//
// GET  → { band: 'minor' | 'adult' | null }   (own band only)
// POST { band } → writes it, WRITE-ONCE.
//
// Why its own collection (age_bands/{uid}) rather than a field on
// user_profiles: profiles are owner-writable from the client, and "I am
// an adult" is exactly the field a client must not be able to edit after
// the fact. age_bands has no entry in firestore.rules, so the default
// deny makes it admin-SDK-only; the only door in is this endpoint, and
// this endpoint refuses to overwrite. Changing a band is a support
// request (the safety page says so), not a toggle.
//
// Write-once is also what makes spar-pair's warm-instance band cache
// safe: a value that cannot change cannot go stale.
//
// Anonymous uids MAY attest. Guests cannot reach the queue today
// (GUEST_FREE_ROUNDS=0), but the trial is one env flip from returning,
// and auth-modal links an anonymous uid on sign-in — the uid, and this
// record with it, survives conversion to a named account. Refusing anon
// here would mean re-asking the question at sign-in for no reason.
//
// This is an attestation, not verification. The product does not check
// IDs; what this buys is a deliberate, recorded answer at the door and a
// server that never pairs across the line the answer draws. Same
// evidentiary posture as the tournament 18+ prize attestation.

const AGE_BANDS = new Set(['minor', 'adult']);

// Runaway-loop throttle, same in-memory shape as spar-pair's. This
// endpoint spends no provider money and at most one Firestore read or
// write per call, so per-isolate is proportionate here.
const attempts = new Map();
const THROTTLE_MS = 500;
function throttled(uid) {
  const now = Date.now();
  const last = attempts.get(uid) || 0;
  if (now - last < THROTTLE_MS) return true;
  attempts.set(uid, now);
  if (attempts.size > 5000) attempts.clear();
  return false;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse('Method not allowed', 405, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('[age-band] auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }
  const uid = decoded.sub;
  if (!uid) return errorResponse('Invalid token subject', 401, request);
  if (throttled(uid)) return errorResponse('Too many attempts. Wait a moment.', 429, request);

  const db = getDb();
  const ref = db.collection('age_bands').doc(uid);

  if (request.method === 'GET') {
    try {
      const snap = await ref.get();
      const band = snap.exists ? String(snap.data()?.band || '') : '';
      return jsonResponse({ band: AGE_BANDS.has(band) ? band : null }, 200, request);
    } catch (err) {
      console.warn('[age-band] read failed:', err?.message || err);
      // The client treats an unknown band as "show the card", and a
      // repeat POST of the same value is idempotent, so erroring soft
      // here costs one extra question, never a wrong pairing.
      return jsonResponse({ band: null, error: 'read_failed' }, 200, request);
    }
  }

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const band = String(body?.band || '').trim().toLowerCase();
  if (!AGE_BANDS.has(band)) {
    return errorResponse('band must be "minor" (13-17) or "adult" (18+)', 400, request);
  }

  try {
    // Transaction so two racing POSTs cannot each see "no doc" and both
    // win; the second sees the first's write and gets the lock answer.
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? String(snap.data()?.band || '') : '';
      if (AGE_BANDS.has(existing)) {
        return existing === band
          ? { ok: true, band: existing, already: true }
          : { locked: true, band: existing };
      }
      tx.set(ref, {
        band,
        attestedAt: FieldValue.serverTimestamp(),
        // Which kind of session answered — an anonymous attestation that
        // later links to a named account keeps its uid, so this records
        // where in the funnel the question was actually answered.
        provider: String(decoded.firebase?.sign_in_provider || ''),
      });
      return { ok: true, band };
    });
    if (result.locked) {
      // Not an error to hide: the client should adopt the recorded band
      // and move on. Changing it is a support conversation.
      return jsonResponse({
        error: 'This account already answered the age question.',
        code: 'AGE_BAND_LOCKED',
        band: result.band,
      }, 409, request);
    }
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('[age-band] write failed:', err?.message || err);
    return errorResponse('Could not save. Try again.', 500, request);
  }
};

export const config = { path: '/api/age-band' };
