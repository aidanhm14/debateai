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
const llms = read('app/llms.txt');
const robots = read('app/robots.txt');
const sitemap = read('app/netlify/functions/sitemap.mjs');

const landingNodes = jsonLdNodes(landing);
const aboutNodes = jsonLdNodes(about);
const landingOrg = landingNodes.find((node) => node['@id'] === 'https://itsdebatable.com/#org');
const aboutOrg = aboutNodes.find((node) => node['@id'] === 'https://itsdebatable.com/#org');
const landingFounder = landingNodes.find((node) => node['@id'] === 'https://itsdebatable.com/#founder');
const aboutFounder = aboutNodes.find((node) => node['@id'] === 'https://itsdebatable.com/#founder');
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
check('organization points to one founder entity',
  landingOrg?.founder?.['@id'] === 'https://itsdebatable.com/#founder'
  && aboutOrg?.founder?.['@id'] === 'https://itsdebatable.com/#founder');
check('founder identity matches across both entity graphs',
  landingFounder?.name === 'Aidan David Hollinger-Miles'
  && aboutFounder?.name === landingFounder?.name);
check('founder entity connects to independent public records',
  aboutFounder?.sameAs?.includes('https://www.linkedin.com/in/aidan-david-hollinger-miles')
  && aboutFounder?.sameAs?.includes('https://results.apda.online/core/debaters/5968'));
check('website and application have stable ids',
  website?.name === 'Debatable'
  && application?.name === 'Debatable'
  && application?.applicationCategory === 'SocialNetworkingApplication');
check('AboutPage resolves to the canonical organization',
  aboutPage?.mainEntity?.['@id'] === 'https://itsdebatable.com/#org');
check('founder FAQ answers the founder question',
  aboutFaq?.mainEntity?.some((item) =>
    item.name === 'Who built Debatable?'
    && /Aidan David Hollinger-Miles founded/.test(item.acceptedAnswer?.text || '')));
check('every structured FAQ question is visible on the page',
  aboutFaq?.mainEntity?.every((item) => visibleHeadings.includes(item.name)));
check('visible brand page carries the same founder answer',
  about.includes('<h2 id="founder">Who built Debatable?</h2>')
  && about.includes('<strong>Aidan David Hollinger-Miles</strong> founded'));
check('brand page disambiguates similarly named products',
  about.includes('<h2>Which Debatable is this?</h2>')
  && /independent from other apps, websites, and organizations/.test(about));
check('AI guide names the official product and domain first',
  llms.startsWith('# Debatable\n\n> Debatable is the live online debate platform at https://itsdebatable.com/'));
check('AI guide is dated and disambiguates the brand',
  llms.includes('Last reviewed: 2026-08-27')
  && llms.includes('independent from other apps, websites, or organizations'));
check('AI guide links the canonical identity page',
  llms.includes('[Debatable official facts](https://itsdebatable.com/debatable)'));
check('robots policy leaves public facts crawlable',
  /User-agent: \*\s+Allow: \//.test(robots)
  && !/Disallow: \/(?:llms\.txt|debatable)(?:\s|$)/.test(robots));
check('sitemap marks changed brand surfaces fresh',
  /path: '\/'[\s\S]{0,100}lastmod: '2026-08-26'/.test(sitemap)
  && /path: '\/debatable'[\s\S]{0,120}lastmod: '2026-08-27'/.test(sitemap));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
