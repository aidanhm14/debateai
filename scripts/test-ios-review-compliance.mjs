#!/usr/bin/env node

// App Store Guidelines 1.2 and 2.2 are release requirements, not review
// copy. This guard keeps the production flow behind the reviewer evidence:
// affirmative terms before auth, report plus durable block, a 24-hour safety
// response promise, and no beta language on the native-facing legal surfaces.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(root + path, 'utf8');

const auth = read('app/js/auth-modal.js');
const spar = read('app/spar.html');
const round = read('app/live-round.html');
const terms = read('app/terms.html');
const privacy = read('app/privacy.html');
const practice = read('app/practice.html');
const voice = read('app/voice-debate.html');
const coach = read('app/coach.html');
const community = read('app/community.html');
const channels = read('app/js/community-channels.js');
const communityCheck = read('app/netlify/functions/community-content-check.mjs');
const commons = read('app/netlify/functions/chat-feed.mjs');
const report = read('app/netlify/functions/report-user.mjs');
const pair = read('app/netlify/functions/spar-pair.mjs');
const listing = read('mobile/APP_STORE_LISTING.md');

let pass = 0;
function ok(name, fn) {
  try { fn(); pass += 1; }
  catch (error) {
    console.error(`FAIL: ${name}\n  ${error.message}`);
    process.exitCode = 1;
  }
}

ok('terms agreement is visible and affirmative before auth', () => {
  assert.match(auth, /id="daTerms" type="checkbox"/);
  assert.match(auth, /zero tolerance for objectionable content or abusive users/i);
  assert.match(auth, /debatable-terms-accepted-/);
  assert.match(auth, /function isInAppBrowser\(\) \{[\s\S]{0,600}if \(window\.__DB_NATIVE\) return false;/, 'native shell must not be treated as a third-party in-app browser');
});

ok('every shared sign-in method enforces the agreement', () => {
  for (const signature of ['doGoogle()', 'doAppleSignIn()', 'doEmailPassword(event)', 'doEmailLink(event)']) {
    const escaped = signature.replace(/[()]/g, '\\$&');
    assert.match(auth, new RegExp(`function ${escaped} \\{[\\s\\S]{0,120}if \\(!requireTerms\\(\\)\\) return;`), signature);
  }
});

// The agreement must be TAKEABLE on every screen that demands it, and
// asking must never be silent. Both halves broke in production and were
// measured 2026-09-02 on the (since retired, 2026-09-03) phone screen:
// it demanded agreement with no checkbox on it, and the chooser disabled
// the provider buttons, which dispatch no click when disabled, so
// requireTerms()'s message and focus were unreachable. The chooser is
// the one screen that asks now, and it must carry the field.
ok('the chooser can take the agreement it demands', () => {
  assert.match(auth, /function termsFieldHtml\(\)[\s\S]{0,400}id="daTerms" type="checkbox"/,
    'shared terms field markup missing');
  assert.match(auth, /function renderChooser\([\s\S]{0,9000}termsFieldHtml\(\)/,
    'chooser no longer renders the terms field');
});

ok('the terms gate is never enforced by a disabled button', () => {
  assert.doesNotMatch(auth, /\['#daApple', '#daG', '#daEmailBtn'\][\s\S]{0,220}\.disabled = /,
    'provider buttons disabled again: a disabled button fires no click, so requireTerms() cannot report');
  assert.doesNotMatch(auth, /#daG'\)\.disabled = true/, 'Google button must never be disabled as a terms gate');
});

// Phone sign-in was retired 2026-09-03 (Aidan: Google plus whatever else
// is quick, not text and not phone). Apple stays in the iOS shell only.
ok('the retired phone door does not come back', () => {
  assert.doesNotMatch(auth, /PhoneAuthProvider|RecaptchaVerifier|id="daPhone"|startWith === 'phone'/,
    'phone sign-in markup or provider returned to the shared chooser');
});

ok('native spar sign-in cannot bypass the shared terms chooser', () => {
  assert.match(spar, /function doGoogleSignIn\(\)\{\s*[\s\S]{0,500}window\.__DB_NATIVE[\s\S]{0,250}window\.openAuthModal\('signup'\)/);
  assert.doesNotMatch(spar, /id="(?:emailStartBtn|gateEmailForm)"/, 'retired spar email path returned without a native terms guard');
});

ok('live report flow exposes block and removes the blocked round', () => {
  assert.match(round, /id="safetyBlock" type="checkbox" checked/);
  assert.match(round, /Debatable receives this report/);
  assert.match(round, /Reported and blocked\. Leaving this round\./);
  assert.match(round, /location\.href = '\/spar'/);
});

ok('report notifies the developer and writes a durable block', () => {
  assert.match(report, /collection\('safety_reports'\)\.add\(report\)/);
  assert.match(report, /collection\('user_blocks'\)[\s\S]*collection\('blocked'\)/);
});

ok('matchmaking enforces durable blocks in both directions', () => {
  assert.match(pair, /tx\.get\(myBlockRef\)/);
  assert.match(pair, /tx\.get\(peerBlockRef\)/);
  assert.match(pair, /myBlockSnap\.exists \|\| peerBlockSnap\.exists/);
});

ok('terms contain zero tolerance, filtering, blocking, and 24-hour action', () => {
  assert.match(terms, /zero tolerance for objectionable content or abusive users/i);
  assert.match(terms, /<strong>Filtering\.<\/strong>/);
  assert.match(terms, /<strong>Blocking\.<\/strong>/);
  assert.match(terms, /within 24 hours/i);
  assert.match(terms, /remove the offending content[\s\S]*eject, suspend, or terminate/i);
});

ok('public community writes pass through objectionable-content filters', () => {
  for (const surface of ['composer', 'case_comment', 'thread', 'reply', 'channel']) {
    assert.match(communityCheck, new RegExp(`${surface}: \\[`, 'i'));
  }
  assert.match(communityCheck, /checkAll\(rules\.map/);
  assert.match(community, /screenCommunityContent\('case_comment'[\s\S]{0,180}colRef\.add/);
  assert.match(community, /screenCommunityContent\('composer'[\s\S]{0,180}forum_posts'\)\.add/);
  assert.match(community, /screenCommunityContent\('thread'[\s\S]{0,200}forum_posts'\)\.add/);
  assert.match(community, /screenCommunityContent\('reply'[\s\S]{0,200}forum_posts'\)\.add/);
  assert.match(channels, /screenCommunityContent\('channel'[\s\S]{0,220}sendFs\(text\)/);
  assert.match(commons, /checkContent\(\{[\s\S]{0,100}kind: 'message'[\s\S]{0,180}contentCheck\.ok/);
});

ok('native-facing production and legal copy does not advertise beta testing', () => {
  for (const [name, source] of Object.entries({ terms, privacy, practice, listing })) {
    assert.doesNotMatch(source, /\bbeta\b/i, `${name} still contains beta language`);
  }
  assert.match(voice, /nativeApp \? 'Voice' : 'Voice · Beta'/);
  assert.match(voice, /nativeApp \?[\s\S]{0,120}href: '\/terms'[\s\S]{0,300}href: '\/safety'[\s\S]{0,100}Voice mode is in beta/i);
  assert.match(coach, /<div id="freeMeter" class="free-meter" data-native-hide>Free allowance/i);
});

if (process.exitCode) {
  console.error(`\ntest-ios-review-compliance: ${pass} passed, failures above.`);
} else {
  console.log(`test-ios-review-compliance: ${pass}/${pass} assertions passed.`);
}
