// /api/admin/visitors  →  Anonymous visitor traffic. The one number the
// rest of /admin deliberately does not have.
//
// Why this exists. Every other panel on /admin is uid-keyed, because
// track.js treats an anonymous visitor as signed-out on purpose
// (`currentUser = user && !user.isAnonymous ? user : null`) and skips
// session_start / page_view / heartbeat for them. That was the
// 2026-05-18 credit-burn call and it still holds: opening lifecycle
// events to anon traffic would have added ~17K /api/log-event
// invocations a month against the Netlify 125K ceiling.
//
// The consequence is that /admin answers "who is signed in" while the
// obvious question is "how many people looked at the site." Firebase
// Auth doesn't answer it either: the (anonymous) rows in the Auth
// console are minted by signInAnonymously(), which only runs on /spar,
// /live, /live-round and the Spar-live toggle. Those rows count arena
// visits, not visits.
//
// So this reads the presence pipeline instead, which has always been
// anon-inclusive:
//   presence_live/{sid}          rolling snapshot, one doc per tab
//   presence_daily/{YYYY-MM-DD}  per-day counters, written by the
//                                first beat of each session
//
// Read cost: 1 collection scan capped at MAX_LIVE docs for "now", plus
// up to DAYS docs for the trend. Cached 5 min.
//
// Units matter and the dashboard says so: these are SESSIONS (per tab,
// per sessionStorage lifetime), not people, and only from pages that
// load track.js. Nothing here dedupes a returning visitor.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, getStaleShared, wantsFresh } from './lib/admin-cache.mjs';

const CACHE_KEY = 'admin:visitors';
const CACHE_TTL_MS = 5 * 60 * 1000;
const LIVE_WINDOW_MS = 30 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;
const MAX_LIVE = 300; // same ceiling presence-live's own GET uses
const DAYS = 30;

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Inverse of entryKey() in presence-live.mjs.
function unkey(k) {
  return k === '~root' ? '/' : String(k).replace(/~/g, '/');
}

function topN(map, n) {
  return Object.entries(map || {})
    .map(([key, count]) => ({ key, count: Number(count) || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { db } = auth;

  if (!wantsFresh(request)) {
    const cached = await getCachedShared(CACHE_KEY).catch(() => null);
    if (cached) return jsonResponse(cached, 200, request);
  }

  try {
    const now = Date.now();

    // Build the list of day ids up front so missing days render as 0
    // instead of silently collapsing the trend.
    const dayIds = [];
    for (let i = DAYS - 1; i >= 0; i--) dayIds.push(dayKey(now - i * 86400000));

    const [liveSnap, dayDocs] = await Promise.all([
      db.collection('presence_live').where('lastSeen', '>=', now - LIVE_WINDOW_MS).limit(MAX_LIVE).get(),
      db.getAll(...dayIds.map((d) => db.collection('presence_daily').doc(d))),
    ]);

    // ── Right now, from the rolling snapshot ────────────────────────
    let online5 = 0;
    const liveCities = {};
    liveSnap.docs.forEach((d) => {
      const p = d.data() || {};
      if (now - (Number(p.lastSeen) || 0) <= FIVE_MIN) online5 += 1;
      const label = [p.city, p.country].filter(Boolean).join(', ') || 'unknown';
      liveCities[label] = (liveCities[label] || 0) + 1;
    });

    // ── The trend, from the daily rollup ────────────────────────────
    const byCountry = {};
    const byEntry = {};
    const series = dayDocs.map((doc, i) => {
      const d = doc.exists ? doc.data() || {} : {};
      const sessions = Number(d.sessions) || 0;
      Object.entries(d.byCountry || {}).forEach(([k, v]) => {
        byCountry[k] = (byCountry[k] || 0) + (Number(v) || 0);
      });
      Object.entries(d.byEntry || {}).forEach(([k, v]) => {
        byEntry[k] = (byEntry[k] || 0) + (Number(v) || 0);
      });
      return { day: dayIds[i], sessions, tracked: doc.exists };
    });

    const sum = (n) => series.slice(-n).reduce((a, r) => a + r.sessions, 0);
    const trackedDays = series.filter((r) => r.tracked).length;

    const result = {
      online5,
      online30: liveSnap.size,
      liveSampled: liveSnap.size >= MAX_LIVE,
      today: series[series.length - 1] ? series[series.length - 1].sessions : 0,
      d7: sum(7),
      d30: sum(30),
      prev7: series.slice(-14, -7).reduce((a, r) => a + r.sessions, 0),
      series,
      trackedDays,
      topCountries: topN(byCountry, 8),
      topEntries: topN(byEntry, 8).map((r) => ({ ...r, key: unkey(r.key) })),
      liveCities: topN(liveCities, 6),
      now,
    };

    await setCachedShared(CACHE_KEY, result, CACHE_TTL_MS).catch(() => {});
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('admin-visitors error:', err);
    const stale = await getStaleShared(CACHE_KEY).catch(() => null);
    if (stale && stale.value) {
      return jsonResponse({ ...stale.value, _stale: true, _staleAgeMs: stale.ageMs }, 200, request);
    }
    return errorResponse('Failed to load visitors: ' + (err.message || 'unknown'), 500, request);
  }
};

export const config = { path: '/api/admin/visitors' };
