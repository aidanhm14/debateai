import { assert, generateRecord, hash, RUBRIC, VERSION, validateSchema } from './synthetic-lab-core.mjs';

export const EXAMPLES = [
  { id: 'free-buses', family: 'urban-transit', motion: 'Should a city make local buses free?', context: 'A hypothetical city has a fixed transport budget. No ridership, capacity or budget figures are supplied.', evidence: [] },
  { id: 'four-day-week', family: 'workplace-policy', motion: 'Should an office switch to a four-day working week at the same pay?', context: 'Customer support must stay available five days a week. No productivity measurements are supplied.', evidence: [] },
  { id: 'phone-storage', family: 'classroom-technology', motion: 'Should students leave phones outside the classroom during lessons?', context: 'Compare storage outside class with silent phones in bags. Accommodate accessibility needs. No studies are supplied.', evidence: [] },
  { id: 'car-free-street', family: 'city-planning', motion: 'Should a city turn its main shopping street into a pedestrian-only street?', context: 'Shops need deliveries, some visitors need accessible transport, and current businesses serve both drivers and pedestrians. No traffic data is supplied.', evidence: [] },
  { id: 'salary-transparency', family: 'pay-transparency', motion: 'Should companies tell employees what everyone else earns?', context: 'Compare exact salaries visible to colleagues with published salary bands. No pay disparity measurements are supplied.', evidence: [] },
  { id: 'right-to-repair', family: 'device-repair', motion: 'Should phone makers be required to sell spare parts to independent repair shops?', context: 'Consider repair cost, product safety and access to parts. Do not invent failure rates or cost estimates.', evidence: [] },
  { id: 'return-to-office', family: 'workplace-policy', motion: 'Should an office require everyone to come in three days each week?', context: 'Some tasks need collaboration; other tasks need uninterrupted concentration. Compare a universal requirement with team-level choices.', evidence: [] },
  { id: 'cashless-shops', family: 'payment-access', motion: 'Should shops be allowed to refuse cash?', context: 'Consider payment access, handling costs and reliability during outages. No measured costs or customer statistics are supplied.', evidence: [] },
  { id: 'renter-pets', family: 'rental-housing', motion: 'Should landlords have to allow tenants to keep a pet?', context: 'Consider property damage, the needs of other residents and tenants\' control over their home. No damage statistics are supplied.', evidence: [] },
  { id: 'subscription-cancellation', family: 'consumer-rights', motion: 'Should cancelling a subscription be as easy as signing up?', context: 'Compare a one-step cancellation option with a required conversation with customer support. Consider informed choice and unwanted charges.', evidence: [] },
];
export const LAB_CONFIG = {
  maxRepairs: 2, variants: 1, demo: false,
  roles: {
    debaterA: { provider: 'anthropic', model: 'claude-sonnet-5', maxOutputTokens: 1800 },
    debaterB: { provider: 'openai', model: 'gpt-4.1', maxOutputTokens: 1800 },
    judgeA: { provider: 'anthropic', model: 'claude-sonnet-5', reasoningEffort: 'low', maxOutputTokens: 3500 },
    judgeB: { provider: 'openai', model: 'gpt-5.5', reasoningEffort: 'low', maxOutputTokens: 6000 },
    repair: { provider: 'anthropic', model: 'claude-sonnet-5', maxOutputTokens: 1800 },
  },
};

function anthropicSchema(value) {
  if (Array.isArray(value)) return value.map(anthropicSchema);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['minimum', 'maximum'].includes(key)).map(([key, child]) => [key, anthropicSchema(child)]));
  return value;
}

