import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { createHash } from 'crypto';

// Deep training-signal capture — stores the full prompt → output → user-action
// triple so we can feed real usage back into prompt tuning and fine-tunes.
// Separate from /api/log-event (which is lean telemetry, 500-char caps).
//
// Collections written:
//  - generations: one doc per generation attempt (full text)
//  - generation_signals: subsequent user actions tagged to a generation
//    (rate, save, share, regenerate, edit). This is the supervised label.

const MAX_OUTPUT_CHARS = 40_000;  // ~6k words — fits comp-depth output
const MAX_PROMPT_CHARS = 8_000;   // motion + background + system
const MAX_BODY_BYTES = 140_000;   // voice transcript + prompts + metadata

const VALID_KINDS = new Set([
  'case',
  'tightblock',
  'sneaky',
  'opp_attack',
  'opponent',
  'rebuttal',
  'poi',
  'philosophy',
  'judge_adapt',
  'judge',
  'debate_chat',
  'casual',
  'bot',
  'vision',
  'resolution',
  'voice_round',
  'other',
]);

const VALID_SIGNAL_TYPES = new Set([
  'rate',         // user gave a 1-5 star rating
  'save',         // user saved the case to their cases
  'share',        // user shared / exported
  'regenerate',   // user hit generate again on same motion
  'edit',         // user edited the output text
  'discard',      // user cleared or walked away
  'copy',         // user copied output
]);

// Rate limiting: generations are expensive payloads, cap writes.
const rateLimits = new Map();
const RATE_LIMIT = 60; // 60/min/user
const RATE_LIMIT_ANON = 12; // anonymous voice-round flushes + ratings
const RATE_WINDOW_MS = 60_000;

function isRateLimited(uid, max = RATE_LIMIT) {
  const now = Date.now();
  const entry = rateLimits.get(uid);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(uid, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

// Server-side minors gate: never license data from an account that hasn't
// attested 18+ in profile settings. The client only sets contributable=true
// after the attestation, but a forged request must not bypass it. Cached per
// uid for an hour so this costs at most one profile read/user/hour, and only
// for users who actually have the corpus toggle on.
const ageAttestCache = new Map();
const AGE_TTL_MS = 60 * 60 * 1000;

async function isAgeAttested(db, uid) {
  const c = ageAttestCache.get(uid);
  if (c && Date.now() - c.at < AGE_TTL_MS) return c.attested;
  let attested = false;
  try {
    const p = await db.collection('user_profiles').doc(uid).get();
    attested = p.exists && p.data().corpusAgeAttested === true;
  } catch (e) {
    console.warn('[log-generation] age-attest check failed:', e.message);
    attested = false; // fail closed — no attestation means not licensable
  }
  ageAttestCache.set(uid, { attested, at: Date.now() });
  return attested;
}

setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rateLimits) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) rateLimits.delete(uid);
  }
  for (const [uid, entry] of ageAttestCache) {
    if (now - entry.at > AGE_TTL_MS) ageAttestCache.delete(uid);
  }
}, 5 * 60 * 1000);

function clamp(val, max) {
  if (typeof val !== 'string') return '';
  return val.length > max ? val.slice(0, max) : val;
}

