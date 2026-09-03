#!/usr/bin/env node
// Guards the automatic welcome email (lib/welcome-email.mjs). Runs in the
// pre-commit hook. Pure: no Auth, no Firestore, no Resend.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { welcomeEligibility, renderWelcome, firstNameOf, WELCOME_SINCE_MS, SUBJECT }
  from '../app/netlify/functions/lib/welcome-email.mjs';

let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error(`FAIL welcome-email: ${name}\n  ${e.message}`); process.exit(1); } };

const after = new Date(WELCOME_SINCE_MS + 60_000).toISOString();
const before = new Date(WELCOME_SINCE_MS - 60_000).toISOString();
const google = (over = {}) => ({ uid: 'u1', email: 'someone@gmail.com', displayName: 'Sam Lee',
  providerData: [{ providerId: 'google.com' }], metadata: { creationTime: after }, ...over });

ok('a fresh Google account is eligible', () => assert.equal(welcomeEligibility(google(), null).ok, true));
ok('an anonymous account is not', () => assert.equal(welcomeEligibility(google({ providerData: [{ providerId: 'anonymous' }] }), null).reason, 'anonymous'));
ok('a phone account (no email) is not', () => assert.equal(welcomeEligibility(google({ email: null, providerData: [{ providerId: 'phone' }] }), null).reason, 'no_email'));
ok('an account created before launch is not', () => assert.equal(welcomeEligibility(google({ metadata: { creationTime: before } }), null).reason, 'before_launch'));
ok('an Apple relay address is not', () => assert.equal(welcomeEligibility(google({ email: 'x@privaterelay.appleid.com' }), null).reason, 'excluded_domain'));
ok('a test-domain address is not', () => assert.equal(welcomeEligibility(google({ email: 'dryrun.1@itsdebatable.com' }), null).reason, 'excluded_domain'));
ok('a stamped profile is never mailed twice', () => assert.equal(welcomeEligibility(google(), { signupWelcomeSentAt: {} }).reason, 'already_sent'));
ok('the catch-up campaign stamp also blocks it', () => assert.equal(welcomeEligibility(google(), { openRallySentAt: {} }).reason, 'already_emailed'));
ok('the global opt-out blocks it', () => assert.equal(welcomeEligibility(google(), { emailOptOut: true }).reason, 'opted_out'));
ok('a missing profile doc is not an opt-out', () => assert.equal(welcomeEligibility(google(), null).ok, true));
ok('an email/password account is eligible', () => assert.equal(welcomeEligibility(google({ providerData: [{ providerId: 'password' }] }), null).ok, true));

ok('first name comes from a real name, never an alias or email', () => {
  assert.equal(firstNameOf(google(), null), 'Sam');
  assert.equal(firstNameOf(google({ displayName: 'sam.lee@gmail.com' }), null), '');
  assert.equal(firstNameOf(google({ displayName: 'Quiet_Falcon42' }), null), '');
  assert.equal(firstNameOf(google({ displayName: '' }), { displayName: 'Priya Nair' }), 'Priya');
});

const html = renderWelcome({ firstName: 'Sam', uid: 'u1' });
const text = html.replace(/<[^>]+>/g, ' ');
ok('no em-dashes anywhere in the email', () => assert.doesNotMatch(html + SUBJECT, /—|–/));
ok('no banned phrases', () => {
  for (const bad of [/free during beta/i, /no sign-?up required/i, /unlimited/i, /pay nothing/i, /let'?s dive in/i, /let'?s break it down/i, /at the end of the day/i, /it'?s important to note/i, /hear me out/i]) {
    assert.doesNotMatch(text, bad, String(bad));
  }
});
ok('the founder stays anonymous', () => assert.doesNotMatch(text, /Aidan|Hollinger|UChicago|APDA|champion/i));
ok('the crowd is people, not debaters', () => assert.doesNotMatch(text, /\bdebaters\b/i));
ok('the ask is a reply, and it says who reads it', () => assert.match(text, /Reply to this email/i));
ok('canonical price only', () => { assert.match(text, /\$10 a year/); assert.doesNotMatch(text, /\$5\b|\$20\b|\$14\.99|once\b/); });
ok('no image, button, or pixel: text only', () => { assert.doesNotMatch(html, /<img|<table|background:#dc2626|border-radius:999px/); });
ok('few links', () => assert.ok((html.match(/<a /g) || []).length <= 4, 'more than four links reads as a newsletter'));
ok('the unsubscribe link rides the onboarding stream', () => assert.match(html, /Unsubscribe|Reply to opt out/));
ok('subject is lowercase and short', () => { assert.equal(SUBJECT, SUBJECT.toLowerCase()); assert.ok(SUBJECT.length < 60); });

const client = readFileSync(new URL('../app/js/auth-modal.js', import.meta.url), 'utf8');
ok('the client fires the welcome the moment a sign-up completes', () => {
  assert.match(client, /fetch\('\/api\/welcome-email'/, 'auth-modal must call /api/welcome-email');
  assert.match(client, /keepalive: true/, 'the call must survive the navigation that follows sign-in');
});
const sweep = readFileSync(new URL('../app/netlify/functions/scheduled-welcome-sweep.mjs', import.meta.url), 'utf8');
ok('the sweep is scheduled', () => assert.match(sweep, /schedule: '[^']+'/));

console.log(`welcome-email: ${n} checks passed`);
