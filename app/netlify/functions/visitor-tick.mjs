/* visitor-tick.mjs
 *
 * Live visitor counter for the /community Members surface.
 *
 * Two methods:
 *   GET  /api/visitor-tick  → returns current counts, no write
 *   POST /api/visitor-tick  → atomic +1 then returns the new counts
 *
 * Storage shape:
 *   metrics/visitor_counter
 *     count: number (cumulative all-time)
 *     updatedAt: server timestamp
 *
 *   metrics/daily/{YYYY-MM-DD}
 *     count: number (visits on that UTC day)
 *     updatedAt: server timestamp
 *
 * Returns:
 *   { count, count30d, source }
 *
 *   count    — cumulative all-time (legacy field, kept for compat)
 *   count30d — sum of daily docs in the rolling 30-day window
 *              (this is what community.html displays now)
 *
 * Per-IP rate limiting prevents trivial abuse: an IP can tick at most
 * MAX_TICKS_PER_HOUR. Beyond that the function returns current counts
 * without incrementing — silent floor, no 429.
 *
 * Firestore Admin SDK bypasses firestore.rules — no rules change needed.
 */

import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { writeJoinEvent } from './chat-feed.mjs';

const COUNTER_DOC = 'metrics/visitor_counter';
const DAILY_COLLECTION = 'metrics/daily';
const BASELINE = 7074;

// 30-day window — how many daily docs to sum for the rolling count.
const WINDOW_DAYS = 30;

// Per-IP tick budget.
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

// 1-hour in-memory cache for the 30-day sum so a busy page doesn't
// fire 30 Firestore reads per visitor.
let rollingCache = { value: null, ts: 0 };
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function todayKey(){
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

function dayKeys(n){
  const keys = [];
  const now = new Date();
  for (let i = 0; i < n; i++){
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

async function readCumulativeCount(docRef){
  const snap = await docRef.get();
  if (!snap.exists) return BASELINE;
  const v = snap.data().count;
  return (typeof v === 'number' && v >= BASELINE) ? v : BASELINE;
}

async function read30dCount(db){
  const now = Date.now();
  if (rollingCache.value !== null && now - rollingCache.ts < CACHE_TTL){
    return rollingCache.value;
  }
  const keys = dayKeys(WINDOW_DAYS);
  const refs = keys.map(k => db.doc(`${DAILY_COLLECTION}/${k}`));
  const snaps = await Promise.all(refs.map(r => r.get()));
  let total = 0;
  for (const snap of snaps){
    if (snap.exists){
      const v = snap.data().count;
      if (typeof v === 'number') total += v;
    }
  }
  rollingCache = { value: total, ts: now };
  return total;
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
    return jsonResponse({ count: BASELINE, count30d: 0, source: 'baseline' }, 200, request);
  }
  const docRef = db.doc(COUNTER_DOC);

  if (request.method === 'GET'){
    try {
      const [count, count30d] = await Promise.all([
        readCumulativeCount(docRef),
        read30dCount(db),
      ]);
      return jsonResponse({ count, count30d, source: 'firestore' }, 200, request);
    } catch (err) {
      console.error('visitor-tick GET failed:', err.message);
      return jsonResponse({ count: BASELINE, count30d: 0, source: 'baseline-fallback' }, 200, request);
    }
  }

  // POST → tick path.
  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for') ||
    'unknown';

  if (isRateLimited(ip)){
    try {
      const [count, count30d] = await Promise.all([
        readCumulativeCount(docRef),
        read30dCount(db),
      ]);
      return jsonResponse({ count, count30d, ticked: false, reason: 'rate-limit' }, 200, request);
    } catch (err) {
      return jsonResponse({ count: BASELINE, count30d: 0, ticked: false, reason: 'rate-limit' }, 200, request);
    }
  }

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
    const today = todayKey();
    const dailyRef = db.doc(`${DAILY_COLLECTION}/${today}`);

    // Seed cumulative counter on first write.
    const snap = await docRef.get();
    if (!snap.exists){
      await Promise.all([
        docRef.set({
          count: BASELINE + 1,
          updatedAt: FieldValue.serverTimestamp(),
          baseline: BASELINE,
        }),
        dailyRef.set({ count: 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      ]);
      // Bust rolling cache so next GET sees the new day.
      rollingCache = { value: null, ts: 0 };
      writeJoinEvent({ db, handle: joinHandle }).catch(() => {});
      const count30d = await read30dCount(db);
      return jsonResponse({ count: BASELINE + 1, count30d, ticked: true, seeded: true }, 200, request);
    }

    await Promise.all([
      docRef.update({
        count: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }),
      dailyRef.set({
        count: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);
    // Bust rolling cache so the new tick shows in subsequent GETs.
    rollingCache = { value: null, ts: 0 };

    writeJoinEvent({ db, handle: joinHandle }).catch(() => {});
    const [count, count30d] = await Promise.all([
      readCumulativeCount(docRef),
      read30dCount(db),
    ]);
    return jsonResponse({ count, count30d, ticked: true }, 200, request);
  } catch (err) {
    console.error('visitor-tick POST failed:', err.message);
    return jsonResponse({ count: BASELINE, count30d: 0, ticked: false, error: 'write-failed' }, 200, request);
  }
};

export const config = { path: '/api/visitor-tick' };
