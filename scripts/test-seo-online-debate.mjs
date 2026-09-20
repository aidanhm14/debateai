import { readPageSource } from './lib/page-source.mjs';
import vm from 'node:vm';

const read = file => readPageSource(new URL(`../${file}`, import.meta.url), 'utf8');
const page = read('app/debate-online.html');
const canonical = 'https://itsdebatable.com/debate-online';
const first = pattern => (page.match(pattern) || [])[1] || '';
const title = first(/<title>([^<]+)<\/title>/i);
const description = first(/<meta name="description" content="([^"]+)"/i);
const body = first(/<body[^>]*>([\s\S]*?)<\/body>/i);
const h1 = first(/<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, '').trim();
const entities = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap(match => { const json = JSON.parse(match[1]); return json['@graph'] || [json]; });
const webPage = entities.find(entity => entity['@type'] === 'WebPage');
const application = entities.find(entity => entity['@type'] === 'WebApplication');
const breadcrumb = entities.find(entity => entity['@type'] === 'BreadcrumbList');
let passed = 0, failed = 0;
function check(name, condition) {
  if (condition) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.error(`FAIL ${name}`); }
}

check('search title keeps the query and brand', title.startsWith('Debate Online ') && title.endsWith(' | Debatable'));
check('description describes the current private human entry', description.includes('Debate online') && description.includes('Rounds start private'));
check('one unchanged human-intent headline is in the raw HTML', h1 === 'Debate online with a real person.' && (page.match(/<h1\b/g) || []).length === 1);
const main = body.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
const actions = [...main.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/g)];
check('the only main action works without JavaScript', actions.length === 1 && actions[0][1].includes('href="/spar?from=debate-online"') && actions[0][2].includes('Meet someone'));
check('round privacy stays visible beside the action', main.includes('Rounds start private.') && main.includes('Go public when you choose.'));
check('no explainer or competing product controls return', !/<(?:section|details|video|form)\b/.test(body) && !body.includes('onlineActivity'));
check('the layout can grow for enlarged text instead of clipping controls', page.includes('100svh') && !/overflow\s*:\s*hidden/.test(page));
check('motion has a reduced-motion fallback', page.includes('prefers-reduced-motion:reduce'));
check('automatic button motion ends', !/animation[^;\n]*\binfinite\b/.test(page));
check('the one page remains measurable', page.includes('/js/track.js') && page.includes('debate_online_matchdesk_click') && page.includes('debate-online-primary-human'));
check('no old navigation or automatic signup UI is loaded directly', !/src="\/js\/(?:topbar|signup-nudge|notifications|debate-discovery)\.js"/.test(page));
for (const file of ['app/js/signin-wall.js', 'app/js/corpus-nudge.js']) {
  let error = null;
  try { vm.runInNewContext(read(file), { document: { documentElement: { dataset: { entry: 'meet' } } } }); }
  catch (e) { error = e; }
  check(`${file} leaves the entry action unobstructed`, !error);
}
for (const match of page.matchAll(/<script(?![^>]*type="application\/ld\+json")([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (match[2].trim()) new vm.Script(match[2]);
}
check('inline JavaScript parses', true);
check('canonical stays at the existing ranking URL', page.includes(`<link rel="canonical" href="${canonical}">`));
check('language alternates agree with the canonical', ['en', 'x-default'].every(lang => page.includes(`hreflang="${lang}" href="${canonical}"`)));
check('the page remains indexable', page.includes('content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"'));
check('social titles agree with the page title', page.includes(`property="og:title" content="${title}"`) && page.includes(`name="twitter:title" content="${title}"`));
check('social URL agrees with the canonical', page.includes(`property="og:url" content="${canonical}"`));
check('social images have descriptions', page.includes('property="og:image:alt"') && page.includes('name="twitter:image:alt"'));
check('WebPage identity and descriptions agree', webPage?.['@id'] === `${canonical}#webpage` && webPage?.url === canonical && webPage?.name === title && webPage?.description === description);
check('structured data uses the sole brand and social category', application?.name === 'Debatable' && !application?.alternateName && application?.applicationCategory === 'SocialNetworkingApplication');
check('removed FAQs and paths are not claimed in structured data', !entities.some(e => ['FAQPage', 'ItemList'].includes(e['@type'])));
check('breadcrumb links back to the website', breadcrumb?.itemListElement?.[0]?.item === 'https://itsdebatable.com/' && breadcrumb?.itemListElement?.[1]?.item === canonical);
for (const file of ['netlify.toml', 'app/netlify.toml']) {
  check(`${file} keeps the reversed slug consolidated`, /from = "\/online-debate"\s+to = "\/debate-online"\s+status = 301\s+force = true/.test(read(file)));
}
const sitemap = read('app/netlify/functions/sitemap.mjs');
const snapshot = read('app/sitemap.xml');
const liveDate = sitemap.match(/path: '\/debate-online'[^\n]*lastmod: '([^']+)'/)?.[1];
const staticDate = snapshot.match(/<loc>https:\/\/itsdebatable\.com\/debate-online<\/loc>\s+<lastmod>([^<]+)<\/lastmod>/)?.[1];
check('sitemap dates reflect this page update', liveDate === webPage?.dateModified && staticDate === liveDate);
check('sitemaps omit the redirect alias', !sitemap.includes("path: '/online-debate'") && !snapshot.includes('<loc>https://itsdebatable.com/online-debate</loc>'));
for (const file of ['app/landing.html', 'app/debate-strangers.html', 'app/online-debate-platforms.html']) {
  check(`${file} retains an incoming link`, /href="\/debate-online"/.test(read(file)));
}
check('AI discovery describes the new page accurately', read('app/llms.txt').includes('[Debate online](https://itsdebatable.com/debate-online): meet another person'));
const visible = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ');
check('copy avoids retired claims and em dashes', !/—|free during beta|no sign-up required|unlimited|under a minute|in seconds/i.test(visible));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
