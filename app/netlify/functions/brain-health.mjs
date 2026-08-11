// /api/brain-health  →  Does each AI brain actually answer right now?
//
// WHY THIS EXISTS
// On 2026-08-11 a judge-panel audit found, incidentally, that three of
// the six brains this site advertises were dead: Gemini's billing was
// exhausted, the xAI key was invalid, and OPENROUTER_API_KEY had never
// been set on Netlify. Nothing anywhere reported it. A signed-in user
// picking Grok on /judge got an error, /pricing kept selling "six
// brains", and the only way anyone found out was a human happening to
// curl the providers during unrelated work.
//
// That is the same shape as the judge panel's truncated juror, the
// frozen visitor counter, and the learning loop's missing indexes: a
// subsystem rendering a plausible screen for months. The fix for the
// class is not more care, it is a probe that fails loudly.
//
// WHAT IT DOES
// One tiny completion per provider, run concurrently, reporting whether
// the brain answered and how long it took. Not a synthetic ping: it
// calls the SAME model the brain picker offers, because a working key
// against a retired model id is still a dead brain to a user.
//
// PUBLIC, and deliberately so. /judge reads it to grey out a brain
// rather than letting someone pick one that errors on click, and that
// read has to work for a signed-out visitor. Same posture as
// /api/judge/charter: the honest operational state is worth more
// published than hidden.
//
// The provider's raw error message is NOT public. "Your prepayment
// credits are depleted" names an account's billing state, so the public
// payload carries a REASON CATEGORY (auth / billing / rate_limit /
// model / timeout / down) which is what a picker needs anyway. The raw
// text is added for an authenticated admin, who is the person who can
// act on it.
//
// COST. Probes are max_tokens 1-8 and the result is shared-cached for
// 15 minutes, so a busy day costs about 96 probe sets, i.e. cents per
// month. No cron: it probes lazily on a request that finds the cache
// cold. That is deliberate given the 2026-05-18 credit-burn audit,
// which killed a keepalive doing far less for far more.

import { verifyIdToken, extractBearerToken, isAdminEmail } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getCachedShared, setCachedShared, wantsFresh } from './lib/admin-cache.mjs';
import { BRAINS, classify, usesCompletionTokens, publicView } from './lib/brain-health.mjs';

const ADMIN_UID = process.env.ADMIN_UID || 'REPLACE_WITH_YOUR_FIREBASE_UID';
const CACHE_KEY = 'brain-health:v1';
const TTL_MS = 15 * 60 * 1000;
const PROBE_TIMEOUT_MS = 8000;

async function probeOne(brain) {
  const key = process.env[brain.env];
  // An unset key is a configured-off brain, not a broken one. Saying so
  // precisely is the difference between "top up billing" and "you never
  // added the key", which are different jobs for different people.
  if (!key) return { ok: false, reason: 'unconfigured', ms: 0, detail: `${brain.env} is not set` };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
  const started = Date.now();
  try {
    const model = brain.key === 'openlab' ? (process.env.OPENLAB_MODEL || brain.model) : brain.model;
    let url;
    let headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    let body;

    if (brain.key === 'claude') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
      body = { model, max_tokens: 4, messages: [{ role: 'user', content: 'ok' }] };
    } else if (brain.key === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      headers = { 'Content-Type': 'application/json' };
      body = { contents: [{ role: 'user', parts: [{ text: 'ok' }] }], generationConfig: { maxOutputTokens: 4 } };
    } else {
      url = brain.key === 'gpt' ? 'https://api.openai.com/v1/chat/completions'
        : brain.key === 'grok' ? 'https://api.x.ai/v1/chat/completions'
          : brain.key === 'deepseek' ? 'https://api.deepseek.com/chat/completions'
            : 'https://openrouter.ai/api/v1/chat/completions';
      body = {
        model,
        ...(usesCompletionTokens(model) ? { max_completion_tokens: 16 } : { max_tokens: 4 }),
        messages: [{ role: 'user', content: 'ok' }],
      };
    }

    const r = await fetch(url, { method: 'POST', signal: ac.signal, headers, body: JSON.stringify(body) });
    const ms = Date.now() - started;
    if (!r.ok) {
      const text = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 220);
      return { ok: false, reason: classify(r.status, text), ms, detail: `${r.status}: ${text}` };
    }
    return { ok: true, reason: null, ms, detail: '' };
  } catch (err) {
    const ms = Date.now() - started;
    const aborted = err && err.name === 'AbortError';
    return {
      ok: false,
      reason: aborted ? 'timeout' : 'down',
      ms,
      detail: aborted ? `no response in ${PROBE_TIMEOUT_MS}ms` : String((err && err.message) || err).slice(0, 220),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeAll() {
  const results = await Promise.all(BRAINS.map(async (b) => {
    const r = await probeOne(b);
    return { key: b.key, name: b.name, maker: b.maker, model: b.model, env: b.env, ...r };
  }));
  return {
    generatedAt: Date.now(),
    ttlMs: TTL_MS,
    total: results.length,
    up: results.filter((r) => r.ok).length,
    brains: results,
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405, request);

  // Admin is resolved BEFORE the cache read so a stale-cache hit still
  // returns the full record to an admin and the redacted one to
  // everyone else. Caching the redaction instead would leak whichever
  // view happened to warm the cache first.
  let isAdmin = false;
  const token = extractBearerToken(request);
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      isAdmin = decoded.sub === ADMIN_UID || isAdminEmail(decoded.email);
    } catch {
      // An unreadable token is an anonymous caller, not an error. This
      // endpoint is public; a bad token must not deny the picker its read.
      isAdmin = false;
    }
  }

  // Only an admin may force a re-probe. Otherwise any visitor could
  // spend real provider calls by appending a query parameter.
  const fresh = isAdmin && wantsFresh(request);
  const cached = fresh ? null : await getCachedShared(CACHE_KEY);
  if (cached) return jsonResponse(isAdmin ? cached : publicView(cached), 200, request);

  try {
    const payload = await probeAll();
    await setCachedShared(CACHE_KEY, payload, TTL_MS).catch(() => {});
    return jsonResponse(isAdmin ? payload : publicView(payload), 200, request);
  } catch (err) {
    console.error('brain-health error:', err && err.message);
    return errorResponse('Could not probe the brains', 500, request);
  }
};

export const config = { path: '/api/brain-health' };
