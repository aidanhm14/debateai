/* log-missed-match.mjs
 *
 * Spar activity counters for /spar. Two separate counter docs:
 *
 *   metrics/missed_matches  — true misses (tried, nobody showed).
 *   metrics/spar_attempts   — spar intent (pressed Spar / started a
 *                             search). A superset of misses: every miss
 *                             had an attempt, but plenty of attempts end
 *                             in a fast AI fallback that never counted as
 *                             a "miss." This is the honest "how many
 *                             people looked for a live round" number.
 *
 * Two methods:
 *   POST /api/log-missed-match  → atomic +1 on one counter; returns totals.
 *   GET  /api/log-missed-match  → read-only fetch of both counters.
 *
 * Fired by app/spar.html via reason:
 *   'attempt'  — search started (logSparAttempt, once per tab session).
 *   'fallback' — sat in the queue 60s without pairing (renderFallback).
 *   'cancel'   — gave up after staying in the queue >=15s (cancelQueue).
 * 'fallback'/'cancel' tick missed_matches; 'attempt' ticks spar_attempts.
 *
 * Storage shape (identical for both docs):
 *   total: number (all-time)
 *   week_count: number (resets at the start of each ISO week)
 *   week_key: string (YYYY-WW)
 *   month_count: number (resets at the start of each UTC month)
 *   month_key: string (YYYY-MM)
 *   by_format: { apda: N, bp: N, ... }
 *   updatedAt: server timestamp
 *
 * GET returns the misses counts at top level (backward-compat: /live's
 * callout + the original /spar strip read week_count) with the attempts
 * counts nested under `attempts`.
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
const ATTEMPTS_DOC = 'metrics/spar_attempts';

// Recent-seeks ring. The aggregate counters above answer "how many
// looked this week"; this answers "who looked, in what order, and when"
// so /spar can render an ordered timeline ("APDA · 2h ago") instead of a
// dead "0 in queue" empty state. One doc holding a capped array, newest
// first. Anonymous on purpose — an attempt is "I pressed find a round,"
// not an opt-in to be named publicly (that's the waitlist rail's job),
// so we store the format + a server-stamped time and nothing else.
const RECENT_DOC = 'metrics/spar_recent_seeks';
const MAX_RECENT_STORED = 24;       // ring size kept in Firestore
const MAX_RECENT_RETURNED = 12;     // most the GET ever hands back
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // drop events older than 7d

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

// Month key — e.g., "2026-05". Same idea as week_key but coarser; the
// stored month_count rolls back to 1 when the stored month_key no longer
// matches the current UTC month.
function monthKey(date){
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Allow-list of format slugs we expect to see — anything else collapses
// to 'other' so a bad client param can't pollute the by_format map.
const ALLOWED_FORMATS = new Set([
  'apda', 'bp', 'wsdc', 'policy', 'ld', 'pf', 'congress', 'mun',
  'asian_parli', 'india_school', 'india_college', 'quick',
]);
// spar.html's style chips send 'worlds' / 'asian'; the allow-list (and
// the rest of the brain stack) calls those 'wsdc' / 'asian_parli'. Map
// the client slugs onto the canonical names so Worlds/Asian-Parli seeks
// land in by_format and the recent-seeks ring instead of collapsing to
// 'other'. The client SEEK_LABELS renders either spelling correctly.
const FORMAT_ALIASES = { worlds: 'wsdc', asian: 'asian_parli' };
function normFormat(raw){
  if (!raw || typeof raw !== 'string') return 'other';
  let s = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (FORMAT_ALIASES[s]) s = FORMAT_ALIASES[s];
  return ALLOWED_FORMATS.has(s) ? s : 'other';
}

function defaultCounts(){
  return {
    total: 0,
    week_count: 0,
    week_key: isoWeekKey(new Date()),
    month_count: 0,
    month_key: monthKey(new Date()),
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
    month_count: typeof d.month_count === 'number' ? d.month_count : 0,
    month_key: typeof d.month_key === 'string' ? d.month_key : monthKey(new Date()),
    by_format: d.by_format && typeof d.by_format === 'object' ? d.by_format : {},
  };
}

// Increment one counter doc (misses or attempts). Same shape for both:
// total (all-time), week_count (current ISO week), week_key, by_format.
// Each doc self-manages its own weekly roll, so the two counters never
// fight over a shared week_key.
async function tickCounter(docRef, format, reason){
  const now = new Date();
  const currentWeek = isoWeekKey(now);
  const currentMonth = monthKey(now);
  const snap = await docRef.get();

  if (!snap.exists){
    await docRef.set({
      total: 1,
      week_count: 1,
      week_key: currentWeek,
      month_count: 1,
      month_key: currentMonth,
      by_format: { [format]: 1 },
      last_reason: reason,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { total: 1, week_count: 1, week_key: currentWeek, month_count: 1, month_key: currentMonth, by_format: { [format]: 1 } };
  }

  const stored = snap.data() || {};
  const sameWeek = stored.week_key === currentWeek;
  const sameMonth = stored.month_key === currentMonth;
  const update = {
    total: FieldValue.increment(1),
    [`by_format.${format}`]: FieldValue.increment(1),
    last_reason: reason,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (sameWeek){
    update.week_count = FieldValue.increment(1);
  } else {
    // Roll the week counter. Set to 1 (this tick starts the new week).
    update.week_count = 1;
    update.week_key = currentWeek;
  }
  if (sameMonth){
    update.month_count = FieldValue.increment(1);
  } else {
    // Roll the month counter. Set to 1 (this tick starts the new month).
    update.month_count = 1;
    update.month_key = currentMonth;
  }
  await docRef.update(update);
  return await readCounts(docRef);
}

// Read the recent-seeks ring: newest first, stale events (older than the
// window) filtered out, capped to what the strip will actually show. A
// single cheap doc read — no collection scan, no composite index.
async function readRecentSeeks(docRef){
  const snap = await docRef.get();
  if (!snap.exists) return [];
  const d = snap.data() || {};
  const events = Array.isArray(d.events) ? d.events : [];
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  return events
    .filter((e) => e && typeof e.ts === 'number' && e.ts >= cutoff && typeof e.fmt === 'string')
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_RECENT_RETURNED)
    .map((e) => ({ fmt: e.fmt, ts: e.ts }));
}

// Push one attempt onto the ring inside a transaction so concurrent
// seeks don't clobber each other, prepend newest, drop anything past the
// window, and trim to MAX_RECENT_STORED. Time is stamped server-side
// (Date.now ms) — FieldValue.serverTimestamp() can't live inside an
// array element, so a plain epoch number is the right shape here.
async function pushRecentSeek(db, docRef, format){
  const now = Date.now();
  const cutoff = now - RECENT_WINDOW_MS;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const prior = snap.exists && Array.isArray(snap.data().events) ? snap.data().events : [];
    const fresh = prior.filter((e) => e && typeof e.ts === 'number' && e.ts >= cutoff);
    const events = [{ fmt: format, ts: now }, ...fresh].slice(0, MAX_RECENT_STORED);
    tx.set(docRef, { events, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
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
    return jsonResponse({ ...defaultCounts(), attempts: defaultCounts() }, 200, request);
  }
  const missesRef = db.doc(COUNTER_DOC);
  const attemptsRef = db.doc(ATTEMPTS_DOC);
  const recentRef = db.doc(RECENT_DOC);

  if (request.method === 'GET'){
    try {
      // Read both counters + the recent-seeks ring in parallel. Misses
      // stay top-level for backward-compat; attempts ride alongside under
      // `attempts`; the ordered "who looked, and when" timeline rides
      // under `recent`. Stale week_key on read is fine — we don't reset
      // on GET (avoids a write per anonymous read).
      const [misses, attempts, recent] = await Promise.all([
        readCounts(missesRef),
        readCounts(attemptsRef),
        readRecentSeeks(recentRef),
      ]);
      return jsonResponse({ ...misses, attempts, recent }, 200, request);
    } catch (err) {
      console.error('log-missed-match GET failed:', err.message);
      return jsonResponse({ ...defaultCounts(), attempts: defaultCounts(), recent: [] }, 200, request);
    }
  }

  // POST → increment path.
  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for') ||
    'unknown';

  let format = 'other';
  let reason = 'fallback';
  try {
    if (request.headers.get('content-type')?.includes('application/json')){
      const body = await request.clone().json().catch(() => null);
      if (body){
        format = normFormat(body.format);
        if (typeof body.reason === 'string'){
          // 'attempt' (started a search — spar intent) | 'fallback' (60s
          // AI fallback fired) | 'cancel' (user gave up). Anything else
          // collapses to 'fallback'.
          if (body.reason === 'attempt') reason = 'attempt';
          else if (body.reason === 'cancel') reason = 'cancel';
          else reason = 'fallback';
        }
      }
    }
  } catch {}

  const isAttempt = reason === 'attempt';
  const targetRef = isAttempt ? attemptsRef : missesRef;

  if (isRateLimited(ip)){
    try {
      const counts = await readCounts(targetRef);
      return jsonResponse({ ...counts, ticked: false, reason: 'rate-limit' }, 200, request);
    } catch (err) {
      return jsonResponse({ ...defaultCounts(), ticked: false, reason: 'rate-limit' }, 200, request);
    }
  }

  try {
    const counts = await tickCounter(targetRef, format, reason);
    // Only a genuine "looked for a round" intent joins the ordered
    // timeline. Misses/cancels already had their own 'attempt' tick when
    // the search started, so logging them again would double up the same
    // person. Best-effort: a ring write failing never fails the tick.
    if (isAttempt){
      try { await pushRecentSeek(db, recentRef, format); }
      catch (e) { console.warn('spar_recent_seeks push failed:', e.message); }
    }
    return jsonResponse({ ...counts, ticked: true, kind: isAttempt ? 'attempt' : 'miss' }, 200, request);
  } catch (err) {
    console.error('log-missed-match POST failed:', err.message);
    return jsonResponse({ ...defaultCounts(), ticked: false, error: 'write-failed' }, 200, request);
  }
};

export const config = { path: '/api/log-missed-match' };
