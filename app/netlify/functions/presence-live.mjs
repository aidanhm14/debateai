// ─────────────────────────────────────────────────────────────
// /api/presence-live — the live-visitor map behind the /spar globe.
// (Distinct from /api/presence, the landing "was here" press board;
//  different route, different collection: presence_live.)
//
// POST: anonymous heartbeat. track.js sends {sid} every ~5 min from
//   any page; we stamp Netlify edge geo onto presence_live/{sid}.
//   Privacy posture: coords rounded to 1 decimal (~11 km), city-level
//   only, no uid, no IP stored in the presence collections, and the sid
//   is a random per-tab id that links to nothing else. The rate limiter
//   retains only an expiring IP bucket. This exists so /spar can show
//   measured recent-visit locations.
//
// GET: aggregated pins for anyone. {pins:[{lat,lng,city,country,n}],
//   online5, online30, online24}. Rides the Firestore-backed shared cache
//   (5-minute TTL) so polling costs 1 cache read, not a collection scan —
//   same quota posture as floor-state's anon payload.
//   The counts are SESSIONS, not people: a sid is per-tab and per-visit,
//   so one person in two tabs is two, and coming back after lunch is two.
//   Anything rendering these must say visits/sessions, not people.
//   Suspicious cell bursts are excluded, so these are a conservative floor,
//   not a census. Pin `n` is always 1: public geography names a place, never
//   publishes an exact city ranking. Counts contain no synthetic baseline.
//
// DAILY ROLLUP (added 2026-07-28). presence_live is a rolling snapshot:
//   one doc per tab, overwritten on every beat, swept at 48h. That
//   answers "who is here now" and nothing about last Tuesday. Firebase
//   Auth is not the answer either — anonymous accounts only exist on
//   the three pages that mint one, so the Auth user list counts arena
//   visits, not site visits. So the FIRST beat of each session also
//   increments presence_daily/{YYYY-MM-DD}: total sessions, sessions by
//   country, and sessions by entry page. That is ~1 extra write per
//   session (not per beat), and it is the only place anonymous traffic
//   accumulates over time. /api/admin/visitors reads it.
// ─────────────────────────────────────────────────────────────
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared } from './lib/admin-cache.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';
import {
  isAutomatedUserAgent,
  isSuspiciousPresenceCell,
  publicPresencePin,
} from './lib/presence-quality.mjs';

// 2026-08-01: the pin window widened from 30 minutes to 24 hours. On this
// traffic base a 30-min window painted an almost-empty globe most of the
// day, which reads as a dead product rather than an honest one. A day is
// still a real, defensible "recently" (every pin is a real visit), and it
// is inside the 48h sweep horizon so no extra retention is needed. The
// 5-min and 30-min counts are still computed and returned for anything
// that wants the narrower read.
const WINDOW_MS = 24 * 60 * 60 * 1000; // pins = seen in the last 24 hours
const THIRTY_MIN = 30 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;
// Versioned so a deploy cannot serve a five-minute cached payload built by
// the retired padded/burst-permissive code.
const CACHE_KEY = 'presence-live:pins:trusted-v1';
// 2026-08-14: 60s -> 5min. A cache MISS scans up to MAX_DOCS documents, so
// the read bill is (misses per day) x (docs in the 24h window). At a 60s TTL
// with a bot inflating the window to ~750 docs that was on the order of
// 860K reads/day for an ambient globe, which is the same drain shape the
// 2026-05-18 credit audit cut. Five minutes costs nothing anyone can see:
// a 24h pin window does not meaningfully move minute to minute. The narrow
// online5 / online30 counts ride the same cache and are therefore up to
// 5 minutes stale, which is acceptable because nothing sells liveness off
// them (the /spar note prefers online24 and falls back to online30).
const CACHE_TTL_MS = 300_000;
const MAX_DOCS = 600;
const STALE_MS = 48 * 60 * 60 * 1000; // opportunistic cleanup horizon

// Layered IP budgets make direct sid rotation expensive without persisting an
// address in Firestore. Upstash shares the budget across instances when it is
// configured; otherwise the helper degrades to an in-memory instance budget.
// Limits are deliberately generous for same-network households and classrooms;
// the independent cell filter is the public-read backstop.
const POST_LIMITS = [
  { window: 10 * 60 * 1000, max: 30, label: '10m' },
  { window: 60 * 60 * 1000, max: 120, label: 'hour' },
];

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10); // UTC, matches the crons
}

