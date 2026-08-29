import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

const page = read('app/debate-online.html');
const appToml = read('app/netlify.toml');
const rootToml = read('netlify.toml');
const sitemap = read('app/netlify/functions/sitemap.mjs');
const staticSitemap = read('app/sitemap.xml');
const landing = read('app/landing.html');
const people = read('app/debate-strangers.html');
const platforms = read('app/online-debate-platforms.html');
const llms = read('app/llms.txt');
const signupNudge = read('app/js/signup-nudge.js');
const homeMagnet = read('app/js/home-magnet.js');

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
const entities = jsonLd.flatMap((entry) => entry['@graph'] || [entry]);
const webPage = entities.find((entry) => entry['@type'] === 'WebPage');
const application = entities.find((entry) => entry['@type'] === 'WebApplication');
const breadcrumb = entities.find((entry) => entry['@type'] === 'BreadcrumbList');
const paths = entities.find((entry) => entry['@type'] === 'ItemList');
const faq = entities.find((entry) => entry['@type'] === 'FAQPage');
const landingJsonLd = [];
for (const match of landing.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  try { landingJsonLd.push(JSON.parse(match[1])); } catch (error) { landingJsonLd.push({ parseError: error.message }); }
}
const landingEntities = landingJsonLd.flatMap((entry) => entry['@graph'] || [entry]);
const homeWebPage = landingEntities.find((entry) => entry['@id'] === 'https://itsdebatable.com/#webpage');

check('title begins with exact query', title.startsWith('Debate Online '));
check('title fits search display', title.length >= 45 && title.length <= 60);
check('description begins with the current watch-or-join intent', description.startsWith('Watch live arguments'));
check('description fits search display', description.length >= 120 && description.length <= 160);
check('one transactional H1 is present', h1 === 'Debate online. Climb the leaderboard.' && (page.match(/<h1\b/g) || []).length === 1);
check('hero directly answers the watch-or-join intent', page.includes('Watch a live round, or take a seat against another person'));
check('first screen offers honest human queue and AI fallback',
  page.includes('Live, when someone is waiting')
  && page.includes('Debate a real person')
  && page.includes('Argue with the AI'));
check('first screen exposes direct Google sign-in',
  page.includes('id="doGoogle"')
  && page.includes("button.addEventListener('click'"));
check('page loads shared One Tap and account-linking module', page.includes('/js/signup-nudge.js'));
check('One Tap route uses inline auth without a competing nudge',
  signupNudge.includes("match: /^\\/debate-online")
  && signupNudge.includes('inlineAuth: true')
  && signupNudge.includes('window.debatableGoogleSignIn'));
check('home redirect popup yields to the page conversion flow',
  /entryPages = \{[\s\S]*?'\/debate-online': true/.test(homeMagnet));
check('definition FAQ is visible', page.includes('<summary>What is an online debate?</summary>'));

check('canonical points to one clean URL', page.includes('<link rel="canonical" href="https://itsdebatable.com/debate-online">'));
check('English and default alternates agree with canonical',
  page.includes('hreflang="en" href="https://itsdebatable.com/debate-online"')
  && page.includes('hreflang="x-default" href="https://itsdebatable.com/debate-online"'));
check('page is fully indexable', page.includes('content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"'));
check('social titles begin with exact query',
  page.includes('<meta property="og:title" content="Debate Online ')
  && page.includes('<meta name="twitter:title" content="Debate Online '));
check('social image has alt text', page.includes('<meta property="og:image:alt"') && page.includes('<meta name="twitter:image:alt"'));

check('all JSON-LD parses', jsonLd.length >= 1 && jsonLd.every((entry) => !entry.parseError));
check('WebPage entity matches canonical',
  webPage?.['@id'] === 'https://itsdebatable.com/debate-online#webpage'
  && webPage?.url === 'https://itsdebatable.com/debate-online'
  && webPage?.name.startsWith('Debate Online '));
check('application entity carries exact-query aliases',
  application?.alternateName?.includes('Online Debate')
  && application?.alternateName?.includes('Online Debate Platform'));
check('breadcrumb names the exact query', breadcrumb?.itemListElement?.[1]?.name === 'Online Debate');
check('path entity describes participation choices', paths?.name === 'Online debate: ways to play');
check('FAQ schema defines online debate', faq?.mainEntity?.some((item) => item.name === 'What is an online debate?'));

function hasAliasRedirect(source) {
  return /from = "\/online-debate"\s+to = "\/debate-online"\s+status = 301\s+force = true/.test(source);
}
check('app redirect consolidates reversed slug', hasAliasRedirect(appToml));
check('root redirect consolidates reversed slug', hasAliasRedirect(rootToml));
check('alias is not submitted as a competing sitemap URL',
  !sitemap.includes("path: '/online-debate'")
  && !staticSitemap.includes('<loc>https://itsdebatable.com/online-debate</loc>'));
check('live sitemap marks canonical page fresh and primary',
  /path: '\/debate-online'[\s\S]{0,140}priority: '0\.92'[\s\S]{0,80}lastmod: '2026-08-28'/.test(sitemap));
check('live sitemap marks branded homepage fresh and primary',
  /path: '\/'[\s\S]{0,100}priority: '1\.0'[\s\S]{0,80}lastmod: '2026-08-28'/.test(sitemap));
check('static sitemap names both query word orders', staticSitemap.includes('"online debate" / "debate online"'));
check('static sitemap marks homepage and debate page fresh',
  /<loc>https:\/\/itsdebatable\.com\/<\/loc>\s+<lastmod>2026-08-28<\/lastmod>/.test(staticSitemap)
  && /<loc>https:\/\/itsdebatable\.com\/debate-online<\/loc>\s+<lastmod>2026-08-28<\/lastmod>/.test(staticSitemap));

check('homepage links exact anchor to canonical', /<a href="\/debate-online"[^>]*>Debate online<\/a>/.test(landing));
check('homepage metadata owns branded intent',
  landing.includes('<title>Debatable | Live, Judged Debate With Real People</title>')
  && landing.includes('"@id": "https://itsdebatable.com/#webpage"'));
check('homepage JSON-LD parses with a branded WebPage entity',
  landingJsonLd.length >= 1
  && landingJsonLd.every((entry) => !entry.parseError)
  && homeWebPage?.url === 'https://itsdebatable.com/'
  && homeWebPage?.name.startsWith('Debatable |'));
check('legacy landing route consolidates to branded root',
  /from = "\/landing"\s+to = "\/"\s+status = 301\s+force = true/.test(appToml)
  && /from = "\/landing"\s+to = "\/"\s+status = 301\s+force = true/.test(rootToml));
check('human-intent page links exact anchor to canonical', people.includes('<a href="/debate-online">Online debate</a>'));
check('comparison page links exact anchor to canonical', platforms.includes('<a href="/debate-online">Online debate</a>'));
check('AI discovery file identifies canonical page', llms.includes('[Online debate, three ways](https://itsdebatable.com/debate-online)'));
check('comparison page keeps its own plural-intent canonical',
  platforms.includes('<link rel="canonical" href="https://itsdebatable.com/online-debate-platforms">'));

check('visible copy has no em dash', !visible.includes('—'));
check('visible copy avoids banned acquisition claims',
  !/free during beta|no sign-up required|pay nothing|unlimited|holistic|robust framework/i.test(visible));
check('page makes no unverifiable matching-time promise', !/under a minute|in seconds/i.test(visible));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
