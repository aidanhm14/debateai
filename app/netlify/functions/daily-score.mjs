// Daily-motion public leaderboard writer.
//
// Anyone who lands on /debate-it from /today (the `?dm=YYYY-MM-DD` CTA)
// and finishes a round with speaker points posts their score here. The
// /today page reads back from `daily_entries/{date}/entries` and renders
// a public leaderboard panel below the motion. One reason to come back
// tomorrow (different motion); one reason to come back today (catch the
// top of today's board).
//
// Anti-cheat surface:
//   - Auth-required: only signed-in users can post (Firestore admin
//     verifies the Firebase ID token; no token = 401)
//   - Motion-bound: server re-derives today's daily motion from the
//     date and rejects submissions whose `motion` doesn't match. Stops
//     a client from submitting a fake-high score for an arbitrary
//     motion.
//   - Date-bound: only YYYY-MM-DD === today UTC accepted. No back-
//     filling, no future-dating.
//   - Score bounds: 0–100. Anything outside that range gets rejected.
//   - One entry per uid per day: doc keyed on uid; subsequent submits
//     overwrite. Keeps grinding-multiple-rounds from inflating the
//     board (best-of-the-day score, not most-rounds-played).
//
// No rate limit beyond the per-IP cap that AppCheck/Netlify enforces
// upstream — one daily entry per user per day is its own ceiling.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb } from './lib/firestore.mjs';
import { dailyMotionFor, formatDailyDate } from './lib/daily-motion-bank.mjs';

const PRODUCTION_ORIGINS = [
  'https://debateos1.netlify.app',
  'https://debateos.com',
  'https://www.debateos.com',
  'https://debateai.com',
  'https://www.debateit.com',
  'https://debateai.com',
  'https://www.debateai.com',
];
const DEV_ORIGINS = ['http://localhost:8888', 'http://localhost:3000'];
const isProduction = process.env.CONTEXT === 'production';
const ALLOWED_ORIGINS = isProduction ? PRODUCTION_ORIGINS : [...PRODUCTION_ORIGINS, ...DEV_ORIGINS];

function getCorsHeaders(request) {
  const origin = request?.headers?.get?.('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export default async (request) => {
  const CORS = getCorsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  // Warm-up handshake (mirrors tts.mjs / claude.mjs etc.)
  if (body && body.warm === true) {
    return new Response(JSON.stringify({ ok: true, warm: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const token = extractBearerToken(request);
  if (!token) {
    return new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  const uid = decoded.uid;

  // Derive today's daily motion server-side. Submissions for any other
  // date are rejected — the leaderboard is "today" only.
  const today = new Date();
  const todayStr = formatDailyDate(today);
  const todayMotion = dailyMotionFor(today);
  const submittedMotion = (body.motion || '').toString().trim();
  if (!todayMotion || !submittedMotion) {
    return new Response(JSON.stringify({ error: 'missing_motion' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  // Soft match — strip trailing punctuation + whitespace so a minor
  // formatting drift (em-dash, trailing period) doesn't reject a legit
  // submission. The hard equality check would be brittle.
  const norm = (s) => s.toLowerCase().replace(/[.\s—–-]+$/g, '').replace(/\s+/g, ' ').trim();
  if (norm(todayMotion.motion) !== norm(submittedMotion)) {
    return new Response(JSON.stringify({ error: 'motion_mismatch' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  // Speaker points sanity bounds. Different formats output different
  // scales (APDA 25-30, PF 0-30, custom 0-100) — clamp loosely. The
  // intent is to reject obvious spam (-9999, 1e308), not to canonical-
  // ize the units.
  const score = parseFloat(body.score);
  if (isNaN(score) || score < 0 || score > 100) {
    return new Response(JSON.stringify({ error: 'invalid_score' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
  const aiScoreRaw = parseFloat(body.aiScore);
  const aiScore = isNaN(aiScoreRaw) ? null : Math.max(0, Math.min(100, aiScoreRaw));

  // Caller display fields. Trust decoded JWT for the photoURL; trust
  // the body for displayName but clamp + sanitize length.
  const displayName = ((body.displayName || decoded.name || 'A debater') + '').slice(0, 80).trim();
  const photoURL = (decoded.picture || '').toString().slice(0, 500);

  const db = getDb();
  try {
    const docRef = db
      .collection('daily_entries')
      .doc(todayStr)
      .collection('entries')
      .doc(uid);
    // Read existing entry (if any). Keep the higher score — grinding
    // shouldn't penalize an earlier strong attempt by overwriting it
    // with a later weaker one, but a fresher attempt that beats the
    // prior best should land. Best-of-the-day semantics.
    const prior = await docRef.get().catch(() => null);
    const priorScore = prior && prior.exists ? prior.data().score : -Infinity;
    if (score < priorScore) {
      return new Response(
        JSON.stringify({ ok: true, kept: 'prior', score: priorScore }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }
    await docRef.set(
      {
        uid,
        displayName,
        photoURL,
        score,
        aiScore,
        side: (body.side || '').toString().slice(0, 40),
        sideLabel: (body.sideLabel || '').toString().slice(0, 80),
        format: (body.format || '').toString().slice(0, 40),
        formatName: (body.formatName || '').toString().slice(0, 80),
        decision: (body.decision || '').toString().slice(0, 240),
        won: !!body.won,
        submittedAt: Date.now(),
      },
      { merge: false }
    );
    return new Response(
      JSON.stringify({ ok: true, score, motion: todayMotion.motion, date: todayStr }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  } catch (err) {
    console.error('[daily-score] firestore write failed:', err);
    return new Response(JSON.stringify({ error: 'server_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
};

export const config = {
  path: '/api/daily-score',
};
