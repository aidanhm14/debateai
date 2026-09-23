import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { corsResponse, jsonResponse, errorResponse } from '../app/netlify/functions/lib/response.mjs';

const source = readFileSync(new URL('../app/netlify/functions/admin-benchmark-run.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async request =>', 'globalThis.handler = async request =>');
const secret = 'test-only-not-a-real-api-key';
const system = '  Evaluate the actual objection.\nKeep the same prompt.  ';
const user = '\nA: Free buses improve access.\nB: How is lost fare revenue replaced?\n';
const pairs = [['anthropic', 'claude-opus-5'], ['openai', 'gpt-5.5'], ['google', 'gemini-3.6-flash']];
const input = (provider = 'anthropic', model = 'claude-opus-5') => ({ provider, model, system, user });
const request = body => new Request('https://itsdebatable.com/.netlify/functions/admin-benchmark-run', {
  method: 'POST', headers: { Authorization: 'Bearer mock-valid-token', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');

function harness(options = {}) {
  const calls = [], rates = [];
  const context = {
    createHash, corsResponse, jsonResponse, errorResponse, Buffer, Response, AbortController,
    setTimeout: options.timeout ? fn => setTimeout(fn, 1) : setTimeout,
    clearTimeout,
    process: { env: options.noKey ? {} : { ANTHROPIC_API_KEY: secret, OPENAI_API_KEY: secret, GEMINI_API_KEY: secret } },
    requireAdmin: async () => options.denied
      ? { error: new Response('Denied', { status: options.denied }) }
      : { uid: 'owner', db: new Proxy({}, { get() { throw new Error('Unexpected database access'); } }) },
    verifyIdToken: async token => {
      assert.equal(token, 'mock-valid-token');
      if (options.badToken) throw new Error(secret);
      return { sub: 'owner', email: options.nonOwner ? 'other@example.invalid' : 'owner@example.invalid', email_verified: !options.unverified, firebase: { sign_in_provider: options.anonymous ? 'anonymous' : 'google.com' } };
    },
    extractBearerToken: r => r.headers.get('authorization')?.slice(7),
    isOwnerEmail: email => email === 'owner@example.invalid',
    isNamedAccount: identity => identity.firebase.sign_in_provider !== 'anonymous',
    checkLayers: async (...args) => {
      rates.push(args);
      if (options.rateError) throw new Error(secret);
      return options.limited ? { ok: false, layer: 'hour' } : { ok: true };
    },
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      if (options.timeout) return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error(secret)), { once: true }));
      if (options.throwFetch) throw new Error(secret);
      if (options.httpError) return new Response('sensitive upstream error ' + secret, { status: options.httpError });
      if (options.invalidJson) return new Response('<html>' + secret, { status: 200 });
      const provider = url.includes('anthropic') ? 'anthropic' : url.includes('openai') ? 'openai' : 'google';
      const data = options.data || {
        anthropic: { model: 'claude-opus-5-reported', content: [{ type: 'text', text: 'Answer' }], usage: { input_tokens: 10, output_tokens: 4 }, stop_reason: 'end_turn' },
        openai: { model: 'gpt-5.5-reported', choices: [{ message: { content: 'Answer' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 2 } } },
        google: { modelVersion: 'gemini-3.6-flash-reported', candidates: [{ content: { parts: [{ text: 'hidden thought', thought: true }, { text: 'Answer' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 2 } },
      }[provider];
      return new Response(JSON.stringify(data), { status: 200 });
    },
  };
  runInNewContext(source, context);
  return { calls, rates, handler: context.handler };
}

for (const status of [401, 403]) {
  const h = harness({ denied: status });
  assert.equal((await h.handler(request(input()))).status, status);
  assert.equal(h.calls.length, 0);
  assert.equal(h.rates.length, 0);
}
for (const option of [{ nonOwner: true }, { anonymous: true }, { unverified: true }, { badToken: true }]) {
  const h = harness(option);
  assert.equal((await h.handler(request(input()))).status, option.badToken ? 401 : 403);
  assert.equal(h.calls.length, 0);
}
const hashes = [];
for (const [provider, model] of pairs) {
  const h = harness();
  const response = await h.handler(request(input(provider, model)));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const data = await response.json();
  assert.equal(data.status, 'completed');
  assert.equal(data.text, 'Answer');
  assert.equal(data.served_model_id, model + '-reported');
  assert.equal(data.system_sha256, hash(system));
  assert.equal(data.user_sha256, hash(user));
  assert.equal(data.prompt_sha256, hash(JSON.stringify({ system, user })));
  assert.equal(data.settings.max_output_tokens, 4096);
  assert.equal(data.settings.sampling, 'provider_defaults');
  assert.equal(data.settings.timeout_ms, 45000);
  assert.equal(h.calls.length, 1);
  const sent = h.calls[0];
  assert.equal(data.request_sha256, hash(JSON.stringify({ provider, body: sent.body })));
  hashes.push(data.prompt_sha256);
  assert.equal(h.rates[0][0], 'admin_benchmark');
  assert.equal(h.rates[0][1], 'uid_owner');
  assert.deepEqual(JSON.parse(JSON.stringify(h.rates[0][2])).map(l => l.max), [3, 12, 36]);
  assert.equal(JSON.stringify(data).includes(secret), false);
  assert.equal(sent.url.includes(secret), false);
  if (provider === 'anthropic') {
    assert.deepEqual(sent.body, { model, system, messages: [{ role: 'user', content: user }], max_tokens: 4096, stream: false });
    assert.equal(sent.init.headers['x-api-key'], secret);
  } else if (provider === 'openai') {
    assert.deepEqual(sent.body, { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_completion_tokens: 4096, stream: false });
    assert.equal(data.usage.completion_tokens_details.reasoning_tokens, 2);
  } else {
    assert.deepEqual(sent.body, { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: 4096 } });
    assert.equal(sent.init.headers['x-goog-api-key'], secret);
  }
}
assert.equal(new Set(hashes).size, 1, 'all providers receive identical prompt strings');

for (const body of [input('anthropic', 'gpt-5.5'), input('other', 'claude-opus-5'), { ...input(), stream: true }, { ...input(), max_tokens: 999999 }, { ...input(), _voiceFeature: 'case' }, { ...input(), user: '' }]) {
  const h = harness();
  assert.equal((await h.handler(request(body))).status, 400);
  assert.equal(h.calls.length, 0, 'no model fallback or unknown settings');
}
const boundary = harness();
assert.equal((await boundary.handler(request({ ...input(), system: 's', user: 'u'.repeat(19999) }))).status, 200);
const oversize = harness();
assert.equal((await oversize.handler(request({ ...input(), system: 's', user: 'u'.repeat(20000) }))).status, 413);
assert.equal(oversize.calls.length, 0);
for (const [options, status] of [[{ noKey: true }, 503], [{ limited: true }, 429], [{ rateError: true }, 503]]) {
  const h = harness(options);
  const response = await h.handler(request(input()));
  assert.equal(response.status, status);
  assert.equal((await response.text()).includes(secret), false);
  assert.equal(h.calls.length, 0);
}
for (const options of [{ httpError: 429 }, { throwFetch: true }, { invalidJson: true }, { timeout: true }]) {
  const h = harness(options);
  const response = await h.handler(request(input()));
  assert.equal(response.status, options.timeout ? 504 : 502);
  const data = await response.json();
  assert.equal(JSON.stringify(data).includes(secret), false);
  assert.equal(h.calls.length, 1, 'provider failures never retry');
  assert.equal(data.prompt_sha256, hash(JSON.stringify({ system, user })));
  if (options.httpError) assert.equal(data.provider_http_status, 429);
  assert.equal(typeof data.elapsed_ms, 'number');
  assert.equal(Number.isFinite(Date.parse(data.completed_at)), true);
}
const truncated = harness({ data: { model: 'gpt-5.5', choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: { completion_tokens: 4096 } } });
assert.equal((await (await truncated.handler(request(input('openai', 'gpt-5.5')))).json()).status, 'truncated');
const blocked = harness({ data: { promptFeedback: { blockReason: 'SAFETY' } } });
const blockedData = await (await blocked.handler(request(input('google', 'gemini-3.6-flash')))).json();
assert.equal(blockedData.status, 'blocked');
assert.equal(blockedData.served_model_id, null, 'missing served identity is never inferred');
const empty = harness({ data: {} });
assert.equal((await (await empty.handler(request(input('anthropic', 'claude-opus-5')))).json()).status, 'empty');
for (const [reason, status] of [['refusal', 'blocked'], ['model_context_window_exceeded', 'truncated'], ['pause_turn', 'unresolved']]) {
  const h = harness({ data: { model: 'claude-opus-5', content: [{ type: 'text', text: 'Partial answer' }], stop_reason: reason } });
  assert.equal((await (await h.handler(request(input()))).json()).status, status);
}
for (const reason of ['LANGUAGE', 'OTHER', 'MALFORMED_RESPONSE', 'UNEXPECTED_TOOL_CALL']) {
  const h = harness({ data: { modelVersion: 'gemini-3.6-flash', candidates: [{ content: { parts: [{ text: 'Partial answer' }] }, finishReason: reason }] } });
  assert.equal((await (await h.handler(request(input('google', 'gemini-3.6-flash')))).json()).status, 'unresolved');
}
console.log('Founder benchmark runner: authorization, exact provider payloads/prompts, fixed budgets, no fallback, bounded failures, hashes and usage/status preservation passed. No live calls.');
