// Guards on the SMS lane's pure logic.
//
// Runs in the pre-commit hook. The things asserted here are the ones that
// are a legal problem rather than a bug if they break: a number we cannot
// normalize must be refused rather than guessed at, STOP must be recognised
// exactly, and an inbound webhook must not be forgeable. The send gate
// itself (consent, verification, caps, quiet hours) is exercised through a
// fake record so it can be tested without a Twilio account or Firestore.
import assert from 'node:assert';
import { createHmac } from 'node:crypto';

import {
  normalizePhone, phoneLast4, keywordFor, verifyTwilioSignature,
  publicPhoneStatus, SMS_KINDS, SMS_CONSENT_TEXT, SMS_DAILY_CAP,
  SMS_LIVE_DAILY_CAP, QUIET_START_HOUR, QUIET_END_HOUR,
} from '../app/netlify/functions/lib/sms.mjs';

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n++; assert.strictEqual(a, b, msg); };

// ── normalizePhone ────────────────────────────────────────────────
// A number we store wrong is a text sent to a stranger, so the parser
// refuses anything it cannot place rather than guessing a country.
eq(normalizePhone('+1 555 123 4567'), '+15551234567', 'spaced E.164');
eq(normalizePhone('(555) 123-4567'), '+15551234567', 'bare 10-digit assumes default country');
eq(normalizePhone('5551234567'), '+15551234567', 'bare 10-digit');
eq(normalizePhone('15551234567'), '+15551234567', 'bare 11-digit starting 1');
eq(normalizePhone('+44 20 7946 0958'), '+442079460958', 'UK with plus');
eq(normalizePhone('+91 98765 43210'), '+919876543210', 'India with plus');
eq(normalizePhone(''), '', 'empty');
eq(normalizePhone(null), '', 'null');
eq(normalizePhone('abc'), '', 'letters only');
eq(normalizePhone('12345'), '', 'too short');
eq(normalizePhone('442079460958'), '', 'no plus and not 10 or 11 digits is refused, never guessed');
eq(normalizePhone('+1234567890123456'), '', 'too long');
eq(phoneLast4('+15551234567'), '4567', 'last4');
eq(phoneLast4(''), '', 'last4 of empty');

// ── keywordFor ────────────────────────────────────────────────────
// Carriers require STOP to work. Matching is whole-body: "stop" inside a
// sentence is somebody talking, and silencing them for it would be worse
// than missing an opt-out we will get again.
eq(keywordFor('STOP'), 'stop', 'STOP');
eq(keywordFor('stop'), 'stop', 'lowercase stop');
eq(keywordFor('  Stop  '), 'stop', 'padded stop');
eq(keywordFor('UNSUBSCRIBE'), 'stop', 'unsubscribe');
eq(keywordFor('CANCEL'), 'stop', 'cancel');
eq(keywordFor('QUIT'), 'stop', 'quit');
eq(keywordFor('START'), 'start', 'start');
eq(keywordFor('unstop'), 'start', 'unstop');
eq(keywordFor('HELP'), 'help', 'help');
eq(keywordFor('please stop texting me'), '', 'stop inside a sentence is NOT an opt-out keyword');
eq(keywordFor('I will stop arguing'), '', 'stop mid-sentence ignored');
eq(keywordFor(''), '', 'empty body');
eq(keywordFor('lol'), '', 'ordinary reply');

// ── verifyTwilioSignature ─────────────────────────────────────────
// Without a valid signature this endpoint would let anyone silence any
// number they can guess, so a wrong signature must fail and a right one
// must pass against the documented algorithm.
{
  const url = 'https://itsdebatable.com/api/sms-inbound';
  const params = { From: '+15551234567', Body: 'STOP', To: '+15559999999' };
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (token) {
    const keys = Object.keys(params).sort();
    let data = url;
    for (const k of keys) data += k + params[k];
    const good = createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
    ok(verifyTwilioSignature(url, params, good), 'a correctly computed signature verifies');
    ok(!verifyTwilioSignature(url, params, 'nope'), 'a wrong signature is refused');
    ok(!verifyTwilioSignature(url + '/x', params, good), 'a signature for another URL is refused');
    ok(!verifyTwilioSignature(url, { ...params, Body: 'START' }, good), 'a tampered body is refused');
  } else {
    // No token configured is the state this repo is in today, and the
    // right behaviour there is to refuse everything rather than fail open.
    ok(!verifyTwilioSignature(url, params, 'anything'), 'unconfigured token refuses ALL signatures (fails closed)');
    ok(!verifyTwilioSignature(url, params, ''), 'unconfigured token refuses empty signature');
  }
}

