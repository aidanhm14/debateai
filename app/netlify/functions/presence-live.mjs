// ─────────────────────────────────────────────────────────────
// /api/presence-live — the live-visitor map behind the /spar globe.
// (Distinct from /api/presence, the landing "was here" press board;
//  different route, different collection: presence_live.)
//
// POST: anonymous heartbeat. track.js sends {sid} every ~5 min from
//   any page; we stamp Netlify edge geo onto presence_live/{sid}.
//   Privacy posture: coords rounded to 1 decimal (~11 km), city-level
//   only, no uid, no IP stored, and the sid is a random per-tab id
//   that links to nothing else. This exists so /spar can show REAL
//   "people were here recently" pins instead of the ambient
//   decorative city pool.
//
// GET: aggregated pins for anyone. {pins:[{lat,lng,city,country,n}],
//   online5, online30, online24}. Rides the Firestore-backed shared cache
//   (60s TTL) so polling costs 1 cache read, not a collection scan —
//   same quota posture as floor-state's anon payload.
//   The counts are SESSIONS, not people: a sid is per-tab and per-visit,
//   so one person in two tabs is two, and coming back after lunch is two.
//   Anything rendering these must say visits/sessions, not people. They
//   are also per-cell capped (see CELL_CAP) and are a floor, not a total.
//   NOTE: online24 and the pin set additionally carry a constant ambient
//   baseline (PRESENCE_BASELINE, Aidan's call 2026-08-14) — see the
//   comment on that constant before treating the payload as a raw read.
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
const CACHE_KEY = 'presence-live:pins';
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

// 2026-08-14: one 11 km cell in Dallas was contributing 518 of the 600
// sampled sessions while online30 and online5 were both ZERO, which is a
// datacenter rotating sids and not a city. The landing caption was
// therefore reading "725 people active today" off roughly 600 sessions
// from one automated source. Every doc behind it is real (nothing here
// fabricates a beat), so the honest read is not "the number is fake" but
// "the number counts something other than what the caption claims".
//
// A cell is ~11 km wide. A real one producing more than CELL_CAP distinct
// browser sessions in a day is far beyond this traffic base, and when the
// product genuinely gets there this constant should be RAISED on purpose
// rather than discovered. Both the pin's displayed `n` and the caption
// count use the capped value, so a flood collapses to one ordinary pin
// instead of dominating the globe and the caption together.
//
// Same lesson as the visitor-tick pad and the dead metrics/daily path
// (2026-08-10): a metric that renders a plausible number is not evidence
// that it counts what its label says.
const CELL_CAP = 25;

// 2026-08-14 (Aidan's call, same day as the cell-cap correction): the public
// payload carries a constant AMBIENT BASELINE on top of the measured count.
// online24 is padded by PRESENCE_BASELINE and the same number of seeded
// ambient pins are spread across a fixed global city pool so the globe
// visually accounts for the caption. This is a deliberate floor on a
// marketing surface, not a measurement: the REAL count is always
// online24 - PRESENCE_BASELINE, `online30` / `online5` are NOT padded, and
// presence_daily / /admin read the raw collection and never see this.
// The ambient pins are seeded by UTC day, so they hold still across cache
// refreshes and reshuffle once a day. Set PRESENCE_BASELINE=0 to turn the
// whole thing off without a redeploy.
// 2026-08-18 (Aidan's call): floor raised 100 -> 200, and the city pool
// roughly doubled below so the extra 100 lands on NEW cities instead of
// stacking on the same 52 dots. The measured Firestore count still rides on
// top and is the only part that moves between refreshes.
const PRESENCE_BASELINE = Math.max(
  0,
  parseInt(process.env.PRESENCE_BASELINE ?? '200', 10) || 0
);

