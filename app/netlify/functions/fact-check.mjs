// Source-backed live checks. Only authenticated participants can request
// checks of their room's saved, attributed speech. Writes are server-only;
// cards never enter the judging prompt. Per-seat leases and room budgets
// prevent duplicate browser requests from creating unbounded provider calls.
// POST /api/fact-check {room, speechIdx, side}

import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { searchFacts } from './lib/fact-check-provider.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { factCheckInput, reserveFactCheck } from './lib/fact-check-session.mjs';
import { callerIp, checkLayers } from './lib/rate-limit.mjs';
import {
  factCheckPrompt, parseFactChecks, verifyPrompt, applyVerification,
} from './lib/fact-check.mjs';

const USER_LAYERS = [
  { window: 60_000, max: 6, label: 'min' },
  { window: 60 * 60_000, max: 90, label: 'hour' },
];
const IP_LAYERS = [
  { window: 60_000, max: 8, label: 'min' },
  { window: 60 * 60_000, max: 60, label: 'hour' },
];

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('POST only', 405, request);

  // Only real browsers running our Firebase app get to spend sourced
  // provider calls. live-round.html mints tokens sitewide, so a
  // missing token here is a script, not a round.
  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) {
    return jsonResponse({
      error: 'App verification failed. Reload the page and try again.',
      code: 'APP_CHECK_' + String(appCheck.reason || '').toUpperCase(),
    }, 401, request);
  }

  const pplxKey = process.env.PERPLEXITY_API_KEY;

  // Neither key configured: tell the client to stop asking rather than
  // failing a request every 20 seconds for the rest of the round.
  if (!pplxKey && !process.env.OPENAI_API_KEY) return jsonResponse({ flags: [], disabled: true }, 200, request);

  // Only a NAMED account earns the per-uid lane. Anonymous Firebase uids
  // are free and unlimited to mint (the 2026-07-28 lesson), so keying a
  // limit on one hands a rotating caller a fresh allowance per uid; they
  // meter per IP instead.
  let uid = '';
  const token = extractBearerToken(request);
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      if (isNamedAccount(decoded)) uid = decoded.sub || '';
    } catch (_) { return errorResponse('Invalid sign-in.',401,request); }
  }
  const limited = uid
    ? await checkLayers('factcheck', 'u_' + uid, USER_LAYERS)
    : await checkLayers('factcheck', 'ip_' + callerIp(request), IP_LAYERS);
  if (!limited.ok) return jsonResponse({ flags: [], throttled: limited.layer }, 200, request);

  let body;
  try { body = await request.json(); } catch (_) { return errorResponse('Invalid JSON', 400, request); }

  if (!uid) return errorResponse('Sign in to check this round.',401,request);
  const room = String(body.room || '');
  if (!/^[a-zA-Z0-9-]{3,80}$/.test(room)) return errorResponse('Invalid room.',400,request);
  const db = getDb(), ref = db.collection('live_rounds').doc(room);
  let d;
  try {
    const snap = await ref.get();
    if (!snap.exists) return errorResponse('Round not found.',404,request);
    d = factCheckInput(snap.data(),uid,body);
  } catch (e) { return errorResponse(e.message,e.status || 503,request); }
  if (d.text.split(/\s+/).length < 40) return jsonResponse({flags:[],status:'listening'},200,request);
  const reservation = await reserveFactCheck(db,room,d);
  if (reservation !== 'reserved') return jsonResponse({flags:[],status:reservation},200,request);
  const grounded = true;
  const prompt = factCheckPrompt(d, grounded);
  const ask = p => searchFacts(p);
  try {
    const res = await ask(prompt);
    const candidates = parseFactChecks(res.text, d, { grounded, sources: res.sources, requireSources:true });
    if (!candidates.length) return jsonResponse({ flags: [], grounded, status:'checked', checkedAt:Date.now() }, 200, request);

    // Second opinion. One call for the whole batch (there are at most two),
    // so the round waits for one extra round trip, not one per card.
    const check = await ask(verifyPrompt(d, candidates));
    const flags = applyVerification(check.text, candidates);
    if (flags.length) await ref.update({factChecks:FieldValue.arrayUnion(...flags.map((f,i) => ({
      ...f,model:res.model,provider:res.provider,id:Date.now()+'_'+i,speechIdx:d.speechIdx,code:'',speaker:d.speaker,side:d.side,atMs:Date.now(),
    })))});
    return jsonResponse({ flags, grounded, status:'checked', checkedAt:Date.now(), considered: candidates.length }, 200, request);
  } catch (err) {
    console.warn('[fact-check] provider or storage unavailable');
    // A checker that errors is a checker that says nothing. The round is
    // not waiting on it, so never surface a failure into the broadcast.
    return jsonResponse({ flags: [], error: 'unavailable' }, 200, request);
  } finally {
    await db.collection('fact_check_runs').doc(room).update({['busyUntil.'+d.seat]:0}).catch(() => {});
  }
};

export const config = { path: '/api/fact-check' };