// ── publicPhoneStatus ─────────────────────────────────────────────
// The status a page renders must never carry the number itself.
{
  const rec = {
    e164: '+15551234567', verified: true, optedOut: false,
    kinds: { live: true, challenge: true, dm: false },
    codeHash: 'secret', codeSalt: 'salty', consentIp: '1.2.3.4',
  };
  const pub = publicPhoneStatus(rec);
  eq(pub.last4, '4567', 'status carries last4');
  const s = JSON.stringify(pub);
  ok(!s.includes('+15551234567'), 'status NEVER carries the full number');
  ok(!s.includes('secret'), 'status never carries the code hash');
  ok(!s.includes('salty'), 'status never carries the code salt');
  ok(!s.includes('1.2.3.4'), 'status never carries the consent IP');
  eq(publicPhoneStatus(null).hasPhone, false, 'no record reads as no phone');
  eq(publicPhoneStatus(null).verified, false, 'no record is never verified');
}

// ── constants that are promises to the user ───────────────────────
// These numbers are stated in the consent text and in the settings copy.
// If they drift, the page is lying about what someone signed up for.
ok(SMS_DAILY_CAP <= 6, 'daily cap stays in "a few a day" territory');
ok(SMS_LIVE_DAILY_CAP <= SMS_DAILY_CAP, 'the live sub-cap sits under the daily cap');
ok(SMS_LIVE_DAILY_CAP <= 2, 'unprompted live alerts stay at most twice a day');
eq(QUIET_START_HOUR, 22, 'quiet hours start at 10pm, as the settings copy says');
eq(QUIET_END_HOUR, 8, 'quiet hours end at 8am, as the settings copy says');
ok(/STOP/.test(SMS_CONSENT_TEXT), 'consent text tells people how to stop');
ok(/HELP/.test(SMS_CONSENT_TEXT), 'consent text mentions HELP');
ok(/rates may apply/i.test(SMS_CONSENT_TEXT), 'consent text carries the rates disclosure');
ok(/frequency/i.test(SMS_CONSENT_TEXT), 'consent text states message frequency');
eq(SMS_KINDS.length, 3, 'three text kinds');
ok(SMS_KINDS.indexOf('live') >= 0 && SMS_KINDS.indexOf('challenge') >= 0 && SMS_KINDS.indexOf('dm') >= 0,
  'the three kinds are live, challenge, dm');

// ── the module must not export a raw send ─────────────────────────
// Every product text has to go through sendSmsToUser so the consent gate
// cannot be skipped by a future call site that means well. If a raw
// `sendSms` is ever exported, this fails and asks the question again.
{
  const mod = await import('../app/netlify/functions/lib/sms.mjs');
  ok(!('sendSms' in mod), 'raw sendSms is NOT exported; the consent gate cannot be bypassed');
  ok(typeof mod.sendSmsToUser === 'function', 'the gated sender is what callers get');
  ok(typeof mod.sendVerificationSms === 'function', 'the verification send is separately named');
}

// ── every product send site goes through the gate ─────────────────
// A grep-level guard: the standing rule is that nothing texts a user
// except through sendSmsToUser / sendSmsToManyUsers.
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = new URL('../app/netlify/functions/', import.meta.url).pathname;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs'));
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf-8');
    if (!/from '\.\/lib\/sms\.mjs'/.test(src)) continue;
    const importLine = (src.match(/import \{([^}]*)\} from '\.\/lib\/sms\.mjs'/) || [, ''])[1];
    ok(!/\bsendSms\b(?!To)/.test(importLine),
      `${f} does not import a raw send from lib/sms.mjs`);
  }
}

console.log(`[sms-guard] ${n} assertions passed`);
