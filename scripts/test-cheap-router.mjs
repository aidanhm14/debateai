#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Guard for lib/cheap.mjs, the internal model router.
//
// WHY THIS IS IN THE HOOK. A bad edit here does not break one endpoint, it
// silently sends a dozen internal tasks to the wrong vendor with the wrong
// key, or quietly re-enables reasoning and starts truncating every
// structured task inside the 26s Netlify budget. Both of those present as
// "the parser broke" at twelve unrelated call sites.
//
// PURE ASSERTIONS ONLY. No network. The live probes belong in a manual
// run, not in a hook that has to pass on a plane.
// ─────────────────────────────────────────────────────────────────────────

import {
  resolveProvider, toOpenAiBody, fromOpenAiReply,
  CHEAP_FAST, CHEAP_MID, FALLBACK_FAST, FALLBACK_MID,
} from '../app/netlify/functions/lib/cheap.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN = join(HERE, '..', 'app', 'netlify', 'functions');

let pass = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) { pass++; return; }
  fails.push(msg);
}

// ── routing: every id lands on the vendor that can actually serve it ────
ok(resolveProvider('claude-haiku-4-5-20251001').id === 'anthropic', 'claude-* routes to anthropic');
ok(resolveProvider('claude-sonnet-4-6').url.includes('api.anthropic.com'), 'anthropic url');
ok(resolveProvider('claude-opus-5').shape === 'anthropic', 'anthropic keeps native shape');
ok(resolveProvider('deepseek-v4-flash').id === 'deepseek', 'deepseek-* routes direct');
ok(resolveProvider('deepseek-v4-pro').key === 'DEEPSEEK_API_KEY', 'deepseek reads its own key');
ok(resolveProvider('moonshotai/kimi-k2.6').id === 'openrouter', 'vendor/slug routes to openrouter');
ok(resolveProvider('z-ai/glm-5.2').id === 'openrouter', 'any slug with a slash is openrouter');
ok(resolveProvider('gpt-4o-mini').id === 'openai', 'gpt-* routes to openai');

// An unknown id must resolve to NOTHING. Guessing a vendor for a typo'd
// env var is how a cost knob becomes a request to the wrong company.
ok(resolveProvider('kimi-k3') === null, 'bare kimi id is unroutable (it needs the moonshotai/ prefix)');
ok(resolveProvider('llama-3') === null, 'unknown id resolves to null, never a guess');
ok(resolveProvider('') === null, 'empty id resolves to null');
ok(resolveProvider(undefined) === null, 'undefined id resolves to null');

// ── the cheap defaults are ids a vendor actually serves ────────────────
// deepseek-chat and deepseek-reasoner are legacy aliases that both now
// resolve to flash upstream. A default must be a real id, not an alias.
ok(CHEAP_FAST === 'deepseek-v4-flash', 'CHEAP_FAST is a real served id');
ok(CHEAP_MID === 'deepseek-v4-pro', 'CHEAP_MID is a real served id');
ok(resolveProvider(CHEAP_FAST) && resolveProvider(CHEAP_MID), 'both cheap tiers are routable');
ok(resolveProvider(FALLBACK_FAST).id === 'anthropic' && resolveProvider(FALLBACK_MID).id === 'anthropic',
  'both fallbacks are Anthropic, so a cheap outage cannot take a feature down');

// ── request translation ────────────────────────────────────────────────
const b = toOpenAiBody('deepseek-v4-flash', {
  system: 'SYS', max_tokens: 512, temperature: 0.15,
  messages: [{ role: 'user', content: 'hello' }],
});
ok(b.messages[0].role === 'system' && b.messages[0].content === 'SYS', 'system hoisted to first message');
ok(b.messages[1].role === 'user', 'user message preserved');
ok(b.max_tokens === 512, 'max_tokens passed for deepseek');
ok(b.temperature === 0.15, 'temperature passed through');

const bGpt5 = toOpenAiBody('gpt-5.5', { max_tokens: 64, messages: [{ role: 'user', content: 'x' }] });
ok(bGpt5.max_completion_tokens === 64 && bGpt5.max_tokens === undefined,
  'gpt-5.x gets max_completion_tokens (it rejects max_tokens outright)');

const bArr = toOpenAiBody('deepseek-v4-flash', {
  system: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }],
  messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }],
});
ok(bArr.messages[0].content === 'A\nB', 'array system (the cache-prefix form) flattens');
ok(bArr.messages[1].content === 'q', 'array message content flattens');

// ── THINKING OFF BY DEFAULT. The most load-bearing assertion here. ─────
// Measured: with thinking on, v4-pro spent an entire 2200-token budget
// reasoning and returned empty content with finish_reason 'stop'.
ok(b.thinking && b.thinking.type === 'disabled', 'deepseek gets thinking disabled by default');
const bOr = toOpenAiBody('moonshotai/kimi-k2.6', { max_tokens: 100, messages: [{ role: 'user', content: 'x' }] });
ok(bOr.reasoning && bOr.reasoning.enabled === false, 'openrouter gets its own reasoning-off spelling');
const bThink = toOpenAiBody('deepseek-v4-pro', { max_tokens: 100, reasoning: true, messages: [{ role: 'user', content: 'x' }] });
ok(!bThink.thinking, 'reasoning:true opts back in');

