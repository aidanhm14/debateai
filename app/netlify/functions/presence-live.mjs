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
//   "people were here in the last 30 minutes" pins instead of the
//   ambient decorative city pool.
//
// GET: aggregated pins for anyone. {pins:[{lat,lng,city,country,n}],
//   online5, online30}. Rides the Firestore-backed shared cache
//   (60s TTL) so polling costs 1 cache read, not a collection scan —
//   same quota posture as floor-state's anon payload.
// ─────────────────────────────────────────────────────────────
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared } from './lib/admin-cache.mjs';

const WINDOW_MS = 30 * 60 * 1000; // "live" = seen in the last 30 min
const FIVE_MIN = 5 * 60 * 1000;
const CACHE_KEY = 'presence-live:pins';
const CACHE_TTL_MS = 60_000;
const MAX_DOCS = 300;
const STALE_MS = 48 * 60 * 60 * 1000; // opportunistic cleanup horizon

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
      await db.collection('presence_live').doc(sid).set(
        {
          // 1-decimal rounding ≈ 11 km — enough to place a city dot,
          // deliberately not enough to place a person.
          lat: Math.round(geo.lat * 10) / 10,
          lng: Math.round(geo.lng * 10) / 10,
          city: String(geo.city).slice(0, 60),
          country: String(geo.country).slice(0, 40),
          lastSeen: now,
        },
        { merge: true }
      );

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

      const snap = await db
        .collection('presence_live')
        .where('lastSeen', '>=', now - WINDOW_MS)
        .limit(MAX_DOCS)
        .get();

      const byCell = new Map();
      let online5 = 0;
      snap.docs.forEach((d) => {
        const p = d.data();
        if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
        if (now - p.lastSeen <= FIVE_MIN) online5 += 1;
        const key = p.lat + ',' + p.lng;
        const cell = byCell.get(key) || { lat: p.lat, lng: p.lng, city: p.city || '', country: p.country || '', n: 0 };
        cell.n += 1;
        if (!cell.city && p.city) cell.city = p.city;
        byCell.set(key, cell);
      });

      const payload = {
        pins: Array.from(byCell.values()),
        online30: snap.size,
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
