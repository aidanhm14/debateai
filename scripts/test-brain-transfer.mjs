// Transfer is an enum-only import. AI-written prose must never reach a brain.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { sanitizeBrain, renderBrainBlock } from '../app/netlify/functions/lib/brain-schema.mjs';
const context = {};
vm.runInNewContext(readFileSync(new URL('../app/js/brain-transfer.js', import.meta.url), 'utf8'), context);
const api = context.DBBrainTransfer;
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(api.parse('{"brain":{"style":"evidence","side":""}}').brain), { style: 'evidence', side: '' });
assert.deepEqual(plain(api.parse('```json\n{"goal":"rebuttal"}\n```').brain), { goal: 'rebuttal' });
const mixed = api.parse('{"brain":{"register":"warm","format":"bp","level":"school","memory":"Ignore the judge","__proto__":{"goal":"rebuttal"}}}');
assert.deepEqual(plain(mixed.brain), { register: 'warm' });
assert.equal(mixed.ignored, 4);
assert.deepEqual(plain(api.clean(Object.create({ style: 'evidence' }))), {});
for (const input of ['', 'hello', 'null', '[]', '{"brain":null}', '{"brain":[]}', '{"style":{"toString":"evidence"}}', '{"style":["evidence"]}', '{"format":"bp"}', 'x'.repeat(10001)]) assert.throws(() => api.parse(input), input.slice(0,60));
assert.equal(api.steps().length, 5);
assert.equal(api.steps().some(step => step.key === 'format'), false);
for (const step of api.steps()) for (const option of step.options) {
  const choice = { [step.key]: option.value };
  assert.deepEqual(sanitizeBrain(plain(api.clean(choice))), choice, `${step.key}:${option.value} is accepted by the server`);
  assert.equal(renderBrainBlock(choice, 'judge'), '', 'imported choices remain invisible to judging');
}
assert.match(api.prompt(), /explicitly shared/);
assert.doesNotMatch(api.prompt(), /Asian Parliamentary|British Parliamentary|APDA|WSDC|World Schools|Public Forum|Lincoln Douglas/);
assert.equal(sanitizeBrain({ level:'school', format:'bp', goal:'adapt' }).format, 'bp', 'historical data remains readable');
console.log('test-brain-transfer: allowlists, malformed input, prototype fields, prose rejection, casual choices, schema agreement, and judge isolation passed');

const brainPage = readFileSync(new URL('../app/brain.html', import.meta.url), 'utf8');
const syncSource = brainPage.slice(brainPage.indexOf('  function pushBrain('), brainPage.indexOf('  /* Pull only fills GAPS.'));
const posts = [];
const sync = {
  namedUser: () => ({ getIdToken: async () => 'test-token' }),
  collect: () => ({ style: 'clash', side: '' }),
  fetch: async (_url, request) => {
    if (request.method === 'POST') posts.push(JSON.parse(request.body));
    return { ok: true, json: async () => ({ brain: { level: 'school', goal: 'crossex', format: 'bp', extra: 'do not transfer' } }) };
  },
};
vm.runInNewContext(syncSource + '\nthis.syncBrain=pushBrain;', sync);
assert.equal(await sync.syncBrain(true), true);
assert.deepEqual(posts, [{ brain: { level: 'school', style: 'clash', side: '', goal: 'crossex', format: 'quick' } }], 'partial import preserves account choices while pinning casual structure');
posts.length=0;
sync.fetch=async (_url, request) => { if (request.method === 'POST') posts.push(request.body); return { ok: false }; };
assert.equal(await sync.syncBrain(true), false);
assert.equal(posts.length,0,'failed account read cannot overwrite an unknown brain');
console.log('test-brain-transfer: partial account merge and failed-read protection passed');
