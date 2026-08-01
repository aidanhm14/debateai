#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────
// Netlify-function import guard.
//
// Blocks a commit that stages a function importing a name a sibling
// lib module does not actually export, or importing a lib module that
// does not exist. Both fail at Netlify's "Functions bundling" step
// with exit code 2, and — this is the part that makes it worth a hook
// — a bundling failure blocks EVERY deploy, not just the broken
// function. The site then serves a stale build while unrelated
// commits pile up behind it.
//
// Real history, all the same mistake, all `json` (the module exports
// corsResponse / jsonResponse / errorResponse and never `json`):
//   2026-07-31  log-vote.mjs                             (c3463c79)
//   2026-07-31  compute-rfd-metrics + log-rfd-rating     (ec3b77b3)
//   2026-07-31  generate-poll-question + log-poll-response (b5e2a248)
//   2026-07-31  compute-persuasion-delta + extract-claims  (f0800af9)
// Seven functions, four commits, one day. extract-claims also imported
// ./lib/brain-router.mjs, which has never existed — hence the
// missing-module check alongside the missing-export one.
//
//   Build failed with 1 error:
//   No matching export in "netlify/functions/lib/response.mjs"
//   for import "json"
//
// Scope: app/netlify/functions/**/*.mjs only. Per AGENTS.md the Netlify
// base directory is app/, so app/netlify/functions is the ONE deployed
// copy; a netlify/functions/ tree at the repo root is dead weight that
// is never bundled, and flagging it would be noise about code that
// cannot break a deploy.
//
// Static parse, zero dependencies, no npm install, no module loading
// (importing a function for real would need every env var set and
// would run its top-level side effects). Whole-tree scan is ~30ms.
//
// Usage:
//   node scripts/check-function-imports.mjs         # staged files (hook mode)
//   node scripts/check-function-imports.mjs --all   # every deployed function
//
// Behavior: soft-skips (exit 0) when git or the functions dir are
// unavailable, so it never wedges a fresh clone or a non-DebateAI repo
// sharing this hooks directory; hard-fails (exit 1) only on a real
// broken import.
// ──────────────────────────────────────────────────────────────────

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FUNCTIONS_DIR = 'app/netlify/functions';
const ALL = process.argv.includes('--all');

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

if (!fs.existsSync(FUNCTIONS_DIR)) process.exit(0); // not this repo → don't block

// ── Source resolution ─────────────────────────────────────────────
// In hook mode read the STAGED content (`git show :path`), because the
// staged version is what actually ships — a fix sitting unstaged in the
// working tree must not make a broken commit pass. Falls back to disk
// for files that are not in the index (an unstaged lib module an
// importer depends on).
const sourceCache = new Map();
function readSource(file) {
  if (sourceCache.has(file)) return sourceCache.get(file);
  let text = null;
  if (!ALL) {
    try { text = sh(`git show :"${file}"`); } catch { /* not in index */ }
  }
  if (text === null) {
    try { text = fs.readFileSync(file, 'utf8'); } catch { /* gone */ }
  }
  sourceCache.set(file, text);
  return text;
}

// ── Import parsing ────────────────────────────────────────────────
// ESM import declarations are top-level, so anchoring at line start
// keeps commented-out imports (`// import { x } from ...`) out. The
// lazy clause match spans lines so multi-line import lists are covered.
const IMPORT_RE = /^[ \t]*import\s+([\s\S]*?)\sfrom\s*['"]([^'"]+)['"]/gm;

function parseImports(text) {
  const out = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const clause = m[1].trim();
    const spec = m[2];
    const line = text.slice(0, m.index).split('\n').length;
    // `import * as ns from` — a namespace object is always constructible,
    // so there is no bundle-time name to verify.
    if (/^\*\s+as\s/.test(clause)) continue;

    const names = [];
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) names.push(name);
      }
    }
    // A leading bare identifier is a default import.
    const head = clause.split('{')[0].trim().replace(/,$/, '').trim();
    if (head && !head.startsWith('*')) names.push('default');

    if (names.length) out.push({ spec, names, line });
  }
  return out;
}

