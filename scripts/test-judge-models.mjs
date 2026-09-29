import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let now = 1000, requests = 0;
let charter = { season: { to: 2000 }, running: { panelConstitutable: true, jurors: [
  { pinnedModel: 'claude-opus-5-5', available: true },
  { pinnedModel: 'gpt-6-astra', available: true },
  { pinnedModel: 'gemini-3.8-flash', available: false },
] } };
const node = { textContent: '' };
const context = {
  window: {}, Date: { now: () => now }, setInterval() {},
  document: { readyState: 'loading', addEventListener() {}, querySelectorAll: () => [node] },
  fetch: async () => { requests++; return { ok: true, json: async () => charter }; },
};
vm.runInNewContext(readFileSync(new URL('../app/js/judge-models.js', import.meta.url), 'utf8'), context);
const models = context.window.DBJudgeModels;
models.paint();
await models.load();
await Promise.resolve();
assert.equal(node.textContent, 'Current council: Claude Opus 5.5 · GPT-6 Astra · Gemini 3.8 Flash (unavailable).');
assert.equal(requests, 1, 'concurrent disclosure widgets share one read');
now = 1999;
await models.load();
assert.equal(requests, 1);
now = 2000;
await models.load();
assert.equal(requests, 2, 'a season boundary expires the client cache');
assert.equal(models.describe(null), 'Current models could not be loaded.');
assert.equal(models.describe({ running: { panelConstitutable: false, fallbackModel: 'claude-opus-5-5' } }), 'Fallback judge: Claude Opus 5.5.');
assert.equal(models.describe({ running: { panelConstitutable: false, requirePanel: true } }), 'Council unavailable. Judging waits for the panel.');
assert.equal(models.name('future-model-id'), 'future-model-id', 'unknown IDs are preserved instead of guessed');
context.fetch = async () => ({ ok: false });
now = 62000;
models.paint();
await models.load();
await Promise.resolve();
assert.equal(node.textContent, 'Current models could not be loaded.', 'failures never show invented or stale models');
console.log('judge-models: disclosure, availability, cache boundary and failed reads passed');
