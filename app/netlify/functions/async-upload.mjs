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

// Per-IP rate limit. Uploads are authenticated and stay in the caller's own
// namespace, but nothing bounded how many uploadIds one account could mint or
// how many 5MB parts it could write, so a signed-in account (Google or
// anonymous) could exhaust storage. This caps that. Limits are generous for a
// real recording (1 init + up to 8 parts per round) but bite a script
// hammering blob writes.
const upHits = new Map();
const UP_LAYERS = [
  { window: 60_000, max: 60, code: 'RATE_MINUTE' },
  { window: 3_600_000, max: 600, code: 'RATE_HOUR' },
];
function checkUpRate(ip) {
  const now = Date.now();
  const arr = (upHits.get(ip) || []).filter((t) => now - t < 3_600_000);
  for (const layer of UP_LAYERS) {
    if (arr.filter((t) => now - t < layer.window).length >= layer.max) return { ok: false, code: layer.code };
  }
  arr.push(now);
  upHits.set(ip, arr);
  if (upHits.size > 5000) {
    const keep = Array.from(upHits.entries()).slice(-2500);
    upHits.clear();
    for (const [k, v] of keep) upHits.set(k, v);
  }
  return { ok: true };
}

// uploadId suffix must be exactly what newId() produces (18 chars from a fixed
// alphabet) so a caller can't mint arbitrary blob keys inside its namespace.
const ID_SUFFIX = /^[abcdefghjkmnpqrstuvwxyz23456789]{18}$/;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to record a round.', 401, request);
  let uid;
  try { uid = (await verifyIdToken(token)).sub; }
  catch { return errorResponse('Authentication failed. Sign in again.', 401, request); }

  const ip = request.headers.get('x-forwarded-for')
    || request.headers.get('x-nf-client-connection-ip')
    || 'anon';
  const rate = checkUpRate(ip);
  if (!rate.ok) return errorResponse('Too many uploads. Give it a minute.', 429, request);

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
  if (!ID_SUFFIX.test(uploadId.slice(uid.length + 1))) return errorResponse('Bad upload id', 400, request);
  if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_PARTS) return errorResponse('Bad part index', 400, request);

  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length) return errorResponse('Empty part', 400, request);
  if (buf.length > MAX_PART_BYTES) return errorResponse('Part too large', 413, request);

  await store.set(`m/${uploadId}/p${idx}`, buf);
  return jsonResponse({ ok: true, idx, bytes: buf.length }, 200, request);
};

export const config = { path: '/api/async/upload' };