// ── Export parsing ────────────────────────────────────────────────
function parseExports(text) {
  const names = new Set();
  // `export * from './x.mjs'` re-exports an unknowable set. Nothing in
  // lib/ uses it today; if that changes, skip the module rather than
  // report names it may well re-export.
  if (/^[ \t]*export\s+\*/m.test(text)) return { names, unresolvable: true };

  if (/^[ \t]*export\s+default\b/m.test(text)) names.add('default');
  const add = (re) => { for (const m of text.matchAll(re)) names.add(m[1]); };

  add(/^[ \t]*export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm);
  add(/^[ \t]*export\s+class\s+([A-Za-z_$][\w$]*)/gm);
  // `export const A = 1, B = 2` and `export const { a, b } = obj` both
  // occur in the wild, so take every identifier in the declaration head.
  for (const m of text.matchAll(/^[ \t]*export\s+(?:const|let|var)\s+([\s\S]*?)=/gm)) {
    for (const id of m[1].match(/[A-Za-z_$][\w$]*/g) || []) names.add(id);
  }
  // `export { a, b as c }`, optionally spanning lines, optionally
  // followed by `from './x.mjs'` (the names are listed either way).
  for (const m of text.matchAll(/^[ \t]*export\s*\{([\s\S]*?)\}/gm)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      const exported = (bits[1] || bits[0]).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(exported)) names.add(exported);
    }
  }
  return { names, unresolvable: false };
}

const exportCache = new Map();
function exportsOf(file) {
  if (exportCache.has(file)) return exportCache.get(file);
  const text = readSource(file);
  const result = text === null ? null : parseExports(text);
  exportCache.set(file, result);
  return result;
}

// ── Target selection ──────────────────────────────────────────────
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.isFile() && p.endsWith('.mjs') ? [p] : [];
  });
}

let targets;
if (ALL) {
  targets = walk(FUNCTIONS_DIR);
} else {
  let staged;
  try {
    staged = sh('git diff --cached --name-only --diff-filter=ACMR')
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    process.exit(0); // no git context → don't block
  }
  targets = staged.filter((f) => f.startsWith(`${FUNCTIONS_DIR}/`) && f.endsWith('.mjs'));
}
if (!targets.length) process.exit(0);

// ── Check ─────────────────────────────────────────────────────────
const violations = [];
for (const file of targets) {
  const text = readSource(file);
  if (text === null) continue;

  for (const imp of parseImports(text)) {
    // Only relative, explicitly-extensioned specifiers resolve to a file
    // we can read. Bare package names ('firebase-admin') and
    // extensionless paths are somebody else's problem.
    if (!imp.spec.startsWith('.') || !/\.(mjs|js)$/.test(imp.spec)) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), imp.spec));
    if (!resolved.startsWith(`${FUNCTIONS_DIR}/`)) continue;

    const mod = exportsOf(resolved);
    if (mod === null) {
      violations.push({ file, line: imp.line, spec: imp.spec, missingModule: true });
      continue;
    }
    if (mod.unresolvable) continue; // re-export star → cannot verify, don't guess

    for (const name of imp.names) {
      if (!mod.names.has(name)) {
        violations.push({ file, line: imp.line, spec: imp.spec, name, resolved, has: mod.names });
      }
    }
  }
}

if (violations.length) {
  const red = (s) => `\x1b[31m${s}\x1b[0m`;
  console.error(red('\n✗ function-import guard: broken import(s) in Netlify functions'));
  console.error('  These fail at Netlify "Functions bundling" (exit 2), which blocks EVERY deploy,');
  console.error('  not just the function below.\n');
  for (const v of violations) {
    if (v.missingModule) {
      console.error(`  ${v.file}:${v.line}  imports "${v.spec}" — that module does not exist`);
    } else {
      const has = [...v.has].sort().join(', ') || '(none)';
      console.error(`  ${v.file}:${v.line}  imports "${v.name}" from "${v.spec}" — not exported`);
      console.error(`      ${v.resolved} exports: ${has}`);
    }
  }
  console.error('\n  Fix the import name (or add the export). Never bypass with --no-verify —');
  console.error('  a bundling failure takes the whole site\'s deploy pipeline down with it.\n');
  process.exit(1);
}

process.exit(0);
