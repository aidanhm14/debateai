// Asserts the client judge roster (app/js/judge-roster.js) and its
// server twin (app/netlify/functions/lib/judge-roster.mjs) cannot
// drift: same keys, same order, same names, same lens text, same
// hash. Order is load-bearing — the draw is (hash % length), so a
// reorder on one side silently reassigns every round's judge on that
// side only, which is exactly the split this test exists to catch.
//
// Run: node scripts/test-judge-roster.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROSTER as SERVER_ROSTER, hashSeed as serverHash, personaForRoom, assignedParadigmBlock } from '../app/netlify/functions/lib/judge-roster.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function assert(ok, msg) {
  if (ok) return;
  failures++;
  console.error('FAIL: ' + msg);
}

// The client file is a pure IIFE that only touches `window`.
const clientSrc = readFileSync(join(root, 'app/js/judge-roster.js'), 'utf8');
const win = {};
new Function('window', clientSrc)(win);
const client = win.JudgeRoster;

assert(client && Array.isArray(client.ROSTER), 'client roster loads');
assert(client.ROSTER.length === SERVER_ROSTER.length,
  `roster length matches (client ${client.ROSTER.length} vs server ${SERVER_ROSTER.length})`);

const n = Math.min(client.ROSTER.length, SERVER_ROSTER.length);
for (let i = 0; i < n; i++) {
  const c = client.ROSTER[i];
  const s = SERVER_ROSTER[i];
  assert(c.key === s.key, `slot ${i}: key matches (client "${c.key}" vs server "${s.key}")`);
  assert(c.name === s.name, `slot ${i} (${s.key}): name matches`);
  assert(c.lens === s.lens, `slot ${i} (${s.key}): lens text matches`);
  // Client-only display fields the intro card depends on.
  assert(typeof c.glyph === 'string' && c.glyph, `slot ${i} (${c.key}): client has a glyph`);
  assert(Array.isArray(c.inPractice) && c.inPractice.length === 3, `slot ${i} (${c.key}): three inPractice rows`);
  assert(c.inPractice && c.inPractice.some((r) => /costs you/i.test(r.k)),
    `slot ${i} (${c.key}): states its cost (the "Costs you" row is not optional)`);
}

// Same hash, same draw, both sides, across representative room ids.
const seeds = ['SparMatch-abc12345-def67890', 'Debatable-Round-x1y2z3w4', 'a', '', 'room-with-a-much-longer-identifier-string'];
for (const seed of seeds) {
  const cJudge = client.draw(seed);
  const sJudge = personaForRoom(seed || 'x');
  if (seed) {
    assert(cJudge.key === sJudge.key, `draw("${seed}") agrees (client ${cJudge.key} vs server ${sJudge.key})`);
  }
}

// Guard text rides every server injection, and an agreed non-chair
// lens suppresses the draw on both sides.
const block = assignedParadigmBlock('SparMatch-abc12345-def67890', null);
assert(/may NOT name a winner/i.test(block), 'server block carries the guard');
assert(assignedParadigmBlock('room', { pro: 'flow', con: 'flow' }) === '', 'agreed non-chair lens suppresses the assigned judge');
assert(assignedParadigmBlock('room', { pro: 'chair', con: 'chair' }) !== '', 'chair-chair keeps the assigned judge');
assert(/may NOT name a winner/i.test(client.promptBlock(client.ROSTER[0])), 'client promptBlock carries the guard');

// Copy rules on everything that renders.
for (const c of client.ROSTER) {
  const strings = [c.name, c.tag].concat(c.note || []).concat((c.inPractice || []).map((r) => r.k + ' ' + r.v)).concat([c.lens]);
  for (const s of strings) {
    assert(!/—/.test(s), `${c.key}: no em dashes ("${String(s).slice(0, 40)}…")`);
  }
}

if (failures) {
  console.error(`test-judge-roster: ${failures} failure(s)`);
  process.exit(1);
}
console.log('test-judge-roster: all assertions passed');