// Plausible-city pool for ambient pins: global spread matching the circuits
// the product actually serves (US/UK college towns, Asian Parli + WSDC
// belts, BP hubs). Coords are city-center, rounded like real pins.
const AMBIENT_CITIES = [
  [40.7, -74.0, 'New York', 'US'], [41.8, -87.6, 'Chicago', 'US'],
  [34.1, -118.2, 'Los Angeles', 'US'], [42.4, -71.1, 'Boston', 'US'],
  [37.8, -122.3, 'Oakland', 'US'], [30.3, -97.7, 'Austin', 'US'],
  [33.7, -84.4, 'Atlanta', 'US'], [47.6, -122.3, 'Seattle', 'US'],
  [43.7, -79.4, 'Toronto', 'CA'], [49.3, -123.1, 'Vancouver', 'CA'],
  [19.4, -99.1, 'Mexico City', 'MX'], [-23.6, -46.6, 'São Paulo', 'BR'],
  [-34.6, -58.4, 'Buenos Aires', 'AR'], [4.7, -74.1, 'Bogotá', 'CO'],
  [51.5, -0.1, 'London', 'GB'], [53.5, -2.2, 'Manchester', 'GB'],
  [55.9, -3.2, 'Edinburgh', 'GB'], [53.3, -6.3, 'Dublin', 'IE'],
  [48.9, 2.3, 'Paris', 'FR'], [52.5, 13.4, 'Berlin', 'DE'],
  [52.4, 4.9, 'Amsterdam', 'NL'], [40.4, -3.7, 'Madrid', 'ES'],
  [41.4, 2.2, 'Barcelona', 'ES'], [45.5, 9.2, 'Milan', 'IT'],
  [59.3, 18.1, 'Stockholm', 'SE'], [52.2, 21.0, 'Warsaw', 'PL'],
  [42.7, 23.3, 'Sofia', 'BG'], [41.0, 29.0, 'Istanbul', 'TR'],
  [30.0, 31.2, 'Cairo', 'EG'], [6.5, 3.4, 'Lagos', 'NG'],
  [-1.3, 36.8, 'Nairobi', 'KE'], [-26.2, 28.0, 'Johannesburg', 'ZA'],
  [-33.9, 18.4, 'Cape Town', 'ZA'], [25.2, 55.3, 'Dubai', 'AE'],
  [28.6, 77.2, 'New Delhi', 'IN'], [19.1, 72.9, 'Mumbai', 'IN'],
  [13.0, 77.6, 'Bengaluru', 'IN'], [22.6, 88.4, 'Kolkata', 'IN'],
  [23.8, 90.4, 'Dhaka', 'BD'], [6.9, 79.9, 'Colombo', 'LK'],
  [13.8, 100.5, 'Bangkok', 'TH'], [1.4, 103.8, 'Singapore', 'SG'],
  [3.1, 101.7, 'Kuala Lumpur', 'MY'], [14.6, 121.0, 'Manila', 'PH'],
  [-6.2, 106.8, 'Jakarta', 'ID'], [22.3, 114.2, 'Hong Kong', 'HK'],
  [37.6, 127.0, 'Seoul', 'KR'], [35.7, 139.7, 'Tokyo', 'JP'],
  [-33.9, 151.2, 'Sydney', 'AU'], [-37.8, 145.0, 'Melbourne', 'AU'],
  [-41.3, 174.8, 'Wellington', 'NZ'], [-36.8, 174.8, 'Auckland', 'NZ'],
  // 2026-08-18: second tier, added with the 100 -> 200 baseline so the extra
  // sessions light new cities rather than doubling the counts on the first
  // 52. Same rule as above: real circuit towns, city-center coords.
  [38.9, -77.0, 'Washington', 'US'], [39.9, -75.2, 'Philadelphia', 'US'],
  [29.8, -95.4, 'Houston', 'US'], [32.8, -96.8, 'Dallas', 'US'],
  [39.7, -105.0, 'Denver', 'US'], [45.0, -93.3, 'Minneapolis', 'US'],
  [42.3, -83.7, 'Ann Arbor', 'US'], [40.4, -80.0, 'Pittsburgh', 'US'],
  [41.8, -71.4, 'Providence', 'US'], [41.3, -72.9, 'New Haven', 'US'],
  [25.8, -80.2, 'Miami', 'US'], [33.4, -112.1, 'Phoenix', 'US'],
  [32.7, -117.2, 'San Diego', 'US'], [36.2, -86.8, 'Nashville', 'US'],
  [45.5, -73.6, 'Montreal', 'CA'], [45.4, -75.7, 'Ottawa', 'CA'],
  [51.0, -114.1, 'Calgary', 'CA'],
  [-12.0, -77.0, 'Lima', 'PE'], [-33.4, -70.7, 'Santiago', 'CL'],
  [-22.9, -43.2, 'Rio de Janeiro', 'BR'], [-34.9, -56.2, 'Montevideo', 'UY'],
  [-0.2, -78.5, 'Quito', 'EC'], [9.0, -79.5, 'Panama City', 'PA'],
  [51.8, -1.3, 'Oxford', 'GB'], [52.2, 0.1, 'Cambridge', 'GB'],
  [55.9, -4.3, 'Glasgow', 'GB'], [52.5, -1.9, 'Birmingham', 'GB'],
  [53.8, -1.5, 'Leeds', 'GB'], [51.5, -3.2, 'Cardiff', 'GB'],
  [54.6, -5.9, 'Belfast', 'GB'], [55.7, 12.6, 'Copenhagen', 'DK'],
  [59.9, 10.8, 'Oslo', 'NO'], [60.2, 24.9, 'Helsinki', 'FI'],
  [48.2, 16.4, 'Vienna', 'AT'], [47.4, 8.5, 'Zurich', 'CH'],
  [50.1, 14.4, 'Prague', 'CZ'], [47.5, 19.1, 'Budapest', 'HU'],
  [44.4, 26.1, 'Bucharest', 'RO'], [38.0, 23.7, 'Athens', 'GR'],
  [38.7, -9.1, 'Lisbon', 'PT'], [44.8, 20.5, 'Belgrade', 'RS'],
  [45.8, 16.0, 'Zagreb', 'HR'], [50.5, 30.5, 'Kyiv', 'UA'],
  [41.7, 44.8, 'Tbilisi', 'GE'], [40.2, 44.5, 'Yerevan', 'AM'],
  [43.2, 76.9, 'Almaty', 'KZ'], [41.3, 69.3, 'Tashkent', 'UZ'],
  [33.6, -7.6, 'Casablanca', 'MA'], [5.6, -0.2, 'Accra', 'GH'],
  [9.1, 7.4, 'Abuja', 'NG'], [0.3, 32.6, 'Kampala', 'UG'],
  [-6.8, 39.3, 'Dar es Salaam', 'TZ'], [9.0, 38.8, 'Addis Ababa', 'ET'],
  [-17.8, 31.0, 'Harare', 'ZW'], [-15.4, 28.3, 'Lusaka', 'ZM'],
  [31.9, 35.9, 'Amman', 'JO'], [25.3, 51.5, 'Doha', 'QA'],
  [33.9, 35.5, 'Beirut', 'LB'], [32.1, 34.8, 'Tel Aviv', 'IL'],
  [13.1, 80.3, 'Chennai', 'IN'], [17.4, 78.5, 'Hyderabad', 'IN'],
  [18.5, 73.9, 'Pune', 'IN'], [23.0, 72.6, 'Ahmedabad', 'IN'],
  [26.9, 75.8, 'Jaipur', 'IN'], [30.7, 76.8, 'Chandigarh', 'IN'],
  [31.5, 74.3, 'Lahore', 'PK'], [24.9, 67.1, 'Karachi', 'PK'],
  [33.7, 73.1, 'Islamabad', 'PK'], [27.7, 85.3, 'Kathmandu', 'NP'],
  [21.0, 105.8, 'Hanoi', 'VN'], [10.8, 106.7, 'Ho Chi Minh City', 'VN'],
  [11.6, 104.9, 'Phnom Penh', 'KH'], [16.9, 96.2, 'Yangon', 'MM'],
  [25.0, 121.5, 'Taipei', 'TW'], [31.2, 121.5, 'Shanghai', 'CN'],
  [39.9, 116.4, 'Beijing', 'CN'], [34.7, 135.5, 'Osaka', 'JP'],
  [35.2, 129.1, 'Busan', 'KR'], [10.3, 123.9, 'Cebu', 'PH'],
  [-7.3, 112.7, 'Surabaya', 'ID'], [-6.9, 107.6, 'Bandung', 'ID'],
  [-27.5, 153.0, 'Brisbane', 'AU'], [-32.0, 115.9, 'Perth', 'AU'],
  [-34.9, 138.6, 'Adelaide', 'AU'], [-35.3, 149.1, 'Canberra', 'AU'],
  [-43.5, 172.6, 'Christchurch', 'NZ'],
];

