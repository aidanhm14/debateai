import { requireAdmin } from './lib/admin-auth.mjs';
import { validateDesign } from '../../js/design/model.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export function createDesignHandler(authorize = requireAdmin) {
  return async request => {
    if (request.method === 'OPTIONS') return corsResponse(request);
    if (!['GET', 'POST'].includes(request.method)) return errorResponse('Method not allowed', 405, request);
    const gate = await authorize(request);
    if (gate.error) return gate.error;
    const { uid, db } = gate;
    const draftRef = db.collection('design_drafts').doc(uid);
    const publicRef = db.collection('site_design').doc('current');
    const reply = (data, status = 200) => { const res = jsonResponse(data, status, request); res.headers.set('Cache-Control', 'private, no-store'); return res; };
    try {
      if (request.method === 'GET') {
        const [draft, live] = await Promise.all([draftRef.get(), publicRef.get()]);
        const current = live.exists ? live.data() : {};
        return reply({ draft: draft.exists ? draft.data() : { revision: 0, design: current.design || { version: 1, name: 'My site design', changes: [] } }, publishedRevision: current.revision || 0 });
      }
      if (Number(request.headers.get('content-length') || 0) > 750000) return reply({ error: 'Draft too large' }, 413);
      const raw = await request.text();
      if (Buffer.byteLength(raw, 'utf8') > 750000) return reply({ error: 'Draft too large' }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return reply({ error: 'Invalid draft' }, 400); }
      if (!['save', 'publish', 'history', 'restore'].includes(body.action)) return reply({ error: 'Unknown action' }, 400);
      if (body.action === 'history') {
        const rows = await draftRef.collection('history').orderBy('savedAt', 'desc').limit(20).get();
        return reply({ history: rows.docs.map(d => ({ id: d.id, name: d.data().design.name, savedAt: d.data().savedAt, count: d.data().design.changes.length })) });
      }
      if (body.action === 'restore') {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(body.id || '')) return reply({ error: 'Choose a saved version' }, 400);
        const snap = await draftRef.collection('history').doc(body.id).get();
        return snap.exists ? reply({ design: snap.data().design }) : reply({ error: 'Version not found' }, 404);
      }
      let design;
      try { design = validateDesign(body.design); } catch (e) { return reply({ error: e.message }, 400); }
      const result = await db.runTransaction(async tx => {
        const [draft, live] = await Promise.all([tx.get(draftRef), tx.get(publicRef)]);
        const previous = draft.exists ? draft.data() : { revision: 0 };
        const publicData = live.exists ? live.data() : { revision: 0 };
        if (body.revision !== previous.revision) return { conflict: true };
        if (body.action === 'publish' && body.publishedRevision !== publicData.revision) return { publicationConflict: true };
        const now = new Date().toISOString();
        const revision = previous.revision + 1;
        if (previous.design && (body.checkpoint || body.action === 'publish' || !previous.checkpointAt || Date.now() - Date.parse(previous.checkpointAt) > 300000)) {
          tx.set(draftRef.collection('history').doc(String(previous.revision)), { design: previous.design, savedAt: previous.savedAt || now });
        }
        tx.set(draftRef, { revision, design, savedAt: now, checkpointAt: body.checkpoint || !previous.checkpointAt || Date.now() - Date.parse(previous.checkpointAt) > 300000 ? now : previous.checkpointAt });
        let publishedRevision = publicData.revision;
        if (body.action === 'publish') {
          if (publicData.design) tx.set(db.collection('design_releases').doc(String(publicData.revision)), publicData);
          publishedRevision++;
          tx.set(publicRef, { revision: publishedRevision, design, publishedAt: now, publishedBy: uid });
        }
        return { revision, savedAt: now, publishedRevision };
      });
      if (result.conflict) return reply({ error: 'This draft changed on another device. Export your local changes, then reload the saved version.', conflict: true }, 409);
      if (result.publicationConflict) return reply({ error: 'The published design changed since you opened the editor. Reload before publishing.', conflict: true }, 409);
      return reply(result);
    } catch (err) {
      console.error('admin-design:', err.message);
      return reply({ error: 'Your draft could not be saved. Your local changes are still here; retry or export a backup.' }, 500);
    }
  };
}
export default createDesignHandler();
export const config = { path: '/api/admin/design' };
