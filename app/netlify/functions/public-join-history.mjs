// /api/public-join-history → public, anonymized history of who has
// shown up since tracking began. Renders on the /community page as a
// numbered milestone timeline ("Visitor #1 arrived Apr 3", "Visitor
// #1,000 arrived May 8", ...). No UIDs, no emails, no per-user data —
// only per-day aggregate counts and the dates we crossed each
// round-number milestone.
//
// Two sources:
//   - metrics/daily/{YYYY-MM-DD}.count → anonymous visits per UTC day
//     (written by visitor-tick on every first-device tick)
//   - Firebase Auth listUsers() → every real sign-up (Google,
//     email/password, ...). This is the authoritative source — the
//     user_profiles Firestore collection only holds docs for users
//     who took a profile-writing action, so ~most Google sign-ins
//     never make it there. The Auth account is created on first
//     sign-in regardless. Falls back to user_profiles if the Admin
//     SDK is unavailable.
//
// Response shape (intentionally tiny — public surface, no PII leak):
//   {
//     since: 'YYYY-MM-DD',          // earliest tracked day, or null
//     now:   'YYYY-MM-DD',
//     totals: { visits, members, google },
//     milestones: [
//       { kind: 'visitor' | 'member', n: 1|10|100|..., date: 'YYYY-MM-DD' }
//     ]
//   }
//
// Cached 1 hour (public surface, staleness is fine and the cache also
// caps Firestore read amplification — every uncached call does ~MAX_DAYS
// metrics/daily gets + one Auth listUsers pagination).

import { getDb } from './lib/firestore.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCached, setCached } from './lib/admin-cache.mjs';

const CACHE_KEY = 'public-join-history';
const CACHE_TTL = 60 * 60 * 1000;  // 1 hour

const MAX_DAYS = 400;
const MAX_PROFILES = 20_000;

