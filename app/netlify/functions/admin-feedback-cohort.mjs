// /api/admin/feedback-cohort?uids=u1,u2,...&days=14
// /api/admin/feedback-cohort?emails=a@x.com,b@x.com&days=14
//
// Admin-only. For each uid in the cohort, computes active-time over the
// trailing `days` window from the generations + events collections and
// returns per-user qualification + payout for the paid-feedback program.
//
// Payout rules (defaults; overridable via query):
//   ?baseUsd=5   → flat for any meaningful activity (>=3 events OR >=1 generation)
//   ?fullUsd=10  → if activeMinutes >= ?minMinutes (default 30)
//
// Active-time algorithm: sort all activity timestamps (generations +
// events) ascending. Stitch into "windows" where consecutive events are
// within SESSION_GAP_MS (5 min) of each other. activeMs per window =
// max(MIN_WINDOW_MS, last - first). This avoids the "1 event = 0 min"
// trap while not double-counting idle gaps between sessions.
//
// Inputs are normalized:
//   - uids: comma-separated firebase uids
//   - emails: comma-separated; each gets translated to a uid via
//             user_profiles.{email}, missing ones returned as
//             notFound[] so the admin sees the typo immediately.
// Either list works; if both are passed they're unioned.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 60;
const DEFAULT_MIN_MINUTES = 30;
const DEFAULT_BASE_USD = 5;
const DEFAULT_FULL_USD = 10;

const SESSION_GAP_MS = 5 * 60 * 1000;   // 5 min idle → new window
const MIN_WINDOW_MS = 60 * 1000;        // single-event window = 1 min credit

// Per-uid scan caps. Big enough that 30-min-of-real-use never gets
// truncated; small enough that the function stays well under the 10s
// Netlify timeout even for 20+ uids.
const MAX_GENERATIONS_PER_UID = 500;
const MAX_EVENTS_PER_UID = 2000;

