import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Lightweight email/phone capture for users who won't sign in with Google.
// Writes to `prospects` (not `users` — these are tracking signals, not real
// accounts). Anonymous endpoint by design; rate-limited per IP and per
// email to keep bots from spraying junk into the collection.
//
// Mirrored from app/js/prospect-capture.js which calls this when the
// client Firestore SDK is blocked (Safari ITP, Instagram/TikTok in-app
// browsers, App Check rejection, etc.). The browser path is preferred
// because it's cheaper; this is the safety net.

const MAX_EMAIL_LEN = 254;     // RFC 5321
const MAX_PHONE_LEN = 18;
const MAX_FIELD_LEN = 240;

function validEmail(s) {
  if (!s || typeof s !== 'string') return false;
  const v = s.trim();
  if (v.length > MAX_EMAIL_LEN) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function normalizePhone(s) {
  if (!s || typeof s !== 'string') return '';
  const v = s.replace(/[^\d+]/g, '');
  if (v.length < 7 || v.length > MAX_PHONE_LEN) return '';
  return v;
}

function clamp(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n) : s;
}

// ── Rate limiting ────────────────────────────────────────────────────
// Two layers: per-IP (anti-spray) and per-email (anti-dupe). Both
// in-memory only — this is best-effort; the real defense is the
// Firestore-side rule cap on `prospects` create (one per IP per hour,
// enforced via App Check + bot-protection on the dashboard side later
// if abuse shows up).
const ipHits = new Map();
const emailHits = new Map();
const IP_LIMIT = 6;
const EMAIL_LIMIT = 2;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function hit(map, key, limit) {
  const now = Date.now();
  const e = map.get(key);
  if (!e || now - e.windowStart > WINDOW_MS) {
    map.set(key, { count: 1, windowStart: now });
    return false;
  }
  e.count += 1;
  return e.count > limit;
}

setInterval(() => {
  const now = Date.now();
  for (const m of [ipHits, emailHits]) {
    for (const [k, v] of m) {
      if (now - v.windowStart > WINDOW_MS * 2) m.delete(k);
    }
  }
}, 10 * 60 * 1000);

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const email = clamp((body.email || '').trim(), MAX_EMAIL_LEN);
  if (!validEmail(email)) {
    return errorResponse('Valid email required', 400, request);
  }
  const phone = normalizePhone(body.phone || '');
  const source = clamp(body.source || 'unknown', 80);
  const ua = clamp(body.ua || '', MAX_FIELD_LEN);
  const locale = clamp(body.locale || '', 16);
  const page = clamp(body.page || '', MAX_FIELD_LEN);
  const ref = clamp(body.ref || '', MAX_FIELD_LEN);

  // Best-effort IP (Netlify forwards x-nf-client-connection-ip + x-forwarded-for)
  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown';

  if (hit(ipHits, ip, IP_LIMIT)) {
    return errorResponse('Too many submissions, try again later', 429, request);
  }
  if (hit(emailHits, email.toLowerCase(), EMAIL_LIMIT)) {
    // Soft-success: the user thinks they captured. We just don't write again.
    return jsonResponse({ ok: true, duplicate: true }, 200, request);
  }

  try {
    const db = getDb();
    await db.collection('prospects').add({
      email,
      emailLower: email.toLowerCase(),
      phone,
      source,
      ua,
      locale,
      page,
      ref,
      ip,
      via: 'function',
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log('[log-prospect]', source, email.replace(/^(.{2}).*(@.*)$/, '$1***$2'));
    return jsonResponse({ ok: true }, 200, request);
  } catch (err) {
    console.error('log-prospect error:', err.message);
    return errorResponse('Failed to save', 500, request);
  }
};

export const config = {
  path: '/api/log-prospect',
};
