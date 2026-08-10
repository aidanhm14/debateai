import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { CONSENT_POLICY_VERSION, CONSENT_EVENTS, CONSENT_SURFACES } from './lib/consent.mjs';

// Append-only consent ledger.
//
// The consent STATE lives on user_profiles/{uid} (contributeToCorpus,
// corpusAgeAttested, transcriptCapture) and is what log-generation
// re-checks at write time. A boolean answers "is this user opted in
// right now" but not the question a licensing recipient's counsel asks:
// WHEN did each contributor consent, on WHICH surface, under WHICH
// policy text. This endpoint records that: one immutable event per
// grant/withdrawal/decline, written server-side so the timestamp and
// policy version cannot be forged by the client.
//
// Rows are never updated or deleted. A withdrawal is a new event, not
// an edit. The policyVersion is stamped from the server constant, never
// taken from the body.

const rateLimits = new Map();
const RATE_LIMIT = 10; // 10 events/min/uid — a human toggling, not a loop
const RATE_WINDOW_MS = 60_000;

function isRateLimited(uid) {
  const now = Date.now();
  const entry = rateLimits.get(uid);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(uid, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rateLimits) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) rateLimits.delete(uid);
  }
}, 5 * 60 * 1000);

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('log-consent auth error:', err.message);
    return errorResponse('Authentication failed', 401, request);
  }
  const uid = decoded.sub;
  const authProvider = decoded?.firebase?.sign_in_provider || decoded?.sign_in_provider || '';

  if (isRateLimited(uid)) {
    return errorResponse('Rate limit exceeded', 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400, request); }

  const event = typeof body.event === 'string' ? body.event : '';
  if (!CONSENT_EVENTS.has(event)) return errorResponse('Invalid event', 400, request);
  const surface = CONSENT_SURFACES.has(body.surface) ? body.surface : 'other';

  // Corpus licensing events only mean something for named accounts:
  // anonymous rows are excluded from the corpus unconditionally, so an
  // anonymous "opt-in" would be a ledger entry describing nothing.
  const anonymousAuth = authProvider === 'anonymous' || authProvider === 'anonymous_session';
  if (anonymousAuth && event.startsWith('corpus_')) {
    return errorResponse('Corpus consent requires a named account', 401, request);
  }

  try {
    const db = getDb();
    const doc = {
      uid,
      authProvider: String(authProvider).slice(0, 60),
      event,
      surface,
      policyVersion: CONSENT_POLICY_VERSION,
      contribute: typeof body.contribute === 'boolean' ? body.contribute : null,
      ageAttested: typeof body.ageAttested === 'boolean' ? body.ageAttested : null,
      createdAt: FieldValue.serverTimestamp(),
    };
    await db.collection('consent_events').add(doc);

    // Stamp the policy version the user last acted under onto the
    // profile, so the manifest can report version coverage without
    // scanning the ledger.
    if (event === 'corpus_opt_in' || event === 'corpus_opt_out') {
      await db.collection('user_profiles').doc(uid).set({
        corpusPolicyVersion: CONSENT_POLICY_VERSION,
        corpusConsentLedgerAt: FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }

    return jsonResponse({ ok: true, policyVersion: CONSENT_POLICY_VERSION }, 200, request);
  } catch (err) {
    console.error('log-consent error:', err.message);
    return errorResponse('Failed to record consent event', 500, request);
  }
};

export const config = {
  path: '/api/log-consent',
};
