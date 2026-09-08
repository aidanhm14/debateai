#!/usr/bin/env node
/* The passed-proposal skip rule exists in TWO places: skipActive() in
   app/netlify/functions/spar-pair.mjs and its mirror docSkips() in
   app/spar.html. They must agree, or the client filters on rules the
   server no longer enforces and POSTs pairs it refuses.

   This runs BOTH real implementations, pulled out of the shipped files,
   against the same fixtures. It is not a string check: a constant can be
   edited on one side and the mismatch shows up here as behaviour.

   The TTL itself is pinned because it is a product call, not a tuning
   knob: 30s since 2026-09-08 (Aidan: "offer rematch with declined matches
   after 30 secodns actually not 2 mins"), and it is only safe that short
   because a SECOND pass on the same person never expires. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const srv = read('app/netlify/functions/spar-pair.mjs');
const cli = read('app/spar.html');

function serverSkip() {
  const from = srv.indexOf('const STALE_PEER_MS');
  const to = srv.indexOf('function blocked(', from);
  assert.ok(from > -1 && to > from, 'could not slice skipActive out of spar-pair.mjs');
  const box = { Date, Number, Array, console };
  vm.runInNewContext(srv.slice(from, to) + '\nthis.__f = skipActive;\nthis.__ttl = SKIP_TTL_MS;\nthis.__hard = SKIP_HARD_COUNT;\nthis.__ghost = GHOST_SKIP_TTL_MS;', box);
  return box;
}
function clientSkip() {
  const from = cli.indexOf('  var SKIP_TTL_MS =');
  assert.ok(from > -1, 'could not find the client mirror in spar.html');
  const tail = cli.slice(from);
  const end = tail.indexOf('\n  function ', tail.indexOf('function docSkips'));
  assert.ok(end > -1, 'could not slice docSkips out of spar.html');
  const box = { Date, Number, Array, console };
  vm.runInNewContext(tail.slice(0, end) + '\nthis.__f = docSkips;\nthis.__ttl = SKIP_TTL_MS;\nthis.__hard = SKIP_HARD_COUNT;\nthis.__ghost = GHOST_SKIP_TTL_MS;', box);
  return box;
}

const S = serverSkip(), C = clientSkip();
let failed = 0;
const check = (ok, label) => { if (!ok) { failed++; console.error('FAIL ' + label); } else console.log('PASS ' + label); };

check(S.__ttl === 30 * 1000, 'a declined pair is re-offered after 30 seconds');
check(S.__hard === 2, 'a second pass on the same person never expires');
check(S.__ttl === C.__ttl && S.__hard === C.__hard && S.__ghost === C.__ghost,
  'server and client mirrors carry identical skip constants');
check(S.__ghost > S.__ttl,
  'a ghosted proposal stays hidden longer than a human pass, so a dead tab is swept before we retry it');

const now = Date.now();
const at = ms => ({ toMillis: () => ms });
const cases = [
  ['nothing recorded', {}, false],
  ['passed 10s ago', { skipUids: ['p'], skipAt: { p: at(now - 10e3) } }, true],
  ['passed 29s ago', { skipUids: ['p'], skipAt: { p: at(now - 29e3) } }, true],
  ['passed 31s ago, re-offered', { skipUids: ['p'], skipAt: { p: at(now - 31e3) } }, false],
  ['passed 2 min ago, re-offered', { skipUids: ['p'], skipAt: { p: at(now - 120e3) } }, false],
  ['passed twice, permanent', { skipUids: ['p'], skipCount: { p: 2 }, skipAt: { p: at(now - 600e3) } }, true],
  ['ghosted 40s ago', { skipUids: ['p'], ghostAt: { p: at(now - 40e3) } }, true],
  ['ghosted 50s ago', { skipUids: ['p'], ghostAt: { p: at(now - 50e3) } }, false],
  ['in a room together 5 min ago', { skipUids: ['p'], matchSkipAt: { p: at(now - 300e3) } }, true],
  // A legacy doc with a bare array and no stamp must read EXPIRED, or old
  // ghosts deadlock the queue permanently.
  ['legacy bare skipUids', { skipUids: ['p'] }, false],
];
for (const [label, data, want] of cases) {
  const a = S.__f(data, 'p'), b = C.__f(data, 'p');
  check(a === want && b === want, `${label} (server ${a}, client ${b}, want ${want})`);
}

if (failed) { console.error(`\nspar skip rule: ${failed} failed`); process.exit(1); }
console.log('\nspar skip rule: all checks passed');
