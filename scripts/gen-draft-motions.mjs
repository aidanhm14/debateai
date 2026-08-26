#!/usr/bin/env node
// gen-draft-motions.mjs — regenerate app/netlify/functions/lib/draft-motions.mjs
// from the canonical motion pools in app/practice.html.
//
// Why generated and not hand-written: motion-library.mjs already requires
// every motion it carries to exist VERBATIM in one of practice.html's pools,
// and the curated case files there key off exact motion text. A paraphrase
// silently breaks that handoff, so the draft pool is derived rather than
// retyped. Run this after editing any pool in practice.html:
//
//   node scripts/gen-draft-motions.mjs
//
// Idempotent. Prints per-format counts so a shrunken pool is visible.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'app/practice.html');
const OUT = path.join(ROOT, 'app/netlify/functions/lib/draft-motions.mjs');
const ORDER = ['quick', 'apda', 'bp', 'worlds', 'asian', 'ld', 'pf', 'policy', 'congress', 'mun'];
const MIN_POOL = 6; // SLATE_SIZE + 1

const src = fs.readFileSync(SRC, 'utf8');

// Balanced-delimiter scan. A regex cannot find the end of these arrays:
// several motions contain brackets and apostrophes.
function block(s, startIdx, open, close) {
  let depth = 0;
  for (let j = startIdx; j < s.length; j++) {
    const c = s[j];
    if (c === open) depth++;
    else if (c === close) { depth--; if (!depth) return s.slice(startIdx, j + 1); }
  }
  return s.slice(startIdx);
}

// Pull quoted strings that look like motions. The length and shape filters
// drop array-internal comments, keys, and any markup that wanders in.
function strings(body) {
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(body))) {
    const s = (m[1] !== undefined ? m[1] : m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (s.length > 18 && /[a-z]/.test(s) && !/^https?:|^\//.test(s) && !/[<>{}]/.test(s)) out.push(s);
  }
  return out;
}

function namedArray(name) {
  const i = src.indexOf('var ' + name + ' = [');
  if (i < 0) return [];
  return strings(block(src, src.indexOf('[', i), '[', ']'));
}

const pools = {
  apda: namedArray('APDA_MOTIONS'),
  bp: namedArray('BP_MOTIONS'),
  asian: namedArray('ASIAN_MOTIONS'),
  worlds: namedArray('WORLDS_MOTIONS'),
};

const mbf = block(src, src.indexOf('{', src.indexOf('var MOTIONS_BY_FORMAT = {')), '{', '}');
const keyRe = /(?:^|\n)\s*([a-z_]+)\s*:\s*\[/g;
let km;
while ((km = keyRe.exec(mbf))) {
  const key = km[1];
  const list = strings(block(mbf, mbf.indexOf('[', km.index), '[', ']'));
  if (!pools[key] || pools[key].length < MIN_POOL) pools[key] = list;
}

const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
let bad = 0;
let body = '';
for (const k of ORDER) {
  const list = pools[k] || [];
  if (list.length < MIN_POOL) { console.error('SHORT POOL: ' + k + ' has ' + list.length); bad++; }
  console.log(k.padEnd(9), list.length);
  body += '\n  ' + k + ': [\n' + list.map((m) => '    ' + q(m) + ',').join('\n') + '\n  ],\n';
}
if (bad) { console.error('Refusing to write: ' + bad + ' pool(s) under ' + MIN_POOL + '.'); process.exit(1); }

fs.writeFileSync(OUT, `// draft-motions.mjs — the slate pool for the pre-round motion draft.
//
// GENERATED FILE. Do not hand-edit. Source of truth is the canonical motion
// pools in app/practice.html; regenerate with:
//
//   node scripts/gen-draft-motions.mjs
//
// Every pool must hold at least SLATE_SIZE + 1 motions or a slate cannot be
// drawn without repeats. scripts/test-motion-draft.mjs asserts that in the
// pre-commit hook, because a short pool surfaces as a duplicated card in
// front of two real people mid-draft rather than as an error anyone sees.

export const DRAFT_MOTIONS = {
${body}};

// A format with no pool of its own draws from the plain-language Quick Clash
// pool. 'casual' is the live case: /debate-chat pairs ride the same queue
// collection and never opt into a draft, but the fallback keeps a future
// opt-in from ever drawing an empty slate.
export const DRAFT_FALLBACK_FORMAT = 'quick';

export function draftPoolFor(format) {
  const key = String(format || '').toLowerCase();
  const pool = DRAFT_MOTIONS[key];
  return (pool && pool.length) ? pool : DRAFT_MOTIONS[DRAFT_FALLBACK_FORMAT];
}
`);
console.log('wrote ' + path.relative(ROOT, OUT));
