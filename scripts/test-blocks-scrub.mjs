#!/usr/bin/env node
// Guards the one promise /api/blocks makes that would cost real
// credibility to break: it never hands a debater a citation to read.
//
// The prompt forbids author-year strings inside the argument fields, but a
// prompt is not a guarantee, and the consequence of a miss is a debater
// reading a fabricated card in a real round and a coach never trusting the
// site again. scrubFabricatedCites is the belt to that braces, so it gets
// a test rather than a comment.
//
// Runs in the pre-commit hook.

import assert from 'node:assert';
import { scrubFabricatedCites } from '../app/netlify/functions/blocks.mjs';

let pass = 0;
function ok(name, fn) {
  try { fn(); pass += 1; }
  catch (err) {
    console.error(`FAIL: ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}

// ── Author-year forms get neutralised wherever they hide ───────────────
ok('strips author-year in a nested object string', () => {
  const d = { readBack: { summary: 'They argue X per Smith 2022.' } };
  const n = scrubFabricatedCites(d);
  assert.strictEqual(n, 1);
  assert.ok(!/Smith 2022/.test(d.readBack.summary), 'cite survived');
});

ok("strips apostrophe-year form (Jones '21)", () => {
  const d = { readBack: { summary: "Jones '21 shows growth." } };
  scrubFabricatedCites(d);
  assert.ok(!/Jones '21/.test(d.readBack.summary), 'cite survived');
});

// This is the case that was actually broken on first write: a plain string
// sitting directly inside an array was walked past, because forEach(walk)
// recursed into it and then bailed on the not-an-object guard. `chain`,
// `crossEx` and `gaps` are all arrays of plain strings.
ok('strips cites inside ARRAYS OF STRINGS (the regression)', () => {
  const d = {
    readBack: { contentions: [{ chain: ['Garcia 2018 proves the link', 'plain step'] }] },
    crossEx: ['Do you concede Miller 2020?'],
    gaps: ['They never answer Chen 2019.'],
  };
  const n = scrubFabricatedCites(d);
  assert.strictEqual(n, 3, `expected 3 strips, got ${n}`);
  assert.ok(!/Garcia 2018/.test(d.readBack.contentions[0].chain[0]), 'chain cite survived');
  assert.ok(!/Miller 2020/.test(d.crossEx[0]), 'crossEx cite survived');
  assert.ok(!/Chen 2019/.test(d.gaps[0]), 'gaps cite survived');
  assert.strictEqual(d.readBack.contentions[0].chain[1], 'plain step', 'clean text was altered');
});

ok('strips vague "a 2019 study" phrasing', () => {
  const d = { answers: [{ best: 'a 2019 study found the opposite' }] };
  const n = scrubFabricatedCites(d);
  assert.strictEqual(n, 1);
  assert.ok(!/2019 study/.test(d.answers[0].best), 'vague cite survived');
});

// ── evidenceLeads is exempt, and that exemption is the point ───────────
ok('evidenceLeads keeps its named literature', () => {
  const d = {
    answers: [{ best: 'Their warrant fails per Smith 2022.' }],
    evidenceLeads: [{
      claim: 'growth',
      lookFor: 'Acemoglu 2012 style institutional economics',
      note: 'unverified',
    }],
  };
  scrubFabricatedCites(d);
  assert.ok(/Acemoglu 2012/.test(d.evidenceLeads[0].lookFor),
    'lead was scrubbed; naming literature to go read is its whole job');
  assert.strictEqual(d.evidenceLeads[0].note, 'unverified', 'unverified flag lost');
  assert.ok(!/Smith 2022/.test(d.answers[0].best), 'argument-field cite survived');
});

ok('evidenceLeads survives even when it is the only key', () => {
  const d = { evidenceLeads: [{ claim: 'c', lookFor: 'Rawls 1971', note: 'unverified' }] };
  const n = scrubFabricatedCites(d);
  assert.strictEqual(n, 0);
  assert.ok(Array.isArray(d.evidenceLeads) && d.evidenceLeads.length === 1, 'leads array lost');
});

// ── It must not eat ordinary debate prose ─────────────────────────────
ok('leaves normal argument text alone', () => {
  const d = {
    answers: [{
      best: 'The internal link does not follow. Growth does not reach the people they name.',
      frontlines: [{ type: 'no-internal-link', line: 'Their own mechanism skips a step.', why: 'It assumes transfer.' }],
    }],
  };
  const before = JSON.stringify(d);
  const n = scrubFabricatedCites(d);
  assert.strictEqual(n, 0, 'stripped something from clean prose');
  assert.strictEqual(JSON.stringify(d), before, 'clean prose was modified');
});

ok('a bare year with no author is left alone', () => {
  // "In 2019 the government did X" is a fact a debater can state, not a
  // card. Over-scrubbing would make the tool useless for policy rounds.
  const d = { answers: [{ best: 'In 2019 the policy was repealed, so their uniqueness is gone.' }] };
  const n = scrubFabricatedCites(d);
  assert.strictEqual(n, 0, 'over-scrubbed a plain historical year');
});

// ── Defensive: never throw on junk ────────────────────────────────────
ok('handles null / non-object input', () => {
  assert.strictEqual(scrubFabricatedCites(null), 0);
  assert.strictEqual(scrubFabricatedCites(undefined), 0);
  assert.strictEqual(scrubFabricatedCites('a string'), 0);
});

if (process.exitCode) {
  console.error(`\ntest-blocks-scrub: ${pass} passed, failures above.`);
} else {
  console.log(`test-blocks-scrub: ${pass}/${pass} assertions passed.`);
}
