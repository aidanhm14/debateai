import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

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
const RATE_WINDOW_MS = 60_000;

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
    if (typeof v === 'string') out[k] = v.slice(0, 500);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (err) {
    console.error('log-generation auth error:', err.message);
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const uid = decoded.sub;
  if (isRateLimited(uid)) {
    return errorResponse('Rate limit exceeded. Try again shortly.', 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400, request); }

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
      if (!output || typeof output !== 'string') {
        return errorResponse('Missing output', 400, request);
      }

      const doc = {
        uid,
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
        context: sanitizeContext(context),
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
      if (signal === 'rate' && typeof value === 'number') update.rating = value;
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
