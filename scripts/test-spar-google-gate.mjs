#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const spar = read('app/spar.html');
const pair = read('app/netlify/functions/spar-pair.mjs');
const rules = read('app/firestore.rules');
const notifications = read('app/js/notifications.js');

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

check(spar.includes('>12 live now</span>'), 'signed-out gate must carry the founder-called 12-live display');
check(spar.includes('Sign up with Google'), 'signed-out gate must show the Google signup action');
check(!spar.includes('id="emailStartBtn"'), 'signed-out gate must not render an email alternative');
check(!spar.includes('id="gateEmailForm"'), 'signed-out gate must not render the retired email form');

const expectedFaces = ['46', '47', '48', '49', '51', '52', '53', '54'];
for (const face of expectedFaces) {
  check(spar.includes(`/img/round/faces/face${face}.jpg`), `gate must include consented face${face}`);
}
check(!spar.includes('/img/round/faces/face55.jpg'), 'deleted face55 must never return');

if (failures) process.exit(1);
console.log('spar Google gate: all checks passed');
