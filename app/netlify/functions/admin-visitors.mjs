// /api/admin/visitors  →  Anonymous visitor traffic. The one number the
// rest of /admin deliberately does not have.
//
// Why this exists. Every other panel on /admin is uid-keyed, and until
// 2026-08-14 track.js skipped session_start / page_view entirely for
// anonymous visitors (the 2026-05-18 credit-burn call), so this was the
// only anon-inclusive number on the dashboard. Firebase Auth doesn't
// answer it either: the (anonymous) rows in the Auth console are minted
// by signInAnonymously(), which only runs on /spar, /live, /live-round
// and the Spar-live toggle. Those rows count arena visits, not visits.
//
// **That suppression was REVERSED on 2026-08-14.** Anon now writes
// session_start / page_view / session_end, so `events` carries a second,
// independent record of the same traffic. The heartbeat stays signed-in
// only, which is the part the credit audit was actually about. The two
// pipelines are NOT interchangeable and this endpoint is still the right
// one for the Visitors card:
//
//   presence_daily (here)  gated to HUMANS. Since gate v2 on 2026-08-27,
//                          the first beat requires browser-trusted input;
//                          server UA and rate gates run before the write.
//                          Undercounts deliberately.
//   events page_view       UNGATED. Every visit, crawler included, with
//                          `automated` and `engaged` flags so a reader
//                          filters rather than the client dropping.
//
// A count of people reads this. A count of visits reads `events`. Don't
// reconcile them and don't "fix" a gap between them; the gap is the gate.
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
//
// That last caveat used to be a real hole and is now closed: on
// 2026-08-14, 60 of 114 public pages carried no track.js at all, so a
// visitor landing on /index, /privacy, /terms, /report, /floor, /predict
// or the SEO cluster produced no beat and no event. `topbar.js` does NOT
// pull track.js, which is why "most pages have the topbar" read as
// coverage and was not. Every public page carries the tag now; admin,
// og-image, offline and _more-preview are excluded on purpose.

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, getStaleShared, wantsFresh } from './lib/admin-cache.mjs';
import { isSuspiciousPresenceCell } from './lib/presence-quality.mjs';

const CACHE_KEY = 'admin:visitors:trusted-v1';
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
    let online30 = 0;
    let suppressedLiveSessions = 0;
    const liveCities = {};
    const liveCells = new Map();
    liveSnap.docs.forEach((d) => {
      const p = d.data() || {};
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      const key = p.lat + ',' + p.lng;
      const cell = liveCells.get(key) || {
        city: p.city || '', country: p.country || '', n: 0, n30: 0, n5: 0,
      };
      cell.n += 1;
      cell.n30 += 1;
      if (now - (Number(p.lastSeen) || 0) <= FIVE_MIN) cell.n5 += 1;
      if (!cell.city && p.city) cell.city = p.city;
      liveCells.set(key, cell);
    });
    liveCells.forEach((cell) => {
      if (isSuspiciousPresenceCell(cell)) {
        suppressedLiveSessions += cell.n;
        return;
      }
      online5 += cell.n5;
      online30 += cell.n30;
      const label = [cell.city, cell.country].filter(Boolean).join(', ') || 'unknown';
      liveCities[label] = (liveCities[label] || 0) + cell.n;
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
      online30,
      suppressedLiveSessions,
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
