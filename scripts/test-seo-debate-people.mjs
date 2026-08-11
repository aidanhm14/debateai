import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

const page = read('app/debate-strangers.html');
const appToml = read('app/netlify.toml');
const rootToml = read('netlify.toml');
const sitemap = read('app/netlify/functions/sitemap.mjs');
const staticSitemap = read('app/sitemap.xml');
const landing = read('app/landing.html');
const hub = read('app/debate-online.html');
const platforms = read('app/online-debate-platforms.html');
const llms = read('app/llms.txt');
const guides = read('app/netlify/functions/learn-guides.mjs');

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

function first(pattern, source = page) {
  return (source.match(pattern) || [])[1] || '';
}

const title = first(/<title>([^<]+)<\/title>/i);
const description = first(/<meta\s+name="description"\s+content="([^"]+)"/i);
const h1 = first(/<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, '').trim();
const visible = page
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');

const jsonLd = [];
for (const match of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  try { jsonLd.push(JSON.parse(match[1])); } catch (error) { jsonLd.push({ parseError: error.message }); }
}
const faq = jsonLd.find((entry) => entry['@type'] === 'FAQPage');
const webPage = jsonLd.find((entry) => entry['@type'] === 'WebPage');
const application = jsonLd.find((entry) => entry['@type'] === 'WebApplication');
const breadcrumb = jsonLd.find((entry) => entry['@type'] === 'BreadcrumbList');

check('title targets exact query', title.startsWith('Debate People Online |'));
check('title fits search display', title.length >= 45 && title.length <= 60);
check('description targets exact query', description.startsWith('Debate people online'));
check('description fits search display', description.length >= 120 && description.length <= 160);
check('one exact-intent H1 is present', h1 === 'Debate people online. Then settle it.' && (page.match(/<h1\b/g) || []).length === 1);
check('direct answer is extractable', page.includes('<strong>To debate people online,</strong>'));
check('supporting H2 answers where intent', page.includes('<h2>Where to debate people online</h2>'));
check('exact-query FAQ is visible', page.includes('<summary>Where can I debate people online?</summary>'));

check('canonical points to one clean URL', page.includes('<link rel="canonical" href="https://itsdebatable.com/debate-strangers">'));
check('English and default alternates agree with canonical',
  page.includes('hreflang="en" href="https://itsdebatable.com/debate-strangers"')
  && page.includes('hreflang="x-default" href="https://itsdebatable.com/debate-strangers"'));
check('page is fully indexable', page.includes('content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"'));
check('social metadata names Debatable', page.includes('<meta property="og:site_name" content="Debatable">'));
check('social image has alt text', page.includes('<meta property="og:image:alt"') && page.includes('<meta name="twitter:image:alt"'));

check('all JSON-LD parses', jsonLd.length >= 4 && jsonLd.every((entry) => !entry.parseError));
check('WebPage entity matches canonical',
  webPage?.['@id'] === 'https://itsdebatable.com/debate-strangers#webpage'
  && webPage?.url === 'https://itsdebatable.com/debate-strangers'
  && webPage?.dateModified === '2026-08-10');
check('application entity carries query aliases',
  application?.alternateName?.includes('Debate People Online')
  && application?.alternateName?.includes('Debate With People Online'));
check('FAQ schema answers exact query', faq?.mainEntity?.some((item) => item.name === 'Where can I debate people online?'));
check('breadcrumb entity is linked and current',
  breadcrumb?.['@id'] === 'https://itsdebatable.com/debate-strangers#breadcrumb'
  && breadcrumb?.itemListElement?.[1]?.name === 'Debate People Online');

function hasAliasRedirect(source, from) {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`from = "${escaped}"\\s+to = "/debate-strangers"\\s+status = 301\\s+force = true`).test(source);
}
for (const from of ['/debate-people-online', '/debate-with-people-online']) {
  check(`app redirect consolidates ${from}`, hasAliasRedirect(appToml, from));
  check(`root redirect consolidates ${from}`, hasAliasRedirect(rootToml, from));
}
check('aliases are not submitted as competing sitemap URLs',
  !sitemap.includes("path: '/debate-people-online'")
  && !sitemap.includes("path: '/debate-with-people-online'"));
check('live sitemap marks canonical page fresh',
  /path: '\/debate-strangers'[\s\S]{0,140}lastmod: '2026-08-10'/.test(sitemap));
check('static sitemap snapshot names the query cluster', staticSitemap.includes('debate people online'));

check('homepage links exact anchor to canonical', landing.includes('<a href="/debate-strangers">Debate people online</a>'));
check('online-debate hub links exact anchor to canonical', hub.includes('<a href="/debate-strangers">Debate people online</a>'));
check('comparison page links exact anchor to canonical', platforms.includes('<a href="/debate-strangers">Debate people online</a>'));
check('AI discovery file identifies canonical page', llms.includes('[Debate people online](https://itsdebatable.com/debate-strangers)'));
check('guide cluster links human intent to canonical', guides.includes('<a href="/debate-strangers">Debate people online on video</a>'));
check('online-debate primary CTA explicitly enters a live debate',
  /<a class="btn-primary" href="\/spar"[^>]*>[\s\S]*?<span class="btn-primary-title">Enter a live debate<\/span>/.test(hub));
check('online-debate primary CTA has a large tap target',
  /\.btn-primary\{[\s\S]{0,180}min-height:84px/.test(hub));
check('online-debate primary CTA stacks first on small screens',
  /@media\(max-width:680px\)[\s\S]{0,180}\.hero-ctas\{grid-template-columns:1fr\}/.test(hub));

check('visible brand is Debatable, not a fake dot-com name', !visible.includes('Debatable.com'));
check('visible copy has no em dash', !visible.includes('—'));
check('visible copy avoids banned acquisition claims',
  !/no sign-up required|pay nothing|unlimited requests|holistic|robust framework/i.test(visible));
check('page makes no unverifiable matching-time promise', !/under a minute|in seconds/i.test(visible));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
