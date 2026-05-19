// Per-user style fingerprint update — the "edit your style profile" surface.
//
// Companion to user-style-summary.mjs (read) — this endpoint lets the
// signed-in user override their auto-generated fingerprint with their
// own wording. Writes user_fingerprints/{uid} with userEdited:true so
// the nightly Haiku pass (scheduled-user-fingerprint.mjs) leaves it
// alone instead of overwriting their edits.
//
// Why this exists: the learning loop has been wired since 2026-05-13
// but invisible to users. The /profile style-profile card surfaces
// the fingerprint and lets users tune it; if they think the AI
// misread one of their habits, they can rewrite that line and the
// brains pick it up on the next round. Turns "AI learns your style"
// from a claim into a product moment.
//
// Cost: one Firestore set per user-initiated edit. No LLM call.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { _resetFingerprintCache } from './lib/user-fingerprints.mjs';

const MAX_FINGERPRINT_CHARS = 2000;
const MIN_FINGERPRINT_CHARS = 30;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch { return errorResponse('Authentication failed.', 401, request); }

  const uid = decoded.sub;

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body.', 400, request); }

  // Two modes:
  //   - { fingerprint: "..." }     → save edit (sets userEdited:true)
  //   - { reset: true }            → drop userEdited so nightly regenerates
  if (body && body.reset === true) {
    try {
      const db = getDb();
      await db.collection('user_fingerprints').doc(uid).set({
        userEdited: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      _resetFingerprintCache();
      return jsonResponse({ ok: true, reset: true }, 200, request);
    } catch (err) {
      console.error('user-style-update reset failed:', err.message);
      return errorResponse('Could not reset style profile.', 500, request);
    }
  }

  const text = typeof body?.fingerprint === 'string' ? body.fingerprint.trim() : '';
  if (text.length < MIN_FINGERPRINT_CHARS) {
    return errorResponse(`Style profile must be at least ${MIN_FINGERPRINT_CHARS} characters.`, 400, request);
  }
  if (text.length > MAX_FINGERPRINT_CHARS) {
    return errorResponse(`Style profile must be ${MAX_FINGERPRINT_CHARS} characters or fewer.`, 400, request);
  }

  try {
    const db = getDb();
    await db.collection('user_fingerprints').doc(uid).set({
      fingerprint: text,
      userEdited: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    // Clear the in-process cache so the next brain call this user makes
    // picks up the new fingerprint immediately rather than the 1hr-cached
    // previous value.
    _resetFingerprintCache();
    return jsonResponse({ ok: true, savedChars: text.length }, 200, request);
  } catch (err) {
    console.error('user-style-update write failed:', err.message);
    return errorResponse('Could not save style profile.', 500, request);
  }
};

export const config = {
  path: '/api/user/style-update',
};
