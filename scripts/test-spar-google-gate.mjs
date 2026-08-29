#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const spar = read('app/spar.html');
const pair = read('app/netlify/functions/spar-pair.mjs');
const rules = read('app/firestore.rules');
const notifications = read('app/js/notifications.js');

const publicContractPages = [
  'app/debate-online.html',
  'app/debate-strangers.html',
  'app/debate-an-ai.html',
  'app/how-it-works.html',
  'app/omegle-alternative.html',
  'app/learn.html',
  'app/debatable.html',
  'app/press.html',
  'app/research.html',
  'app/online-debate-platforms.html',
];

function publicText(html) {
  const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .join(' ');
  const visible = html
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return `${visible} ${jsonLd}`.replace(/\s+/g, ' ');
}

let failures = 0;
function check(ok, message) {
  if (ok) return;
  failures += 1;
  console.error(`FAIL spar-google-gate: ${message}`);
}

check(spar.includes('var GUEST_FREE_ROUNDS = 0;'), 'client guest allowance must stay at zero');
check(pair.includes('const GUEST_FREE_ROUNDS = 0;'), 'server guest allowance must stay at zero');
check(spar.includes('return isGoogleUser(u);'), 'foreground queue must require a Google user');
check(notifications.includes('return isGoogleUser(u);'), 'background queue must require a Google user');
check(pair.includes("sign_in_provider !== 'google.com'"), 'matcher must verify the Google provider');
check(pair.includes("code: 'GOOGLE_SIGN_IN_REQUIRED'"), 'matcher must return the labeled Google gate');
check(rules.includes('allow create: if isGoogleAccount()'), 'Firestore must reject non-Google queue creation');
check(spar.includes("authProvider: 'google.com'"), 'foreground queue must stamp its verified Google provider');
check(notifications.match(/authProvider: 'google\.com'/g)?.length >= 2, 'every background queue write must stamp Google');
check(rules.includes("request.resource.data.authProvider == 'google.com'"), 'Firestore must bind the queue marker to Google auth');
check(pair.includes("theirs.authProvider !== 'google.com'"), 'matcher must reject a non-Google passive seat');

check(spar.includes('>12 live now</span>'), 'signed-out gate must carry the founder-called 12-live baseline');
check(spar.includes("var GATE_LIVE_BASE = 12;"), 'signed-out gate must keep 12 as its live-count floor');
check(spar.includes("fetch('/api/spar-queue', { cache: 'no-cache' })"), 'signed-out gate must fetch the fresh public queue count');
check(/function gateLiveTotal\(waiting\)[\s\S]*?return GATE_LIVE_BASE \+/.test(spar), 'signed-out gate must add the real queue count to the 12-live floor');
const gateLiveBody = spar.match(/function gateLiveTotal\(waiting\)\{([\s\S]*?)\n  \}/)?.[1];
const gateLiveTotal = gateLiveBody ? Function('waiting', 'var GATE_LIVE_BASE = 12;' + gateLiveBody) : null;
check(gateLiveTotal && gateLiveTotal(3) === 15 && gateLiveTotal(-2) === 12, 'signed-out gate live-count arithmetic must add waiting people without lowering the floor');
check(spar.includes('Sign up with Google'), 'signed-out gate must show the Google signup action');
check(!spar.includes('id="emailStartBtn"'), 'signed-out gate must not render an email alternative');
check(!spar.includes('id="gateEmailForm"'), 'signed-out gate must not render the retired email form');

const retiredGuestPromise = /two live rounds|two guest rounds|first two live rounds|guest rounds before sign-in/i;
const retiredPublicFormats = /\b(?:APDA|WSDC|Quick Clash|General Clash|British Parliamentary|Asian Parliamentary|Asian Parli|Public Forum|Lincoln-Douglas|World Schools|Model UN|Karl Popper)\b/i;
for (const path of publicContractPages) {
  const source = read(path);
  check(!retiredGuestPromise.test(source), `${path} must not promise retired guest live rounds`);
  check(!retiredPublicFormats.test(publicText(source)), `${path} must not expose a retired competitive format`);
}

for (const path of [
  'app/landing.html',
  'app/debate-online.html',
  'app/debate-strangers.html',
  'app/how-it-works.html',
  'app/omegle-alternative.html',
]) {
  const source = read(path);
  check(/live video requires Google sign-in/i.test(source), `${path} must describe the Google-only live door`);
}

const expectedFaces = ['46', '47', '48', '49', '51', '52', '53', '54'];
for (const face of expectedFaces) {
  check(spar.includes(`/img/round/faces/face${face}.jpg`), `gate must include consented face${face}`);
}
for (const face of ['fictional-sydney', 'fictional-sofia', 'fictional-kevin', 'fictional-anna', 'fictional-malik', 'fictional-chloe', 'fictional-mike']) {
  check(spar.includes(`/img/round/faces/${face}.jpg`), `gate must include founder-supplied ${face}`);
}
check((spar.match(/<span class="gate-cam(?: |")/g) || []).length === 15, 'wide signed-out gate must carry fifteen surrounding tiles');
check(!spar.includes('/img/round/faces/face55.jpg'), 'deleted face55 must never return');

if (failures) process.exit(1);
console.log('spar Google gate: all checks passed');
