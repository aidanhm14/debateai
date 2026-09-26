import { getDb, FieldValue } from './lib/firestore.mjs';
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';
import { checkContent } from './lib/content-guard.mjs';
import { outlookWrite, readPublicOutlooks } from './lib/public-outlook.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (!['GET','POST'].includes(request.method)) return errorResponse('Method not allowed', 405, request);
  let user = null;
  const token = extractBearerToken(request);
  if (token) {
    try { user = await verifyIdToken(token); }
    catch { return errorResponse('Sign in again to continue.', 401, request); }
  }
  const uid = user && isNamedAccount(user) ? user.sub : '';
  if (request.method === 'POST' && !uid) return errorResponse('Sign in to edit your outlook.', 401, request);
  const rl = await checkLayers('public-outlook', uid || callerIp(request), [{window:60000,max:60,label:'min'}]);
  if (!rl.ok) return errorResponse('Please wait a moment and try again.', 429, request);
  try {
    const db = getDb();
    if (request.method === 'GET') {
      const raw = new URL(request.url).searchParams.get('uids');
      const ids = raw ? raw.split(',').filter(id => /^[A-Za-z0-9_-]{8,128}$/.test(id)).slice(0,40) : uid ? [uid] : [];
      const outlooks = await readPublicOutlooks(db, ids, uid);
      const response = jsonResponse({outlooks}, 200, request);
      response.headers.set('Cache-Control','no-store');
      return response;
    }
    let fields;
    try { fields = outlookWrite(await request.json()); }
    catch (e) { return errorResponse(e.message, 400, request); }
    if (fields.publicBelief) {
      const guard = checkContent({text:fields.publicBelief, kind:'bio', maxLength:240});
      if (!guard.ok) return errorResponse(guard.reason || 'Please revise your statement.', 400, request);
    }
    await db.collection('user_profiles').doc(uid).set({
      ...fields, publicOutlookUpdatedAt: FieldValue.serverTimestamp(),
    }, {merge:true});
    return jsonResponse({ok:true, outlook:{label:fields.publicIdeology || '',belief:fields.publicBelief}}, 200, request);
  } catch { return errorResponse('Could not load or save your outlook. Try again.', 503, request); }
};
export const config = { path:'/api/public-outlook' };
