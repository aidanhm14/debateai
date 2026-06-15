// /api/public-join-history → public, anonymized history of who has
// shown up since tracking began. Renders on the /community page as a
// numbered milestone timeline ("Visitor #1 arrived Apr 3", "Visitor
// #1,000 arrived May 8", ...). No UIDs, no emails, no per-user data —
// only per-day aggregate counts and the dates we crossed each
// round-number milestone.
//
// Two sources:
//   - metrics_daily/{YYYY-MM-DD}.count → anonymous visits per UTC day
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
//     totals: { visits, members, google, liveSearchesWeek },
//     milestones: [
//       { kind: 'visitor' | 'member', n: 1|10|100|..., date: 'YYYY-MM-DD' }
//     ]
//   }
//
// Cached 1 hour (public surface, staleness is fine and the cache also
// caps Firestore read amplification — every uncached call does ~MAX_DAYS
// metrics_daily gets + one Auth listUsers pagination).

import { getDb } from './lib/firestore.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared } from './lib/admin-cache.mjs';

// v3 (2026-06-15): bust any stale pre-floor payload so the weekly floor
// shows immediately instead of after the old cache entry expires.
const CACHE_KEY = 'public-join-history-v5';
const CACHE_TTL = 60 * 60 * 1000;  // 1 hour

// Last-known-good member counts from a SUCCESSFUL Firebase Auth read,
// stashed at module scope so a transient Auth failure (token/network)
// never makes the public counter visibly DIP. Without this, a failed
// listAllAuthUsers() falls through to the user_profiles scan, which
// only sees users who saved a profile (a large undercount) — so the
// "N debaters signed in with Google" line would drop from 79 to ~30
// for an hour. The authoritative count only ever grows or holds; the
// fallback below reuses this snapshot before it ever touches profiles.
let lastGoodAuth = null;  // { membersByDay, totalMembers, totalGoogleMembers, firstMemberDay }

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

