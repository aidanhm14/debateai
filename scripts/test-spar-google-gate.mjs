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
// phone gone the honest instruction is open-in-Safari plus Copy link.
// 2026-09-04 (the founder, off session replays: the Google-only door "is
// detering ppl"): ONE anonymous round is metered server-side before that
// door, Match Desk first. The guest lane is a metered exception on the
// queue only; every other surface in this file stays Google or Apple.
const dailyRoom = read('app/netlify/functions/create-daily-room.mjs');
const livePopup = read('app/js/live-popup.js');
const liveRound = read('app/live-round.html');
const watch = read('app/watch.html');

check(spar.includes('var GUEST_FREE_ROUNDS = 1;'), 'client guest allowance must mirror the one-round server default');
check(/const GUEST_FREE_ROUNDS = process\.env\.GUEST_FREE_ROUNDS !== undefined\s*\?[^;]*:\s*1;/.test(pair), 'server guest allowance must default to one round and read the env override');
check(spar.includes("var LIVE_VIDEO_PROVIDERS = ['google.com', 'apple.com'];"), 'spar must define the two-provider live-video set');
check(spar.includes('if (isLiveVideoUser(u)) return true;') && spar.includes('return !!(u && u.isAnonymous && guestRoundsLeft() > 0);'), 'foreground queue must take a Google or Apple user, or a guest with a free round left');
check(notifications.includes("var LIVE_VIDEO_PROVIDERS = ['google.com', 'apple.com'];"), 'background pill must define the same two-provider set');
check(notifications.includes('return !!liveVideoProvider(u);'), 'background queue must require a Google or Apple user');
check(pair.includes("const LIVE_VIDEO_PROVIDERS = new Set(['google.com', 'apple.com']);"), 'matcher must define the two-provider set');
check(pair.includes('if (!iAmGuest && !LIVE_VIDEO_PROVIDERS.has(decoded.firebase?.sign_in_provider))'), 'matcher must verify the provider from the token, guests excepted into the metered lane');
check(pair.includes("const iAmGuest = decoded.firebase?.sign_in_provider === 'anonymous';") && pair.includes('if (used >= GUEST_FREE_ROUNDS) {'), 'matcher must meter guests against the server record before seating them');
check(pair.includes("code: 'GOOGLE_SIGN_IN_REQUIRED'"), 'matcher must return the labeled gate code clients handle');
check(pair.includes("const seatOk = (p) => LIVE_VIDEO_PROVIDERS.has(p) || p === 'anonymous';") && pair.includes('if (!seatOk(mine.authProvider))'), 'matcher must reject a stale active seat marker while accepting a guest seat');
check(pair.includes('if (!seatOk(theirs.authProvider))'), 'matcher must reject an ineligible passive seat');
check(dailyRoom.includes("const LIVE_VIDEO_PROVIDERS = new Set(['google.com', 'apple.com']);"), 'video room minter must define the two-provider set');
check(dailyRoom.includes("if (role !== 'stage' && !LIVE_VIDEO_PROVIDERS.has(who.provider))"), 'video room minter must gate every human role on the provider set');
check(dailyRoom.includes("role === 'viewer'\n        ? 'Sign in with Google to spectate live debates.'"), 'viewer rejection must name the spectator Google door');
check(dailyRoom.includes("body.role === 'stage' ? 'stage'"), 'video room minter must recognize the non-person stage renderer');
check(dailyRoom.includes("const receiveOnly = role === 'viewer' || role === 'stage';"), 'viewer and stage tokens must both stay receive-only');
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
check(rules.includes('allow create: if (isLiveVideoAccount() || isGuestAccount())'), 'Firestore must accept queue creation only from the set or a guest');
check(rules.includes("request.auth.token.firebase.sign_in_provider == 'anonymous'"), 'rules must define isGuestAccount as the anonymous provider');
check(rules.includes("request.resource.data.authProvider == request.auth.token.firebase.sign_in_provider"), 'Firestore must bind the queue marker to the caller\'s own verified provider');
check(!rules.includes("request.resource.data.authProvider == 'google.com'"), 'rules must not pin the queue marker to Google alone');
check(spar.includes("authProvider: state.user.isAnonymous ? 'anonymous' : liveVideoProvider(state.user),"), 'foreground queue must stamp the provider the account holds');
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
check(
  livePopup.includes("if (item.kind === 'wait' && item.needsAuth)")
    && livePopup.includes('if (openWaitingSignIn(item, opts)) return;')
    && livePopup.includes("placement: 'center'")
    && livePopup.includes("window.openAuthModal('signin',"),
  'a signed-out wants-to-debate alert must open the centered auth dialog instead of a corner card',
);
check(
  livePopup.includes('onDone: function (user)')
    && livePopup.includes("if (!user) {")
    && livePopup.includes("write(localStorage, SNOOZE_KEY, now());"),
  'dismissing the centered sign-in dialog must not send a guest to the queue or immediately reprompt',
);
check(liveRound.includes("pd[i].providerId === 'google.com' || pd[i].providerId === 'apple.com'"), 'live-round seat gate must accept Google and Apple accounts only');
check(liveRound.includes('liveVideo: true'), 'live-round must open the shared card in live-video mode');
check(liveRound.includes("if (!prefill.stage && !isLiveVideoUser(state.user))"), 'live-round must gate human spectators while preserving the stage renderer');
check(liveRound.includes("if (isSpectator() && !prefill.stage && !isLiveVideoUser(user))"), 'persisted anonymous state must not gate the non-person stage renderer');
check(liveRound.includes("role: prefill.stage ? 'stage' : (isSpectator() ? 'viewer' : 'debater')"), 'live-round must label the non-person stage request explicitly');
check(liveRound.includes("headline: isSpectator() ? 'Sign in to spectate live debates'"), 'direct spectator links must open the dedicated sign-in prompt');
check(liveRound.includes("if (isSpectator() && !prefill.stage) showAuthGate();"), 'signed-out human spectators must not mint an anonymous account');
check(livePopup.includes('spectatorAuth: needsSpectatorAuth'), 'sitewide live cards must mark signed-out spectators for auth');
check(livePopup.includes("headline: 'Sign in to spectate live debates'"), 'sitewide live cards must use the dedicated spectator prompt');
check(watch.includes("headline:'Sign in to spectate live debates'"), 'Watch live rows must use the dedicated spectator prompt');
check(watch.includes("destination:link.getAttribute('href')"), 'Watch sign-in must return to the exact live room');
check(authModal.includes('liveVideo = !!(opts && opts.liveVideo) && !googleOnly;'), 'shared auth prompt must accept live-video mode');
check(authModal.includes('var noEmail = true;'), 'every public prompt, including live video, must omit the email door');
check(authModal.includes('var providerButtons = googleBtn;'), 'chooser must render Google as the one provider button on web');
check(authModal.includes('Open the site in Safari or Chrome to sign in with Google.'), 'in-app live-video note must point at a real browser');
check(!spar.includes('id="emailStartBtn"'), 'signed-out gate must not render an email alternative');
check(!spar.includes('id="gateEmailForm"'), 'signed-out gate must not render the retired email form');

