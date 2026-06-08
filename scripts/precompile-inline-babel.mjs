#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────
// Precompile <script data-precompile="es5"> blocks to var-hoisted JS.
//
// Why: index.html / debate-it.html / etc. ship a 14k+ line inline
// <script type="text/babel"> and a babel-standalone CDN tag. At
// runtime, Babel parses the whole thing into an AST, transforms it,
// and the browser parses the output again. ~300-600MB of heap
// vanishes once Babel is gone.
//
// Naively dropping Babel breaks the app because the source relies on
// const/let forward-references (e.g. useEffect deps array reading
// `navigateTab` before the `const navigateTab = useCallback(...)`
// declaration). Babel was masking these by transforming const/let to
// var with function-scope hoisting. esbuild with
// `supported: { 'const-and-let': false }` does the same conversion —
// nothing else — keeping the rest of the source modern + readable.
//
// Trigger: tag the inline script with `<script data-precompile="es5">`.
// The script reads it, esbuild-transforms the content in place, and
// drops the babel-standalone CDN <script> tag from the same file.
// Idempotent: running on already-var code is a no-op.
// ──────────────────────────────────────────────────────────────────

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Babel lives in app/node_modules — let Node resolve from that root.
const babelPath = require.resolve('@babel/core', { paths: [resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app')] });
const pluginPath = require.resolve('@babel/plugin-transform-block-scoping', { paths: [resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app')] });
const babel = await import(babelPath);
const blockScopingPlugin = (await import(pluginPath)).default;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_FILES = [
  'app/index.html',
  'app/debate-it.html',
  'app/voice-debate.html',
  'app/learn.html',
  'app/high-school.html',
  'app/exhibition.html',
];

const SCRIPT_RE = /<script data-precompile="es5">([\s\S]*?)<\/script>/g;
const BABEL_CDN_RE = /\n?[ \t]*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/babel-standalone\/[^"]+"><\/script>\n?/g;

async function precompileFile(relPath) {
  const path = resolve(REPO_ROOT, relPath);
  let html;
  try {
    html = await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { path: relPath, status: 'missing' };
    throw err;
  }

  let touched = false;
  let blocks = 0;

  // 1) Transform each <script data-precompile="es5"> block.
  const matches = [...html.matchAll(SCRIPT_RE)];
  for (const m of matches) {
    const original = m[1];
    const result = await babel.transformAsync(original, {
      // Only convert block-scoped declarations to var (matches the
      // hoisting semantics @babel/standalone gave us at runtime).
      // No other transforms — keeps the rest of the source modern.
      plugins: [blockScopingPlugin],
      // Don't read .babelrc or babel.config.json.
      babelrc: false,
      configFile: false,
      // Preserve formatting/comments as much as possible.
      retainLines: true,
      compact: false,
      sourceType: 'script',
    });
    const transpiled = result.code;
    if (transpiled !== original) {
      // Pass replacement via a function so `$` characters in the transpiled
      // output (e.g. `'$' + usd`) aren't interpreted as backreferences like
      // `$'` (rest-after-match) by String.prototype.replace.
      const replacement = `<script data-precompile="es5">${transpiled}</script>`;
      html = html.replace(m[0], () => replacement);
      touched = true;
    }
    blocks++;
  }

  // 2) Drop babel-standalone CDN script tags — they're dead weight once
  //    the inline blocks are precompiled.
  const beforeCdnStrip = html;
  html = html.replace(BABEL_CDN_RE, '\n');
  if (html !== beforeCdnStrip) touched = true;

  if (touched) await writeFile(path, html);

  return {
    path: relPath,
    status: touched ? 'updated' : (blocks === 0 ? 'no-marker' : 'no-op'),
    blocks,
  };
}

const filesArg = process.argv.slice(2);
const files = filesArg.length ? filesArg : DEFAULT_FILES;

let anyUpdated = false;
for (const f of files) {
  const r = await precompileFile(f);
  const tag = r.status === 'updated' ? '✓' : r.status === 'no-op' ? '·' : r.status === 'no-marker' ? '—' : '?';
  console.log(`${tag} ${r.path} (${r.status}${r.blocks != null ? `, ${r.blocks} block${r.blocks === 1 ? '' : 's'}` : ''})`);
  if (r.status === 'updated') anyUpdated = true;
}

process.exit(0);