// Round-number milestones we surface. Walking forward in time, the
// first day the running cumulative crosses each threshold is the
// milestone date. The lists stay narrow on purpose — the rendered
// timeline reads as 6-10 punctuating moments, not a wall.
const VISITOR_THRESHOLDS = [1, 10, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
const MEMBER_THRESHOLDS  = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

function ymd(d){
  return d.toISOString().slice(0, 10);
}
function startOfDayUTC(ms){
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function dayKeysOldestFirst(n){
  const keys = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--){
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function emptyPayload(error){
  const out = {
    since: null,
    now: ymd(new Date()),
    totals: { visits: 0, members: 0, google: 0 },
    milestones: [],
  };
  if (error) out.error = String(error).slice(0, 400);
  return out;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const cached = getCached(CACHE_KEY);
  if (cached) return jsonResponse(cached, 200, request);

  let db;
  try { db = getDb(); }
  catch (err) {
    console.error('public-join-history getDb failed:', err.message);
    return jsonResponse(emptyPayload('getDb: ' + err.message), 200, request);
  }

  // ── 1. Per-day anonymous visits ───────────────────────────────
  // Isolated try-catch so a failure here (e.g. the
  // `metrics/daily/{date}` path being a 3-segment collection ref,
  // not a 2-segment doc ref — see lib note below) doesn't take
  // down the much more useful members read in section 2.
  //
  // TODO: visitor-tick.mjs writes daily counters at the same
  // 3-segment path and has been silently throwing for months;
  // its source string `metrics/daily/{date}` is not a valid
  // Firestore document path. Real fix: either flatten to a
  // 2-segment collection (`metrics_daily/{date}`) or nest into
  // a true subcollection (`metrics/daily/days/{date}`). Until
  // that lands, totalVisits stays at 0 here.
  const visitsByDay = Object.create(null);
  let firstVisitDay = null;
  let totalVisits = 0;
  try {
    const keys = dayKeysOldestFirst(MAX_DAYS);
    const refs = keys.map(k => db.doc(`metrics/daily/${k}`));
    const snaps = await Promise.all(refs.map(r => r.get().catch(() => null)));
    for (let i = 0; i < snaps.length; i++){
      const snap = snaps[i];
      if (snap && snap.exists){
        const c = snap.data().count;
        if (typeof c === 'number' && c > 0){
          visitsByDay[keys[i]] = c;
          totalVisits += c;
          if (!firstVisitDay) firstVisitDay = keys[i];
        }
      }
    }
  } catch (err) {
    console.warn('public-join-history daily-visit read failed:', err.message);
    // visit data stays empty; members section still runs.
  }

  try {

    // ── 2. Members per day, from Firebase Auth ────────────────────
    // The Auth user list is authoritative: every sign-in creates an
    // Auth account regardless of whether the user ever wrote a
    // user_profiles doc. Pure-anonymous accounts (no providerData)
    // are excluded — those are the visitor side of the page and
    // would double-count.
    //
    // metadata.creationTime is an ISO string set by Firebase on
    // account creation. We bucket by UTC day.
    //
    // Fallback: if the Admin SDK fails (credentials, network), fall
    // back to user_profiles scan with both data.createdAt and
    // Firestore doc.createTime as timestamp sources. Will undercount
    // (only users who saved a profile), but keeps the section from
    // going totally blank.
    const membersByDay = Object.create(null);
    let totalMembers = 0;
    let totalGoogleMembers = 0;
    let firstMemberDay = null;
    let memberSource = 'auth';

    let authUsers = null;
    try {
      authUsers = await listAllAuthUsers();
    } catch (err) {
      console.warn('public-join-history listAllAuthUsers failed, falling back to user_profiles:', err.message);
      memberSource = 'user_profiles_fallback';
    }

    if (authUsers) {
      for (const u of authUsers) {
        const providers = (u.providerData || []).map(p => p.providerId);
        if (providers.length === 0) continue; // pure anonymous
        const tStr = u.metadata && u.metadata.creationTime;
        const t = tStr ? Date.parse(tStr) : null;
        if (!t) continue;
        const k = ymd(new Date(startOfDayUTC(t)));
        membersByDay[k] = (membersByDay[k] || 0) + 1;
        totalMembers += 1;
        if (providers.includes('google.com')) totalGoogleMembers += 1;
        if (!firstMemberDay || k < firstMemberDay) firstMemberDay = k;
      }
    } else {
      // Fallback path — user_profiles scan.
      let skippedNoTs = 0;
      const profSnap = await db.collection('user_profiles')
        .limit(MAX_PROFILES)
        .get()
        .catch(err => {
          console.warn('public-join-history user_profiles fallback failed too:', err.message);
          return { docs: [] };
        });
      profSnap.docs.forEach(d => {
        const data = d.data();
        let t = null;
        if (data.createdAt && typeof data.createdAt.toMillis === 'function') t = data.createdAt.toMillis();
        else if (d.createTime && typeof d.createTime.toMillis === 'function') t = d.createTime.toMillis();
        if (!t) { skippedNoTs++; return; }
        const k = ymd(new Date(startOfDayUTC(t)));
        membersByDay[k] = (membersByDay[k] || 0) + 1;
        totalMembers += 1;
        if (!firstMemberDay || k < firstMemberDay) firstMemberDay = k;
      });
      if (skippedNoTs) console.warn('public-join-history fallback: skipped', skippedNoTs, 'profile docs with no timestamp');
    }

    // ── 3. Walk forward, emit milestone dates ─────────────────────
    // Iterate over each source's OWN sorted day-keys (not the shared
    // metrics/daily window) so historical members from before visit
    // tracking began aren't dropped. The earliest of any source
    // becomes the timeline's "since".
    const milestones = [];
    const visitDays  = Object.keys(visitsByDay).sort();
    const memberDays = Object.keys(membersByDay).sort();

    const candidates = [firstVisitDay, firstMemberDay].filter(Boolean).sort();
    const since = candidates[0] || ymd(new Date());

    let runVisits = 0;
    let nextV = 0;
    for (const k of visitDays){
      runVisits += visitsByDay[k] || 0;
      while (nextV < VISITOR_THRESHOLDS.length && runVisits >= VISITOR_THRESHOLDS[nextV]){
        milestones.push({ kind: 'visitor', n: VISITOR_THRESHOLDS[nextV], date: k });
        nextV++;
      }
    }

    let runMembers = 0;
    let nextM = 0;
    for (const k of memberDays){
      runMembers += membersByDay[k] || 0;
      while (nextM < MEMBER_THRESHOLDS.length && runMembers >= MEMBER_THRESHOLDS[nextM]){
        milestones.push({ kind: 'member', n: MEMBER_THRESHOLDS[nextM], date: k });
        nextM++;
      }
    }

    // Sort by date ascending; ties → visitor before member, smaller n first.
    milestones.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.kind !== b.kind) return a.kind === 'visitor' ? -1 : 1;
      return a.n - b.n;
    });

    const payload = {
      since,
      now: ymd(new Date()),
      totals: { visits: totalVisits, members: totalMembers, google: totalGoogleMembers },
      memberSource,
      milestones,
    };
    setCached(CACHE_KEY, payload, CACHE_TTL);
    return jsonResponse(payload, 200, request);
  } catch (err) {
    console.error('public-join-history failed:', err.message, err.stack);
    return jsonResponse(emptyPayload('outer: ' + err.message), 200, request);
  }
};

export const config = { path: '/api/public-join-history' };