function sanitizeContext(ctx) {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return {};
  const out = {};
  const keys = Object.keys(ctx).slice(0, 30);
  for (const k of keys) {
    const v = ctx[k];
    if (typeof v === 'string') {
      out[k] = k === 'fullTranscript'
        ? v.slice(0, MAX_OUTPUT_CHARS)
        : v.slice(0, 500);
    }
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

function sanitizeSid(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s || s.length > 64) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return '';
  return s;
}

function anonUid(sessionId) {
  return 'anon:' + createHash('sha256').update(sessionId).digest('hex').slice(0, 24);
}

function clientIp(request) {
  const h = request.headers;
  return (
    h.get('x-nf-client-connection-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    h.get('cf-connecting-ip') ||
    'unknown'
  );
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return errorResponse('Payload too large', 413, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400, request); }

  const token = extractBearerToken(request);
  let uid = '';
  let isAnon = false;
  let authProvider = '';

  if (token) {
    let decoded;
    try {
      decoded = await verifyIdToken(token);
    } catch (err) {
      console.error('log-generation auth error:', err.message);
      return errorResponse('Authentication failed. Please sign in again.', 401, request);
    }
    uid = decoded.sub;
    authProvider = decoded?.firebase?.sign_in_provider || decoded?.sign_in_provider || '';
  } else {
    const sid = sanitizeSid(body.sessionId || body.anonymousSessionId || body?.context?.sessionId);
    if (!sid) return errorResponse('Authorization required', 401, request);

    const appCheckResult = await checkAppCheck(request);
    if (!appCheckResult.ok) {
      return errorResponse('App verification failed. Reload the page and try again.', 401, request);
    }

    uid = anonUid(sid);
    isAnon = true;
    authProvider = 'anonymous_session';
  }

  const rateKey = isAnon ? uid + ':' + clientIp(request) : uid;
  if (isRateLimited(rateKey, isAnon ? RATE_LIMIT_ANON : RATE_LIMIT)) {
    return errorResponse('Rate limit exceeded. Try again shortly.', 429, request);
  }

  const { action } = body;

  try {
    const db = getDb();

    // ── Mode A: new generation ───────────────────────────────────
    if (action === 'generation' || !action) {
      const {
        kind,
        motion,
        side,
        format,
        depth,
        model,
        promptId,
        systemPrompt,
        userPrompt,
        output,
        durationMs,
        inputTokens,
        outputTokens,
        context,
      } = body;

      if (!kind || typeof kind !== 'string' || !VALID_KINDS.has(kind)) {
        return errorResponse('Invalid or missing kind', 400, request);
      }
      if (isAnon && kind !== 'voice_round') {
        return errorResponse('Anonymous generation logging is only enabled for voice rounds', 401, request);
      }
      if (!output || typeof output !== 'string') {
        return errorResponse('Missing output', 400, request);
      }

      // Research-corpus consent at write time. The flag is stamped on the
      // doc when it lands; a later opt-out cannot retroactively un-license
      // a previously contributable round, and an opt-in does not reach back
      // to pre-consent rounds. This is the only legally clean posture for
      // any downstream licensing of the generations corpus.
      const anonymousAuth = isAnon || authProvider === 'anonymous';
      let contributable = !anonymousAuth && body.contributable === true;
      // Minors gate (defense in depth): never stamp contributable on an
      // account that hasn't attested 18+, even if the client sends true.
      if (contributable && !(await isAgeAttested(db, uid))) {
        contributable = false;
      }
      const cleanContext = sanitizeContext(context);
      if (isAnon) cleanContext.source = cleanContext.source || 'anonymous_voice_round';

      const doc = {
        uid,
        anonymous: anonymousAuth,
        authProvider: clamp(authProvider, 60),
        kind,
        motion: clamp(motion, 2000),
        side: clamp(side, 40),
        format: clamp(format, 40),
        depth: clamp(depth, 40),
        model: clamp(model, 100),
        promptId: clamp(promptId, 100),
        systemPrompt: clamp(systemPrompt, MAX_PROMPT_CHARS),
        userPrompt: clamp(userPrompt, MAX_PROMPT_CHARS),
        output: clamp(output, MAX_OUTPUT_CHARS),
        outputLength: output.length,
        durationMs: typeof durationMs === 'number' ? durationMs : null,
        inputTokens: typeof inputTokens === 'number' ? inputTokens : null,
        outputTokens: typeof outputTokens === 'number' ? outputTokens : null,
        context: cleanContext,
        contributable,
        createdAt: FieldValue.serverTimestamp(),
      };

      const ref = await db.collection('generations').add(doc);
      console.log('[log-generation]', kind, uid.slice(0, 6), 'id=', ref.id, 'len=', doc.outputLength);
      return jsonResponse({ ok: true, id: ref.id }, 200, request);
    }

    // ── Mode B: user-action signal on a prior generation ──────────
    if (action === 'signal') {
      const { generationId, signal, value, meta } = body;
      if (!generationId || typeof generationId !== 'string') {
        return errorResponse('Missing generationId', 400, request);
      }
      if (!signal || !VALID_SIGNAL_TYPES.has(signal)) {
        return errorResponse('Invalid signal type', 400, request);
      }
      if (isAnon && signal !== 'rate') {
        return errorResponse('Anonymous signals are limited to round ratings', 401, request);
      }
      if (isAnon && (typeof value !== 'number' || value < 1 || value > 5)) {
        return errorResponse('Anonymous ratings must be 1-5', 400, request);
      }

      // Verify the generation belongs to this user before attaching a signal.
      const genRef = db.collection('generations').doc(generationId);
      const genDoc = await genRef.get();
      if (!genDoc.exists || genDoc.data().uid !== uid) {
        return errorResponse('Generation not found', 404, request);
      }

      await db.collection('generation_signals').add({
        uid,
        generationId,
        signal,
        value: typeof value === 'number' ? value : null,
        meta: sanitizeContext(meta),
        createdAt: FieldValue.serverTimestamp(),
      });

      // Denormalize the most-recent signal onto the generation doc so
      // downstream querying ("show me 5-star cases") doesn't require a join.
      const update = { lastSignal: signal, lastSignalAt: FieldValue.serverTimestamp() };
      if (signal === 'rate' && typeof value === 'number') {
        update.rating = value;
        // Boring/generic flag + freeform notes ride along on the rate
        // signal. Denormalized so the cataloging query
        // (generations.where('boring', '==', true).where('format', '==', X))
        // doesn't need to join generation_signals. Matches the admin
        // rating tool's write shape — both surfaces feed the same field.
        if (meta && typeof meta.boring === 'boolean') {
          update.boring = meta.boring;
        }
        if (meta && typeof meta.notes === 'string' && meta.notes.trim()) {
          update.userNotes = clamp(meta.notes, 600);
        }
      }
      if (signal === 'save') update.saved = true;
      if (signal === 'share') update.shared = true;
      if (signal === 'regenerate') update.regenerated = true;
      if (signal === 'edit') {
        update.edited = true;
        if (meta && typeof meta.editedOutput === 'string') {
          update.editedOutput = clamp(meta.editedOutput, MAX_OUTPUT_CHARS);
        }
      }
      await genRef.update(update);

      return jsonResponse({ ok: true }, 200, request);
    }

    return errorResponse('Unknown action', 400, request);
  } catch (err) {
    console.error('log-generation error:', err.message, err.code || '');
    return errorResponse('Failed to log generation', 500, request);
  }
};

export const config = {
  path: '/api/log-generation',
};