const EMAIL_LOOKUP_BATCH = 10;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { db } = auth;

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(MAX_DAYS, parseInt(url.searchParams.get('days') || String(DEFAULT_DAYS), 10)));
  const minMinutes = Math.max(1, Math.min(240, parseInt(url.searchParams.get('minMinutes') || String(DEFAULT_MIN_MINUTES), 10)));
  const baseUsd = Math.max(0, parseInt(url.searchParams.get('baseUsd') || String(DEFAULT_BASE_USD), 10));
  const fullUsd = Math.max(0, parseInt(url.searchParams.get('fullUsd') || String(DEFAULT_FULL_USD), 10));

  // Parse cohort inputs. Strip whitespace, dedupe, drop blanks.
  const splitList = (raw) => (raw || '')
    .split(/[,\s\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
  const inputUids = splitList(url.searchParams.get('uids'));
  const inputEmails = splitList(url.searchParams.get('emails')).map(e => e.toLowerCase());

  if (inputUids.length === 0 && inputEmails.length === 0) {
    return errorResponse('Pass uids= or emails= (comma-separated)', 400, request);
  }

  // ── Translate emails → uids ──────────────────────────────────────
  // Firestore can't do `where('email', 'in', [...])` past 10 at a time,
  // so we batch. Missing emails land in notFound[] so the admin sees
  // the typo without having to diff the input vs the output.
  const emailToUid = new Map();
  const notFound = [];
  for (let i = 0; i < inputEmails.length; i += EMAIL_LOOKUP_BATCH) {
    const batch = inputEmails.slice(i, i + EMAIL_LOOKUP_BATCH);
    try {
      const snap = await db.collection('user_profiles')
        .where('email', 'in', batch)
        .get();
      const foundInBatch = new Set();
      snap.docs.forEach(d => {
        const data = d.data();
        if (data && data.email) {
          const emailKey = String(data.email).toLowerCase();
          emailToUid.set(emailKey, d.id);
          foundInBatch.add(emailKey);
        }
      });
      batch.forEach(e => { if (!foundInBatch.has(e)) notFound.push({ email: e, reason: 'no user_profiles match' }); });
    } catch (err) {
      console.warn('feedback-cohort email lookup batch failed:', err.message);
      batch.forEach(e => notFound.push({ email: e, reason: 'lookup error: ' + err.message }));
    }
  }

  // Final uid set (union of explicit uids + email-resolved uids).
  const uidSet = new Set(inputUids);
  emailToUid.forEach(uid => uidSet.add(uid));
  const uids = [...uidSet];

  if (uids.length === 0) {
    return jsonResponse({
      ok: true,
      windowDays: days,
      users: [],
      notFound,
      totals: { count: 0, baseQualifies: 0, fullQualifies: 0, payoutUsd: 0 },
    }, 200, request);
  }

  const windowStartMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const windowStart = new Date(windowStartMs);

  // ── Pull profiles in parallel ────────────────────────────────────
  // user_profiles.{uid} gets us email + displayName for the cohort
  // table without an extra lookup per-row at render time.
  const profileSnaps = await Promise.all(
    uids.map(uid => db.collection('user_profiles').doc(uid).get().catch(() => null))
  );
  const profileByUid = new Map();
  profileSnaps.forEach((snap, i) => {
    const uid = uids[i];
    if (snap && snap.exists) {
      const data = snap.data() || {};
      profileByUid.set(uid, {
        email: data.email || '',
        displayName: data.displayName || '',
        createdAt: data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : null,
        plan: data.plan || (data.lifetimeUntil ? 'lifetime' : 'free'),
      });
    } else {
      profileByUid.set(uid, { email: '', displayName: '', createdAt: null, plan: 'unknown' });
    }
  });

  // ── Per-uid activity scan ────────────────────────────────────────
  // Each user: pull generations + events in parallel for that uid.
  // Then collapse into windows + compute activeMs.
  const users = [];

  // Fan-out per-uid in parallel — Firestore client handles connection
  // pooling. With 20-30 uids this stays well under any IO bottleneck.
  const perUid = await Promise.all(uids.map(async (uid) => {
    const [genSnap, evtSnap] = await Promise.all([
      db.collection('generations')
        .where('uid', '==', uid)
        .where('createdAt', '>=', windowStart)
        .orderBy('createdAt', 'desc')
        .limit(MAX_GENERATIONS_PER_UID)
        .get()
        .catch(async err => {
          // Composite-index fallback: scan-and-sort client-side. Slow
          // but functional if the index hasn't been built yet.
          if (/FAILED_PRECONDITION|index/i.test(err.message || '')) {
            console.warn('feedback-cohort generations index missing for uid', uid, '— falling back');
            return db.collection('generations')
              .where('uid', '==', uid)
              .limit(MAX_GENERATIONS_PER_UID)
              .get();
          }
          throw err;
        }),
      db.collection('events')
        .where('uid', '==', uid)
        .where('createdAt', '>=', windowStart)
        .orderBy('createdAt', 'desc')
        .limit(MAX_EVENTS_PER_UID)
        .get()
        .catch(async err => {
          if (/FAILED_PRECONDITION|index/i.test(err.message || '')) {
            console.warn('feedback-cohort events index missing for uid', uid, '— falling back');
            return db.collection('events')
              .where('uid', '==', uid)
              .limit(MAX_EVENTS_PER_UID)
              .get();
          }
          throw err;
        }),
    ]).catch(err => {
      console.error('feedback-cohort scan failed for uid', uid, err.message);
      return [{ docs: [] }, { docs: [] }];
    });

    // Collect timestamps + per-collection counts. Skip events older
    // than windowStart in case the fallback path pulled them in.
    const timestamps = [];
    let generationCount = 0;
    let voiceRoundCount = 0;
    const formatsTouched = new Set();
    const kindCounts = {};
    let lastActiveMs = 0;

    genSnap.docs.forEach(d => {
      const data = d.data() || {};
      const t = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : null;
      if (!t || t < windowStartMs) return;
      timestamps.push(t);
      generationCount++;
      if (data.kind === 'voice_round') voiceRoundCount++;
      if (data.format) formatsTouched.add(String(data.format));
      const k = String(data.kind || 'other');
      kindCounts[k] = (kindCounts[k] || 0) + 1;
      if (t > lastActiveMs) lastActiveMs = t;
    });

    let eventCount = 0;
    let pageViewCount = 0;
    evtSnap.docs.forEach(d => {
      const data = d.data() || {};
      const t = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : null;
      if (!t || t < windowStartMs) return;
      timestamps.push(t);
      eventCount++;
      if (data.event === 'page_view') pageViewCount++;
      if (t > lastActiveMs) lastActiveMs = t;
    });

    // ── Window-stitching active-time ───────────────────────────────
    // Sort ascending, walk through. Consecutive events within
    // SESSION_GAP_MS share a window; bigger gap = new window.
    timestamps.sort((a, b) => a - b);
    let activeMs = 0;
    let windowCount = 0;
    if (timestamps.length > 0) {
      let winStart = timestamps[0];
      let winEnd = timestamps[0];
      for (let i = 1; i < timestamps.length; i++) {
        const t = timestamps[i];
        if (t - winEnd > SESSION_GAP_MS) {
          activeMs += Math.max(MIN_WINDOW_MS, winEnd - winStart);
          windowCount++;
          winStart = t;
        }
        winEnd = t;
      }
      activeMs += Math.max(MIN_WINDOW_MS, winEnd - winStart);
      windowCount++;
    }

    const activeMinutes = Math.round(activeMs / 60000 * 10) / 10;

    // ── Qualification ──────────────────────────────────────────────
    // Base: any meaningful activity. Pure page_views without a single
    // generation or 3+ tracked events looks like a drive-by, not a
    // genuine attempt — don't pay for that.
    const hasMeaningfulActivity = (generationCount >= 1) || (eventCount >= 3);
    const qualifiesBase = hasMeaningfulActivity;
    const qualifiesFull = qualifiesBase && (activeMinutes >= minMinutes);

    const payoutUsd = qualifiesFull ? fullUsd : (qualifiesBase ? baseUsd : 0);
    const qualifies = qualifiesFull ? 'full' : (qualifiesBase ? 'base' : 'none');

    const profile = profileByUid.get(uid) || {};

    return {
      uid,
      email: profile.email,
      displayName: profile.displayName,
      plan: profile.plan,
      activeMinutes,
      activeMs,
      windowCount,
      generationCount,
      voiceRoundCount,
      eventCount,
      pageViewCount,
      formatsTouched: [...formatsTouched].sort(),
      kindCounts,
      lastActiveMs: lastActiveMs || null,
      qualifies,
      payoutUsd,
    };
  }));

  // Sort: highest payout → highest active time → email. Makes the
  // "who gets the $10" pile read first in the admin view.
  perUid.sort((a, b) => {
    if (b.payoutUsd !== a.payoutUsd) return b.payoutUsd - a.payoutUsd;
    if (b.activeMinutes !== a.activeMinutes) return b.activeMinutes - a.activeMinutes;
    return (a.email || '').localeCompare(b.email || '');
  });

  // ── Totals ───────────────────────────────────────────────────────
  const totals = {
    count: perUid.length,
    baseQualifies: perUid.filter(u => u.qualifies === 'base').length,
    fullQualifies: perUid.filter(u => u.qualifies === 'full').length,
    none: perUid.filter(u => u.qualifies === 'none').length,
    payoutUsd: perUid.reduce((s, u) => s + u.payoutUsd, 0),
    activeMinutesAvg: perUid.length
      ? +(perUid.reduce((s, u) => s + u.activeMinutes, 0) / perUid.length).toFixed(1)
      : 0,
  };

  return jsonResponse({
    ok: true,
    windowDays: days,
    minMinutes,
    baseUsd,
    fullUsd,
    users: perUid,
    notFound,
    totals,
  }, 200, request);
};

export const config = {
  path: '/api/admin/feedback-cohort',
};
