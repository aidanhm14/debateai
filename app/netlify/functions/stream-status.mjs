// Public read side of the owner livestream (WS2 Phase 6). The landing
// page, the Open event lobby, and /watch poll this to show one broadcast.
//
//   GET /api/stream-status → { live, url, title, startedAt }
//
// CDN-cached for 15s so a front-page traffic spike costs a handful of
// function invocations, not one per visitor.

import { getDb } from './lib/firestore.mjs';
import { errorResponse } from './lib/response.mjs';

export default async (req) => {
  if (req.method !== 'GET') return errorResponse('GET only', 405, req);
  let out = { live: false };
  try {
    const snap = await getDb().collection('site_stream').doc('current').get();
    if (snap.exists){
      const d = snap.data() || {};
      if (d.live){
        out = {
          live: true,
          url: d.url || '',
          title: d.title || 'Live from the arena',
          // Present when the round is restreaming to YouTube. Viewers
          // watch THIS instead of joining the Daily room, which is what
          // takes the audience off max_participants and off participant
          // minutes. Absent means no restream is configured and the
          // player falls back to joining the room directly.
          watchEmbedUrl: d.watchEmbedUrl || null,
          startedAt: d.startedAt && d.startedAt.toMillis ? d.startedAt.toMillis() : null,
        };
      }
    }
  } catch (e) {
    console.warn('[stream-status] read failed:', e.message);
  }
  return new Response(JSON.stringify(out), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=10, s-maxage=15, stale-while-revalidate=30',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

export const config = {
  path: '/api/stream-status',
};
