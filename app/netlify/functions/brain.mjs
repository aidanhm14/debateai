// /api/brain — the signed-in user's debate brain.
//
//   GET  → { brain: {...}, stored: bool }
//   POST → { brain: {...}, stored: true }     body: { brain: {...} }
//
// AUTH IS REQUIRED AND MUST BE A NAMED ACCOUNT. This app uses Firebase
// anonymous auth for guests, so "has a valid token" is not the same as
// "is a person with an account": anonymous accounts are free and
// unlimited to mint, and keying stored documents to one is an open
// invitation to fill the collection at no cost to the writer. Guests
// keep their brain in localStorage and it uploads on their first real
// sign-in. Same named-account gate realtime-session.mjs had to add on
// 2026-07-28 for exactly this reason.
//
// Writes go through the ADMIN SDK, so this needs no Firestore rules
// change: the client never writes user_profiles.brain directly.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getBrain, saveBrain, sanitizeBrain } from './lib/brain.mjs';

// Mirrors isNamedAccount() in firestore.rules. A missing claim fails
// CLOSED (treated as anonymous) rather than open.
function isNamed(payload) {
  const p = payload && payload.firebase && payload.firebase.sign_in_provider;
  return !!p && p !== 'anonymous';
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse('Method not allowed', 405, request);
  }

  let payload;
  try {
    payload = await verifyIdToken(extractBearerToken(request));
  } catch (err) {
    return errorResponse('Sign in to save your debate brain', 401, request);
  }
  if (!isNamed(payload)) {
    return errorResponse('Create an account to save your debate brain', 403, request);
  }
  const uid = payload.sub;

  if (request.method === 'GET') {
    const brain = await getBrain(uid);
    return jsonResponse({ brain, stored: Object.keys(brain).length > 0 }, 200, request);
  }

  let body;
  try { body = await request.json(); }
  catch (e) { return errorResponse('Invalid JSON body', 400, request); }

  // Sanitise before deciding it is empty, so a body of nothing but
  // unrecognised ids is rejected as empty rather than stored as {}.
  const clean = sanitizeBrain(body && body.brain);
  if (!Object.keys(clean).length) {
    return errorResponse('No recognised brain fields in that body', 400, request);
  }

  try {
    const brain = await saveBrain(uid, clean);
    return jsonResponse({ brain, stored: true }, 200, request);
  } catch (err) {
    console.warn('[brain] write failed:', err.message);
    return errorResponse('Could not save right now', 503, request);
  }
};

export const config = { path: '/api/brain' };
