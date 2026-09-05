#!/usr/bin/env node
// Exercise the sitemap response against the content, routing and crawler
// contracts. No network or production credentials are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sitemap from '../app/netlify/functions/sitemap.mjs';
import debate from '../app/netlify/functions/debate.mjs';
import { listMotions } from '../app/netlify/functions/lib/debate-bank.mjs';

const ORIGIN = 'https://itsdebatable.com';
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const exists = file => fs.existsSync(new URL(`../${file}`, import.meta.url));
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let checks = 0;
function check(value, message) {
  checks++;
  assert.ok(value, message);
}

// Read only literal path rules, in their declared order. Host redirects and
// conditional rules need deployment verification, not a partial emulation.
const routes = read('app/netlify.toml').split(/^\[\[redirects\]\]\s*$/m).slice(1)
  .map(block => {
    const section = block.split(/^\[/m)[0];
    const field = key => section.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];
    return {
      from: field('from'), to: field('to'),
      status: Number(section.match(/^\s*status\s*=\s*(\d+)/m)?.[1] || 301),
      force: /^\s*force\s*=\s*true\s*$/m.test(section),
      conditional: /^\s*(?:conditions|query)\s*=/m.test(section) || /^\[redirects\.(?:conditions|query)\]/m.test(block),
    };
  }).filter(route => route.from?.startsWith('/') && !/[*:]/.test(route.from) && !route.conditional);

function crawlerRules(source) {
  const groups = [];
  let group = null;
  for (const raw of source.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const entry = line.match(/^([^:]+):\s*(.*)$/);
    if (!entry) continue;
    const [, key, value] = entry;
    if (key.toLowerCase() === 'user-agent') {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (group && /^(allow|disallow)$/i.test(key) && value) {
      const anchored = value.endsWith('$');
      const pattern = anchored ? value.slice(0, -1) : value;
      group.rules.push({
        allow: key.toLowerCase() === 'allow',
        length: pattern.replace(/\*/g, '').length,
        regex: new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + (anchored ? '$' : '')),
      });
    }
  }
  const specific = groups.filter(group => group.agents.includes('googlebot'));
  return (specific.length ? specific : groups.filter(group => group.agents.includes('*'))).flatMap(group => group.rules);
}
const robots = crawlerRules(read('app/robots.txt'));
function crawlable(path) {
  const matches = robots.filter(rule => rule.regex.test(path))
    .sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
  return !matches.length || matches[0].allow;
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)]
    .map(match => [match[1].toLowerCase(), match[3]]));
}
function checkIndexableHtml(html, url) {
  // Restrict checks to actual head markup, excluding commented examples.
  const head = html.replace(/<!--[\s\S]*?-->/g, '').match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  check(!metas.some(meta => /^(robots|googlebot)$/i.test(meta.name || '') && /\b(noindex|none)\b/i.test(meta.content || '')),
    `${url} is submitted despite a noindex directive`);
  const canonicals = [...head.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]))
    .filter(link => /(?:^|\s)canonical(?:\s|$)/i.test(link.rel || ''));
  check(canonicals.length === 1 && canonicals[0].href === url,
    `${url} must have exactly one self-canonical link, found ${JSON.stringify(canonicals)}`);
}

const response = await sitemap(new Request(`${ORIGIN}/sitemap.xml`));
check(response.status === 200, 'sitemap must return HTTP 200');
check(/application\/xml/i.test(response.headers.get('content-type') || ''), 'sitemap must be served as XML');
const xml = await response.text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
check(urls.length > 0, 'sitemap cannot be empty');
check(urls.length === new Set(urls).size, 'sitemap contains duplicate URLs');
let staticPages = 0;
for (const value of urls) {
  const url = new URL(value);
  check(url.origin === ORIGIN && !url.search && !url.hash, `noncanonical sitemap URL: ${value}`);
  check(crawlable(url.pathname), `sitemap URL is blocked by robots.txt: ${value}`);
  const route = routes.find(route => route.from === url.pathname);
  const natural = url.pathname.endsWith('/') ? `app${url.pathname}index.html` : `app${url.pathname}.html`;
  const shadowed = exists(natural) && !route?.force;
  check(!route || shadowed || route.status < 300 || route.status >= 400,
    `sitemap submits a redirect: ${url.pathname} -> ${route?.to}`);
  const file = route && !shadowed && route.status === 200
    ? (/^\/[^?#]*\.html$/.test(route.to || '') ? `app${route.to}` : null)
    : (exists(natural) ? natural : null);
  if (file) {
    check(exists(file), `static sitemap destination is missing: ${file}`);
    checkIndexableHtml(read(file), value);
    staticPages++;
  }
}

// Comparing with the bank catches both deleted dossiers left in the sitemap
// and new dossiers omitted from it. Render every advertised dossier as well:
// membership alone cannot prove that a URL returns an indexable document.
const dossiers = urls.filter(url => new URL(url).pathname.startsWith('/debate/')).sort();
assert.deepEqual(dossiers, listMotions().map(motion => `${ORIGIN}/debate/${motion.slug}`).sort(),
  'sitemap dossier URLs must exactly cover the current rendering bank');
checks++;
for (const url of dossiers) {
  const page = await debate(new Request(url));
  check(page.status === 200, `advertised dossier does not return 200: ${url}`);
  check(!/\b(noindex|none)\b/i.test(page.headers.get('x-robots-tag') || ''), `dossier HTTP header blocks indexing: ${url}`);
  checkIndexableHtml(await page.text(), url);
}

// Google must be able to fetch these existing handoff variants to read their
// bare-path canonical; robots.txt cannot remove already discovered URLs.
for (const path of ['/practice?motion=Should%20AI%20be%20regulated', '/voice-debate?motion=Should%20AI%20be%20regulated']) {
  check(crawlable(path), `handoff canonical cannot be read because robots.txt blocks ${path}`);
}
console.log(`sitemap indexing: ${checks} checks passed (${urls.length} URLs, ${staticPages} static pages, ${dossiers.length} rendered dossiers)`);
