// /api/log-debate — persists a finished debate round + per-speech rows
// for the training pool. Wire 3 of the self-recurring feedback loop:
// every AI-judged round becomes labeled training data. Each speech is a
// row tagged "won" or "lost" by the judge's verdict, which is the
// cleanest supervised signal short of a real tournament flow.
//
// Collections written:
//   debates/{id}                — round summary (motion, format, verdict,
//                                  speaker points, judge votes, optional
//                                  RFD per judge, optional opponent meta)
//   debate_speeches/{id}        — one doc per speech (role, who, text,
//                                  durationSec, wpm, won boolean, motion,
//                                  format, side, parent debateId)
//
// The retrieval helper reads `generations` today; in v2 it will also
// pull from debate_speeches (winning speeches as exemplars, losing
// speeches as anti-exemplars). The schema is intentionally compatible
// with that future query: { kind:'speech', motion, format, side, output,
// rating, lastSignal, createdAt }.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const MAX_SPEECH_CHARS = 12_000;
const MAX_RFD_CHARS = 4_000;
const MAX_MOTION_CHARS = 600;
const MAX_SPEECHES_PER_ROUND = 30; // safety cap; longest formats top out around 12

const rateLimits = new Map();
const RATE_WINDOW = 60_000;
const RATE_MAX = 30; // per uid per minute

function rateLimited(uid) {
  const now = Date.now();
  const e = rateLimits.get(uid);
  if (!e || now - e.start > RATE_WINDOW) {
    rateLimits.set(uid, { start: now, count: 1 });
    return false;
  }
  e.count += 1;
  return e.count > RATE_MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    if (now - v.start > RATE_WINDOW * 2) rateLimits.delete(k);
  }
}, 5 * 60 * 1000);

