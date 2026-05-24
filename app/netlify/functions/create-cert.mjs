import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { tierForScore, MIN_CERT_SCORE, MAX_CERT_SCORE } from './lib/cert-tiers.mjs';

// Server-side certificate issuance. Client (voice-debate.html) posts the
// parsed RFD score + round metadata after the judge ballot lands. We
// re-validate the score band, mint a short URL-safe id, write the
// cert doc, and bump the per-user summary so /profile can render the
// user's collection without a slow `where(uid==).orderBy()` scan.
//
// Why server-side instead of writing from the client:
// - The verify URL has to be trustworthy. If a user could write to
//   `certificates/{id}` directly, they could mint a Champion at will.
// - We want the issuer ("debateai.com") to be the authority on the
//   doc, not the recipient.
// - One audited place to bump anti-gaming logic later (cooldowns,
//   max-per-day, sufficient transcript length, etc.).

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT = 12; // 12 cert issuances per user per hour. Real users
                      // running real voice rounds won't approach this;
                      // a script trying to farm certs will.
const rateLimits = new Map();

function isRateLimited(uid) {
  const now = Date.now();
  const entry = rateLimits.get(uid);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(uid, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rateLimits) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) rateLimits.delete(uid);
  }
}, 10 * 60 * 1000);

// URL-safe base32 ID, ~12 chars => 60 bits of entropy. Long enough that
// a verify URL can't be guessed; short enough to look like a credential
// id and not a hash.
function mintCertId() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no l/i/o/0/1 ambiguity
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 12; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function clamp(val, max) {
  if (typeof val !== 'string') return '';
  return val.length > max ? val.slice(0, max) : val;
}

function sanitizeDisplayName(name) {
  if (typeof name !== 'string') return 'Anonymous';
  const trimmed = name.replace(/[^\p{L}\p{N}\s.'\-]/gu, '').trim().slice(0, 80);
  return trimmed || 'Anonymous';
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in required to earn a certificate', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('create-cert auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  if (isRateLimited(uid)) {
    return errorResponse('Too many certificates issued recently. Try again later.', 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400, request); }

  const {
    score,
    motion,
    side,
    sideLabel,
    format,
    formatLabel,
    personaKey,
    personaLabel,
    rfd,
    aiLanguage,
    roundId,
    won,
    displayName,
  } = body;

  // Re-validate the score band server-side. The client tier preview is
  // for UX; this is the authority.
  const numScore = Number(score);
  if (!Number.isFinite(numScore) || numScore < MIN_CERT_SCORE || numScore > MAX_CERT_SCORE) {
    return jsonResponse(
      { ok: false, reason: 'below_threshold', minScore: MIN_CERT_SCORE },
      200,
      request
    );
  }
  const tier = tierForScore(numScore);
  if (!tier) {
    return jsonResponse(
      { ok: false, reason: 'below_threshold', minScore: MIN_CERT_SCORE },
      200,
      request
    );
  }

  // Require some real round material. A 3-word transcript and a fabricated
  // RFD wouldn't pass even Novice in the judge prompt, but defense in depth.
  const rfdText = typeof rfd === 'string' ? rfd : '';
  if (rfdText.length < 200) {
    return jsonResponse(
      { ok: false, reason: 'insufficient_round' },
      200,
      request
    );
  }

  const cleanDisplayName = sanitizeDisplayName(displayName || decoded.name || decoded.email?.split('@')[0]);

  try {
    const db = getDb();
    const certId = mintCertId();
    const issuedAtMs = Date.now();

    const certDoc = {
      certId,
      uid,
      displayName: cleanDisplayName,
      tier: tier.key,
      tierName: tier.name,
      score: Math.round(numScore * 10) / 10,
      motion: clamp(motion, 400),
      side: clamp(side, 40),
      sideLabel: clamp(sideLabel, 60),
      format: clamp(format, 40),
      formatLabel: clamp(formatLabel, 60),
      personaKey: clamp(personaKey, 40),
      personaLabel: clamp(personaLabel, 80),
      aiLanguage: clamp(aiLanguage, 8) || 'en',
      roundId: clamp(roundId, 80),
      won: won === true,
      rfdExcerpt: clamp(rfdText, 4000),
      issuedAt: FieldValue.serverTimestamp(),
      issuedAtMs,
    };

    await db.collection('certificates').doc(certId).set(certDoc);

    // Per-user summary doc — keeps the profile read to a single doc
    // instead of scanning the whole collection. Increment with FieldValue
    // so concurrent issuances don't clobber each other.
    const summaryRef = db.collection('user_certificates').doc(uid);
    const summaryUpdate = {
      uid,
      displayName: cleanDisplayName,
      latestCertId: certId,
      latestTier: tier.key,
      latestScore: certDoc.score,
      updatedAt: FieldValue.serverTimestamp(),
      [`counts.${tier.key}`]: FieldValue.increment(1),
      totalCount: FieldValue.increment(1),
    };
    await summaryRef.set(summaryUpdate, { merge: true });

    // Track highest tier separately — FieldValue can't do max(), so we
    // read once and write only if this beats the prior best.
    try {
      const summarySnap = await summaryRef.get();
      const prior = summarySnap.exists ? summarySnap.data() : null;
      const tierRank = { novice: 1, varsity: 2, circuit: 3, champion: 4 };
      const priorRank = prior?.highestTier ? tierRank[prior.highestTier] || 0 : 0;
      if (tierRank[tier.key] > priorRank) {
        await summaryRef.set({
          highestTier: tier.key,
          highestTierName: tier.name,
          highestScore: certDoc.score,
        }, { merge: true });
      } else if (!prior?.highestScore || certDoc.score > prior.highestScore) {
        await summaryRef.set({ highestScore: Math.max(prior?.highestScore || 0, certDoc.score) }, { merge: true });
      }
    } catch (e) {
      console.warn('[create-cert] summary highest-tier write skipped:', e.message);
    }

    console.log('[create-cert]', tier.key, uid.slice(0, 6), 'id=', certId, 'score=', certDoc.score);

    return jsonResponse({
      ok: true,
      certId,
      tier: tier.key,
      tierName: tier.name,
      tierBlurb: tier.blurb,
      score: certDoc.score,
      verifyUrl: `https://debateai.com/verify/${certId}`,
    }, 200, request);
  } catch (err) {
    console.error('create-cert error:', err.message, err.code || '');
    return errorResponse('Failed to issue certificate', 500, request);
  }
};

export const config = {
  path: '/api/create-cert',
};