// Entry path → a Firestore-safe map key. Firestore field names can't
// hold '/', so slashes become '~'. Anything that isn't a plain path
// is dropped rather than sanitized into something misleading.
function entryKey(p) {
  if (typeof p !== 'string' || !p) return '';
  let s = p.split('?')[0].split('#')[0].slice(0, 60);
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  if (!/^\/[A-Za-z0-9/_-]*$/.test(s)) return '';
  return s === '/' ? '~root' : s.replace(/\//g, '~');
}

// One increment per new session. Bounded: `sessions` is a counter,
// byCountry maxes out at the number of ISO codes, and byEntry only
// ever holds real site paths.
//
// `gateVersion` stamps WHICH RULE produced the day's number. v1 accepted an
// interaction or 20 seconds of visible dwell. v2, from 2026-08-27, requires
// browser-trusted interaction and adds server automation/burst guards. The
// step down is a correction; do not compare a window spanning either gate.
async function bumpDailyRollup(db, now, geo, entry) {
  const inc = FieldValue.increment(1);
  const day = dayKey(now);
  const patch = { day, sessions: inc, updatedAt: now, engagedGate: true, gateVersion: 2 };
  const cc = /^[A-Za-z]{2}$/.test(geo.country || '') ? geo.country.toUpperCase() : '';
  if (cc) patch.byCountry = { [cc]: inc };
  if (entry) patch.byEntry = { [entry]: inc };
  await db.collection('presence_daily').doc(day).set(patch, { merge: true });
}

function readGeo(request, context) {
  // Netlify v2 functions expose parsed geo on context; the x-nf-geo
  // header is the same blob for local/edge fallback.
  const g = context && context.geo;
  if (g && typeof g.latitude === 'number') {
    return {
      lat: g.latitude,
      lng: g.longitude,
      city: g.city || '',
      country: (g.country && (g.country.code || g.country.name)) || '',
    };
  }
  const blob = request.headers.get('x-nf-geo');
  if (!blob) return null;
  try {
    const d = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'));
    if (typeof d.latitude !== 'number') return null;
    return {
      lat: d.latitude,
      lng: d.longitude,
      city: d.city || '',
      country: (d.country && (d.country.code || d.country.name)) || '',
    };
  } catch (_) {
    return null;
  }
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  const db = getDb();
  const now = Date.now();

  if (request.method === 'POST') {
    let body = null;
    try {
      body = await request.json();
    } catch (_) {
      return errorResponse('Bad body', 400, request);
    }
    const sid = typeof body?.sid === 'string' ? body.sid : '';
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(sid)) return errorResponse('Bad sid', 400, request);

    // Client interaction is a useful signal, not authentication. Refuse
    // obvious renderers here and put every source through a shared IP budget
    // before a rotated sid can become a Firestore row. IPs live only in the
    // expiring rate-limit bucket; presence_live still stores none.
    const userAgent = request.headers.get('user-agent') || '';
    if (isAutomatedUserAgent(userAgent)) {
      return jsonResponse({ ok: true, recorded: false, reason: 'automated' }, 200, request);
    }
    const rate = await checkLayers('presence-live', 'ip_' + callerIp(request), POST_LIMITS);
    if (!rate.ok) {
      return jsonResponse({ ok: true, recorded: false, reason: 'rate-limit' }, 200, request);
    }

    const geo = readGeo(request, context);
    if (!geo) return jsonResponse({ ok: true, geo: false }, 200, request); // dev / no edge geo: accept quietly

    try {
      const ref = db.collection('presence_live').doc(sid);
      const fields = {
        // 1-decimal rounding ≈ 11 km — enough to place a city dot,
        // deliberately not enough to place a person.
        lat: Math.round(geo.lat * 10) / 10,
        lng: Math.round(geo.lng * 10) / 10,
        city: String(geo.city).slice(0, 60),
        country: String(geo.country).slice(0, 40),
        lastSeen: now,
      };

      await ref.set(fields, { merge: true });

      // First-beat detection is the CLIENT's job, via body.first, because
      // both server-side alternatives cost something per beat:
      //   - ref.get() before writing = one extra Firestore READ on every
      //     beat, which is exactly the drain the 2026-05-18 audit cut.
      //   - ref.create() and treat the rejection as "seen before" = one
      //     extra failed COMMIT on every repeat beat, i.e. two writes per
      //     beat instead of one, forever, to learn one bit.
      // (The create() version shipped on 2026-07-28 and was replaced the
      // same day on the write-cost argument. A commit message at the time
      // claimed it also HUNG, on the theory that the SDK retried
      // ALREADY_EXISTS with backoff. That was wrong: Commit's retry set in
      // @google-cloud/firestore 7.x is ["RESOURCE_EXHAUSTED","UNAVAILABLE"]
      // only, so create() on an existing doc rejects immediately. The 504s
      // that prompted it were a local proxy failing bursts of POSTs over a
      // reused connection, and they reproduced against the fixed code too.
      // Don't "restore" create() on the grounds that the hang was fake.)
      //
      // track.js already knows: its `_da_plast` sessionStorage key is
      // absent on the first beat of a session, the same lifecycle as the
      // sid itself. A hostile client could inflate the daily count by
      // lying, but it could equally just rotate sids, so this trusts no
      // more than the counter already did.
      if (body?.first === true) {
        // Never let the rollup break the beat — the globe matters more
        // than the counter.
        try {
          await bumpDailyRollup(db, now, geo, entryKey(body?.path));
        } catch (e) {
          console.error('presence_daily rollup failed:', e.message);
        }
      }

      // Opportunistic cleanup: ~5% of beats sweep a small batch of
      // long-dead docs so the collection never needs a TTL policy.
      if (Math.random() < 0.05) {
        const stale = await db
          .collection('presence_live')
          .where('lastSeen', '<', now - STALE_MS)
          .limit(25)
          .get();
        if (!stale.empty) {
          const batch = db.batch();
          stale.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      return jsonResponse({ ok: true }, 200, request);
    } catch (err) {
      console.error('presence-live write failed:', err.message);
      return errorResponse('Write failed', 500, request);
    }
  }

  if (request.method === 'GET') {
    try {
      const cached = await getCachedShared(CACHE_KEY).catch(() => null);
      if (cached) return jsonResponse(cached, 200, request);

      // The counts are summed from the SAMPLE after cell quarantine. The
      // `.count()` aggregate this used to report is gone on purpose: it
      // returns one number for the whole window with no way to see which
      // cell it came from, so it cannot be filtered and it was the number
      // carrying the bot. Its replacement is a FLOOR bounded by MAX_DOCS,
      // which is the safe direction to be wrong in for a figure that gets
      // read aloud on the landing page.
      //
      // Docs come back ordered by document id, and a sid is random, so the
      // sample is roughly uniform over sessions. Do not add an orderBy on
      // lastSeen to "get the freshest" — a beating bot is always freshest,
      // so that biases the sample toward exactly what this is filtering.
      const snap = await db
        .collection('presence_live')
        .where('lastSeen', '>=', now - WINDOW_MS)
        .limit(MAX_DOCS)
        .get();

      const byCell = new Map();
      snap.docs.forEach((d) => {
        const p = d.data();
        if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
        const key = p.lat + ',' + p.lng;
        const cell = byCell.get(key) || {
          lat: p.lat, lng: p.lng, city: p.city || '', country: p.country || '',
          n: 0, n30: 0, n5: 0, lastSeen: 0,
        };
        cell.n += 1;
        if (now - p.lastSeen <= THIRTY_MIN) cell.n30 += 1;
        if (now - p.lastSeen <= FIVE_MIN) cell.n5 += 1;
        cell.lastSeen = Math.max(cell.lastSeen || 0, Number(p.lastSeen) || 0);
        if (!cell.city && p.city) cell.city = p.city;
        byCell.set(key, cell);
      });

      let online24 = 0;
      let online30 = 0;
      let online5 = 0;
      const pins = [];
      Array.from(byCell.values()).forEach((cell) => {
        if (isSuspiciousPresenceCell(cell)) {
          // Loud on purpose. The raw rows stay available for forensics, but
          // a synchronized cell cannot become a public bubble or count.
          console.warn(
            'presence-live: cell suppressed', cell.n, 'sessions',
            cell.n30, 'in 30m', cell.n5, 'in 5m',
            'at', cell.lat + ',' + cell.lng, cell.city || '(no city)', cell.country
          );
          return;
        }
        online24 += cell.n;
        online30 += cell.n30;
        online5 += cell.n5;
        const pin = publicPresencePin(cell);
        if (pin) pins.push(pin);
      });

      const payload = {
        pins,
        online24,
        online30,
        online5,
      };
      await setCachedShared(CACHE_KEY, payload, CACHE_TTL_MS).catch(() => {});
      return jsonResponse(payload, 200, request);
    } catch (err) {
      console.error('presence-live read failed:', err.message);
      return errorResponse('Read failed', 500, request);
    }
  }

  return errorResponse('Method not allowed', 405, request);
};

export const config = {
  path: '/api/presence-live',
};
