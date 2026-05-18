// /api/admin/realtime → live event tail + concurrent-users count.
//
// Powers the "right now" panel on /admin. Returns:
//   - The last N events across all users (default 60), with display name
//     resolved per uid.
//   - Distinct uids seen in the last 5 / 30 minutes ("online" and
//     "active in the last half hour").
//   - Distinct uids with a session_start in the last 24h.
//   - A 60-bucket per-minute spark of the last hour's event volume.
//
// Auth gate: requireAdmin (shared with all /api/admin/* routes).

import { requireAdmin } from './lib/admin-auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const MAX_TAIL = 80;
const MAX_DOCS = 1200;

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { db } = auth;

  const url = new URL(request.url);
  const tailLimit = Math.max(10, Math.min(MAX_TAIL, parseInt(url.searchParams.get('limit') || '60', 10)));

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Pull the most recent hour. We aggregate the buckets / online
    // counts from the full hour, and surface the top `tailLimit` for
    // the live feed.
    const snap = await db.collection('events')
      .where('createdAt', '>=', oneHourAgo)
      .orderBy('createdAt', 'desc')
      .limit(MAX_DOCS)
      .get();

    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;
    const THIRTY_MIN = 30 * 60 * 1000;

    const buckets = new Array(60).fill(0);
    const onlineUids = new Set();
    const recentUids = new Set();
    const hourUids = new Set();
    const eventTypeCounts = {};

    const raw = [];
    for (const d of snap.docs) {
      const data = d.data();
      const ts = data.createdAt && data.createdAt.toMillis
        ? data.createdAt.toMillis()
        : (data.createdAt && data.createdAt.seconds ? data.createdAt.seconds * 1000 : 0);
      if (!ts) continue;

      const ageMs = now - ts;
      // 60 one-minute buckets, index 0 = most recent minute.
      const bucketIdx = Math.min(59, Math.max(0, Math.floor(ageMs / 60000)));
      buckets[bucketIdx]++;

      const uid = data.uid || '';
      if (uid) {
        hourUids.add(uid);
        if (ageMs <= THIRTY_MIN) recentUids.add(uid);
        if (ageMs <= FIVE_MIN) onlineUids.add(uid);
      }

      const evName = (data.event === 'app_event' && data.metadata && data.metadata.name)
        ? data.metadata.name
        : data.event || 'unknown';
      eventTypeCounts[evName] = (eventTypeCounts[evName] || 0) + 1;

      raw.push({ ts, uid, event: data.event, metadata: data.metadata || {} });
    }

    // Resolve display names for the tail. One batch read on the unique
    // uids in the slice we'll actually return.
    const tail = raw.slice(0, tailLimit);
    const uidsInTail = [...new Set(tail.map(e => e.uid).filter(Boolean))].slice(0, 30);
    const nameMap = {};
    if (uidsInTail.length) {
      const profiles = await Promise.all(
        uidsInTail.map(u => db.collection('user_profiles').doc(u).get().catch(() => null))
      );
      profiles.forEach((p, i) => {
        if (p && p.exists) {
          const d = p.data();
          nameMap[uidsInTail[i]] = {
            name: d.displayName || (d.email ? d.email.split('@')[0] : '') || 'anon',
            email: d.email || '',
            photoURL: d.photoURL || '',
          };
        }
      });
    }

    const labeledTail = tail.map(e => {
      const id = nameMap[e.uid];
      const evName = (e.event === 'app_event' && e.metadata && e.metadata.name)
        ? e.metadata.name
        : e.event;
      return {
        ts: e.ts,
        uid: e.uid,
        name: id ? id.name : 'anon',
        email: id ? id.email : '',
        photoURL: id ? id.photoURL : '',
        event: evName,
        path: e.metadata && e.metadata.path ? e.metadata.path : '',
        meta: e.metadata || {},
      };
    });

    // Buckets are most-recent-first; flip so the spark reads left→right
    // as time-forward.
    const spark = buckets.slice().reverse();

    return jsonResponse({
      online5: onlineUids.size,
      active30: recentUids.size,
      hour: hourUids.size,
      tail: labeledTail,
      spark,
      eventMix: Object.entries(eventTypeCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ event: k, count: v })),
      sampled: snap.size >= MAX_DOCS,
      sampleSize: snap.size,
      now: Date.now(),
    }, 200, request);
  } catch (err) {
    console.error('admin-realtime error:', err);
    return errorResponse('Failed to load realtime: ' + (err.message || 'unknown'), 500, request);
  }
};

export const config = { path: '/api/admin/realtime' };
