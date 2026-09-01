#!/usr/bin/env node

import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function jsonLdNodes(html) {
  const blocks = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    blocks.push(JSON.parse(match[1]));
  }
  return blocks.flatMap((block) => block['@graph'] || [block]);
}

const landing = read('app/landing.html');
const about = read('app/debatable.html');
const press = read('app/press.html');
const llms = read('app/llms.txt');
const robots = read('app/robots.txt');
const sitemap = read('app/netlify/functions/sitemap.mjs');
const topbar = read('app/js/topbar.js');

const landingNodes = jsonLdNodes(landing);
const aboutNodes = jsonLdNodes(about);
const landingOrg = landingNodes.find((node) => node['@id'] === 'https://itsdebatable.com/#org');
const aboutOrg = aboutNodes.find((node) => node['@id'] === 'https://itsdebatable.com/#org');
const website = landingNodes.find((node) => node['@id'] === 'https://itsdebatable.com/#website');
const application = landingNodes.find((node) => node['@id'] === 'https://itsdebatable.com/#app');
const aboutPage = aboutNodes.find((node) => node['@type'] === 'AboutPage');
const aboutFaq = aboutNodes.find((node) => node['@type'] === 'FAQPage');
const visibleHeadings = [...about.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
  .map((match) => match[1].replace(/<[^>]+>/g, '').trim());

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

check('brand page has one canonical URL',
  about.includes('<link rel="canonical" href="https://itsdebatable.com/debatable">'));
check('brand page permits full search snippets',
  about.includes('content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"'));
check('homepage and brand page use the same organization id',
  landingOrg?.['@id'] === aboutOrg?.['@id']);
check('organization identifies the official domain',
  landingOrg?.identifier === 'itsdebatable.com'
  && aboutOrg?.identifier === 'itsdebatable.com'
  && /at itsdebatable\.com/.test(landingOrg?.disambiguatingDescription || ''));
check('organization graphs do not publish a founder identity',
  !landingOrg?.founder
  && !aboutOrg?.founder
  && !landingNodes.some((node) => node['@type'] === 'Person')
  && !aboutNodes.some((node) => node['@type'] === 'Person'));
check('organization graphs agree on the casual product',
  landingOrg?.knowsAbout?.includes('Casual one-on-one debate')
  && aboutOrg?.knowsAbout?.includes('Casual one-on-one debate'));
check('structured identity keeps Discord and TikTok but pauses X, Twitch and YouTube',
  landingOrg?.sameAs?.includes('https://discord.gg/WMHZW9BKvJ')
  && landingOrg?.sameAs?.includes('https://www.tiktok.com/@trydebatable')
  && aboutOrg?.sameAs?.includes('https://discord.gg/WMHZW9BKvJ')
  && aboutOrg?.sameAs?.includes('https://www.tiktok.com/@trydebatable')
  && !landingOrg?.sameAs?.some((url) => /(?:x\.com|twitch\.tv|youtube\.com)/.test(url))
  && !aboutOrg?.sameAs?.some((url) => /(?:x\.com|twitch\.tv|youtube\.com)/.test(url)));
check('shared social row is TikTok plus Discord',
  topbar.includes("key: 'tiktok'")
  && topbar.includes("key: 'discord'")
  && topbar.includes('size: 19')
  && topbar.includes('<rect x="1" y="1" width="22" height="22"')
  && !topbar.includes("key: 'x'")
  && !topbar.includes("key: 'twitch'")
  && !topbar.includes("key: 'youtube'"));
check('website and application have stable ids',
  website?.name === 'Debatable'
  && application?.name === 'Debatable'
  && application?.applicationCategory === 'SocialNetworkingApplication');
check('AboutPage resolves to the canonical organization',
  aboutPage?.mainEntity?.['@id'] === 'https://itsdebatable.com/#org');
check('round FAQ answers the public product question',
  aboutFaq?.mainEntity?.some((item) =>
    item.name === 'What kind of round does Debatable use?'
    && /casual 1v1/.test(item.acceptedAnswer?.text || '')));
check('every structured FAQ question is visible on the page',
  aboutFaq?.mainEntity?.every((item) => visibleHeadings.includes(item.name)));
check('visible brand page carries the same round answer',
  about.includes('<h2>What kind of round does Debatable use?</h2>')
  && about.includes('Every public round is a casual 1v1.'));
// Founder identity remains sanctioned on public surfaces, but the landing
// note is deliberately text-only: no portrait or named signature here.
check('the landing founder quote is short and text-only',
  /Quote from the founder/.test(landing)
  && /A good argument is a beautiful thing\. Debatable gives anyone a place to test an idea, take a side, and enjoy the game\./.test(landing)
  && !/class="fndr-photo"/.test(landing)
  && !/<b>Aidan<\/b>/.test(landing));
check('the public signup caption uses only the named-account total',
  /' sign-ups<\/b> so far\.<\/span>'/.test(landing)
  && !/' with Google, '/.test(landing)
  && !/' with email\.<\/span>'/.test(landing));
check('example resolutions alternate red and black in italic type',
  /\.fs-board \.fs-motion\{[^}]*font-style:italic/.test(landing)
  && /classList\.toggle\('is-alt-red', i % 2 === 0\)/.test(landing));
check('example portraits render without the retired grain and colour filter',
  !/\.fs-tile::after\{/.test(landing)
  && !/\.fs-tile img\{[^}]*filter:/.test(landing));
check('public identity surfaces do not restore the retired credential stack',
  !/(APDA|Pro-?Ams)\s+champion|champion\s+at\s+UChicago|results\.apda\.online|linkedin\.com\/in\/aidan/i.test(landing + about + press + llms));
check('brand page disambiguates similarly named products',
  about.includes('<h2>Which Debatable is this?</h2>')
  && /independent from other apps, websites, and organizations/.test(about));
check('AI guide names the ranked show and official domain first',
  llms.startsWith('# Debatable\n\n> Debatable is the ranked show for live argument at https://itsdebatable.com/'));
check('AI guide is dated and disambiguates the brand',
  llms.includes('Last reviewed: 2026-08-29')
  && llms.includes('independent from other apps, websites, or organizations'));
check('AI guide links the canonical identity page',
  llms.includes('[Debatable official facts](https://itsdebatable.com/debatable)'));
check('robots policy leaves public facts crawlable',
  /User-agent: \*\s+Allow: \//.test(robots)
  && !/Disallow: \/(?:llms\.txt|debatable)(?:\s|$)/.test(robots));
check('sitemap marks changed brand surfaces fresh',
  /path: '\/'[\s\S]{0,100}lastmod: '2026-08-29'/.test(sitemap)
  && /path: '\/debatable'[\s\S]{0,120}lastmod: '2026-08-29'/.test(sitemap));
check('sitemap submits the current AI and learn entry pages',
  /path: '\/debate-an-ai'[\s\S]{0,120}lastmod: '2026-08-28'/.test(sitemap)
  && /path: '\/learn'[\s\S]{0,120}lastmod: '2026-08-28'/.test(sitemap));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
