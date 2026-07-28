import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Open Spar Night RSVP capture (2026-07-28).
//
// Why this exists: the spar-night countdown card (app/js/spar-night.js) has
// been seen by 2,264 unique visitors in 21 days and its only pre-event CTA
// was a Google Calendar link. A calendar template is client-side and leaves
// no record, so a visitor who wanted in was unreachable forever after. The
// weekly reminder cron (scheduled-spar-night.mjs) could only mail signed-in
// accounts, and there are ~12 sign-ins a fortnight, so the reminder reached
// almost nobody who saw the banner.
//
// This endpoint takes an email from an ANONYMOUS visitor. That is the whole
// point: the cohort that needs reminding is the one that never signs in.
//
// One doc per email at `spar_night_rsvps/{emailHash}`, so a re-submit
// updates rather than duplicates. scheduled-spar-night.mjs reads this
// collection alongside the Auth user list and dedupes by address.
//
// Rate limit: 5 per IP per hour. A real person RSVPs once.
//
// NOTE: sends nothing itself. Delivery is the cron's job, and the cron
// cannot send at all until RESEND_API_KEY is set (it is currently an empty
// string in Netlify env, which is why the 2026-07-22 run recorded 6
// attempts and 0 sends). Capture is still worth doing without delivery:
// the list is the durable asset and it can be mailed by hand.

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 5;
const rateLimits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    if (now - v.windowStart > RATE_WINDOW_MS * 2) rateLimits.delete(k);
  }
}, 10 * 60 * 1000);

function clientIp(request) {
  const h = request.headers;
  return (
    h.get('x-nf-client-connection-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    h.get('cf-connecting-ip') ||
    'unknown'
  );
}

// FNV-1a 32-bit hex. Same helper shape as ambassador-apply.mjs: we need a
// stable email -> doc id mapping for dedup, not cryptographic strength.
export function emailHash(email) {
  const s = String(email || '').trim().toLowerCase();
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clamp(s, n) {
  return typeof s === 'string' ? s.trim().slice(0, n) : '';
}

// ── Next event start (same math as app/js/spar-night.js) ────────────────────
// Wednesdays 20:00 America/New_York, 90-minute window. Duplicated rather
// than shared because the client copy has to stay dependency-free; if you
// change one, change all three (here, spar-night.js, scheduled-spar-night.mjs).
const TZ = 'America/New_York';
const LIVE_MS = 90 * 60 * 1000;
const FIRST_EVENT_UTC = Date.UTC(2026, 6, 23, 0, 0, 0);

function nyParts(utcMs) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const out = {};
  for (const p of fmt.formatToParts(new Date(utcMs))) out[p.type] = p.value;
  return out;
}
function nyToUtc(y, mo, d, hh, mm) {
  const want = Date.UTC(y, mo - 1, d, hh, mm);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const p = nyParts(guess);
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute);
    guess += want - asUtc;
  }
  return guess;
}
function nextEventStart(nowMs) {
  for (let i = 0; i < 10; i++) {
    const p = nyParts(nowMs + i * 86400000);
    if (p.weekday !== 'Wed') continue;
    const start = nyToUtc(+p.year, +p.month, +p.day, 20, 0);
    if (start + LIVE_MS <= nowMs) continue;
    return Math.max(start, FIRST_EVENT_UTC);
  }
  return FIRST_EVENT_UTC;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405, request);
  }

  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return errorResponse('Too many sign-ups from this address. Try again later.', 429, request);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return errorResponse('Invalid JSON body', 400, request);
  }

  // Honeypot: the form renders it off-screen, bots fill it, humans never do.
  // Answer 200 so a bot sees success and does not retry.
  if (clamp(body['bot-field'], 50)) {
    return jsonResponse({ ok: true }, 200, request);
  }

  const email = clamp(body.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return errorResponse('Enter a valid email address', 400, request);
  }

  const start = nextEventStart(Date.now());

  try {
    const db = getDb();
    const ref = db.collection('spar_night_rsvps').doc(emailHash(email));

    let existing = null;
    try { existing = await ref.get(); } catch (e) {
      console.warn('[spar-rsvp] existence check failed (quota?):', e && e.message);
    }

    const doc = {
      email,
      // Timezone is the visitor's IANA zone when the browser reports one.
      // Stored so a future send can time itself to their evening rather
      // than blasting everyone at 9am Eastern.
      tz: clamp(body.tz, 64),
      page: clamp(body.page, 40),
      // Present only when the visitor happened to be signed in. Most will
      // not be; that is the cohort this endpoint exists for.
      uid: clamp(body.uid, 128) || null,
      userAgent: clamp(request.headers.get('user-agent') || '', 200),
      ip,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!existing || !existing.exists) {
      doc.createdAt = FieldValue.serverTimestamp();
      // A fresh RSVP is opted in. A re-submit deliberately does NOT clear
      // an existing unsubscribe: someone who opted out and later hits the
      // button again should not be silently resubscribed by a stray click.
      doc.unsubscribed = false;
    }
    await ref.set(doc, { merge: true });
  } catch (e) {
    console.error('[spar-rsvp] write failed:', e);
    return errorResponse('Could not save that. Try again in a moment.', 500, request);
  }

  return jsonResponse({ ok: true, nextEvent: new Date(start).toISOString() }, 200, request);
}

export const config = { path: '/api/spar-rsvp' };