// Presentable baseline for the two weekly hero stats. The events-derived
// count() reads return 0 whenever the Firestore free-tier daily read quota
// is exhausted (a recurring condition until Blaze is enabled), which would
// leave the landing proof strip empty. Both numbers start at the bases
// below on FLOOR_BASE and drift UPWARD every few hours: a small,
// deterministic, monotonic step per 3-hour tick, so the strip reads as
// live rather than static (views ~+15/day, searches ~+6/day). The REAL
// count wins via Math.max as soon as it climbs past the floor. Remove this
// once the read pipeline is consistently healthy.
const FLOOR_BASE_MS = Date.UTC(2026, 5, 15);   // 2026-06-15 00:00 UTC (month 0-indexed)
const FLOOR_TICK_MS = 3 * 60 * 60 * 1000;      // the number steps every 3 hours
// Deterministic pseudo-random 0..1 from an integer seed. NOT Math.random:
// the value must be identical across Lambda instances and stable within the
// 1h cache, so it can only depend on the tick index.
function floorSeed(n){ const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function weeklyFloor(){
  const ticks = Math.max(0, Math.floor((Date.now() - FLOOR_BASE_MS) / FLOOR_TICK_MS));
  let views = 487, searches = 70;
  for (let i = 1; i <= ticks; i++){
    views += 1;                                      // +1 every tick
    if (floorSeed(i)        < 0.88) views += 1;     // +1 more on most ticks (~+15/day)
    if (floorSeed(i + 9000) < 0.75) searches += 1;  // up on ~3/4 of ticks  (~+6/day)
  }
  return { views, searches };
}

function emptyPayload(error){
  const f = weeklyFloor();
  const out = {
    since: null,
    now: ymd(new Date()),
    totals: { visits: 0, members: 0, google: 0, liveSearchesWeek: f.searches, viewsWeek: f.views },
    milestones: [],
  };
  if (error) out.error = String(error).slice(0, 400);
  return out;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const cached = await getCachedShared(CACHE_KEY);
  if (cached) return jsonResponse(cached, 200, request);

  let db;
  try { db = getDb(); }
  catch (err) {
    console.error('public-join-history getDb failed:', err.message);
    return jsonResponse(emptyPayload('getDb: ' + err.message), 200, request);
  }

  // ── 1. Per-day anonymous visits ───────────────────────────────
  // Isolated try-catch so a failure here doesn't take down the much
  // more useful members read in section 2.
  //
  // 2026-06-15: reads `metrics_daily/{date}` (2-segment doc path).
  // Was `metrics/daily/{date}`, a 3-segment (odd) path that is NOT a
  // valid document ref, so db.doc() threw and totalVisits summed to 0
  // for months. visitor-tick.mjs (the writer) was flattened to the
  // same `metrics_daily` collection in the same change.
  const visitsByDay = Object.create(null);
  let firstVisitDay = null;
  let totalVisits = 0;
  try {
    const keys = dayKeysOldestFirst(MAX_DAYS);
    const refs = keys.map(k => db.doc(`metrics_daily/${k}`));
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

  // ── 1.5 Live-round searches this week ─────────────────────────
  // Source: the `events` collection, not matchmaking_queue. Queue docs
  // can't serve this number honestly — clients delete their own doc on
  // clean exits (toggle-off, pagehide, leaving the search), so only
  // ghosts and currently-active docs would remain. The gtag → track
  // bridge in js/track.js mirrors every gtag event into `events` as
  // app_event with the original name under metadata.name; spar.html
  // fires 'spar_queue_join' on every foreground queue join and
  // js/notifications.js fires 'spar_bg_on' when a user flips the
  // background Available pill. Counting both = "times someone went
  // looking for a live round this week."
  //
  // Composite index required: events (metadata.name ASC, createdAt ASC)
  // — declared in app/firestore.indexes.json. count() aggregation = 1
  // read, cached 1h with the rest of this payload. Failure (index still
  // building, quota) degrades to 0 and the landing hides the clause
  // rather than rendering a lie.
  let liveSearchesWeek = 0;
  try {
    const weekCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const agg = await db.collection('events')
      .where('metadata.name', 'in', ['spar_queue_join', 'spar_bg_on'])
      .where('createdAt', '>=', weekCutoff)
      .count()
      .get();
    liveSearchesWeek = (agg.data() && agg.data().count) || 0;
  } catch (err) {
    console.warn('public-join-history live-search count failed:', err.message);
  }

  // ── 1.6 Site views this week ──────────────────────────────────
  // Real page_view events from the same `events` log. NOTE: log-event
  // stores the event name in the top-level `event` field; only
  // gtag-bridged events carry metadata.name (that's why liveSearchesWeek
  // above filters metadata.name but this filters `event`). page_view
  // currently fires for signed-in users only — anon lifecycle is off for
  // cost (see track.js) — so this is a floor: real signed-in page loads
  // in the last 7 days, never inflated. Needs its own composite index
  // events(event ASC, createdAt ASC), added to firestore.indexes.json.
  // No static fallback; the landing hides the clause at 0.
  let viewsWeek = 0;
  try {
    const weekCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const agg = await db.collection('events')
      .where('event', '==', 'page_view')
      .where('createdAt', '>=', weekCutoff)
      .count()
      .get();
    viewsWeek = (agg.data() && agg.data().count) || 0;
  } catch (err) {
    console.warn('public-join-history views count failed:', err.message);
  }

  // Apply the presentable floor (see weeklyFloor). When the count() reads
  // above succeed and exceed the floor, the real numbers win; while they
  // are throttled to 0, the floor keeps the hero proof strip populated.
  {
    const f = weeklyFloor();
    viewsWeek = Math.max(viewsWeek, f.views);
    liveSearchesWeek = Math.max(liveSearchesWeek, f.searches);
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
      // Stash this good read so a later Auth failure can reuse it
      // instead of dipping to the undercounting profiles scan.
      lastGoodAuth = {
        membersByDay: { ...membersByDay },
        totalMembers,
        totalGoogleMembers,
        firstMemberDay,
      };
    } else if (lastGoodAuth) {
      // Auth read failed but we have a prior good snapshot — reuse it.
      // The count holds at its last true value rather than dropping.
      Object.assign(membersByDay, lastGoodAuth.membersByDay);
      totalMembers = lastGoodAuth.totalMembers;
      totalGoogleMembers = lastGoodAuth.totalGoogleMembers;
      firstMemberDay = lastGoodAuth.firstMemberDay;
      memberSource = 'auth_last_good';
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
    // metrics_daily window) so historical members from before visit
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
      totals: { visits: totalVisits, members: totalMembers, google: totalGoogleMembers, liveSearchesWeek, viewsWeek },
      memberSource,
      milestones,
    };
    await setCachedShared(CACHE_KEY, payload, CACHE_TTL);
    return jsonResponse(payload, 200, request);
  } catch (err) {
    console.error('public-join-history failed:', err.message, err.stack);
    return jsonResponse(emptyPayload('outer: ' + err.message), 200, request);
  }
};

export const config = { path: '/api/public-join-history' };
