#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import politicalDebate from '../app/netlify/functions/political-debate.mjs';
import debate from '../app/netlify/functions/debate.mjs';
import { MOTION_BANK } from '../app/netlify/functions/lib/debate-bank.mjs';
import { checkContent } from '../app/netlify/functions/lib/content-guard.mjs';
import { INDEPENDENT_ISSUES, PARTISAN_ISSUES, POLITICS_GROUPS, politicalSlugCount } from '../app/netlify/functions/lib/politics-hub.mjs';

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
assert.ok(PARTISAN_ISSUES.length >= 8, 'partisan path should cover the major red-blue fault lines');
assert.equal(new Set(PARTISAN_ISSUES.map(issue => issue.id)).size, PARTISAN_ISSUES.length, 'partisan issue ids must be unique');
for (const issue of PARTISAN_ISSUES) {
  assert.ok(issue.democratic && issue.republican && issue.clash, `${issue.id} needs both party cases and a neutral clash`);
  const guard = checkContent({
    text: [issue.question, issue.democratic, issue.republican, issue.clash].join(' '),
    kind: 'motion',
  });
  assert.ok(guard.ok, `${issue.id} violates the site topic boundary: ${guard.reason || 'unknown'}`);
}
assert.ok(INDEPENDENT_ISSUES.length >= 4, 'Independent lane should be a real path, not one token card');
assert.equal(new Set(INDEPENDENT_ISSUES.map(issue => issue.id)).size, INDEPENDENT_ISSUES.length, 'Independent issue ids must be unique');
for (const issue of INDEPENDENT_ISSUES) {
  assert.ok(issue.independent && issue.twoParty && issue.clash, `${issue.id} needs an Independent case, a two-party case, and a neutral clash`);
  const guard = checkContent({
    text: [issue.question, issue.independent, issue.twoParty, issue.clash].join(' '),
    kind: 'motion',
  });
  assert.ok(guard.ok, `${issue.id} violates the site topic boundary: ${guard.reason || 'unknown'}`);
}

const hub = await htmlFrom(politicalDebate, '/api/political-debate');
const topics = await htmlFrom(politicalDebate, '/api/political-debate/topics');
const allQuestions = await htmlFrom(debate, '/api/debate');
const politicalQuestion = await htmlFrom(debate, '/api/debate/should-the-electoral-college-be-abolished');

assert.match(hub, /<title>Political Debate Online \| Discuss Current Issues \| Debatable<\/title>/);
assert.match(hub, /<link rel="canonical" href="https:\/\/itsdebatable\.com\/political-debate">/);
assert.match(hub, /For people who always end up talking politics\./);
assert.match(hub, /href="\/spar" data-cta="political-hub-live">Debate someone now/);
assert.match(hub, /href="\/"[^>]*><span aria-hidden="true">←<\/span> Debat<b>able<\/b>/);
assert.match(hub, /\/img\/politics\/capitol\.jpg/);
assert.match(hub, /<script defer src="\/js\/track\.js"><\/script>/);
assert.match(hub, /"@type":"FAQPage"/);
assert.equal((hub.match(/class="party-card"/g) || []).length, PARTISAN_ISSUES.length);
assert.match(hub, /Common Democratic case/);
assert.match(hub, /Common Republican case/);
assert.equal((hub.match(/class="independent-card"/g) || []).length, INDEPENDENT_ISSUES.length);
assert.match(hub, /The Independent lane/);
assert.match(hub, /Independent case/);
assert.match(hub, /Two-party case/);
assert.match(hub, /href="\/challenges\?claim=/);
const challengeHrefs = [...hub.matchAll(/href="(\/challenges\?[^"#]+)"/g)]
  .map(match => match[1].replaceAll('&amp;', '&'));
assert.ok(challengeHrefs.length >= PARTISAN_ISSUES.length * 2, 'each partisan case needs a challenge handoff');
const democraticHandoff = new URL(challengeHrefs[0], 'https://itsdebatable.com');
const republicanHandoff = new URL(challengeHrefs[1], 'https://itsdebatable.com');
assert.equal(democraticHandoff.searchParams.get('claim'), PARTISAN_ISSUES[0].question);
assert.equal(democraticHandoff.searchParams.get('sideA'), 'Democratic case');
assert.equal(democraticHandoff.searchParams.get('sideB'), 'Republican case');
assert.equal(democraticHandoff.searchParams.get('side'), 'a');
assert.equal(republicanHandoff.searchParams.get('side'), 'b');
assert.equal(democraticHandoff.searchParams.get('category'), 'Politics');
assert.equal(democraticHandoff.searchParams.get('source'), 'political-debate');
assert.equal(democraticHandoff.searchParams.get('lane'), 'partisan');
const independentHandoffs = challengeHrefs
  .map(href => new URL(href, 'https://itsdebatable.com'))
  .filter(url => url.searchParams.get('lane') === 'independent');
assert.equal(independentHandoffs.length, INDEPENDENT_ISSUES.length * 2, 'every Independent question needs both challenge sides');
assert.equal(independentHandoffs[0].searchParams.get('sideA'), 'Independent case');
assert.equal(independentHandoffs[0].searchParams.get('sideB'), 'Two-party case');
assert.equal(independentHandoffs[0].searchParams.get('side'), 'a');
assert.equal(independentHandoffs[1].searchParams.get('side'), 'b');

assert.match(topics, /<title>Political Debate Topics \| Current Issues to Argue \| Debatable<\/title>/);
assert.match(topics, /id="topicSearch"/);
assert.match(topics, /id="pickTopic"/);
assert.match(topics, /Pick one and challenge/);
assert.match(topics, /Political questions people are already arguing about\./);
assert.match(topics, /href="\/spar" data-cta="political-topics-live">Debate someone now/);
assert.match(topics, /href="\/">Back to Debatable<\/a>/);
assert.match(topics, /data-challenge="\/challenges\?claim=/);
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
assert.match(politicalQuestion, /href="\/spar" data-cta="question-brief-live">Debate someone now/);
assert.doesNotMatch(politicalQuestion, />Start a round</);

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
assert.match(contested, /class="cta" href="\/spar" data-cta="contested-live">Debate someone now<\/a>/);
assert.doesNotMatch(contested, /href="\/practice">Start a round<\/a>/);

const landing = readFileSync(new URL('../app/landing.html', import.meta.url), 'utf8');
const topbar = readFileSync(new URL('../app/js/topbar.js', import.meta.url), 'utf8');
const challenges = readFileSync(new URL('../app/challenges.html', import.meta.url), 'utf8');
assert.match(landing, /href="\/political-debate">Political debate<\/a>/);
assert.match(topbar, /href: '\/political-debate', label: 'Political debates'/);
assert.match(challenges, /q\.get\('claim'\)/);
assert.match(challenges, /q\.get\('lane'\)/);
assert.match(challenges, /state\.prefill\.sideA \|\| 'For'/);
assert.match(challenges, /Post this political challenge/);
assert.match(challenges, /Independent politics/);
assert.match(challenges, /source: state\.source \|\| 'challenge-board'/);
assert.match(challenges, /c\.category === 'Politics'/);
assert.match(challenges, /history\.replaceState\(\{\}, '', '\/challenges'\)/);

console.log(`political SEO guard: ${PARTISAN_ISSUES.length} partisan and ${INDEPENDENT_ISSUES.length} Independent challenges, ${politicalSlugCount()} questions, 5 image-led categories passed`);
