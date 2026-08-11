import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

const page = read('app/online-debate-platforms.html');
const hub = read('app/debate-online.html');
const people = read('app/debate-strangers.html');
const landing = read('app/landing.html');
const llms = read('app/llms.txt');
const appToml = read('app/netlify.toml');
const rootToml = read('netlify.toml');
const sitemap = read('app/netlify/functions/sitemap.mjs');
const staticSitemap = read('app/sitemap.xml');

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
  .replace(/&middot;/g, '·')
  .replace(/\s+/g, ' ');

const jsonLd = [];
for (const match of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  try { jsonLd.push(JSON.parse(match[1])); } catch (error) { jsonLd.push({ parseError: error.message }); }
}
const article = jsonLd.find((entry) => entry['@type'] === 'Article');
const itemList = jsonLd.find((entry) => entry['@type'] === 'ItemList');
const faq = jsonLd.find((entry) => entry['@type'] === 'FAQPage');

check('title targets exact free-platform query', title.startsWith('7 Best Free Online Debate Platforms'));
check('title fits search display', title.length >= 45 && title.length <= 60);
check('description contains exact query phrase', description.includes('free online debate platforms'));
check('description fits search display', description.length >= 120 && description.length <= 160);
check('one exact-intent H1 is present',
  h1 === 'The best free online debate platforms in 2026'
  && (page.match(/<h1\b/g) || []).length === 1);
check('lede directly answers exact query', page.includes('<strong>free online debate platform</strong>'));
check('Debatable free access is qualified',
  page.includes('Debatable offers limited free access to video and AI debates'));
check('access note explains limits',
  page.includes('<strong>What “free” means here.</strong>')
  && page.includes('this guide does not promise permanent or unrestricted access'));
check('comparison table has access column', page.includes('<th>Free access</th>'));
check('Debatable row names limited rounds',
  /<a href="\/spar">Debatable<\/a>[\s\S]{0,100}<td>Limited rounds<\/td>/.test(page));
check('exact-query FAQ is visible', page.includes('<summary>What is the best free online debate platform?</summary>'));

check('canonical points to the substantive comparison',
  page.includes('<link rel="canonical" href="https://itsdebatable.com/online-debate-platforms">'));
check('English and default alternates agree with canonical',
  page.includes('hreflang="en" href="https://itsdebatable.com/online-debate-platforms"')
  && page.includes('hreflang="x-default" href="https://itsdebatable.com/online-debate-platforms"'));
check('page is fully indexable', page.includes('content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"'));
check('social titles target exact query',
  page.includes('<meta property="og:title" content="7 Best Free Online Debate Platforms')
  && page.includes('<meta name="twitter:title" content="7 Best Free Online Debate Platforms'));
check('social image has alt text', page.includes('<meta property="og:image:alt"') && page.includes('<meta name="twitter:image:alt"'));

check('all JSON-LD parses', jsonLd.length >= 3 && jsonLd.every((entry) => !entry.parseError));
check('Article schema targets exact query', article?.headline === '7 Best Free Online Debate Platforms in 2026');
check('ItemList schema targets exact query', itemList?.name === 'Best free online debate platforms in 2026');
check('Debatable is first in structured comparison', itemList?.itemListElement?.[0]?.name === 'Debatable');
check('structured Debatable claim qualifies free access',
  itemList?.itemListElement?.[0]?.description?.startsWith('Limited free access'));
check('FAQ schema answers exact query',
  faq?.mainEntity?.some((item) => item.name === 'What is the best free online debate platform?'));

function hasAliasRedirect(source) {
  return /from = "\/free-online-debate-platform"\s+to = "\/online-debate-platforms"\s+status = 301\s+force = true/.test(source);
}
check('app redirect consolidates exact singular slug', hasAliasRedirect(appToml));
check('root redirect consolidates exact singular slug', hasAliasRedirect(rootToml));
check('alias is not submitted as a competing sitemap URL',
  !sitemap.includes("path: '/free-online-debate-platform'")
  && !staticSitemap.includes('<loc>https://itsdebatable.com/free-online-debate-platform</loc>'));
check('live sitemap marks comparison fresh and important',
  /path: '\/online-debate-platforms'[\s\S]{0,120}priority: '0\.92'[\s\S]{0,80}lastmod: '2026-08-10'/.test(sitemap));
check('static sitemap names exact query and fresh date',
  staticSitemap.includes('"free online debate platform"')
  && /<loc>https:\/\/itsdebatable\.com\/online-debate-platforms<\/loc>\s+<lastmod>2026-08-10<\/lastmod>/.test(staticSitemap));

check('homepage links exact query anchor to comparison',
  landing.includes('<a href="/online-debate-platforms" style="color:var(--text-dim)">Free online debate platforms</a>'));
check('broad online-debate hub links exact query anchor',
  hub.includes('<a href="/online-debate-platforms">Compare free online debate platforms</a>'));
check('human-intent page links exact query anchor',
  people.includes('<a href="/online-debate-platforms">Compare free online debate platforms</a>'));
check('AI discovery file identifies exact-query comparison',
  llms.includes('[Best free online debate platforms compared](https://itsdebatable.com/online-debate-platforms)'));
check('broad online-debate page keeps its own canonical',
  hub.includes('<link rel="canonical" href="https://itsdebatable.com/debate-online">'));

check('visible copy has no em dash', !visible.includes('—'));
check('visible copy removes beta-era free phrasing', !/free while in beta|free during beta/i.test(visible));
check('visible copy avoids banned acquisition claims',
  !/no sign-up required|pay nothing|unlimited|holistic|robust framework/i.test(visible));
check('page makes no unverifiable matching-time promise', !/under a minute|in seconds/i.test(visible));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