// ── tool translation ───────────────────────────────────────────────────
const bTool = toOpenAiBody('deepseek-v4-flash', {
  max_tokens: 100,
  messages: [{ role: 'user', content: 'x' }],
  tools: [{ name: 'propose', description: 'd', input_schema: { type: 'object', properties: { a: { type: 'string' } } } }],
  tool_choice: { type: 'tool', name: 'propose' },
});
ok(bTool.tools[0].function.name === 'propose', 'tool name mapped');
ok(bTool.tools[0].function.parameters.type === 'object', 'input_schema -> parameters');
ok(bTool.tool_choice.function.name === 'propose', 'forced tool choice mapped');

// ── reply translation ──────────────────────────────────────────────────
const r = fromOpenAiReply({
  choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 20 },
}, 'm');
ok(r.content[0].type === 'text' && r.content[0].text === 'hi', 'text block rebuilt in anthropic shape');
ok(r.stop_reason === 'end_turn', "finish 'stop' -> 'end_turn'");
ok(r.usage.input_tokens === 10 && r.usage.output_tokens === 20, 'usage keys renamed');

// Truncation must survive the translation. Call sites check the Anthropic
// name BEFORE parsing, precisely so a cut-off reply reports as truncation
// rather than as the parser's fault.
const rTrunc = fromOpenAiReply({ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }, 'm');
ok(rTrunc.stop_reason === 'max_tokens', "finish 'length' -> 'max_tokens'");

const rTool = fromOpenAiReply({
  choices: [{ message: { tool_calls: [{ id: 't1', function: { name: 'f', arguments: '{"a":1}' } }] }, finish_reason: 'tool_calls' }],
}, 'm');
ok(rTool.content[0].type === 'tool_use', 'tool_use block rebuilt');
ok(rTool.content[0].input.a === 1, 'tool arguments parsed');
ok(rTool.stop_reason === 'tool_use', "finish 'tool_calls' -> 'tool_use'");

const rBad = fromOpenAiReply({ choices: [{ message: { tool_calls: [{ function: { name: 'f', arguments: 'not json' } }] } }] }, 'm');
ok(rBad.content[0].input && typeof rBad.content[0].input === 'object', 'unparseable tool args degrade to {}, never throw');

const rEmpty = fromOpenAiReply({}, 'm');
ok(Array.isArray(rEmpty.content) && rEmpty.content.length === 0, 'empty reply yields an empty content array, not a crash');

// ── THE JUDGE MUST NOT BE ROUTED THROUGH HERE ──────────────────────────
// Its models are pinned by a published charter and stamped on every audit
// row. Cheapening a juror is a promise change, not a config change.
for (const f of ['lib/judge-run.mjs', 'lib/judge-charter.mjs', 'lib/judge-jurors.mjs']) {
  let src = '';
  try { src = readFileSync(join(FN, f), 'utf8'); } catch (_) { continue; }
  ok(!/^\s*import[^\n]*lib\/cheap\.mjs/m.test(src), `${f} does not import the cheap router (charter-pinned models)`);
}

// The six user-facing brain proxies must not be routed either: the user
// picked that vendor, and a silent downgrade is a lie about what argued
// against them.
for (const f of ['claude.mjs', 'openai-chat.mjs', 'gemini.mjs', 'grok.mjs', 'deepseek.mjs', 'openlab.mjs']) {
  let src = '';
  try { src = readFileSync(join(FN, f), 'utf8'); } catch (_) { continue; }
  // Match the IMPORT, not the substring: deepseek.mjs names this module
  // in a comment explaining why its own path deliberately keeps thinking
  // ON, and a substring test reads that explanation as a violation.
  ok(!/^\s*import[^\n]*lib\/cheap\.mjs/m.test(src), `${f} (a user-picked brain) does not silently reroute`);
}

// ── every call site that imports the router declares a fallback ────────
// A call with no fallback is a cost saving with no safety net.
for (const f of readdirSync(FN).filter((n) => n.endsWith('.mjs'))) {
  const src = readFileSync(join(FN, f), 'utf8');
  if (!src.includes("from './lib/cheap.mjs'")) continue;
  const calls = src.split(/\b(?:callModel|routeModel)\(\{/).slice(1);
  for (let i = 0; i < calls.length; i++) {
    const head = calls[i].slice(0, 400);
    ok(/fallback:/.test(head), `${f} call #${i + 1} declares a fallback model`);
  }
}

// ── no call site left a dead hardcoded Anthropic fetch behind ──────────
for (const f of ['extract-claims.mjs', 'classify-disclosure.mjs', 'argument-lint.mjs', 'flow.mjs', 'blocks.mjs', 'scheduled-distill.mjs', 'scheduled-user-fingerprint.mjs', 'translate.mjs']) {
  const src = readFileSync(join(FN, f), 'utf8');
  ok(!src.includes('api.anthropic.com'), `${f} no longer hardcodes the anthropic endpoint`);
  ok(src.includes("from './lib/cheap.mjs'"), `${f} imports the router`);
}

if (fails.length) {
  console.error(`\ncheap-router: ${fails.length} FAILED of ${pass + fails.length}`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`cheap-router: ${pass} assertions passed`);
