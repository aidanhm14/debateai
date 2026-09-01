#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const spar = read('app/spar.html');
const authModal = read('app/js/auth-modal.js');
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

// 2026-08-31, later founder conversion call: the signed-out gate is the
// one declared exception to the raw-public-number rule. It displays four
// plus the fresh /api/spar-queue waiting count, while analytics preserve
// both the conversion display and the operational measurement.
check(spar.includes('var GATE_LIVE_BASE = 4;'), 'signed-out gate must carry the founder-called base of four');
check(!/>\s*\d+ live now</.test(spar), 'signed-out gate markup must not hardcode a live figure');
check(/id="gateLive" hidden/.test(spar), 'signed-out gate pill must ship hidden until its count is hydrated');
check(spar.includes('.gate-live[hidden]{display:none}') || /\.gate-live\[hidden\][^}]*display:none/.test(spar), 'gate pill must respect [hidden] against its display:flex');
check(spar.includes("fetch('/api/spar-queue', { cache: 'no-cache' })"), 'signed-out gate must fetch the fresh public queue count');
check(spar.includes('var liveDisplay = GATE_LIVE_BASE + queueWaiting;'), 'signed-out gate must add the real waiting count to four');
check(spar.includes("text.textContent = liveDisplay + ' live now';"), 'signed-out gate must render the combined live display');
check(spar.includes('live_display: liveDisplay, queue_waiting: queueWaiting'), 'gate analytics must preserve displayed and measured counts separately');
check(spar.includes('Sign up with Google'), 'signed-out gate must show the Google signup action');
check(spar.includes('autoPopAuthModal();'), 'signed-out gate must open its sign-in prompt on arrival');
check(spar.includes('var AUTH_POP_DELAY_MS = 5000;'), 'automatic prompt must wait five seconds before opening');
check(spar.includes('setTimeout(tryOpenAuthPop, AUTH_POP_DELAY_MS);'), 'automatic prompt must use the calm-entry delay');
check(spar.includes('googleOnly: true'), 'signed-out gate prompt must offer Google only');
check(authModal.includes('googleOnly = !!(opts && opts.googleOnly);'), 'shared auth prompt must accept Google-only mode');
check(authModal.includes("googleOnly ? '' : '<div class=\"da-or\">or use email</div>'"), 'Google-only auth prompt must omit the email door');
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

// face63-65 added 2026-08-31: second consented batch (Ray, Pascal, Yael)
// cropped from real live rounds, consent + 18+ confirmed on record.
const expectedFaces = ['46', '47', '48', '49', '51', '52', '53', '54', '63', '64', '65'];
for (const face of expectedFaces) {
  check(spar.includes(`/img/round/faces/face${face}.jpg`), `gate must include consented face${face}`);
}
for (const face of ['fictional-sydney', 'fictional-sofia', 'fictional-kevin', 'fictional-anna', 'fictional-malik', 'fictional-chloe', 'fictional-mike']) {
  check(spar.includes(`/img/round/faces/${face}.jpg`), `gate must include founder-supplied ${face}`);
}
// The Avatar-mode mask tile is gate atmosphere only; the mask must never
// enter the landing face pools where the deal would name-caption it.
check(spar.includes('/img/round/faces/mask-ano.jpg'), 'gate must include the Avatar-mode mask tile');
check((spar.match(/<span class="gate-cam(?: |")/g) || []).length === 19, 'wide signed-out gate must carry nineteen surrounding tiles (15 + the 2026-08-31 batch)');
check(!spar.includes('/img/round/faces/face55.jpg'), 'deleted face55 must never return');

if (failures) process.exit(1);
console.log('spar Google gate: all checks passed');
