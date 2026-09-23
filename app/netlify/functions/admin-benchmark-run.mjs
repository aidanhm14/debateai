import { createHash } from 'node:crypto';
import { requireAdmin } from './lib/admin-auth.mjs';
import { verifyIdToken, extractBearerToken, isOwnerEmail, isNamedAccount } from './lib/auth.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

const MODELS = { anthropic: 'claude-opus-5', openai: 'gpt-5.5', google: 'gemini-3.6-flash' };
const KEYS = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GEMINI_API_KEY' };
const MAX_INPUT_CHARS = 20_000;
const MAX_BODY_BYTES = 160_000;
const MAX_OUTPUT_TOKENS = 4096;
const TIMEOUT_MS = 45_000;
const LAYERS = [
  { window: 60_000, max: 3, label: 'minute' },
  { window: 3_600_000, max: 12, label: 'hour' },
  { window: 86_400_000, max: 36, label: 'day' },
];
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');

function providerRequest(provider, model, system, user, key) {
  if (provider === 'anthropic') return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: { model, system, messages: [{ role: 'user', content: user }], max_tokens: MAX_OUTPUT_TOKENS, stream: false },
  };
  if (provider === 'openai') return {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_completion_tokens: MAX_OUTPUT_TOKENS, stream: false },
  };
  return {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS } },
  };
}

function numericUsage(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 2) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, val]) => {
    if (typeof val === 'number' && Number.isFinite(val)) return [[key, val]];
    if (val && typeof val === 'object' && !Array.isArray(val)) return [[key, numericUsage(val, depth + 1)]];
    return [];
  }));
}

function providerResult(provider, data) {
  if (provider === 'anthropic') return {
    served_model_id: typeof data.model === 'string' ? data.model : null,
    text: (data.content || []).filter(p => p.type === 'text').map(p => p.text).join(''),
    usage: numericUsage(data.usage),
    stop_reason: data.stop_reason || null,
    blocked: data.stop_reason === 'refusal',
  };
  if (provider === 'openai') {
    const choice = data.choices?.[0];
    return {
      served_model_id: typeof data.model === 'string' ? data.model : null,
      text: typeof choice?.message?.content === 'string' ? choice.message.content : '',
      usage: numericUsage(data.usage),
      stop_reason: choice?.finish_reason || null,
      blocked: !!choice?.message?.refusal || choice?.finish_reason === 'content_filter',
    };
  }
  const candidate = data.candidates?.[0];
  return {
    served_model_id: typeof data.modelVersion === 'string' ? data.modelVersion : null,
    text: (candidate?.content?.parts || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join(''),
    usage: numericUsage(data.usageMetadata),
    stop_reason: candidate?.finishReason || data.promptFeedback?.blockReason || null,
    blocked: !!data.promptFeedback?.blockReason || ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(candidate?.finishReason),
  };
}

export default async request => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);
  const reply = (data, status = 200) => {
    const response = jsonResponse(data, status, request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
  let gate, identity;
  try {
    gate = await requireAdmin(request);
    if (gate.error) return gate.error;
    identity = await verifyIdToken(extractBearerToken(request));
  } catch {
    return reply({ error: 'Authentication unavailable' }, 401);
  }
  if (identity.sub !== gate.uid || identity.email_verified !== true || !isNamedAccount(identity) || !isOwnerEmail(identity.email)) {
    return reply({ error: 'Founder access required' }, 403);
  }

  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return reply({ error: 'Request too large' }, 413);
  let body;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return reply({ error: 'Request too large' }, 413);
    body = JSON.parse(raw);
  } catch { return reply({ error: 'Invalid JSON body' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(k => !['provider', 'model', 'system', 'user'].includes(k))) {
    return reply({ error: 'Use only provider, model, system and user fields' }, 400);
  }
  const { provider, model, system, user } = body;
  if (!Object.hasOwn(MODELS, provider) || model !== MODELS[provider]) return reply({ error: 'Provider/model pair not allowed' }, 400);
  if (typeof system !== 'string' || typeof user !== 'string' || !system.trim() || !user.trim()) {
    return reply({ error: 'Nonempty system and user strings required' }, 400);
  }
  if (system.length + user.length > MAX_INPUT_CHARS) return reply({ error: 'Combined prompt limit is 20000 characters' }, 413);
  const apiKey = process.env[KEYS[provider]];
  if (!apiKey) return reply({ error: 'Provider unavailable' }, 503);
  try {
    const rate = await checkLayers('admin_benchmark', 'uid_' + gate.uid, LAYERS);
    if (!rate.ok) return reply({ error: 'Benchmark request limit reached', limit_window: rate.layer }, 429);
  } catch { return reply({ error: 'Rate limit check unavailable' }, 503); }

  // Dedicated evaluation requests never enter product prompt assembly or corpus capture.
  const sent = providerRequest(provider, model, system, user, apiKey);
  const sentBody = JSON.stringify(sent.body);
  const provenance = {
    protocol_version: 'debatable-benchmark-0.1',
    provider, requested_model_id: model,
    system_sha256: sha256(system), user_sha256: sha256(user),
    prompt_sha256: sha256(JSON.stringify({ system, user })),
    request_sha256: sha256(JSON.stringify({ provider, body: sent.body })),
    settings: { max_output_tokens: MAX_OUTPUT_TOKENS, stream: false, sampling: 'provider_defaults', timeout_ms: TIMEOUT_MS },
  };
  const started = Date.now();
  const timing = () => ({ elapsed_ms: Date.now() - started, completed_at: new Date().toISOString() });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(sent.url, { method: 'POST', headers: sent.headers, body: sentBody, signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel();
      return reply({ ...provenance, ...timing(), status: 'provider_error', provider_http_status: response.status, error: 'Provider request failed' }, 502);
    }
    const data = await response.json();
    const result = providerResult(provider, data);
    const normalStop = { anthropic: 'end_turn', openai: 'stop', google: 'STOP' }[provider];
    const status = result.blocked ? 'blocked'
      : ['max_tokens', 'model_context_window_exceeded', 'length', 'MAX_TOKENS'].includes(result.stop_reason) ? 'truncated'
      : !result.text ? 'empty'
      : result.stop_reason === normalStop ? 'completed' : 'unresolved';
    return reply({ ...provenance, ...result, ...timing(), status, provider_http_status: response.status });
  } catch {
    return reply({ ...provenance, ...timing(), status: controller.signal.aborted ? 'timeout' : 'provider_error', error: controller.signal.aborted ? 'Provider request timed out' : 'Provider response unavailable' }, controller.signal.aborted ? 504 : 502);
  } finally { clearTimeout(timer); }
};