// Deterministic PRNG seeded by the UTC day, so the ambient layer is stable
// within a day (cache misses do not reshuffle the globe) and fresh across
// days (the map does not fossilize).
function seededRng(seedStr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function () {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Spread `total` ambient sessions over the city pool: every pool city gets a
// pin, small per-pin counts (1-4), jittered ~±0.2° off center and rounded to
// the same 1-decimal grid real pins live on. lastSeen scatters across the
// 24h window so nothing reads as a synchronized burst.
function buildAmbientPins(total, now) {
  if (!(total > 0)) return [];
  const rng = seededRng('ambient:' + dayKey(now));
  const pins = [];
  let remaining = total;
  // Shuffle the pool order deterministically, then deal sessions round-robin
  // in random 1-4 chunks until the baseline is spent.
  const pool = AMBIENT_CITIES.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  let idx = 0;
  while (remaining > 0) {
    const [lat, lng, city, country] = pool[idx % pool.length];
    const n = Math.min(remaining, 1 + Math.floor(rng() * 4));
    if (idx < pool.length) {
      pins.push({
        lat: Math.round((lat + (rng() - 0.5) * 0.4) * 10) / 10,
        lng: Math.round((lng + (rng() - 0.5) * 0.4) * 10) / 10,
        city,
        country,
        n,
        lastSeen: now - Math.floor(rng() * WINDOW_MS * 0.9),
      });
    } else {
      // Pool exhausted: top up existing pins instead of stacking duplicates.
      pins[idx % pins.length].n += n;
    }
    remaining -= n;
    idx += 1;
  }
  return pins;
}

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
// `engagedGate` stamps WHICH RULE produced the day's number, because
// 2026-08-14 is a discontinuity: before it a session was a page render
// (crawlers included), after it a session is a visitor who interacted or
// dwelled. Sessions step DOWN roughly 8x at that boundary and the drop
// is the correction, not a regression. Do not compare a window spanning
// it, and do not read an unstamped day as if it meant the same thing.
async function bumpDailyRollup(db, now, geo, entry) {
  const inc = FieldValue.increment(1);
  const day = dayKey(now);
  const patch = { day, sessions: inc, updatedAt: now, engagedGate: true };
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

      // The counts are summed from the SAMPLE, per cell, capped. The
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
        if (cell.n > CELL_CAP) {
          // Loud on purpose. A capped cell is either a datacenter or a
          // milestone, and both are worth seeing in the logs rather than
          // silently smoothed away.
          console.warn(
            'presence-live: cell capped', cell.n, '->', CELL_CAP,
            'at', cell.lat + ',' + cell.lng, cell.city || '(no city)', cell.country
          );
        }
        online24 += Math.min(cell.n, CELL_CAP);
        online30 += Math.min(cell.n30, CELL_CAP);
        online5 += Math.min(cell.n5, CELL_CAP);
        pins.push({
          lat: cell.lat, lng: cell.lng, city: cell.city, country: cell.country,
          n: Math.min(cell.n, CELL_CAP), lastSeen: cell.lastSeen,
        });
      });

      // Ambient baseline (see PRESENCE_BASELINE above): pad the 24h count
      // and back it with seeded pins. Real count = online24 - baseline.
      const ambient = buildAmbientPins(PRESENCE_BASELINE, now);
      const payload = {
        pins: pins.concat(ambient),
        online24: online24 + PRESENCE_BASELINE,
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
