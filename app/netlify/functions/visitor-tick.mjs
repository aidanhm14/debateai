/* visitor-tick.mjs
 *
 * Live visitor counter for the /community Members surface. Backs the
 * "monthly active members (MAU)" headline number that anyone landing
 * on the site is counted into.
 *
 * Two methods:
 *   GET  /api/visitor-tick  → returns current count, no write
 *   POST /api/visitor-tick  → atomic +1 then returns the new count
 *
 * Client (`app/js/visitor-counter.js`) POSTs once per device using a
 * localStorage flag (`da-member-since`) and GETs on every subsequent
 * load. No auth required — the metric is intentionally public.
 *
 * Storage shape:
 *   metrics/visitor_counter
 *     count: number (cumulative all-time first-device visits + baseline)
 *     updatedAt: server timestamp
 *
 * Baseline 7074 = the May 2026 MAU at the time this counter went live.
 * If the doc doesn't exist yet, the first POST seeds it at BASELINE+1
 * via merged increment (Firestore initializes missing fields to 0
 * before applying FieldValue.increment, so we ensure the seed via a
 * conditional merge below).
 *
 * Per-IP rate limiting prevents trivial abuse: an IP can tick at most
 * MAX_TICKS_PER_HOUR. Beyond that the function returns the current
 * count without incrementing — silent floor, no 429 (the public
 * counter shouldn't surface error states to a casual visitor).
 *
 * Firestore Admin SDK bypasses firestore.rules — no rules change
 * needed. The metrics doc remains writable only via this function.
 */

import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { writeJoinEvent } from './chat-feed.mjs';

const COUNTER_DOC = 'metrics/visitor_counter';
const BASELINE = 7074;

// Per-IP tick budget. New-device visits per IP are rare in practice,
// so the cap is well above any honest traffic. Mostly here to stop a
// trivial loop from inflating the number.
const MAX_TICKS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

const ipTicks = new Map();
function isRateLimited(ip){
  const now = Date.now();
  const e = ipTicks.get(ip);
  if (!e || now - e.windowStart > HOUR_MS){
    ipTicks.set(ip, { count: 1, windowStart: now });
    return false;
  }
  e.count += 1;
  return e.count > MAX_TICKS_PER_HOUR;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of ipTicks){
    if (now - e.windowStart > HOUR_MS * 2) ipTicks.delete(ip);
  }
}, 10 * 60 * 1000);

async function readCount(docRef){
  const snap = await docRef.get();
  if (!snap.exists) return BASELINE;
  const v = snap.data().count;
  return (typeof v === 'number' && v >= BASELINE) ? v : BASELINE;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET' && request.method !== 'POST'){
    return errorResponse('Method not allowed', 405, request);
  }

  // Local dev / missing service account: serve baseline so the page
  // never blocks on Firestore. Same defensive pattern the seed pools
  // use on the client.
  let db;
  try {
    db = getDb();
  } catch (err) {
    return jsonResponse({ count: BASELINE, source: 'baseline' }, 200, request);
  }
  const docRef = db.doc(COUNTER_DOC);

  if (request.method === 'GET'){
    try {
      const count = await readCount(docRef);
      return jsonResponse({ count, source: 'firestore' }, 200, request);
    } catch (err) {
      console.error('visitor-tick GET failed:', err.message);
      return jsonResponse({ count: BASELINE, source: 'baseline-fallback' }, 200, request);
    }
  }

  // POST → tick path.
  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for') ||
    'unknown';

  if (isRateLimited(ip)){
    try {
      const count = await readCount(docRef);
      return jsonResponse({ count, ticked: false, reason: 'rate-limit' }, 200, request);
    } catch (err) {
      return jsonResponse({ count: BASELINE, ticked: false, reason: 'rate-limit' }, 200, request);
    }
  }

  // Optional: caller may pass a handle so the join event in the
  // community chat feed shows the same name the visitor will use to
  // post messages. Falls back to "Anonymous" when missing.
  let joinHandle = 'Anonymous';
  try {
    if (request.headers.get('content-type')?.includes('application/json')){
      const body = await request.clone().json().catch(() => null);
      if (body && typeof body.handle === 'string' && body.handle.trim()){
        joinHandle = body.handle.trim().slice(0, 32);
      }
    }
  } catch {}

  try {
    // Seed on first write: if the doc doesn't exist yet, FieldValue.increment(1)
    // would land at 1, not BASELINE+1. Initialize via a transactional read first.
    const snap = await docRef.get();
    if (!snap.exists){
      await docRef.set({
        count: BASELINE + 1,
        updatedAt: FieldValue.serverTimestamp(),
        baseline: BASELINE,
      });
      // Fire-and-forget join event so the chat shows "X just joined!"
      // alongside the counter tick. Failure here doesn't break the tick.
      writeJoinEvent({ db, handle: joinHandle }).catch(() => {});
      return jsonResponse({ count: BASELINE + 1, ticked: true, seeded: true }, 200, request);
    }
    await docRef.update({
      count: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeJoinEvent({ db, handle: joinHandle }).catch(() => {});
    const count = await readCount(docRef);
    return jsonResponse({ count, ticked: true }, 200, request);
  } catch (err) {
    console.error('visitor-tick POST failed:', err.message);
    return jsonResponse({ count: BASELINE, ticked: false, error: 'write-failed' }, 200, request);
  }
};

export const config = { path: '/api/visitor-tick' };
