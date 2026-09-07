import { getDb } from './lib/firestore.mjs';
import { applicableChanges, pageKey } from '../../js/design/model.mjs';
export function createPublicDesignHandler(database = getDb) {
  return async request => {
    if (request.method !== 'GET') return new Response('', { status: 405 });
    const page = pageKey(new URL(request.url).searchParams.get('page') || '/');
    try {
      // Only the explicit public snapshot is read here. Drafts and history are never reachable.
      const snap = await database().collection('site_design').doc('current').get();
      const data = snap.exists ? snap.data() : {};
      return Response.json({ version: 1, revision: data.revision || 0, changes: applicableChanges(data.design, page) }, {
        headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30', 'X-Content-Type-Options': 'nosniff' }
      });
    } catch { return Response.json({ version: 1, changes: [] }, { headers: { 'Cache-Control': 'no-store' } }); }
  };
}
export default createPublicDesignHandler();
export const config = { path: '/api/site-design' };
