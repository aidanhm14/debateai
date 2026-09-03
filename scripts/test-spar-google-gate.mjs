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

// THE LIVE-VIDEO DOOR IS GOOGLE, OR APPLE IN THE iOS APP (2026-08-27
// Google-only; Apple added 2026-09-01; phone added 2026-09-01 and RETIRED
// 2026-09-03 on the founder's call: no text, no phone). Seven places carry
// the same two-provider set and must agree: rules, spar-pair,
// create-daily-room, spar.html, notifications.js, live-popup.js,
// live-round.html. Inside an in-app browser Google OAuth cannot complete
// (measured 2026-08-24: 339/340 TikTok sessions, zero rounds), and with
// phone gone the honest instruction is open-in-Safari plus Copy link. The
// guest allowance stays at zero.
const dailyRoom = read('app/netlify/functions/create-daily-room.mjs');
const livePopup = read('app/js/live-popup.js');
const liveRound = read('app/live-round.html');

check(spar.includes('var GUEST_FREE_ROUNDS = 0;'), 'client guest allowance must stay at zero');
check(pair.includes('const GUEST_FREE_ROUNDS = 0;'), 'server guest allowance must stay at zero');
check(spar.includes("var LIVE_VIDEO_PROVIDERS = ['google.com', 'apple.com'];"), 'spar must define the two-provider live-video set');
check(spar.includes('return isLiveVideoUser(u);'), 'foreground queue must require a Google or Apple user');
check(notifications.includes("var LIVE_VIDEO_PROVIDERS = ['google.com', 'apple.com'];"), 'background pill must define the same two-provider set');
check(notifications.includes('return !!liveVideoProvider(u);'), 'background queue must require a Google or Apple user');
check(pair.includes("const LIVE_VIDEO_PROVIDERS = new Set(['google.com', 'apple.com']);"), 'matcher must define the two-provider set');
check(pair.includes('if (!LIVE_VIDEO_PROVIDERS.has(decoded.firebase?.sign_in_provider))'), 'matcher must verify the provider from the token');
check(pair.includes("code: 'GOOGLE_SIGN_IN_REQUIRED'"), 'matcher must return the labeled gate code clients handle');
check(pair.includes('if (!LIVE_VIDEO_PROVIDERS.has(mine.authProvider))'), 'matcher must reject a stale active seat marker');
check(pair.includes('if (!LIVE_VIDEO_PROVIDERS.has(theirs.authProvider))'), 'matcher must reject an ineligible passive seat');
check(dailyRoom.includes("const LIVE_VIDEO_PROVIDERS = new Set(['google.com', 'apple.com']);"), 'video room minter must define the two-provider set');
check(dailyRoom.includes('!LIVE_VIDEO_PROVIDERS.has(who.provider)'), 'video room minter must gate debater tokens on the set');
check(rules.includes("request.auth.token.firebase.sign_in_provider in ['google.com', 'apple.com']"), 'rules must define isLiveVideoAccount over the same set');
// Phone retired 2026-09-03. A stray 'phone' in any of the seven sets
// reopens a door the founder closed; grep every copy for it.
for (const [label, src] of [['rules', rules], ['spar-pair', pair], ['create-daily-room', dailyRoom], ['spar', spar], ['notifications', notifications], ['live-popup', livePopup], ['live-round', liveRound]]) {
  const code = src.replace(/\/\/[^\n]*/g, '');
  check(!/'google\.com',\s*'phone'/.test(code) && !/providerId === 'phone'/.test(code), `${label} must not carry phone in a live-video provider set`);
}
check(!authModal.includes("startWith === 'phone'"), 'shared chooser must not open on a retired phone step');
check(!authModal.includes('id="daPhone"'), 'shared chooser must not render a phone button');
check(!authModal.includes('PhoneAuthProvider'), 'shared chooser must not carry the phone provider');
check(rules.includes('allow create: if isLiveVideoAccount()'), 'Firestore must reject queue creation outside the set');
check(rules.includes("request.resource.data.authProvider == request.auth.token.firebase.sign_in_provider"), 'Firestore must bind the queue marker to the caller\'s own verified provider');
check(!rules.includes("request.resource.data.authProvider == 'google.com'"), 'rules must not pin the queue marker to Google alone');
check(spar.includes('authProvider: liveVideoProvider(state.user),'), 'foreground queue must stamp the provider the account holds');
check(notifications.match(/authProvider: liveVideoProvider\(myUser\)/g)?.length >= 2, 'every background queue write must stamp the held provider');
check(!spar.includes("authProvider: 'google.com'"), 'foreground queue must not hardcode Google');
check(!notifications.includes("authProvider: 'google.com'"), 'background queue must not hardcode Google');
check(spar.includes('function inAppBrowser(){'), 'spar must detect in-app browsers');
check(spar.includes("typeof window.__ditIsInAppBrowser === 'function'"), 'spar must defer to the shared in-app detector');
check(!spar.includes('id="phoneSignInBtn"'), 'signed-out gate must not offer the retired phone door');
check(spar.includes('id="gateCopyLink"'), 'in-app gate must offer Copy link, since a webview has no address bar');
check(spar.includes("if (inAppBrowser()){ doInAppSignIn(); return; }"), 'every in-app Google click on spar must land on the open-in-Safari instruction');
check(spar.includes('liveVideo: true') && !spar.includes('googleOnly: true'), 'spar prompts must open the shared card in live-video mode, never Google-only');
check(livePopup.includes("pd[i].providerId === 'google.com' || pd[i].providerId === 'apple.com'"), 'wants-to-debate popup must accept Google and Apple accounts only');
check(livePopup.includes('liveVideo: true'), 'wants-to-debate popup must open live-video mode');
check(liveRound.includes("pd[i].providerId === 'google.com' || pd[i].providerId === 'apple.com'"), 'live-round seat gate must accept Google and Apple accounts only');
check(liveRound.includes('liveVideo: true'), 'live-round must open the shared card in live-video mode');
check(authModal.includes('liveVideo = !!(opts && opts.liveVideo) && !googleOnly;'), 'shared auth prompt must accept live-video mode');
check(authModal.includes("var noEmail = googleOnly || liveVideo;"), 'live-video prompt must omit the email door');
check(authModal.includes('var providerButtons = googleBtn;'), 'chooser must render Google as the one provider button on web');
check(authModal.includes("googleOnly || liveVideo ? 'Open the site in Safari or Chrome to sign in with Google.'"), 'in-app live-video note must point at a real browser');
check(!spar.includes('id="emailStartBtn"'), 'signed-out gate must not render an email alternative');
check(!spar.includes('id="gateEmailForm"'), 'signed-out gate must not render the retired email form');

