// Ephemeral activity only. No answers, names, seat promises or queue entries.
import { createHash } from 'node:crypto';
import { getDb } from './lib/firestore.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
const FRESH_MS = 45000;
export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (!['GET', 'POST'].includes(request.method)) return errorResponse('Method not allowed', 405, request);
  const ip = callerIp(request);
  const key = createHash('sha256').update('spar-onboarding:' + new Date().toISOString().slice(0, 10) + ':' + ip).digest('hex');
  const rate = await checkLayers('spar-onboarding', ip, [{ window: 60000, max: 20, label: 'minute' }]);
  if (!rate.ok) return errorResponse('Try again shortly', 429, request);
  try {
    const collection = getDb().collection('spar_onboarding');
    if (request.method === 'POST') {
      const appCheck = await checkAppCheck(request);
      if (!appCheck.ok) return errorResponse('App verification failed', 403, request);
      const body = await request.json();
      if (!['questions', 'signing_in', 'left'].includes(body.stage)) return errorResponse('Invalid stage', 400, request);
      if (body.stage === 'left') await collection.doc(key).delete();
      else await collection.doc(key).set({ stage: body.stage, seenAt: new Date(), expiresAt: new Date(Date.now() + FRESH_MS) });
      return jsonResponse({ ok: true }, 200, request);
    }
    const snap = await collection.where('seenAt', '>', new Date(Date.now() - FRESH_MS)).limit(30).get();
    let questions = false, signingIn = false;
    snap.forEach(doc => {
      if (doc.id === key) return;
      const d = doc.data();
      questions ||= d.stage === 'questions';
      signingIn ||= d.stage === 'signing_in';
    });
    return jsonResponse({ questions, signingIn }, 200, request);
  } catch (_) { return errorResponse('Activity unavailable', 503, request); }
}
export const config = { path: '/api/spar-onboarding' };
