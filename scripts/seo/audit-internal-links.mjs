#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────
// SEO internal-link auditor.
//
// Cross-checks every internal link in the shipped HTML against what the site
// actually serves (page files + netlify.toml redirect rules + the function
// sitemap's path list). Surfaces:
//   - BROKEN  : internal links to a path that has no page and no redirect
//               (these are the "Not found (404)" GSC reports).
//   - REDIRECT: internal links pointing at a 301 source (wastes crawl budget,
//               dilutes link equity — should point at the canonical target).
//
// Run:  node scripts/seo/audit-internal-links.mjs
//       node scripts/seo/audit-internal-links.mjs --redirects   # also list redirect-target links
// ────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(ROOT, 'app');
const SHOW_REDIRECTS = process.argv.includes('--redirects');

// ── 1. resolvable page paths from the file tree (Netlify pretty URLs) ──
const pageFiles = [];
function walk(dir, rel = '') {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const r = rel ? rel + '/' + name : name;
    if (statSync(full).isDirectory()) {
      if (['netlify', 'node_modules', 'icons', 'css', 'js', 'fonts', 'assets', 'tools', 'i18n'].includes(name)) continue;
      walk(full, r);
    } else if (name.endsWith('.html')) {
      if (r === 'index-vite.html') continue; // local Vite dev shell, never shipped/served as a page
      pageFiles.push(r);
    }
  }
}
walk(APP);

const servedPaths = new Set(['/']);
for (const f of pageFiles) {
  const noExt = '/' + f.replace(/\.html$/, '');
  servedPaths.add(noExt);                       // /foo  and /topics/bar
  servedPaths.add('/' + f);                     // /foo.html (Netlify serves both)
  if (noExt.endsWith('/index')) servedPaths.add(noExt.replace(/\/index$/, '') || '/'); // /topics/index → /topics
}

// ── 2. redirect rules from netlify.toml (exact + wildcard prefixes) ──
const toml = readFileSync(join(APP, 'netlify.toml'), 'utf8');
const exactRedirects = new Set();
const wildcardRedirects = []; // prefixes ending in /*
const redirectFrom = new Map(); // from -> to (for redirect-link reporting)
{
  const blocks = toml.split(/\[\[redirects\]\]/).slice(1);
  for (const b of blocks) {
    const from = (b.match(/from\s*=\s*"([^"]+)"/) || [])[1];
    const to = (b.match(/to\s*=\s*"([^"]+)"/) || [])[1];
    const status = (b.match(/status\s*=\s*(\d+)/) || [])[1] || '200';
    if (!from) continue;
    redirectFrom.set(from, { to, status });
    if (from.endsWith('/*')) wildcardRedirects.push(from.slice(0, -2));
    else exactRedirects.add(from);
  }
}

function resolvable(path) {
  if (servedPaths.has(path) || exactRedirects.has(path)) return true;
  for (const pre of wildcardRedirects) if (path === pre || path.startsWith(pre + '/')) return true;
  return false;
}
function redirectsTo(path) {
  if (redirectFrom.has(path) && redirectFrom.get(path).status.startsWith('30')) return redirectFrom.get(path).to;
  return null;
}

// ── 3. collect every internal link from the shipped HTML ──
const ASSET_EXT = /\.(png|jpe?g|svg|gif|webp|ico|css|js|mjs|xml|json|txt|webmanifest|woff2?|ttf|map|pdf|mp4|webm|avif|zip)$/i;
const links = new Map(); // path -> Set(sourceFiles)
for (const f of pageFiles) {
  const html = readFileSync(join(APP, f), 'utf8');
  const re = /(?:href|src)\s*=\s*["'](\/[^"'#?\s]*)/g;
  let m;
  while ((m = re.exec(html))) {
    let p = m[1].replace(/\/$/, '') || '/';
    if (ASSET_EXT.test(p)) continue;          // static asset, not a page
    if (p.startsWith('/api/') || p.startsWith('/.netlify/')) continue;
    if (!links.has(p)) links.set(p, new Set());
    links.get(p).add(f);
  }
}

// ── 4. classify ──
const broken = [];
const toRedirect = [];
for (const [p, srcs] of [...links].sort()) {
  if (!resolvable(p)) broken.push([p, srcs]);
  else { const t = redirectsTo(p); if (t) toRedirect.push([p, t, srcs]); }
}

console.log(`\nSEO internal-link audit  ·  ${pageFiles.length} pages  ·  ${links.size} distinct internal link targets\n`);

if (broken.length) {
  console.log(`✗ BROKEN — link target has no page and no redirect (these 404):`);
  for (const [p, srcs] of broken) console.log(`   ${p.padEnd(42)} ← ${[...srcs].slice(0, 6).join(', ')}${srcs.size > 6 ? ` (+${srcs.size - 6})` : ''}`);
} else {
  console.log('✓ no broken internal links — every internal link resolves to a page or redirect.');
}

if (SHOW_REDIRECTS && toRedirect.length) {
  console.log(`\n→ REDIRECTS — internal links pointing at a 301 source (repoint to the target):`);
  for (const [p, t, srcs] of toRedirect) console.log(`   ${p.padEnd(34)} →301→ ${t.padEnd(20)} ← ${[...srcs].slice(0, 5).join(', ')}${srcs.size > 5 ? ` (+${srcs.size - 5})` : ''}`);
} else if (toRedirect.length) {
  console.log(`\n→ ${toRedirect.length} internal links point at 301 sources (run with --redirects to list).`);
}
console.log('');