// The operational count is a promise that every person it includes can
// actually reach the ready-check. Keep the count and tryMatch on one helper,
// especially for the adult/minor split enforced by spar-pair.
check(spar.includes('function queuePeerCanMatch(doc){'), 'spar must define one shared queue eligibility check');
check((spar.match(/if \(!queuePeerCanMatch\(d\)\) return;/g) || []).length === 2,
  'the available count and match candidate list must use the same eligibility check');
check(spar.includes("peerBand !== myBand"), 'queue eligibility must separate adult and minor age pools');
check(spar.includes("if (LIVE_VIDEO_PROVIDERS.indexOf(peerProvider) < 0 && peerProvider !== 'anonymous') return false;"),
  'queue eligibility must reject stale provider markers before counting them, guests excepted');
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
check(queuePeerCanMatch(peer('guest-peer', 'adult', 'anonymous')), 'a guest on their free round must count as an available opponent');
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
check(!spar.includes('autoPopAuthModal'), 'signed-out gate must remain the sole sign-in prompt instead of opening a duplicate modal');
check(!spar.includes('AUTH_POP_DELAY_MS'), 'signed-out gate must not carry a delayed auth-popup timer');
check(!spar.includes('spar_auth_autopop'), 'signed-out gate must not emit telemetry for a retired automatic popup');
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
// fictional-chloe was pulled 2026-09-03 with the other library and
// classroom stills (the founder: "get rid of the school images"); the
// landing board's hover clips freeze the room behind a moving speaker,
// and the gate follows the same bar so one cast rule covers both surfaces.
for (const face of ['fictional-sydney', 'fictional-sofia', 'fictional-kevin', 'fictional-anna', 'fictional-malik', 'fictional-mike']) {
  check(spar.includes(`/img/round/faces/${face}.jpg`), `gate must include founder-supplied ${face}`);
}
check(!spar.includes('/img/round/faces/fictional-chloe.jpg'), 'pulled fictional-chloe must stay off the gate');
// The Avatar-mode mask tile is gate atmosphere only; the mask must never
// enter the landing face pools where the deal would name-caption it.
check(spar.includes('/img/round/faces/mask-ano.jpg'), 'gate must include the Avatar-mode mask tile');
check((spar.match(/<span class="gate-cam(?: |")/g) || []).length === 17, 'wide signed-out gate must carry seventeen surrounding tiles (15 + the 2026-08-31 batch, less the pulled face64 and fictional-chloe)');
// The school stills (library, classroom, cafeteria backgrounds) are out of
// every landing pool since 2026-09-03. A number here is a bare integer in
// FACE_W / FACE_M_GEN, so the guard reads the arrays rather than filenames.
{
  const pool = (name) => {
    const m = read('app/landing.html').match(new RegExp(`var ${name} = \\[([^\\]]*)\\]`));
    return m ? m[1].split(',').map((n) => n.trim()).filter(Boolean) : null;
  };
  const w = pool('FACE_W'), m = pool('FACE_M_GEN');
  check(Array.isArray(w) && Array.isArray(m), 'landing must still define FACE_W and FACE_M_GEN');
  for (const n of ['1', '4', '6', '30', '43', '45']) {
    check(!(w || []).includes(n) && !(m || []).includes(n), `school still face${n.padStart(2, '0')} must stay out of the landing pools`);
  }
}
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
