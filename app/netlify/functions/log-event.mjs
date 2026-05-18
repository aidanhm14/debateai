import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const VALID_EVENTS = new Set([
  'case_generated',
  'battle_started',
  'feedback_requested',
  'philosophy_explored',
  'forum_post',
  'motion_rolled',
  'speech_practiced',
  'round_mapped',
  'page_view',
  'session_start',
  'session_heartbeat',
  'session_end',
  // Stripe checkout-success conversion event. Was missing from this
  // allowlist so every paid conversion came back 400 from the server,
  // which is one of the two reasons soul.md flagged "Paid conversions:
  // 0 tracked." (The other was the client-side eventMap missing it.)
  'conversion',
  // Generic bucket for arbitrary product events mirrored from the
  // gtag → track bridge in /js/track.js. The original gtag event
  // name comes through as metadata.name so the admin dashboard /
  // per-user activity feed can still slice on it without forcing
  // every new event to be added to this allowlist by hand.
  'app_event',
]);

// Allowlist of events we accept WITHOUT a signed-in user. Funnel-shaped
// only: round-start / round-complete (battle_started + app_event), page
// views, session lifecycle. Sensitive or paid-tier events (conversion,
// feedback_requested, forum_post) still require auth so a stray POST
// can't pollute those collections with anonymous noise.
//
// Rationale (2026-05-18): the round-complete KPI on the HQ dashboard
// was unmeasurable because /api/log-event 401'd every anon call, and
// ~62% of users never sign in. Three funnel fixes shipped over the
// past two weeks and we couldn't tell if any of them moved the metric
// for the cohort they were trying to help. Opening the funnel-shaped
// events to anonymous writes is the actual unlock.
const VALID_EVENTS_ANON = new Set([
  'battle_started',
  'page_view',
  'session_start',
  'session_heartbeat',
  'session_end',
  'app_event',
]);

// In-memory rate limiting: uid (or anon:<sid>:<ip>) -> { count, windowStart }
const rateLimits = new Map();
const RATE_LIMIT = 30;
const RATE_LIMIT_ANON = 10; // anon page_view beacons — tighter
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

function isRateLimited(uid, max = RATE_LIMIT) {
  const now = Date.now();
  const entry = rateLimits.get(uid);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(uid, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > max) return true;
  return false;
}

// Periodically clean up stale entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rateLimits) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) {
      rateLimits.delete(uid);
    }
  }
}, 5 * 60 * 1000);

// Extract a best-effort client IP for anon rate limiting. Netlify
// forwards the real IP in x-nf-client-connection-ip; x-forwarded-for
// is the standards-y fallback that proxies in front of it sometimes
// set. Both are spoofable from outside Netlify's edge but inside it
// they're trustworthy. Last resort: 'unknown' so we still rate-limit
// SOMETHING rather than nothing.
function clientIp(request) {
  const h = request.headers;
  return (
    h.get('x-nf-client-connection-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    h.get('cf-connecting-ip') ||
    'unknown'
  );
}

// Anonymous sessionId from the body. Coerce to a tight format so
// callers can't smuggle absurdly long ids that bloat Firestore docs.
function sanitizeSid(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s || s.length > 64) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return '';
  return s;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, request);
  }

  const { event, metadata } = body;

  if (!event || typeof event !== 'string') {
    return errorResponse('Missing or invalid event type', 400, request);
  }

  // Auth resolution: prefer Bearer token. If absent, fall back to an
  // anonymous-session write keyed by sessionId — but only for the
  // funnel-shaped subset of events. Anything outside VALID_EVENTS_ANON
  // (conversion, forum_post, etc.) still requires a real user.
  const token = extractBearerToken(request);
  let uid;
  let isAnon = false;

  if (token) {
    let decoded;
    try {
      decoded = await verifyIdToken(token);
    } catch (err) {
      console.error('log-event auth error:', err.message);
      return errorResponse('Authentication failed. Please sign in again.', 401, request);
    }
    uid = decoded.sub;
    if (isRateLimited(uid)) {
      return errorResponse('Rate limit exceeded. Try again shortly.', 429, request);
    }
  } else {
    // Anonymous path. Require sessionId in body so funnel queries can
    // still dedupe to a "unique starter" — without it, every anon ping
    // looks like a brand-new session and pollutes the cohort math.
    const sid = sanitizeSid(metadata && metadata.session_id);
    if (!sid) {
      return errorResponse('Anonymous events require metadata.session_id', 400, request);
    }
    if (!VALID_EVENTS_ANON.has(event)) {
      return errorResponse('Event ' + event + ' requires authentication', 401, request);
    }
    // Synthetic uid keeps the events collection's shape stable —
    // admin-funnel.mjs already dedupes by `d.uid` for unique counting,
    // so an anon session reads as a single "starter" via this prefix.
    uid = 'anon:' + sid;
    isAnon = true;
    // Anon rate limit: tighter, keyed by (sid + ip) so one bot rotating
    // sessionIds from a single IP can't quietly spam the events table.
    const rlKey = uid + ':' + clientIp(request);
    if (isRateLimited(rlKey, RATE_LIMIT_ANON)) {
      return errorResponse('Rate limit exceeded. Try again shortly.', 429, request);
    }
  }

  if (!VALID_EVENTS.has(event)) {
    return errorResponse('Unknown event type: ' + event, 400, request);
  }

  if (metadata && (typeof metadata !== 'object' || Array.isArray(metadata))) {
    return errorResponse('metadata must be a plain object', 400, request);
  }

  // Sanitize metadata: only allow string/number/boolean values, limit size
  const sanitizedMetadata = {};
  if (metadata) {
    const keys = Object.keys(metadata).slice(0, 20); // max 20 fields
    for (const key of keys) {
      const val = metadata[key];
      if (typeof val === 'string') {
        sanitizedMetadata[key] = val.slice(0, 500); // max 500 chars per value
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        sanitizedMetadata[key] = val;
      }
    }
  }

  try {
    const db = getDb();
    await db.collection('events').add({
      uid,
      event,
      metadata: sanitizedMetadata,
      // Tag the row so future queries (e.g. anon-vs-signed-in split in
      // admin-funnel) can slice cleanly. Existing rows have no `anon`
      // field — readers should treat its absence as `false`.
      anon: isAnon,
      // createdAt is the canonical name across every collection in this
      // project — admin-analytics.mjs filters time-series by createdAt, so
      // writing `timestamp` instead silently zeroed out every chart on the
      // dashboard. Keep `timestamp` as a back-compat alias so any older
      // tooling that reads it still works.
      createdAt: FieldValue.serverTimestamp(),
      timestamp: FieldValue.serverTimestamp(),
    });

    return jsonResponse({ ok: true }, 200, request);
  } catch (err) {
    console.error('log-event Firestore write failed:', err.message, err.code || '');
    return errorResponse('Failed to log event', 500, request);
  }
};

export const config = {
  path: '/api/log-event',
};
