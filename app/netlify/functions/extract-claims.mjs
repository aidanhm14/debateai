// WS3: Claim extraction from debate speeches.
// Endpoint: POST /api/extract-claims
// Payload: { text, format, side }
// Returns: [{ claim, evidence, strength: 0-1 }]
//
// Uses Claude to identify the 3-5 strongest claims from a speech.
// Strength = how directly this argument advances the motion.

import { jsonResponse, errorResponse } from './lib/response.mjs';
import { checkAppCheck } from './lib/appcheck.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { resolveCaller } from './lib/caller.mjs';
import { callModel, CHEAP_FAST, FALLBACK_FAST } from './lib/cheap.mjs';

// Model is env-overridable so an expensive default can be rolled back without
// a redeploy. Defaults to Haiku, not Opus — this endpoint summarizes a speech,
// it does not need frontier reasoning, and it used to hardcode claude-opus-5
// with no gate at all (a free unmetered Opus proxy for any anonymous caller).
// Claim extraction is read-the-text-and-emit-JSON. Nothing about it needs a
// frontier model, and at 16x/40x under Haiku the cheap tier is the whole
// point. EXTRACT_CLAIMS_MODEL still overrides; a claude-* id there routes
// straight back to Anthropic with no redeploy.
const CLAIMS_MODEL = process.env.EXTRACT_CLAIMS_MODEL || CHEAP_FAST;

const EXTRACTION_PROMPT = `You are analyzing a debate speech. Extract the 3-5 strongest claims made.
For each claim:
1. State it as a clear, standalone assertion (1-2 sentences)
2. Note the key evidence or reasoning supporting it
3. Rate strength 0-1: how directly does this advance the motion?

Format as JSON array: [{ "claim": "...", "evidence": "...", "strength": 0.85 }, ...]

Speech text:
{SPEECH}

Return ONLY the JSON array, no preamble.`;

export default async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('POST only', 405, request);
  }

  // App Check + a hard rate limit so this LLM proxy can't be looped for free
  // credit burn. Keyed by caller rather than by IP since 2026-08-19: an IP is
  // a whole school on one NAT sharing 60/hour, and it is also not an account,
  // so a signed-in user was metered against the guest on the next desk.
  const appCheck = await checkAppCheck(request);
  if (!appCheck.ok) {
    return errorResponse('App verification failed. Reload and try again.', 401, request);
  }
  const caller = await resolveCaller(request);
  const rl = await checkLayers('extract-claims', caller.key, caller.named
    ? [
        { label: 'min', window: 60_000, max: 20 },
        { label: 'hour', window: 3_600_000, max: 180 },
      ]
    : [
        { label: 'min', window: 60_000, max: 10 },
        { label: 'hour', window: 3_600_000, max: 60 },
      ]);
  if (!rl.ok) {
    return errorResponse('Too many requests, give it a moment.', 429, request);
  }

  let body;
  try { body = await request.json(); } catch {
    return errorResponse('Invalid JSON', 400, request);
  }

  const { text, format, side } = body;
  if (!text || !format) {
    return errorResponse('text and format required', 400, request);
  }

  try {
    const prompt = EXTRACTION_PROMPT.replace('{SPEECH}', text.slice(0, 3000));
    if (!process.env.DEEPSEEK_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return errorResponse('API key not configured', 500, request);
    }

    const result = await callModel({
      model: CLAIMS_MODEL,
      fallback: FALLBACK_FAST,
      label: 'extract-claims',
      body: {
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      }
    });

    const responseText = result?.content?.[0]?.text || '';

    // Parse JSON array from response
    let claims = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        claims = JSON.parse(jsonMatch[0]);
        // Validate structure
        claims = claims.filter(c => c.claim && typeof c.strength === 'number');
        claims = claims.slice(0, 5);  // Max 5 claims
      }
    } catch (parseErr) {
      console.warn('[extract-claims] JSON parse failed:', parseErr.message);
    }

    return jsonResponse({
      ok: true,
      format,
      side: side || '',
      claimCount: claims.length,
      claims: claims
    }, 200, request);
  } catch (err) {
    console.error('[extract-claims] error:', err.message);
    return errorResponse('Failed to extract claims', 500, request);
  }
};

export const config = {
  path: '/api/extract-claims',
};
