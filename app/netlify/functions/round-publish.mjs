// POST /api/round/publish — auth-required.
//
// Takes a finished round payload and writes a sanitized copy to the
// public_rounds collection under a short URL-safe ID. Returns the
// public URL for the client to surface in the share dialog.
//
// Privacy:
//  - First-name + last-initial only on the byline (server-truncated).
//  - authorUid stored but never rendered in the public page HTML.
//  - Rate-limited per uid so a runaway client can't flood the corpus.
//
// SEO:
//  - Each published round becomes an indexable page at /r/{id}, fed
//    into Google by sitemap-rounds.xml + the inbound share traffic.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { generatePublicId, sanitizePublishPayload } from './lib/public-round.mjs';

// 10 publishes / hour / uid. Bumped if/when we have signal showing
// legitimate users hitting it. This is a soft floor against runaway
// scripts.
const PUBLISH_LIMIT_PER_HOUR = 10;
const rateBuckets = new Map();

function rateLimitOk(uid) {
  if (!uid) return true;
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const entry = (rateBuckets.get(uid) || []).filter(t => t > hourAgo);
  if (entry.length >= PUBLISH_LIMIT_PER_HOUR) {
    rateBuckets.set(uid, entry);
    return false;
  }
  entry.push(now);
  rateBuckets.set(uid, entry);
  return true;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (err) {
    console.error('round-publish auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  if (!rateLimitOk(uid)) {
    return errorResponse('Publish rate limit exceeded. Try again later.', 429, request);
  }

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  // Caller MAY supply a displayName; if absent, use the Firebase
  // displayName off the token. Either path lands in the same sanitizer
  // which enforces first-name + last-initial.
  if (!body.displayName && decoded.name) body.displayName = decoded.name;

  const doc = sanitizePublishPayload(body, uid);
  if (!doc) {
    return errorResponse('Round payload missing required fields (motion + at least one speech).', 400, request);
  }

  const db = getDb();

  // Loop until we generate a non-colliding ID. 8-char base-30 collisions
  // are vanishingly rare but we still guard. Two attempts is plenty.
  let id;
  for (let attempt = 0; attempt < 3; attempt++) {
    id = generatePublicId();
    const existing = await db.collection('public_rounds').doc(id).get();
    if (!existing.exists) break;
    id = null;
  }
  if (!id) {
    return errorResponse('Could not allocate a public ID. Try again.', 500, request);
  }

  try {
    await db.collection('public_rounds').doc(id).set({
      ...doc,
      createdAt: FieldValue.serverTimestamp(),
      publishedAt: FieldValue.serverTimestamp(),
    });
    console.log(`[round-publish] uid=${uid.slice(0,6)} id=${id} motion="${doc.motion.slice(0,40)}"`);
  } catch (err) {
    console.error('round-publish firestore write failed:', err.message);
    return errorResponse('Could not publish round. Try again.', 500, request);
  }

  return jsonResponse({
    ok: true,
    id,
    url: `/r/${id}`,
    fullUrl: `https://debateit.com/r/${id}`,
  }, 200, request);
};

export const config = {
  path: '/api/round/publish',
};
