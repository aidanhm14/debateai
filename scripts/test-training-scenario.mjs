import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import schema from '../app/js/training-scenario.js';
import * as training from '../app/netlify/functions/lib/training-scenario.mjs';
import * as live from '../app/netlify/functions/lib/live-voice.mjs';
import * as rt from '../app/netlify/functions/lib/realtime-tools.mjs';
import * as guard from '../app/netlify/functions/lib/content-guard.mjs';
import * as topic from '../app/netlify/functions/lib/topic-isolation.mjs';
import * as funding from '../app/netlify/functions/lib/realtime-funding.mjs';
import { previewSession } from '../app/netlify/functions/lib/voice-preview.mjs';

const scenario = { type: 'sales', situation: 'I sell scheduling software for $300 per month.',
  counterpart: 'A clinic manager worried about training time.', goal: 'Agree on a four-week paid pilot.' };
assert.deepEqual(schema.parse({ ...scenario, ignored: 'never sent' }), scenario);
for (const bad of [null, [], {}, { ...scenario, type: '__proto__' }, { ...scenario, type: ['sales'] },
  { ...scenario, counterpart: '  ' }, { ...scenario, goal: 7 }, { ...scenario, situation: 'x'.repeat(1201) }]) {
  assert.throws(() => training.parseTraining(bad), { code: 'INVALID_TRAINING', status: 400 });
}
for (const field of ['situation', 'counterpart', 'goal']) {
  assert.throws(() => training.parseTraining({ ...scenario, [field]: 'Argue about abortion policy' }), { code: 'SENSITIVE_MOTION', status: 400 });
}
assert.deepEqual(schema.read({ getItem: () => JSON.stringify(scenario) }, 'sales'), scenario);
assert.throws(() => schema.read({ getItem: () => JSON.stringify(scenario) }, 'lawyer'));
assert.throws(() => schema.read({ getItem: () => null }, 'sales'));
for (const type of Object.keys(schema.types)) {
  const s = { ...scenario, type };
  const prompt = training.trainingInstructions(s, 'ruthless');
  assert.ok(prompt.includes(JSON.stringify(s)));
  assert.ok(prompt.includes('Difficulty: tough'));
  assert.ok(prompt.includes('untrusted scenario data'));
  assert.ok(prompt.includes('Never score'));
  const preview = previewSession({ training: s, motion: 'UNRELATED TOPIC' });
  assert.ok(preview.instructions.includes(JSON.stringify(s)));
  assert.ok(!preview.instructions.includes('UNRELATED TOPIC'));
  assert.equal(preview.model, 'gpt-realtime');
}
assert.throws(() => previewSession({ training: null }), { code: 'INVALID_TRAINING' });
for (const [type, info] of Object.entries(schema.types)) {
  const html = readFileSync('app' + info.path + '.html', 'utf8');
  const examples = [...html.matchAll(/data-training-example="([^"]+)"/g)];
  assert.equal(examples.length, 3);
  for (const match of examples) {
    const example = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    assert.equal(training.parseTraining(example).type, type);
  }
  assert.ok(html.includes('type="submit" disabled'), 'a missing script cannot submit private fields in the URL');
}

