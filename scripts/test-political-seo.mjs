#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import politicalDebate from '../app/netlify/functions/political-debate.mjs';
import debate from '../app/netlify/functions/debate.mjs';
import { MOTION_BANK } from '../app/netlify/functions/lib/debate-bank.mjs';
import { POLITICS_GROUPS, politicalSlugCount } from '../app/netlify/functions/lib/politics-hub.mjs';

async function htmlFrom(handler, path) {
  const response = await handler(new Request(`https://itsdebatable.com${path}`));
  assert.equal(response.status, 200, `${path} should render`);
  return response.text();
}

function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

for (const group of POLITICS_GROUPS) {
  assert.ok(group.slugs.length >= 3, `${group.id} needs enough questions to be a useful category`);
  for (const slug of group.slugs) assert.ok(MOTION_BANK[slug], `missing political motion: ${slug}`);
  const image = new URL(`../app${group.image}`, import.meta.url);
  assert.ok(statSync(image).size > 20_000, `${group.image} should be a real local image`);
  assert.match(group.imageSource, /^https:\/\/commons\.wikimedia\.org\//);
}

assert.ok(politicalSlugCount() >= 30, 'politics guide should be a substantive collection');

const hub = await htmlFrom(politicalDebate, '/api/political-debate');
const topics = await htmlFrom(politicalDebate, '/api/political-debate/topics');
const allQuestions = await htmlFrom(debate, '/api/debate');
const politicalQuestion = await htmlFrom(debate, '/api/debate/should-the-electoral-college-be-abolished');

assert.match(hub, /<title>Political Debate Online \| Discuss Current Issues \| Debatable<\/title>/);
assert.match(hub, /<link rel="canonical" href="https:\/\/itsdebatable\.com\/political-debate">/);
assert.match(hub, /Political debate where the other side answers back\./);
assert.match(hub, /\/img\/politics\/capitol\.jpg/);
assert.match(hub, /<script defer src="\/js\/track\.js"><\/script>/);
assert.match(hub, /"@type":"FAQPage"/);

assert.match(topics, /<title>Political Debate Topics \| Current Issues to Argue \| Debatable<\/title>/);
assert.match(topics, /id="topicSearch"/);
assert.match(topics, /id="pickTopic"/);
assert.equal((topics.match(/data-topic-card/g) || []).length, politicalSlugCount() + 2);
for (const group of POLITICS_GROUPS) assert.match(topics, new RegExp(`id="${group.id}"`));

for (const [name, html] of [['hub', hub], ['topics', topics], ['all questions', allQuestions], ['question', politicalQuestion]]) {
  const visible = visibleText(html);
  assert.doesNotMatch(visible, /\b(APDA|Public Forum|Lincoln-Douglas|British Parli|World Schools)\b/i, `${name} exposes a retired format`);
  assert.doesNotMatch(visible, /\b(death penalty|capital punishment|abortion|mass shooting|genocide)\b/i, `${name} exposes a blocked topic`);
  assert.doesNotMatch(visible, /—/, `${name} contains a user-facing em dash`);
}

assert.match(allQuestions, /Politics &amp; public life/);
assert.match(allQuestions, /Questions worth arguing about\./);
assert.match(politicalQuestion, /Political debate topics/);
assert.match(politicalQuestion, /Round<\/span><span class="v">One person on each side/);

const rootNetlify = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
const appNetlify = readFileSync(new URL('../app/netlify.toml', import.meta.url), 'utf8');
for (const route of ['/political-debate', '/political-debate-topics']) {
  assert.ok(rootNetlify.includes(`from = "${route}"`), `root netlify missing ${route}`);
  assert.ok(appNetlify.includes(`from = "${route}"`), `app netlify missing ${route}`);
}

const sitemap = readFileSync(new URL('../app/netlify/functions/sitemap.mjs', import.meta.url), 'utf8');
for (const route of ['/political-debate', '/political-debate-topics', '/contested']) {
  assert.ok(sitemap.includes(`path: '${route}'`), `sitemap missing ${route}`);
}

const contested = readFileSync(new URL('../app/netlify/functions/contested.mjs', import.meta.url), 'utf8');
assert.match(contested, /isSensitiveMotion/);
assert.doesNotMatch(contested, /FORMAT_LABELS/);
assert.match(contested, /Political Discussions Today/);

const landing = readFileSync(new URL('../app/landing.html', import.meta.url), 'utf8');
const topbar = readFileSync(new URL('../app/js/topbar.js', import.meta.url), 'utf8');
assert.match(landing, /href="\/political-debate">Political debate<\/a>/);
assert.match(topbar, /href: '\/political-debate', label: 'Political debates'/);

console.log(`political SEO guard: ${politicalSlugCount()} questions, 5 image-led categories, 4 rendered surfaces passed`);