export async function providerCall(role, prompt, schema, config, fetchImpl = fetch) {
  const setting = config.roles[role];
  assert(setting, 'Unknown model role.');
  const started = Date.now();
  const schemaInstruction = '\nReturn only JSON conforming to this schema: ' + JSON.stringify(schema);
  let url, body, headers;
  if (setting.provider === 'anthropic') {
    assert(process.env.ANTHROPIC_API_KEY, 'The Anthropic provider is unavailable.');
    url = 'https://api.anthropic.com/v1/messages';
    headers = { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' };
    body = { model: setting.model, max_tokens: setting.maxOutputTokens, system: prompt.filter(p => p.role === 'system').map(p => p.content).join('\n') + schemaInstruction, messages: prompt.filter(p => p.role !== 'system') };
    body.output_config = { format: { type: 'json_schema', schema: anthropicSchema(schema) }, ...(setting.reasoningEffort ? { effort: setting.reasoningEffort } : {}) };
  } else {
    assert(process.env.OPENAI_API_KEY, 'The OpenAI provider is unavailable.');
    url = 'https://api.openai.com/v1/responses'; headers = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
    body = { model: setting.model, input: prompt, store: false, max_output_tokens: setting.maxOutputTokens, text: { format: { type: 'json_schema', name: 'debate_lab', strict: true, schema } } };
    if (setting.reasoningEffort) body.reasoning = { effort: setting.reasoningEffort };
  }
  const response = await fetchImpl(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  assert(response.ok, `${setting.provider} could not complete this step (HTTP ${response.status}). Progress is saved.`);
  const data = await response.json();
  let text;
  if (setting.provider === 'anthropic') {
    assert(data.stop_reason === 'end_turn', `Anthropic returned ${data.stop_reason || 'an incomplete answer'}. Retry this step.`);
    text = (data.content || []).filter(p => p.type === 'text').map(p => p.text).join('');
  } else {
    assert(data.status === 'completed', 'OpenAI did not finish this answer. Retry this step.');
    const parts = (data.output || []).filter(p => p.type === 'message').flatMap(p => p.content || []);
    assert(!parts.some(p => p.type === 'refusal'), 'The model declined this example.');
    text = parts.filter(p => p.type === 'output_text').map(p => p.text).join('');
  }
  // Anthropic may wrap otherwise-valid JSON in one code fence. Nothing else is guessed or repaired.
  text = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1');
  let result; try { result = JSON.parse(text); } catch { throw new Error('The model returned malformed JSON. Retry this step.'); }
  validateSchema(result, schema);
  return { result, meta: { role, provider: setting.provider, requestedModel: setting.model, returnedModel: data.model || setting.model, responseId: data.id || null, usage: data.usage || {}, ms: Date.now() - started, time: new Date().toISOString(), promptHash: hash(prompt), settings: { ...setting, structuredOutput: true } } };
}

const PAUSED = Symbol('one provider call per request');
export async function advance(job, invoke = providerCall) {
  assert(job.version === VERSION && job.rubricHash === hash(RUBRIC), 'This round uses an older lab version. Export it and start a new round.');
  const calls = [...job.calls]; let index = 0, called = false, record;
  try {
    await generateRecord(job.example, job.config, async (role, prompt, schema) => {
      const signature = hash({ role, prompt, schema });
      const cached = calls[index++];
      if (cached) { assert(cached.signature === signature, 'Saved prompt changed; refusing to mix experiment versions.'); return cached.result; }
      if (called) throw PAUSED;
      called = true;
      const response = await invoke(role, prompt, schema, job.config);
      validateSchema(response.result, schema);
      calls.push({ signature, role, prompt, schema, ...response });
      return response.result;
    }, job.variant, current => { record = current; });
  } catch (error) {
    if (error !== PAUSED) throw error;
  }
  return { calls, record, status: record.status === 'complete' ? 'complete' : 'paused' };
}
export function publicJob(job) {
  return { id: job.id, createdAt: job.createdAt, updatedAt: job.updatedAt, status: job.status, steps: job.calls.length, maximumSteps: 8 + 3 * job.config.maxRepairs, attempts: job.attempts, error: job.error || '', record: job.record || null, example: job.example, variant: job.variant, models: job.config.roles, review: job.review || null, traces: job.calls.map(c => c.meta), busy: !!(job.lease && job.lease.until > Date.now()) };
}
