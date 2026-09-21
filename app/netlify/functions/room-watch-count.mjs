import { getDb, withDeadline } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { jsonResponse, corsResponse } from './lib/response.mjs';

export const WATCH_COUNT_CAP = 1000;
export const WATCH_STALE_MS = 75_000;

export default async request => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return jsonResponse({ error: 'GET only' }, 405, request);
  const room = new URL(request.url).searchParams.get('room') || '';
  if (!/^[a-zA-Z0-9_-]{3,100}$/.test(room)) return jsonResponse({ error: 'Invalid room' }, 400, request);
  let decoded;
  try { decoded = await verifyIdToken(extractBearerToken(request)); } catch {
    return jsonResponse({ error: 'Sign in required' }, 401, request);
  }
  const uid = decoded && (decoded.uid || decoded.sub || decoded.user_id);
  if (!uid) return jsonResponse({ error: 'Sign in required' }, 401, request);
  try {
    const ref = getDb().collection('live_rounds').doc(room);
    const snap = await withDeadline(ref.get(), 2500);
    const d = snap.data() || {};
    if (![d.proUid, d.conUid, d.proUid2, d.conUid2].includes(uid)) {
      return jsonResponse({ error: 'Not seated' }, 403, request);
    }
    // A server aggregate returns one number, not 500 watcher documents.
    // The caller is seated and already owns the audience-count heartbeat.
    const count = d.isPrivate === true ? 0 : (await withDeadline(ref.collection('watchers')
      .where('ts', '>', new Date(Date.now() - WATCH_STALE_MS))
      .limit(WATCH_COUNT_CAP + 1).count().get(), 2500)).data().count;
    return jsonResponse({ count: Math.min(count, WATCH_COUNT_CAP), capped: count > WATCH_COUNT_CAP }, 200, request);
  } catch {
    return jsonResponse({ error: 'Audience count temporarily unavailable' }, 503, request);
  }
};

export const config = { path: '/api/room-watch-count' };
