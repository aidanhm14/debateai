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
 *   metrics_daily/{YYYY-MM-DD}
 *     count: number (visits on that UTC day)
 *     updatedAt: server timestamp
 *
 * Returns:
 *   { count, count30d, source }
 *
 *   count    — cumulative all-time, with the legacy 7,074 ad-spike
 *              seed subtracted back out (see LEGACY_BASELINE)
 *   count30d — sum of daily docs in the rolling 30-day window
 *              (this is what community.html displays now)
 *
 * A POST must carry `deviceId` (the durable localStorage `_da_aid`
 * that track.js mints) or it reads without incrementing. That id is
 * the only thing standing between this counter and a browser with
 * storage disabled ticking on every single page load.
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

// FLAT, 2-segment collection. It used to be `metrics/daily`, which
// made every per-day ref `metrics/daily/{YYYY-MM-DD}` — three
// segments, which Firestore reads as a COLLECTION path and rejects
// as a document. Every read and write in this function threw on
// construction, for months, so the counter silently served its
// hardcoded fallback and not one daily doc was ever written. That is
// why /community has always shown the static baseline. Nothing to
// migrate: the old path never held data.
const DAILY_COLLECTION = 'metrics_daily';

// The counter doc was SEEDED at 7,074 in the ad-spike era, so the
// stored cumulative number carries seven thousand visits that never
// happened. That padding is subtracted back out on read (2026-08-10)
// rather than rewritten in Firestore, because the daily docs are the
// real record and rewriting the running total would destroy the only
// evidence of what the number used to claim. `count` is now honest;
// `count30d` always was. Kept as a constant only to un-pad docs
// written before the seed recorded its own `baseline` field.
const LEGACY_BASELINE = 7074;

// A tick without a durable device id cannot be deduped: the client
// marks "already counted" in localStorage, so a browser that blocks
// it (Safari ITP, Instagram/TikTok in-app) re-ticks on EVERY page
// load. Requiring the id means those visitors are undercounted rather
// than counted a dozen times each. Undercounting is the honest
// direction to be wrong in for a number we may quote.
function sanitizeDeviceId(raw){
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s || s.length > 64) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return '';
  return s;
}

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
  if (!snap.exists) return 0;
  const data = snap.data() || {};
  const raw = typeof data.count === 'number' ? data.count : 0;
  // Docs seeded before 2026-08-10 recorded their own pad in `baseline`.
  const pad = typeof data.baseline === 'number' ? data.baseline : LEGACY_BASELINE;
  return Math.max(0, raw - pad);
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
    return jsonResponse({ count: 0, count30d: 0, source: 'baseline' }, 200, request);
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
      return jsonResponse({ count: 0, count30d: 0, source: 'baseline-fallback' }, 200, request);
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
      return jsonResponse({ count: 0, count30d: 0, ticked: false, reason: 'rate-limit' }, 200, request);
    }
  }

  let joinHandle = 'Anonymous';
  let deviceId = '';
  try {
    if (request.headers.get('content-type')?.includes('application/json')){
      const body = await request.clone().json().catch(() => null);
      if (body && typeof body.handle === 'string' && body.handle.trim()){
        joinHandle = body.handle.trim().slice(0, 32);
      }
      if (body) deviceId = sanitizeDeviceId(body.deviceId);
    }
  } catch {}

  // No durable device id means no dedupe (see sanitizeDeviceId). Read
  // the counts back so the caller still renders a number, but don't
  // increment: an undercount beats counting one blocked-storage
  // visitor once per page load forever.
  if (!deviceId){
    try {
      const [count, count30d] = await Promise.all([
        readCumulativeCount(docRef),
        read30dCount(db),
      ]);
      return jsonResponse({ count, count30d, ticked: false, reason: 'no-device-id' }, 200, request);
    } catch (err) {
      return jsonResponse({ count: 0, count30d: 0, ticked: false, reason: 'no-device-id' }, 200, request);
    }
  }

  try {
    const today = todayKey();
    const dailyRef = db.doc(`${DAILY_COLLECTION}/${today}`);

    // Seed cumulative counter on first write.
    const snap = await docRef.get();
    if (!snap.exists){
      await Promise.all([
        docRef.set({
          count: 1,
          updatedAt: FieldValue.serverTimestamp(),
          // Seeded honest: no ad-spike padding on a fresh counter.
          baseline: 0,
        }),
        dailyRef.set({ count: 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      ]);
      // Bust rolling cache so next GET sees the new day.
      rollingCache = { value: null, ts: 0 };
      writeJoinEvent({ db, handle: joinHandle }).catch(() => {});
      const count30d = await read30dCount(db);
      return jsonResponse({ count: 1, count30d, ticked: true, seeded: true }, 200, request);
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
    return jsonResponse({ count: 0, count30d: 0, ticked: false, error: 'write-failed' }, 200, request);
  }
};

export const config = { path: '/api/visitor-tick' };
