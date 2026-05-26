/* log-missed-match.mjs
 *
 * "Missed match" counter for /spar.
 *
 * Two methods:
 *   POST /api/log-missed-match  → atomic +1 on the counter; returns new totals.
 *   GET  /api/log-missed-match  → read-only fetch of current totals.
 *
 * The "miss" is fired by app/spar.html in two places:
 *   1. renderFallback() — user sat in the queue 60s without pairing.
 *   2. cancelQueue() — user gave up after staying in the queue >=15s
 *      (gives up earlier than that and it's not really a "miss," they
 *      probably just clicked through accidentally).
 *
 * Storage shape:
 *   metrics/missed_matches
 *     total: number (all-time)
 *     week_count: number (resets at the start of each ISO week)
 *     week_key: string (YYYY-WW)
 *     by_format: { apda: N, bp: N, ... }
 *     updatedAt: server timestamp
 *
 * Per-IP rate limiting prevents trivial abuse: an IP can only fire
 * MAX_TICKS_PER_HOUR misses (defaults to 6, since the spar surface
 * naturally caps you at ~1 attempt/min). Beyond that, the function
 * returns the current totals without incrementing — silent floor.
 *
 * Firestore Admin SDK bypasses firestore.rules — no rules change.
 */

import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const COUNTER_DOC = 'metrics/missed_matches';

// Per-IP tick budget. The spar matchmaker queues you for ~60s before
// AI fallback fires, so a real user is unlikely to legitimately
// generate >6 misses/hr.
const MAX_TICKS_PER_HOUR = 6;
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

// ISO week key — e.g., "2026-W21". When the week_key on the counter
// doc no longer matches what we compute here, we reset week_count
// to 1 and bump week_key in the same write.
function isoWeekKey(date){
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Allow-list of format slugs we expect to see — anything else collapses
// to 'other' so a bad client param can't pollute the by_format map.
const ALLOWED_FORMATS = new Set([
  'apda', 'bp', 'wsdc', 'policy', 'ld', 'pf', 'congress', 'mun',
  'asian_parli', 'india_school', 'india_college', 'quick',
]);
function normFormat(raw){
  if (!raw || typeof raw !== 'string') return 'other';
  const s = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return ALLOWED_FORMATS.has(s) ? s : 'other';
}

function defaultCounts(){
  return {
    total: 0,
    week_count: 0,
    week_key: isoWeekKey(new Date()),
    by_format: {},
  };
}

async function readCounts(docRef){
  const snap = await docRef.get();
  if (!snap.exists) return defaultCounts();
  const d = snap.data() || {};
  return {
    total: typeof d.total === 'number' ? d.total : 0,
    week_count: typeof d.week_count === 'number' ? d.week_count : 0,
    week_key: typeof d.week_key === 'string' ? d.week_key : isoWeekKey(new Date()),
    by_format: d.by_format && typeof d.by_format === 'object' ? d.by_format : {},
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET' && request.method !== 'POST'){
    return errorResponse('Method not allowed', 405, request);
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    return jsonResponse(defaultCounts(), 200, request);
  }
  const docRef = db.doc(COUNTER_DOC);

  if (request.method === 'GET'){
    try {
      const counts = await readCounts(docRef);
      // If the stored week_key is stale, the *displayed* week_count is
      // still the old week's. That's fine for read; we don't reset on
      // GET to avoid a write per anonymous read.
      return jsonResponse(counts, 200, request);
    } catch (err) {
      console.error('log-missed-match GET failed:', err.message);
      return jsonResponse(defaultCounts(), 200, request);
    }
  }

  // POST → increment path.
  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for') ||
    'unknown';

  if (isRateLimited(ip)){
    try {
      const counts = await readCounts(docRef);
      return jsonResponse({ ...counts, ticked: false, reason: 'rate-limit' }, 200, request);
    } catch (err) {
      return jsonResponse({ ...defaultCounts(), ticked: false, reason: 'rate-limit' }, 200, request);
    }
  }

  let format = 'other';
  let reason = 'fallback';
  try {
    if (request.headers.get('content-type')?.includes('application/json')){
      const body = await request.clone().json().catch(() => null);
      if (body){
        format = normFormat(body.format);
        if (typeof body.reason === 'string'){
          // 'fallback' (60s AI fallback fired) | 'cancel' (user gave up)
          reason = body.reason === 'cancel' ? 'cancel' : 'fallback';
        }
      }
    }
  } catch {}

  try {
    const currentWeek = isoWeekKey(new Date());
    const snap = await docRef.get();

    if (!snap.exists){
      // Seed.
      await docRef.set({
        total: 1,
        week_count: 1,
        week_key: currentWeek,
        by_format: { [format]: 1 },
        last_reason: reason,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return jsonResponse({
        total: 1, week_count: 1, week_key: currentWeek,
        by_format: { [format]: 1 }, ticked: true, seeded: true,
      }, 200, request);
    }

    const stored = snap.data() || {};
    const sameWeek = stored.week_key === currentWeek;
    const update = {
      total: FieldValue.increment(1),
      [`by_format.${format}`]: FieldValue.increment(1),
      last_reason: reason,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (sameWeek){
      update.week_count = FieldValue.increment(1);
    } else {
      // Roll the week counter. Set to 1 (this miss starts the new week).
      update.week_count = 1;
      update.week_key = currentWeek;
    }
    await docRef.update(update);
    const counts = await readCounts(docRef);
    return jsonResponse({ ...counts, ticked: true }, 200, request);
  } catch (err) {
    console.error('log-missed-match POST failed:', err.message);
    return jsonResponse({ ...defaultCounts(), ticked: false, error: 'write-failed' }, 200, request);
  }
};

export const config = { path: '/api/log-missed-match' };
