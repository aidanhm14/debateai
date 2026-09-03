/* welcome-email.mjs  ·  POST /api/welcome-email
 *
 * The client calls this the moment a sign-up completes (auth-modal.js
 * finishSignIn, keepalive fetch, so the navigation that follows does not
 * cancel it). It can only ever mail the CALLER, once: the recipient is the
 * verified token's own account, eligibility is decided from Auth's own
 * record of when that account was created, and the stamp lives on the
 * profile doc. So the worst a hostile caller can do is send themselves
 * their own welcome, which they were getting anyway.
 *
 * No App Check: the ID token is the identity and there is nothing to
 * drain. scheduled-welcome-sweep.mjs is the backstop for every sign-in
 * that never reaches this endpoint. See lib/welcome-email.mjs.
 */

import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';
import { getAuthUserByUid } from './lib/auth-admin.mjs';
import { sendWelcomeTo, welcomeEligibility } from './lib/welcome-email.mjs';

const LAYERS_UID = [{ window: 60 * 60_000, max: 6, label: 'uid-hour' }];
const LAYERS_IP = [
  { window: 10 * 60_000, max: 20, label: 'ip-10m' },
  { window: 24 * 60 * 60_000, max: 120, label: 'ip-day' },
];

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (err) { return errorResponse('Authentication failed', 401, request); }
  if (!isNamedAccount(decoded)) return jsonResponse({ sent: false, reason: 'anonymous' }, 200, request);

  const uid = decoded.sub || decoded.uid;
  const ipGate = await checkLayers('welcome', 'ip_' + callerIp(request), LAYERS_IP);
  if (!ipGate.ok) return jsonResponse({ sent: false, reason: 'rate_limited' }, 429, request);
  const uidGate = await checkLayers('welcome', 'uid_' + uid, LAYERS_UID);
  if (!uidGate.ok) return jsonResponse({ sent: false, reason: 'rate_limited' }, 429, request);

  // Auth's own record, never the token's claims: creationTime is what
  // decides eligibility and the token does not carry it.
  let user;
  try { user = await getAuthUserByUid(uid); }
  catch (err) {
    console.error('[welcome-email] accounts:lookup failed:', err.message);
    return jsonResponse({ sent: false, reason: 'lookup_failed' }, 502, request);
  }
  if (!user) return jsonResponse({ sent: false, reason: 'no_user' }, 200, request);

  const pre = welcomeEligibility(user, null);
  if (!pre.ok) return jsonResponse({ sent: false, reason: pre.reason }, 200, request);

  const result = await sendWelcomeTo(getDb(), user, { source: 'client' });
  return jsonResponse(result, 200, request);
};

export const config = { path: '/api/welcome-email' };
