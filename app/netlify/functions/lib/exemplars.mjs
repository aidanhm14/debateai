// Server-side exemplar injection. Reads admin-weighted rounds from
// debate_rounds (collected via the live app) and prepends 1–3 matching
// reference speeches to the system prompt. This is the runtime half of
// the learning loop: every round a strong debater runs raises the floor
// of every future round on the same format + topic.
//
// Wired into the brain functions (claude.mjs, openai-chat.mjs, gemini.mjs,
// grok.mjs) — call `await applyExemplars(body)` after applyVoiceGuidelines
// and before forwarding to the upstream model.
//
// The HTTP endpoint at /api/retrieve-exemplars (retrieve-exemplars.mjs)
// uses the same getExemplars() function so admin tooling stays consistent.

import { getDb } from './firestore.mjs';

// Tuned 2026-05-13 for latency: was 3 × 900 = 2700 chars of
// reference-round text in every system prompt. That adds ~680 tokens
// per call and roughly equivalent TTFT. 2 × 600 = 1200 chars (~300
// tokens) cuts that in half while still giving the model two distinct
// reference rounds to anchor on. The exemplars are also now in the
// non-cached tail of the system prompt (see claude.mjs cache logic),
// so every byte here costs latency on every cache-hit request.
const MAX_EXEMPLARS = 2;
const USER_SPEECH_CHAR_LIMIT = 600;

// Cache admin uids for 5 min — tiny set (≤20 docs), no point hammering.
let adminCache = { uids: null, weights: null, at: 0 };
const ADMIN_CACHE_MS = 5 * 60 * 1000;

// Cache exemplar query results for 10 min keyed by format+motion-hash+side.
// Same motion within the cache window = zero Firestore reads on subsequent
// brain calls. Critical for chat flows that fire many requests on one topic.
const exemplarCache = new Map();
const EXEMPLAR_CACHE_MS = 10 * 60 * 1000;
const EXEMPLAR_CACHE_MAX = 200;

// Features that should get exemplar injection. Everything else (judge,
// philosophy, vision, casual chat) doesn't benefit from "here's how a
// strong debater opened" — would actively confuse the output.
const EXEMPLAR_FEATURES = new Set([
  'case', 'tightblock', 'opp_attack', 'opponent', 'rebuttal', 'sneaky',
]);

async function getAdminUids(db) {
  if (adminCache.uids && Date.now() - adminCache.at < ADMIN_CACHE_MS) return adminCache;
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
  const superAdmin = process.env.ADMIN_UID;
  if (superAdmin && !weights[superAdmin]) {
    uids.push(superAdmin);
    weights[superAdmin] = 3;
  }
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

// Cheap string hash for cache keys. Don't need cryptographic strength —
// just stable + collision-resistant enough for in-memory keying.
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export async function getExemplars({ motion, format, side }) {
  const m = (motion || '').trim();
  const f = (format || '').trim();
  if (!m || !f) return [];

  const cacheKey = f + ':' + (side || '') + ':' + hashStr(m.toLowerCase());
  const cached = exemplarCache.get(cacheKey);
  if (cached && Date.now() - cached.at < EXEMPLAR_CACHE_MS) return cached.data;

  try {
    const db = getDb();
    const { uids, weights } = await getAdminUids(db);
    if (!uids || !uids.length) {
      exemplarCache.set(cacheKey, { data: [], at: Date.now() });
      return [];
    }

    // Firestore `in` cap is 10. Admin list is small, but guard anyway.
    const batch = uids.slice(0, 10);
    const snap = await db.collection('debate_rounds')
      .where('userId', 'in', batch)
      .where('format', '==', f)
      .limit(40)
      .get();

    const motionTokens = tokens(m);
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
    const out = candidates.slice(0, MAX_EXEMPLARS).map(({ score, ...rest }) => rest);

    // Cache (with bounded size — prune oldest when full).
    if (exemplarCache.size >= EXEMPLAR_CACHE_MAX) {
      const firstKey = exemplarCache.keys().next().value;
      if (firstKey) exemplarCache.delete(firstKey);
    }
    exemplarCache.set(cacheKey, { data: out, at: Date.now() });
    return out;
  } catch (err) {
    console.warn('[exemplars] query failed:', err.message);
    return [];
  }
}

export function formatExemplarsBlock(exemplars) {
  if (!exemplars || !exemplars.length) return '';
  const parts = exemplars.map((e, i) => {
    const header = `EXAMPLE ${i + 1} — ${e.formatName || ''} · ${e.sideLabel || e.side || ''}`;
    const motionLine = e.motion ? `Motion: ${e.motion}` : '';
    return [header, motionLine, '', e.userSpeech].filter(Boolean).join('\n');
  });
  return [
    '',
    '─── REFERENCE ROUNDS (strong debaters on similar motions) ───',
    'Study how these speeches structure their case, weigh impacts, and',
    'land their warrants. Do not copy phrasing; learn the moves.',
    '',
    parts.join('\n\n─────────────\n\n'),
    '─── END REFERENCE ROUNDS ───',
    '',
  ].join('\n');
}

// Mutates body.system in place: prepends a reference-rounds block when the
// feature is debate-relevant and a motion + format are available. Safe to
// call on any request — no-ops when conditions aren't met. Strips the
// _motion / _side meta fields after reading so upstream API calls don't
// see them. Must run before applyVoiceGuidelines (which strips
// _voiceFeature / _voiceFormat).
export async function applyExemplars(body) {
  if (!body || typeof body !== 'object') return;
  const feature = body._voiceFeature || body._feature || '';
  const format = body._voiceFormat || '';
  const motion = body._motion || '';
  const side = body._side || '';

  // Always strip the meta fields, even on no-op paths — upstream APIs
  // (OpenAI, Gemini, Grok) reject unknown top-level keys with strict-mode
  // schemas and we don't want a leak when the feature isn't exemplar-eligible.
  delete body._motion;
  delete body._side;

  if (!EXEMPLAR_FEATURES.has(feature)) return;
  if (!format || !motion) return;

  try {
    const exemplars = await getExemplars({ motion, format, side });
    if (!exemplars.length) return;
    const block = formatExemplarsBlock(exemplars);
    if (!block) return;
    // Prepend so the reference rounds are read before the persona / voice
    // block — the model anchors on them while still respecting downstream
    // formatting rules in voice-guidelines.
    body.system = block + (body.system || '');
  } catch (err) {
    console.warn('[applyExemplars]', err.message);
  }
}

// Cleanup for tests / cold starts.
export function _resetExemplarCache() {
  adminCache = { uids: null, weights: null, at: 0 };
  exemplarCache.clear();
}
