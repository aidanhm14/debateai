// Authenticated storage for optional political matchmaking preferences.
// The backing collection is server-only. No political answer is written to
// matchmaking_queue, analytics, a round, the judge, or the opponent.

import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, errorResponse, jsonResponse } from './lib/response.mjs';
import {
  cleanSparMatchProfile,
  hasPoliticalSignal,
} from './lib/spar-match-profile.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return errorResponse('Method not allowed', 405, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (err) { return errorResponse('Authentication failed', 401, request); }
  if (!isNamedAccount(decoded)) return errorResponse('Account required', 403, request);

  const uid = String(decoded.sub || '');
  if (!uid) return errorResponse('Invalid token subject', 401, request);
  const ref = getDb().collection('spar_match_profiles').doc(uid);

  if (request.method === 'DELETE') {
    await ref.delete();
    return jsonResponse({ ok: true, stored: false }, 200, request);
  }

  let body;
  try { body = await request.json(); }
  catch (err) { return errorResponse('Invalid JSON body', 400, request); }
  const profile = cleanSparMatchProfile(body && body.profile);

  // An all-skip answer is no political profile at all. Delete an older one
  // so skipping today cannot leave yesterday's views active on the server.
  if (!hasPoliticalSignal(profile)) {
    await ref.delete();
    return jsonResponse({ ok: true, stored: false }, 200, request);
  }

  await ref.set({
    uid,
    version: profile.version,
    matchMode: profile.matchMode,
    stances: profile.stances,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return jsonResponse({ ok: true, stored: true }, 200, request);
};

export const config = { path: '/api/spar-match-profile' };