// Exercise the real session handler and request builder with a fake provider.
// This verifies admission, both transport prompts, and reconnect propagation.
const source = readFileSync('app/netlify/functions/realtime-session.mjs', 'utf8')
  .replace(/^import\b[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace('export default async', 'globalThis.handler = async').replace('export const config', 'const config');
const requests = [], charges = [];
let named = true;
const context = { ...training, ...live, ...rt, ...guard, ...topic, ...funding,
  Request, Response, Headers, AbortSignal, FormData, console: { log() {}, warn() {}, error() {} },
  process: { env: { OPENAI_API_KEY: 'test-key', VOICE_CONTINUE_SECRET: 'test-continuation-secret' } },
  setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; }, clearTimeout,
  checkAppCheck: async () => ({ ok: true }), extractBearerToken: r => r.headers.get('authorization'),
  verifyIdToken: async () => ({ sub: 'training-test', firebase: { sign_in_provider: named ? 'password' : 'anonymous' } }),
  isOwnerEmail: () => false, checkLayers: async () => ({ ok: true }), callerIp: () => 'ip',
  TOKENS: { VOICE_ROUND: 10 }, TOKENS_LIVE: true, getTokenBalance: async () => 0,
  spendTokens: async () => { throw Error('Unexpected token spend'); },
  getDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) }), FieldValue: {},
  getUserTeam: async () => ({ team: { plan: 'individual', status: 'active' } }),
  voiceGate: async () => ({ allowed: true, used: 1, reserve: 2, remaining: 2, budget: { minutes: 3 } }),
  openVoiceSession: async (_db, uid, session) => { charges.push({ uid, ...session }); return { used: 1, reserve: 2, remaining: 2 }; },
  freeVoiceLimit: () => 3, SESSION_RESERVE_MIN: 8, FREE_VOICE_NAMED: 3, FREE_VOICE_ANON: 0, planBypassesVoiceCap: () => true,
  DEBATE_VOICE: '', getExemplarBlock: async () => { throw Error('Debate exemplars do not belong in training'); },
  getDistillationBlock: async () => { throw Error('Debate distillations do not belong in training'); },
  fetch: async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(url.includes('/live/sessions')
      ? { session: { id: 'live_training' }, transport: { sdp: 'v=0\r\nanswer' } }
      : { id: 'rtc_training', client_secret: { value: 'test-secret' } }), { status: 201 });
  }
};
context.createLiveVoice = args => live.createLiveVoice({ ...args, fetcher: context.fetch });
vm.createContext(context); vm.runInContext(source, context);
const call = body => context.handler(new Request('https://itsdebatable.com/api/realtime-session', {
  method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(body)
}));
const body = { transport: 'live', sdp: 'v=0\r\noffer', mode: 'clash', training: scenario, voice: 'marin', difficulty: 'ruthless' };
for (const bad of [null, { ...scenario, type: 'unknown' }, { ...scenario, goal: 'Argue about abortion policy' }]) {
  assert.equal((await call({ ...body, training: bad })).status, 400);
}
assert.equal(requests.length, 0); assert.equal(charges.length, 0);
named = false; assert.equal((await call(body)).status, 401); assert.equal(requests.length, 0); named = true;
let response = await call(body); assert.equal(response.status, 200);
const first = await response.json();
assert.equal(charges.length, 1);
let config = requests.at(-1).body.session;
assert.ok(config.instructions.includes(JSON.stringify(scenario)), 'spoken model receives the entire scenario');
assert.ok(config.delegation.responses.instructions.includes(JSON.stringify(scenario)), 'reasoning model receives the same scenario');
assert.ok(!config.instructions.includes('you argue the other side'));
assert.deepEqual(config.delegation.responses.tools.map(t => t.name), ['set_voice']);
assert.deepEqual(first.tools.map(t => t.name), ['set_voice']);
assert.ok(!JSON.stringify(first).includes(scenario.situation), 'response metadata does not echo private setup');
response = await call({ ...body, voice: 'cedar', continuation: first.roundToken, priorTranscript: 'USER: Can we measure staff time saved?\nAI: What would success look like?' });
assert.equal(response.status, 200); assert.equal(charges.length, 2);
config = requests.at(-1).body.session;
assert.ok(config.instructions.includes(JSON.stringify(scenario)));
assert.ok(config.input[0].content[0].text.includes('staff time saved'));
assert.equal(config.audio.output.voice, 'cedar');
response = await call({ ...body, transport: undefined });
assert.equal(response.status, 200);
config = requests.at(-1).body.session || requests.at(-1).body;
assert.ok(config.instructions.includes(JSON.stringify(scenario)), 'Realtime fallback receives scenario');
assert.deepEqual(config.tools.map(t => t.name), ['set_voice']);

// The real setup script handles edits, presets and tab-only handoff.
let submit, navigated = '', saved, presetClick;
const elements = Object.fromEntries(['situation', 'counterpart', 'goal'].map(name => [name, { value: '', focus() {} }]));
const error = { textContent: '' }, button = { disabled: true };
const form = { elements, dataset: { training: 'sales' }, querySelector: () => button, addEventListener: (name, fn) => { if (name === 'submit') submit = fn; } };
const setupContext = { window: { DBTrainingScenario: schema, location: { assign: url => { navigated = url; } } },
  sessionStorage: { getItem: () => null, setItem: (key, value) => { saved = { key, value }; } },
  document: { getElementById: id => id === 'trainingForm' ? form : error, querySelectorAll: () => [{ dataset: { trainingExample: JSON.stringify(scenario) }, addEventListener: (_name, fn) => { presetClick = fn; } }] }
};
vm.runInNewContext(readFileSync('app/js/training-setup.js', 'utf8'), setupContext);
assert.equal(button.disabled, false);
submit({ preventDefault() {} }); assert.equal(navigated, ''); assert.ok(error.textContent);
presetClick(); elements.goal.value = 'Agree to a second meeting.'; submit({ preventDefault() {} });
assert.equal(navigated, '/newvoice?training=sales'); assert.ok(!navigated.includes('meeting'));
assert.equal(JSON.parse(saved.value).goal, elements.goal.value);
setupContext.sessionStorage.setItem = () => { throw Object.assign(new Error('blocked'), { name: 'SecurityError' }); };
navigated = ''; submit({ preventDefault() {} }); assert.equal(navigated, ''); assert.ok(error.textContent.includes('Allow storage'));

const page = readFileSync('app/newvoice.html', 'utf8');
// Execute the actual terminal actions, proving a training session cannot
// reach judging, capture, public scores, or AI ratings via these entry points.
for (const [start, end] of [
  ['function logRound(){', '\n/*'], ['async function postLeaderboard(score, outcome){', '\n/*'],
  ['function rateAiRound(u, rid, outcome){', '\n/*']
]) {
  const at = page.indexOf(start); const stop = page.indexOf(end, at);
  const functionSource = page.slice(at, stop);
  const name = start.match(/function (\w+)/)[1];
  const ctx = { trainingRequested: true };
  vm.createContext(ctx); vm.runInContext(functionSource, ctx);
  await ctx[name](); // Any access beyond the early return would throw.
}
assert.equal((page.match(/\.\.\.trainingBody\(\)/g) || []).length, 3, 'initial, preview and reconnect carry scenario');
assert.ok(page.includes('trainingRequested && !trainingScenario'));
assert.ok(page.includes("if (trainingRequested) { card.hidden = true; return; }"));
assert.ok(page.includes('window.VoiceTranscript && !previewRound && !trainingScenario'));
assert.ok(page.includes("text.textContent = value"), 'scenario review renders text, not HTML');
console.log('Training: schema, all roles, all-field content checks, guest gate, Live/Realtime prompts, preview, metered reconnect, editable handoff, storage failure and no rankings passed.');
