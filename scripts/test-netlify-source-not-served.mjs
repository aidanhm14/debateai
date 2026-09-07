#!/usr/bin/env node
// Guard: the function source tree must never be served as static files.
//
// The Netlify publish dir is app/ and the functions live at
// app/netlify/functions/, so without a forced 404 every function file is a
// plain GET at /netlify/functions/<name>.mjs. On 2026-09-07 that included
// lib/_firestore-creds.mjs, which the build bakes the Firestore
// service-account PRIVATE KEY into. The block has to be the FIRST redirect
// (rules are first-match) and forced (so a real file cannot shadow it), in
// BOTH toml mirrors. This test fails the commit if either drifts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
function assert(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } }

for (const rel of ['app/netlify.toml', 'netlify.toml']) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const first = src.indexOf('[[redirects]]');
  assert(first >= 0, rel + ': has no redirects');
  const blockIdx = src.indexOf('from = "/netlify/*"');
  assert(blockIdx >= 0, rel + ': missing the /netlify/* block rule');
  // The block must be the first [[redirects]] entry.
  const firstEntry = src.slice(first, src.indexOf('[[redirects]]', first + 1));
  assert(/from = "\/netlify\/\*"/.test(firstEntry), rel + ': the /netlify/* block is not the FIRST redirect');
  assert(/status = 404/.test(firstEntry), rel + ': the /netlify/* block is not a 404');
  assert(/force = true/.test(firstEntry), rel + ': the /netlify/* block is not forced');
}

// The tracked stub must stay null: real values are baked at build time only.
const stub = fs.readFileSync(path.join(root, 'app/netlify/functions/lib/_firestore-creds.mjs'), 'utf8');
assert(/PRIVATE_KEY_B64 = null/.test(stub), '_firestore-creds.mjs carries a non-null PRIVATE_KEY_B64 (a real key is about to be committed)');
assert(/CLIENT_EMAIL = null/.test(stub), '_firestore-creds.mjs carries a non-null CLIENT_EMAIL');

if (failed) { console.error(failed + ' assertion(s) failed'); process.exit(1); }
console.log('netlify-source-not-served: ok');
