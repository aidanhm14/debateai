// /api/async/upload — chunked media upload for async rounds.
//
// Two calls, both POST, both auth-required:
//   1. init:  JSON { mime, kind, bytes } with header x-async-init: 1
//      → { uploadId }. uploadId embeds the uid so parts and finalize can
//      verify ownership with a string check instead of a blob read.
//   2. parts: raw binary body, headers x-upload-id + x-part-index.
//      ≤5MB per part, ≤8 parts. The turn endpoint validates totals and
//      writes the meta blob at finalize; nothing here touches Firestore.
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { mediaStore, newId, normMime, ALLOWED_MIME, MAX_PART_BYTES, MAX_PARTS } from './lib/async-rounds.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to record a round.', 401, request);
  let uid;
  try { uid = (await verifyIdToken(token)).sub; }
  catch { return errorResponse('Authentication failed. Sign in again.', 401, request); }

  const store = mediaStore();

  if (request.headers.get('x-async-init')) {
    let body;
    try { body = await request.json(); } catch { return errorResponse('Invalid init body', 400, request); }
    const mime = normMime(body.mime);
    if (!ALLOWED_MIME.has(mime)) return errorResponse('Unsupported recording format: ' + mime, 400, request);
    // uid is embedded; a colon cannot appear in a Firebase uid.
    const uploadId = uid + ':' + newId();
    return jsonResponse({ uploadId, maxPartBytes: MAX_PART_BYTES, maxParts: MAX_PARTS }, 200, request);
  }

  const uploadId = String(request.headers.get('x-upload-id') || '');
  const idx = parseInt(request.headers.get('x-part-index') || '', 10);
  if (!uploadId.startsWith(uid + ':')) return errorResponse('Upload does not belong to this account.', 403, request);
  if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_PARTS) return errorResponse('Bad part index', 400, request);

  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length) return errorResponse('Empty part', 400, request);
  if (buf.length > MAX_PART_BYTES) return errorResponse('Part too large', 413, request);

  await store.set(`m/${uploadId}/p${idx}`, buf);
  return jsonResponse({ ok: true, idx, bytes: buf.length }, 200, request);
};

export const config = { path: '/api/async/upload' };