// The operational count is a promise that every person it includes can
// actually reach the ready-check. Keep the count and tryMatch on one helper,
// especially for the adult/minor split enforced by spar-pair.
check(spar.includes('function queuePeerCanMatch(doc){'), 'spar must define one shared queue eligibility check');
check((spar.match(/if \(!queuePeerCanMatch\(d\)\) return;/g) || []).length === 2,
  'the available count and match candidate list must use the same eligibility check');
check(spar.includes("peerBand !== myBand"), 'queue eligibility must separate adult and minor age pools');
check(spar.includes("LIVE_VIDEO_PROVIDERS.indexOf(String(data.authProvider || '')) < 0"),
  'queue eligibility must reject stale provider markers before counting them');
check(!spar.includes('debaters available now'), 'the audience-facing queue count must call them people');
const eligibilityStart = spar.indexOf('function queuePeerCanMatch(doc){');
const eligibilityEnd = spar.indexOf('// ONE definition of "can this browser finish', eligibilityStart);
const eligibilitySource = spar.slice(eligibilityStart, eligibilityEnd).trim();
const queuePeerCanMatch = new Function(
  'state', 'LIVE_VIDEO_PROVIDERS', 'localSkipActive', 'docSkips', 'window',
  `${eligibilitySource}\nreturn queuePeerCanMatch;`,
)(
  { user: { uid: 'me' } },
  ['google.com', 'apple.com'],
  () => false,
  () => false,
  { daAgeBand: () => 'adult' },
);
const peer = (id, ageBand, authProvider = 'google.com') => ({
  id,
  data: () => ({ status: 'waiting', ageBand, authProvider }),
});
check(queuePeerCanMatch(peer('adult-peer', 'adult')), 'an eligible adult peer must be countable and matchable');
check(!queuePeerCanMatch(peer('minor-peer', 'minor')), 'an adult must not count a minor as an available opponent');
check(!queuePeerCanMatch(peer('email-peer', 'adult', 'password')), 'an ineligible provider must not count as an available opponent');
check(!queuePeerCanMatch(peer('me', 'adult')), 'the current user must not count as their own opponent');

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
check(authModal.includes('googleOnly = !!(opts && opts.googleOnly);'), 'shared auth prompt must keep Google-only mode for the admin gates');
check(authModal.includes("(noEmail ? '' : '<div class=\"da-or\">or use email</div>'"), 'Google-only and live-video prompts must omit the email door');
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

