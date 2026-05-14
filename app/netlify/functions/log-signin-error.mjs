// Unauthenticated sink for sign-in errors.
//
// Why this exists: track.js posts every other event through /api/log-event
// behind a Firebase token, but sign-in errors are exactly the case where
// the user has NO token (they failed to authenticate). The existing
// gtag→track bridge queues those events waiting for auth that never
// arrives, then drops them on pagehide. Result: the 62% sign-in drop is
// invisible in our own telemetry — we only see GA4 events, which lack
// the per-user context we need to diagnose.
//
// This endpoint accepts the bare minimum to debug the funnel:
//   - error code (Firebase auth error like "auth/popup-blocked")
//   - error message (truncated, sanitized)
//   - surface (which page/CTA the user clicked from)
//   - method (popup vs redirect)
//   - in-app browser hint
//   - user agent (first 200 chars)
//
// No PII is requested or stored. Rate-limited by IP at the function
// level since anyone can call this without auth.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// Naive in-memory rate limiter: 30 events / IP / hour. Cold restarts
// reset the counter — that's fine, this is a soft cap to keep noise out
// of Firestore, not a security boundary.
const RATE_LIMIT_PER_HOUR = 30;
const ipBuckets = new Map();

function rateLimitOk(ip) {
  if (!ip) return true;
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const entry = ipBuckets.get(ip) || [];
  const recent = entry.filter(t => t > hourAgo);
  if (recent.length >= RATE_LIMIT_PER_HOUR) {
    ipBuckets.set(ip, recent);
    return false;
  }
  recent.push(now);
  ipBuckets.set(ip, recent);
  return true;
}

function sanitizeString(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\x00-\x1f\x7f]/g, '').slice(0, max);
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const ip = request.headers.get('x-nf-client-connection-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || null;

  if (!rateLimitOk(ip)) {
    return errorResponse('Rate limited', 429, request);
  }

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON', 400, request); }

  const event = sanitizeString(body.event, 40) || 'sign_in_error';
  // Only accept the sign_in_* family on this endpoint — keeps it from
  // being abused as a generic anonymous-write firehose.
  if (!event.startsWith('sign_in_')) {
    return errorResponse('Event not allowed on this endpoint', 400, request);
  }

  const doc = {
    event,
    code: sanitizeString(body.code, 80),
    message: sanitizeString(body.message, 240),
    surface: sanitizeString(body.surface, 80),
    method: sanitizeString(body.method, 40),
    inApp: !!body.inApp,
    isMobile: !!body.isMobile,
    userAgent: sanitizeString(request.headers.get('user-agent'), 240),
    country: sanitizeString(request.headers.get('x-country'), 8),
    referer: sanitizeString(request.headers.get('referer'), 240),
    sessionId: sanitizeString(body.sessionId, 64),
    path: sanitizeString(body.path, 120),
    ip: ip ? ip.slice(0, 64) : null,
    timestamp: FieldValue.serverTimestamp(),
  };

  try {
    const db = getDb();
    await db.collection('signin_errors').add(doc);
  } catch (err) {
    console.error('log-signin-error firestore write failed:', err.message);
    // Don't tell the client about server-side write failures — they
    // can't act on it and the event is already fire-and-forget.
    return jsonResponse({ ok: false }, 200, request);
  }

  return jsonResponse({ ok: true }, 200, request);
};

export const config = {
  path: '/api/log-signin-error',
};
