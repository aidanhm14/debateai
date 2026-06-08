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
// - We want the issuer ("debateit.com") to be the authority on the
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

// ── Credential v1 verification ──────────────────────────────────────
//
// Phase A: client (LipSyncCapture) sends raw audio-envelope + mouth-
// aperture arrays. Server computes Pearson r between them and stores
// the result on the cert doc. Threshold gating is INFORMATIONAL ONLY
// in phase A — the mouth array is a stub (all zeros) until FaceMesh
// ships in phase B, so r will always be ~0 regardless of who's actually
// in front of the camera. Gating-on-r switches on the day the mouth
// array carries real samples.
//
// Wire-format guard: we accept a structured `verification.lipSync`
// object, validate the arrays are short (<= ~7.5min worth at 4Hz), and
// clip everything to reasonable bounds so a hostile client can't poison
// the data with strings, huge values, or NaN.

const MAX_LIPSYNC_SAMPLES = 1800;
const LIPSYNC_R_MIN_PASS  = 0.6;
const MIN_USABLE_SAMPLES  = 60;  // need at least 15s at 4Hz

function pearsonR(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const n = Math.min(a.length, b.length);
  if (n < MIN_USABLE_SAMPLES) return null;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const mA = sumA / n, mB = sumB / n;
  let num = 0, dA = 0, dB = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - mA, xb = b[i] - mB;
    num += xa * xb;
    dA += xa * xa;
    dB += xb * xb;
  }
  const denom = Math.sqrt(dA * dB);
  if (!denom || !Number.isFinite(denom)) return null;
  const r = num / denom;
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null;
}

function validateVerification(input) {
  if (!input || typeof input !== 'object') return null;
  const ls = input.lipSync;
  if (!ls || typeof ls !== 'object') return null;
  if (ls.protocol !== 'lipsync-v1') {
    return { method: 'lipsync-unknown', unparseable: true };
  }
  const audio = Array.isArray(ls.audioEnvelope) ? ls.audioEnvelope.slice(0, MAX_LIPSYNC_SAMPLES) : [];
  const mouth = Array.isArray(ls.mouthAperture) ? ls.mouthAperture.slice(0, MAX_LIPSYNC_SAMPLES) : [];
  const cleanAudio = audio.map(v => {
    const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  });
  const cleanMouth = mouth.map(v => {
    const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  });
  const phase = ls.phase === 'B' ? 'B' : 'A';
  const r = pearsonR(cleanAudio, cleanMouth);
  const mouthMaxAbs = cleanMouth.length ? Math.max.apply(null, cleanMouth.map(Math.abs)) : 0;
  const hasMouthSignal = mouthMaxAbs > 0.001;
  const passed = phase === 'B' && r !== null && r >= LIPSYNC_R_MIN_PASS;
  return {
    method: `lipsync-v1-phase${phase}`,
    sampleHz: Math.max(1, Math.min(10, Number(ls.sampleHz) || 4)),
    durationMs: Math.max(0, Math.min(3 * 60 * 60 * 1000, Number(ls.durationMs) || 0)),
    audioSamples: cleanAudio.length,
    mouthSamples: cleanMouth.length,
    hasMouthSignal,
    lipSyncR: r,
    lipSyncPassed: passed,
    // Raw arrays NOT stored on the cert doc — would blow up doc size and
    // there's no view that needs them post-mint. Phase B may persist
    // them to a sub-collection for audit purposes if useful.
    audioEnvelopeStored: false,
    mouthApertureStored: false,
  };
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
    verification, // v1 anti-cheat payload; null on v0 / opt-out rounds
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

    const verificationBlock = validateVerification(verification);

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
      // Phase A: present + audio-only if the client opted into v1 capture,
      // absent otherwise. Verify page reads this to render the verification
      // block; absence triggers the "issued under v0 protocol" banner.
      ...(verificationBlock ? { verification: verificationBlock } : {}),
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
      verifyUrl: `https://debateit.com/verify/${certId}`,
    }, 200, request);
  } catch (err) {
    console.error('create-cert error:', err.message, err.code || '');
    return errorResponse('Failed to issue certificate', 500, request);
  }
};

export const config = {
  path: '/api/create-cert',
};