// face63/65 added 2026-08-31: second consented batch (Ray, Yael) cropped
// from real live rounds, consent + 18+ confirmed on record. face64 (Pascal)
// was pulled 2026-09-01 on the founder's call and is guarded below.
const expectedFaces = ['46', '47', '48', '49', '51', '52', '53', '54', '63', '65'];
for (const face of expectedFaces) {
  check(spar.includes(`/img/round/faces/face${face}.jpg`), `gate must include consented face${face}`);
}
for (const face of ['fictional-sydney', 'fictional-sofia', 'fictional-kevin', 'fictional-anna', 'fictional-malik', 'fictional-chloe', 'fictional-mike']) {
  check(spar.includes(`/img/round/faces/${face}.jpg`), `gate must include founder-supplied ${face}`);
}
// The Avatar-mode mask tile is gate atmosphere only; the mask must never
// enter the landing face pools where the deal would name-caption it.
check(spar.includes('/img/round/faces/mask-ano.jpg'), 'gate must include the Avatar-mode mask tile');
check((spar.match(/<span class="gate-cam(?: |")/g) || []).length === 18, 'wide signed-out gate must carry eighteen surrounding tiles (15 + the 2026-08-31 batch, less the pulled face64)');
check(!spar.includes('/img/round/faces/face55.jpg'), 'deleted face55 must never return');
// Pulled 2026-09-01 on the founder's call. Guarded on BOTH surfaces it rode,
// because the landing pool holds it as a bare number rather than a filename.
check(!spar.includes('/img/round/faces/face64.jpg'), 'pulled face64 must never return to the gate');
// A pulled face rides these pools as a BARE NUMBER, so a filename grep finds
// nothing and a deleted file 404s in silence. face64 survived the first sweep
// of this change inside the rotator's REAL list for exactly that reason.
// Both pools are checked; a third pool needs adding here the day it exists.
const landing = read('app/landing.html');
for (const [label, re] of [
  ['FACE_M_REAL', /var FACE_M_REAL\s*=\s*\[([^\]]*)\]/],
  ['the rotator REAL pool', /var REAL\s*=\s*\[([^\]]*)\]/],
]) {
  const nums = (landing.match(re) || [])[1];
  check(typeof nums === 'string' && nums.length > 0, `landing must define ${label}`);
  const list = String(nums).split(',').map((n) => n.trim());
  check(!list.includes('64'), `pulled face64 must never return to ${label}`);
  check(!list.includes('55'), `deleted face55 must never return to ${label}`);
}

if (failures) process.exit(1);
console.log('spar Google gate: all checks passed');
