import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

// LLM-classify a candidate /disclosures publish before it lands on
// the public board. Layered ABOVE the cheap client-side floor in
// /js/disclosure-guard.js — the word-list catches obvious slurs +
// link spam in 0ms; this catches the subtler stuff (harassment of
// a named person, dogwhistles, doxxing, off-topic spam disguised as
// argument).
//
// Returns:
//   { ok: true } — safe to publish
//   { ok: false, reason: "...", category: "..." } — block + show
//
// Categories: 'harassment' | 'doxxing' | 'spam' | 'off_topic' |
// 'self_harm' | 'sexual_minor' | 'illegal'. Off-topic = looks like a
// case at a glance but is actually unrelated to the motion (LLM
// SEO content, etc.).
//
// Auth-required so anonymous abuse can't pile up. Rate-limited via
// the same in-memory pattern log-event.mjs uses.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.DISCLOSURE_CLASSIFY_MODEL || 'claude-haiku-4-5';

// In-memory rate limit: classify is cheap but if a user is trying to
// brute-force past the filter, throttle them.
const rateLimits = new Map();
const RATE_LIMIT_PER_MIN = 10;

function isRateLimited(uid) {
  const now = Date.now();
  const entry = rateLimits.get(uid);
  if (!entry || now - entry.windowStart > 60_000) {
    rateLimits.set(uid, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_PER_MIN;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    if (now - v.windowStart > 120_000) rateLimits.delete(k);
  }
}, 5 * 60 * 1000);

const SYSTEM_PROMPT = `You are a content moderator for a debate-AI app's public disclosure board. Users publish their debate cases (arguments) on motions like "This House would ban single-use plastics." Other debaters read them for prep.

Your job: decide whether a candidate disclosure is safe to publish or should be blocked.

ALLOW (always safe):
- Real debate arguments, even ones that take controversial positions on legal/policy questions (drug legalization, abortion, immigration, Israel/Palestine, sex work, etc). Steelmanning unpopular views is the WHOLE POINT of debate; don't block based on the position.
- Strong language, profanity used as emphasis, blunt criticism of policies / governments / public figures.
- Discussion of slurs IN A QUOTED, ANALYTICAL CONTEXT ("the opposition's framing relies on the n-word's reclamation history" is fine; raw use is not).
- Heavy academic vocabulary, jargon, philosophy references — the audience is debaters.

BLOCK (categories):
- harassment: targeting a specific named non-public-figure with attacks, threats, slurs. Public figures (politicians, executives, well-known authors) are FAIR GAME for criticism in a debate context.
- doxxing: publishing private contact info, addresses, phone numbers, real names of non-public-figures.
- spam: link dumps, SEO content with no real argument, promotional content for unrelated products/services.
- off_topic: case body that doesn't actually argue the motion — random text, copy-paste from a different topic, AI-generated fluff with no engagement with the specific motion.
- self_harm: instructions or encouragement for self-harm/suicide.
- sexual_minor: sexual content involving minors (zero tolerance).
- illegal: instructions for making weapons, drugs synthesis, hacking specific systems, fraud.

Return ONLY a JSON object, no prose, no markdown:
{
  "ok": true | false,
  "reason": "<short user-facing explanation, only when ok=false>",
  "category": "<one of: harassment | doxxing | spam | off_topic | self_harm | sexual_minor | illegal>"
}

When in doubt, default to ALLOW. Debate disclosures are a serious-arguments space and over-blocking kills the library. Block only when the content has CLEARLY tripped one of the categories above.`;

async function classifyWithClaude(motion, output) {
  if (!ANTHROPIC_KEY) {
    // No key configured — fail open (allow the publish). The cheap
    // word-list guard on the client still ran. Better to ship missing
    // an LLM check than to block legitimate publishers because the
    // server can't reach Anthropic.
    return { ok: true, category: 'allow_no_classifier' };
  }

  const userMsg = `MOTION: ${motion}\n\nCANDIDATE DISCLOSURE:\n${output}\n\nClassify.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.warn('[classify-disclosure] Anthropic error', resp.status, errText.slice(0, 240));
    // Fail open — see comment above. Network blip should not block
    // a real disclosure.
    return { ok: true, category: 'allow_classifier_unreachable' };
  }

  const data = await resp.json();
  const text = (data.content || []).map(c => (c && c.text) || '').join('').trim();
  if (!text) return { ok: true, category: 'allow_empty_response' };

  // Strip ```json fences if model added them.
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first < 0 || last <= first) return { ok: true, category: 'allow_unparseable' };

  try {
    const parsed = JSON.parse(cleaned.slice(first, last + 1));
    if (parsed.ok === false){
      return {
        ok: false,
        reason: String(parsed.reason || 'Disclosure flagged for review.').slice(0, 280),
        category: String(parsed.category || 'unknown').slice(0, 40),
      };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[classify-disclosure] JSON parse failed:', e.message);
    return { ok: true, category: 'allow_parse_error' };
  }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authorization required', 401, request);

  let decoded;
  try { decoded = await verifyIdToken(token); }
  catch (err) {
    console.error('classify-disclosure auth error:', err.message);
    return errorResponse('Authentication failed', 401, request);
  }

  const uid = decoded.sub;
  if (isRateLimited(uid)) {
    return errorResponse('Rate limit. Slow down on disclosure attempts.', 429, request);
  }

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400, request); }

  const motion = String(body.motion || '').slice(0, 1024);
  const output = String(body.output || '').slice(0, 51200);
  if (!output.trim()) return errorResponse('Empty output', 400, request);

  try {
    const result = await classifyWithClaude(motion, output);
    return jsonResponse(result, 200, request);
  } catch (err) {
    console.error('classify-disclosure error:', err.message);
    // Fail open on unexpected error — the client-side guard already
    // ran and the publish would otherwise hang.
    return jsonResponse({ ok: true, category: 'allow_server_error' }, 200, request);
  }
};

export const config = {
  path: '/api/classify-disclosure',
};
