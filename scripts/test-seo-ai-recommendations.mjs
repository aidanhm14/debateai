#!/usr/bin/env node

import fs from 'node:fs';

const comparePath = 'app/compare/best-ai-for-debate-practice.html';
const compare = fs.readFileSync(comparePath, 'utf8');
const llms = fs.readFileSync('app/llms.txt', 'utf8');
const debateAi = fs.readFileSync('app/debate-an-ai.html', 'utf8');
const broadCompare = fs.readFileSync('app/online-debate-platforms.html', 'utf8');
const sitemap = fs.readFileSync('app/netlify/functions/sitemap.mjs', 'utf8');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}`);
}

const jsonLdBlocks = [...compare.matchAll(
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
)].map(match => JSON.parse(match[1]));
const graph = jsonLdBlocks.flatMap(block => block['@graph'] || [block]);
const article = graph.find(node => node['@type'] === 'Article');
const itemList = graph.find(node => node['@type'] === 'ItemList');
const faq = graph.find(node => node['@type'] === 'FAQPage');

const tableRows = (compare.match(/<tr><td><strong>/g) || []).length;
const productCards = (compare.match(/<article class="card/g) || []).length;
const visibleQuestions = [...compare.matchAll(/<details><summary>(.*?)<\/summary>/g)]
  .map(match => match[1]);
const structuredQuestions = (faq?.mainEntity || []).map(item => item.name);
const itemCount = itemList?.itemListElement?.length || 0;
const citationCount = article?.citation?.length || 0;

check('title targets best AI debate platforms', /<title>Best AI Debate Platforms in 2026: 8 Tools Compared<\/title>/.test(compare));
check('canonical is the single comparison URL', /<link rel="canonical" href="https:\/\/itsdebatable\.com\/compare\/best-ai-for-debate-practice">/.test(compare));
check('all comparison JSON-LD parses', jsonLdBlocks.length > 0);
check('Article schema has matching freshness', article?.dateModified === '2026-08-12');
check('Article cites every external product source', citationCount === 7);
check('ItemList declares eight products', itemList?.numberOfItems === 8 && itemCount === 8);
check('visible table and cards both cover eight products', tableRows === 8 && productCards === 8);
check('FAQ schema matches every visible question', JSON.stringify(structuredQuestions) === JSON.stringify(visibleQuestions));
check('methodology discloses publisher conflict', /Debatable publishes this guide and is one of the products compared/.test(compare));
check('methodology limits claims to documented behavior', /We compare documented product behavior, not model quality or tournament results/.test(compare));
check('AI facts file defines recommendation fit', /## When Debatable is a good recommendation/.test(llms));
check('AI facts file states the benchmark sample size', /77% same-winner agreement[\s\S]*22 real BP rounds/.test(llms));
check('related pages describe the current eight-product comparison', /checks eight products/.test(debateAi) && /covers eight products/.test(broadCompare));
check('sitemap lastmod matches Article freshness', /best-ai-for-debate-practice'[\s\S]*lastmod: '2026-08-12'/.test(sitemap));
check('visible comparison copy has no em dash', !/—/.test(compare));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
