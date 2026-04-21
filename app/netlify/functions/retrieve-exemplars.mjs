// Fetch 1-3 admin-authored debate rounds as few-shot examples for the AI
// opponent. Filtered by format and ranked by exemplarWeight × keyword overlap
// with the current motion.
//
// POST /api/retrieve-exemplars
// body: { motion: string, format: string, side: string }
// returns: { exemplars: [{ motion, side, sideLabel, userSpeech, formatName }] }
//
// Public (no auth) — only surfaces opt-in admin rounds.
import { getDb } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const MAX_EXEMPLARS = 3;
const USER_SPEECH_CHAR_LIMIT = 900;

// Cache admin uids for 5 min to keep this cheap.
let adminCache = { uids: null, weights: null, at: 0 };
const CACHE_MS = 5 * 60 * 1000;

async function getAdminUids(db) {
  if (adminCache.uids && Date.now() - adminCache.at < CACHE_MS) return adminCache;
  const snap = await db.collection('user_profiles')
    .where('exemplarWeight', '>=', 1)
    .limit(20)
    .get();
  const uids = [];
  const weights = {};
  snap.forEach(doc => {
    uids.push(doc.id);
    weights[doc.id] = doc.data().exemplarWeight || 1;
  });
  adminCache = { uids, weights, at: Date.now() };
  return adminCache;
}

function tokens(s) {
  return (s || '').toLowerCase().match(/[a-z]{4,}/g) || [];
}

function overlap(a, b) {
  if (!a.length || !b.length) return 0;
  const set = new Set(a);
  let hits = 0;
  for (const t of b) if (set.has(t)) hits++;
  return hits / Math.max(a.length, b.length);
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid body', 400, request); }

  const motion = (body.motion || '').trim();
  const format = (body.format || '').trim();
  const side = (body.side || '').trim();
  if (!motion || !format) return jsonResponse({ exemplars: [] }, 200, request);

  try {
    const db = getDb();
    const { uids, weights } = await getAdminUids(db);
    if (!uids || !uids.length) return jsonResponse({ exemplars: [] }, 200, request);

    // Firestore `in` cap is 10. Admin list is small, but guard anyway.
    const batch = uids.slice(0, 10);
    const snap = await db.collection('debate_rounds')
      .where('userId', 'in', batch)
      .where('format', '==', format)
      .limit(40)
      .get();

    const motionTokens = tokens(motion);
    const candidates = [];
    snap.forEach(doc => {
      const r = doc.data();
      if (!r || !Array.isArray(r.log)) return;
      const userTurns = r.log.filter(e => e && e.who === 'You' && e.text && e.text.length > 80);
      if (!userTurns.length) return;
      const userSpeech = userTurns[0].text.slice(0, USER_SPEECH_CHAR_LIMIT);
      const overlapScore = overlap(motionTokens, tokens(r.motion));
      const weight = weights[r.userId] || 1;
      const recency = r.date ? (Date.now() - new Date(r.date).getTime()) / (1000 * 60 * 60 * 24) : 90;
      // score = weight * (overlap + recency bonus), slight boost when side matches
      const sideBonus = side && r.side === side ? 0.15 : 0;
      const score = weight * (overlapScore + Math.max(0, 1 - recency / 90) * 0.2 + sideBonus);
      candidates.push({
        score,
        motion: r.motion || '',
        side: r.side || '',
        sideLabel: r.sideLabel || r.side || '',
        formatName: r.formatName || r.format || '',
        userSpeech,
      });
    });

    candidates.sort((a, b) => b.score - a.score);
    const exemplars = candidates.slice(0, MAX_EXEMPLARS).map(({ score, ...rest }) => rest);

    return jsonResponse({ exemplars }, 200, request);
  } catch (err) {
    return jsonResponse({ exemplars: [], error: err.message }, 200, request);
  }
};

export const config = { path: '/api/retrieve-exemplars' };
