// WS3: Claim extraction from debate speeches.
// Endpoint: POST /api/extract-claims
// Payload: { text, format, side }
// Returns: [{ claim, evidence, strength: 0-1 }]
//
// Uses Claude to identify the 3-5 strongest claims from a speech.
// Strength = how directly this argument advances the motion.

import { callAnyAI } from './lib/brain-router.mjs';
import { json, errorResponse } from './lib/response.mjs';

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

    const result = await callAnyAI({
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      model: 'claude',  // Use Claude for reasoning over claim extraction
      max_tokens: 800,
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

    return json({
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