function clamp(s, max) { return typeof s === 'string' ? s.slice(0, max) : ''; }
function intOrNull(v, lo, hi) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (err) {
    console.error('[log-debate] auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }
  const uid = decoded.sub;
  if (rateLimited(uid)) return errorResponse('Too many requests.', 429, request);

  let body;
  try { body = await request.json(); }
  catch { return errorResponse('Invalid JSON body', 400, request); }

  const {
    motion = '',
    format = '',
    side = '',
    voice = '',
    brain = '',
    speeches = [],
    verdict = null,    // { winner: 'user'|'ai'|'tie', tally, judges?, speakerPoints?, source: 'panel'|'single'|'manual' }
    durationMs = null, // total round elapsed
    consent = true,    // user can opt this round out of the training pool
  } = body;

  if (!Array.isArray(speeches) || !speeches.length) {
    return errorResponse('Missing speeches', 400, request);
  }
  if (speeches.length > MAX_SPEECHES_PER_ROUND) {
    return errorResponse('Too many speeches', 400, request);
  }

  // Sanitize verdict shape.
  let safeVerdict = null;
  if (verdict && typeof verdict === 'object') {
    const winner = ['user', 'ai', 'tie'].includes(verdict.winner) ? verdict.winner : null;
    const judges = Array.isArray(verdict.judges) ? verdict.judges.slice(0, 8).map(j => ({
      name: clamp(j && j.name, 64),
      paradigm: clamp(j && j.paradigm, 200),
      ballot: ['user', 'ai'].includes(j && j.ballot) ? j.ballot : null,
      rfd: clamp(j && j.rfd, MAX_RFD_CHARS),
      points: (j && j.points && typeof j.points === 'object') ? {
        user: intOrNull(parseFloat(j.points.user), 0, 50),
        ai: intOrNull(parseFloat(j.points.ai), 0, 50),
      } : null,
    })) : [];
    const speakerPoints = (verdict.speakerPoints && typeof verdict.speakerPoints === 'object') ? {
      user: intOrNull(parseFloat(verdict.speakerPoints.user) * 10, 0, 500), // store *10 to keep .5 precision as int
      ai:   intOrNull(parseFloat(verdict.speakerPoints.ai)   * 10, 0, 500),
    } : null;
    safeVerdict = {
      winner,
      tally: clamp(verdict.tally, 16),
      judges,
      speakerPoints,
      source: clamp(verdict.source, 32),
      practiceAdvice: clamp(verdict.practice, 600),
    };
  }

  try {
    const db = getDb();
    const debateRef = db.collection('debates').doc();
    const debateId = debateRef.id;

    const roundDoc = {
      uid,
      motion: clamp(motion, MAX_MOTION_CHARS),
      format: clamp(format, 40),
      side:   clamp(side, 40),
      voice:  clamp(voice, 64),
      brain:  clamp(brain, 32),
      verdict: safeVerdict,
      durationMs: typeof durationMs === 'number' && Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
      speechCount: speeches.length,
      consent: !!consent,
      createdAt: FieldValue.serverTimestamp(),
    };
    await debateRef.set(roundDoc);

    // Per-speech rows. We compute "won" for each speech by side, so every
    // speech becomes a labeled example: speeches on the winning side are
    // positive examples, speeches on the losing side are negative ones.
    const winnerSide = safeVerdict ? safeVerdict.winner : null; // 'user'|'ai'|'tie'|null
    const userIsPro = ['pro', 'gov', 'aff'].includes(String(side).toLowerCase());
    const writes = [];
    for (let i = 0; i < speeches.length; i++) {
      const sp = speeches[i];
      if (!sp || typeof sp !== 'object') continue;
      const text = clamp(sp.text, MAX_SPEECH_CHARS);
      if (text.length < 40) continue; // skip empty / silent speeches
      const who = clamp(sp.who, 16);
      const isUserSpeech = who === 'You' || who === 'user';
      let speechSide = null;
      if (isUserSpeech) {
        speechSide = userIsPro ? 'pro' : 'con';
      } else if (who === 'AI' || who === 'ai') {
        speechSide = userIsPro ? 'con' : 'pro';
      }
      // 'won' boolean: only meaningful when verdict is decisive (user/ai win).
      let won = null;
      if (winnerSide === 'user') won = isUserSpeech ? true : false;
      else if (winnerSide === 'ai') won = isUserSpeech ? false : true;

      writes.push(db.collection('debate_speeches').add({
        debateId,
        uid,                           // owner-only read; training pool query is server-side
        kind: 'speech',                // matches generations.kind so retrieval can union them later
        order: i,
        code: clamp(sp.code, 16),
        who,
        speechSide,
        text,
        durationSec: typeof sp.durationSec === 'number' && Number.isFinite(sp.durationSec) ? Math.max(0, Math.round(sp.durationSec)) : null,
        wpm: typeof sp.wpm === 'number' && Number.isFinite(sp.wpm) ? Math.max(0, Math.min(900, Math.round(sp.wpm))) : null,
        wordCount: typeof sp.wordCount === 'number' ? Math.max(0, Math.round(sp.wordCount)) : null,
        interrupted: !!sp.interrupted,
        // Cross-collection compatibility with retrieval.mjs candidate shape:
        motion: clamp(motion, MAX_MOTION_CHARS),
        format: clamp(format, 40),
        side: speechSide,
        output: text,                  // alias so retrieval queries can read .output
        won,
        // Rating/saved are denormalized for retrieval: a winning speech is
        // worth retrieving as exemplar; a losing speech feeds anti-exemplar.
        rating: won === true ? 4 : (won === false ? 2 : null),
        saved: won === true,
        lastSignal: won === false ? 'discard' : null,
        createdAt: FieldValue.serverTimestamp(),
      }));
    }
    await Promise.all(writes);

    console.log('[log-debate] wrote round', debateId, 'speeches=', writes.length, 'winner=', winnerSide);
    return jsonResponse({ ok: true, debateId, speechCount: writes.length }, 200, request);
  } catch (err) {
    console.error('[log-debate] write failed:', err.message);
    return errorResponse('Failed to log debate.', 500, request);
  }
};

export const config = { path: '/api/log-debate' };
