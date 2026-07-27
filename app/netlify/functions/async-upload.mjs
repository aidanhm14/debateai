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

// Per-uid caps, layered on top of the per-IP limiter above. The per-IP cap
// catches many accounts behind one IP; these catch one account behind many
// IPs — anonymous Firebase auth is free to mint and IPs are cheap to rotate,
// so a per-IP cap alone does not bound a single determined account, which is
// exactly the storage/cost vector here. Two controls:
//   - a per-uid request-rate layer (covers init + part hammering), and
//   - a rolling aggregate-BYTES budget on the part path, the piece the
//     request-rate caps structurally miss (a 1-byte part and a 5MB part cost
//     a request limiter the same).
// In-memory, so per-instance: an attacker riding cold starts or parallel
// instances gets a multiple of these numbers. That is an acceptable bound for
// a low-severity cost issue; a hard cap would need a durable counter, and this
// function is deliberately Firestore-free (async-turn.mjs owns the finalize).
const uidUse = new Map(); // uid -> { reqs: number[], bytes: [ts, n][] }
const UID_REQ_LAYERS = [
  { window: 60_000, max: 40, code: 'RATE_UID_MINUTE' },
  { window: 3_600_000, max: 400, code: 'RATE_UID_HOUR' },
];
// One full upload is MAX_PARTS x MAX_PART_BYTES (40MB). Allowing ~24 of those
// an hour sits far past any real recording session yet turns an unbounded
// write into a finite ceiling.
const UID_BYTES_WINDOW = 3_600_000;
const UID_BYTES_MAX = 24 * MAX_PARTS * MAX_PART_BYTES;

function uidBucket(uid) {
  let u = uidUse.get(uid);
  if (!u) {
    if (uidUse.size > 5000) {
      const keep = Array.from(uidUse.entries()).slice(-2500);
      uidUse.clear();
      for (const [k, v] of keep) uidUse.set(k, v);
    }
    u = { reqs: [], bytes: [] };
    uidUse.set(uid, u);
  }
  return u;
}
// Every call (init or part) counts against the per-uid request rate.
function checkUidReq(uid) {
  const now = Date.now();
  const u = uidBucket(uid);
  u.reqs = u.reqs.filter((t) => now - t < 3_600_000);
  for (const layer of UID_REQ_LAYERS) {
    if (u.reqs.filter((t) => now - t < layer.window).length >= layer.max) return { ok: false, code: layer.code };
  }
  u.reqs.push(now);
  return { ok: true };
}
// Part writes additionally count against the rolling aggregate-byte budget.
// Only records on pass, so a rejected part does not spend the budget.
function checkUidBytes(uid, n) {
  const now = Date.now();
  const u = uidBucket(uid);
  u.bytes = u.bytes.filter((e) => now - e[0] < UID_BYTES_WINDOW);
  const spent = u.bytes.reduce((s, e) => s + e[1], 0);
  if (spent + n > UID_BYTES_MAX) return { ok: false, code: 'QUOTA_BYTES' };
  u.bytes.push([now, n]);
  return { ok: true };
}

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

  const uidRate = checkUidReq(uid);
  if (!uidRate.ok) return errorResponse('Too many uploads on this account. Give it a minute.', 429, request);

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

  // Aggregate storage ceiling per account, checked before the write lands.
  const byteRate = checkUidBytes(uid, buf.length);
  if (!byteRate.ok) return errorResponse('Upload limit reached for this account. Try again later.', 429, request);

  await store.set(`m/${uploadId}/p${idx}`, buf);
  return jsonResponse({ ok: true, idx, bytes: buf.length }, 200, request);
};

export const config = { path: '/api/async/upload' };
