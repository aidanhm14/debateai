#!/usr/bin/env node
// Guards the pure half of lib/brain.mjs. Runs in the pre-commit hook.
//
// The allow-list is a PROMPT INJECTION BOUNDARY, not a tidiness rule:
// every stored value is concatenated into the system prompt of every
// future round that user runs, so an unrecognised string reaching the
// block would be a persistent injection with a per-user blast radius.
// That is the property most worth a test, so most of these assert it.

import {
  BRAIN_FIELDS, BRAIN_KEYS, sanitizeBrain, hasBrain, renderBrainBlock,
} from '../app/netlify/functions/lib/brain-schema.mjs';

let pass = 0;
const fails = [];
function ok(name, cond) { if (cond) pass++; else fails.push(name); }

/* ── sanitize: only known ids survive ─────────────────────────────── */
ok('keeps a valid answer',
  sanitizeBrain({ level: 'circuit' }).level === 'circuit');

ok('drops an unknown id',
  sanitizeBrain({ level: 'grandmaster' }).level === undefined);

ok('drops rather than defaults',
  Object.keys(sanitizeBrain({ level: 'nope', format: 'nope' })).length === 0);

ok('drops an unknown FIELD entirely',
  sanitizeBrain({ hacked: 'x' }).hacked === undefined);

ok('keeps the valid part of a mixed body',
  (() => { const b = sanitizeBrain({ level: 'school', style: 'zzz' });
    return b.level === 'school' && b.style === undefined; })());

ok('handles null / non-object',
  Object.keys(sanitizeBrain(null)).length === 0 &&
  Object.keys(sanitizeBrain('level=elite')).length === 0 &&
  Object.keys(sanitizeBrain(42)).length === 0);

// '' is a real answer on `side` ("Surprise me"), so it must round-trip
// rather than being swallowed as falsy.
ok("side:'' is an answer, not absence",
  sanitizeBrain({ side: '' }).side === '');

ok('side keeps a real value', sanitizeBrain({ side: 'opp' }).side === 'opp');
ok('side rejects junk', sanitizeBrain({ side: 'both' }).side === undefined);

// A prototype-polluting body must not smuggle a key through.
ok('ignores inherited properties',
  (() => { const proto = { level: 'elite' };
    return sanitizeBrain(Object.create(proto)).level === undefined; })());

// Numbers and objects stringify; neither may match an id.
ok('rejects a coerced object', sanitizeBrain({ level: {} }).level === undefined);

/* ── hasBrain ─────────────────────────────────────────────────────── */
ok('empty is not a brain', hasBrain({}) === false);
ok('null is not a brain', hasBrain(null) === false);
ok('one field is a brain', hasBrain({ goal: 'rebuttal' }) === true);
ok("side:'' alone counts", hasBrain({ side: '' }) === true);

/* ── the rendered block ───────────────────────────────────────────── */
const full = sanitizeBrain({
  level: 'new', format: 'bp', style: 'clash',
  register: 'aggressive', side: 'prop', goal: 'rebuttal',
});
const block = renderBrainBlock(full, 'case');

ok('renders every answered field',
  BRAIN_KEYS.every((k) => full[k] === undefined || block.length > 0));
ok('block names the section', block.includes('THIS DEBATER'));
ok('block carries the level prose', block.includes(BRAIN_FIELDS.level['new']));
ok('block carries the format prose', block.includes(BRAIN_FIELDS.format.bp));

// The two guard clauses are the whole reason this is safe to inject. A
// model told "new to competitive debate" with no ceiling starts conceding,
// which turns the product's one real feature into a yes-man.
ok('block forbids going easier', /do NOT go easier/i.test(block));
ok('block forbids deciding substance', /do NOT decide the substance/i.test(block));

ok('empty brain renders nothing', renderBrainBlock({}, 'case') === '');
ok('unknown-only brain renders nothing',
  renderBrainBlock(sanitizeBrain({ level: 'bogus' }), 'case') === '');

/* ── feature gate: the judge must never see it ────────────────────── */
// A ballot that knows one debater is a beginner, or is working on
// rebuttal, is a ballot with a thumb on the scale. The judge charter is
// explicit that nothing about WHO the debater is may reach the decision.
for (const judgeFeature of ['judge', 'judging', 'ballot', 'rfd']) {
  ok(`judge feature "${judgeFeature}" gets nothing`,
    renderBrainBlock(full, judgeFeature) === '');
}
ok('debate feature gets the block', renderBrainBlock(full, 'opponent') !== '');
ok('rebuttal feature gets the block', renderBrainBlock(full, 'rebuttal') !== '');

// No feature at all is treated as allowed, matching how the fingerprint
// and distillation helpers behave when a caller omits it.
ok('missing feature still renders', renderBrainBlock(full, '') !== '');

/* ── schema integrity ─────────────────────────────────────────────── */
ok('every field has at least two options',
  BRAIN_KEYS.every((k) => Object.keys(BRAIN_FIELDS[k]).length >= 2));
ok('every label is prose, not an id',
  BRAIN_KEYS.every((k) => Object.values(BRAIN_FIELDS[k])
    .every((v) => typeof v === 'string' && v.length > 3)));
// House style, and these strings are read aloud by nothing but still
// ship into a prompt that the voice bank also governs.
ok('no em-dashes in any label',
  BRAIN_KEYS.every((k) => Object.values(BRAIN_FIELDS[k]).every((v) => !v.includes('—'))));
ok('no em-dashes in the block', !block.includes('—'));

if (fails.length) {
  console.error(`test-brain: ${fails.length} FAILED of ${pass + fails.length}`);
  fails.forEach((f) => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log(`test-brain: ${pass}/${pass} passed`);
