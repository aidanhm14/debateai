// SMS (Twilio) helper.
//
// Texts a user when something they asked to be told about happens: someone
// is live and looking for a round, they were challenged, they got a message.
// Dormant until the Twilio env vars are set — every send no-ops cleanly, so
// nothing errors or throws before the account exists. Same posture as
// webpush.mjs, and deliberately so: a notification lane that half-works is
// worse than one that is honestly off.
//
// Env (set in the Netlify dashboard):
//   TWILIO_ACCOUNT_SID   — required to send.
//   TWILIO_AUTH_TOKEN    — required to send, and to verify inbound webhooks.
//   TWILIO_FROM          — an E.164 number you own, OR
//   TWILIO_MESSAGING_SID — a Messaging Service SID (preferred; handles
//                          number pooling and carrier compliance for you).
//
// WHY THIS FILE IS SO CAUTIOUS ABOUT CONSENT. A push notification is scoped
// to a browser the person installed us in; they can revoke it in one tap and
// it costs nobody anything. A text message reaches a phone number, costs real
// money per send, and is regulated: US carriers and the TCPA want prior
// express consent, a clear statement of what you will send, and STOP honored
// immediately and forever. So there is no path in this module that sends to
// a number which has not (a) been verified by round-trip code, (b) carried an
// explicit consent record, and (c) stayed opted in. `sendSms` itself is not
// exported for that reason: callers get `sendSmsToUser`, which cannot skip
// the gate.
import { createHmac, timingSafeEqual } from 'crypto';
import { getDb, FieldValue } from './firestore.mjs';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const FROM_NUMBER = process.env.TWILIO_FROM || '';
const MESSAGING_SID = process.env.TWILIO_MESSAGING_SID || '';

export function smsConfigured() {
  return !!(ACCOUNT_SID && AUTH_TOKEN && (FROM_NUMBER || MESSAGING_SID));
}

// Per-user daily ceiling across ALL kinds. Sized so a busy day of live
// alerts cannot turn into a phone full of texts (and cannot turn into a
// surprise Twilio bill): the cap is the product decision, not just the
// cost one. A person who wants more than this wants the app open.
export const SMS_DAILY_CAP = 4;
// Live alerts are the only lane that fires without the recipient having done
// anything, so they get their own tighter ceiling underneath the daily cap.
export const SMS_LIVE_DAILY_CAP = 2;
// Never text between these local hours. A "someone is live" text at 3am is
// the fastest way to lose both the phone number and the person.
export const QUIET_START_HOUR = 22;  // 10pm
export const QUIET_END_HOUR = 8;     // 8am

export const SMS_KINDS = ['live', 'challenge', 'dm'];

// The exact disclosure a user agrees to. Stored verbatim on the consent
// record, because "they agreed" is worth nothing without "to this text".
// If you change the wording, previously stored records keep THEIR wording,
// which is the whole point of storing it.
export const SMS_CONSENT_TEXT =
  'I agree to receive text messages from Debatable about live rounds, ' +
  'challenges, and messages. Message frequency varies, at most a few per ' +
  'day. Message and data rates may apply. Reply STOP to stop, HELP for help.';

function phonesCol() { return getDb().collection('phone_numbers'); }

// E.164, the only format Twilio accepts and the only one we store.
// Deliberately strict: a number we cannot normalize is rejected at the door
// rather than stored in a shape that fails silently at send time.
export function normalizePhone(raw, defaultCountry = '1') {
  let s = String(raw || '').trim();
  if (!s) return '';
  const hadPlus = s.startsWith('+');
  s = s.replace(/[^0-9]/g, '');
  if (!s) return '';
  if (!hadPlus) {
    // A bare 10-digit number is assumed to be the default country (US/CA).
    // Anything else without a + is ambiguous and refused, because guessing
    // a country code can text a stranger on the other side of the world.
    if (s.length === 10) s = defaultCountry + s;
    else if (s.length === 11 && s.startsWith('1')) { /* already +1 */ }
    else return '';
  }
  if (s.length < 8 || s.length > 15) return '';
  return '+' + s;
}

// Last four digits, for showing a person which number is on file without
// echoing the whole number back to a page.
export function phoneLast4(e164) {
  const s = String(e164 || '');
  return s.length >= 4 ? s.slice(-4) : '';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Quiet hours are evaluated in the user's own offset, captured at opt-in.
// With no offset recorded we do NOT text during a window that is night
// anywhere plausible; erring toward silence is the safe direction.
function inQuietHours(utcOffsetMinutes) {
  const now = new Date();
  const off = Number.isFinite(utcOffsetMinutes) ? utcOffsetMinutes : 0;
  const localMs = now.getTime() + off * 60_000;
  const hour = new Date(localMs).getUTCHours();
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

// Read the stored record. Never exported raw to a client: it holds the full
// number.
export async function getPhoneRecord(uid) {
  if (!uid) return null;
  try {
    const snap = await phonesCol().doc(uid).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    return null;
  }
}

// The public shape: enough for a settings page to render truthfully, with
// no way to recover the number itself.
export function publicPhoneStatus(rec) {
  if (!rec) return { hasPhone: false, verified: false, configured: smsConfigured() };
  return {
    hasPhone: true,
    verified: !!rec.verified,
    optedOut: !!rec.optedOut,
    last4: phoneLast4(rec.e164),
    kinds: rec.kinds || {},
    configured: smsConfigured(),
  };
}

// Raw send. NOT exported: every caller must go through sendSmsToUser so the
// consent gate cannot be bypassed by a future call site that means well.
async function sendSms(to, body) {
  if (!smsConfigured()) return { sent: 0, configured: false };
  const params = new URLSearchParams();
  params.set('To', to);
  params.set('Body', String(body || '').slice(0, 480));
  if (MESSAGING_SID) params.set('MessagingServiceSid', MESSAGING_SID);
  else params.set('From', FROM_NUMBER);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(ACCOUNT_SID)}/Messages.json`;
  const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 21610 is Twilio's "recipient has opted out" code. Carriers keep
      // their own STOP list, so this can fire for a number our record still
      // thinks is subscribed; mirror it locally rather than retrying forever.
      const carrierOptOut = /21610/.test(text);
      console.warn('[sms] send failed', res.status, text.slice(0, 200));
      return { sent: 0, error: true, status: res.status, carrierOptOut };
    }
    return { sent: 1 };
  } catch (e) {
    console.warn('[sms] send threw', e && e.message);
    return { sent: 0, error: true };
  }
}

// Send the one-time verification code. This is the ONLY send that reaches a
// number before consent is confirmed, and it is what confirms it: the person
// typed the number, so a single code to that number is the round trip that
// proves they own it. It carries the STOP/HELP language regardless.
export async function sendVerificationSms(e164, code) {
  return sendSms(
    e164,
    `${code} is your Debatable verification code. Reply STOP to stop, HELP for help. Msg&data rates may apply.`
  );
}

// THE gate. Every product SMS goes through here.
//
// Refuses, in order: unconfigured account, no record, unverified number,
// opted out, kind switched off, daily cap, per-kind cap, quiet hours.
// Returns a reason rather than throwing, because a refused text must never
// break the thing that tried to send it.
export async function sendSmsToUser(uid, { kind, body, force = false } = {}) {
  if (!smsConfigured()) return { sent: 0, reason: 'unconfigured' };
  if (!uid || !body) return { sent: 0, reason: 'bad_args' };
  if (SMS_KINDS.indexOf(kind) < 0) return { sent: 0, reason: 'bad_kind' };

  const ref = phonesCol().doc(uid);
  const rec = await getPhoneRecord(uid);
  if (!rec) return { sent: 0, reason: 'no_number' };
  if (!rec.verified) return { sent: 0, reason: 'unverified' };
  if (rec.optedOut) return { sent: 0, reason: 'opted_out' };
  if (rec.kinds && rec.kinds[kind] === false) return { sent: 0, reason: 'kind_off' };

  const day = todayKey();
  const sameDay = rec.sentDay === day;
  const sentToday = sameDay ? (rec.sentToday || 0) : 0;
  const kindToday = sameDay ? ((rec.sentTodayByKind || {})[kind] || 0) : 0;
  if (sentToday >= SMS_DAILY_CAP) return { sent: 0, reason: 'daily_cap' };
  if (kind === 'live' && kindToday >= SMS_LIVE_DAILY_CAP) return { sent: 0, reason: 'kind_cap' };

  // `force` exists for genuinely time-critical, user-initiated things (a
  // challenge aimed at you by name). It skips quiet hours and nothing else:
  // consent, opt-out and the daily cap are never skippable.
  if (!force && inQuietHours(rec.utcOffsetMinutes)) return { sent: 0, reason: 'quiet_hours' };

  const r = await sendSms(rec.e164, body);

  if (r.carrierOptOut) {
    // The carrier knows something we did not. Record it so we stop trying.
    await ref.set({
      optedOut: true,
      optedOutAt: FieldValue.serverTimestamp(),
      optedOutVia: 'carrier',
    }, { merge: true }).catch(() => {});
    return { sent: 0, reason: 'opted_out' };
  }
  if (!r.sent) return { sent: 0, reason: 'send_failed' };

  await ref.set({
    lastSentAt: FieldValue.serverTimestamp(),
    sentDay: day,
    sentToday: sentToday + 1,
    sentTodayByKind: { ...(sameDay ? (rec.sentTodayByKind || {}) : {}), [kind]: kindToday + 1 },
  }, { merge: true }).catch(() => {});

  return { sent: 1 };
}

// Fan out to many users with a small concurrency cap. Mirrors
// sendToManyUsers in webpush.mjs, including that it never throws.
export async function sendSmsToManyUsers(uids, opts = {}, concurrency = 5) {
  if (!Array.isArray(uids) || !uids.length || !smsConfigured()) {
    return { recipients: 0, sent: 0, configured: smsConfigured() };
  }
  const queue = uids.slice();
  let sent = 0, recipients = 0;
  async function worker() {
    while (queue.length) {
      const uid = queue.shift();
      recipients++;
      try {
        const r = await sendSmsToUser(uid, opts);
        if (r && r.sent) sent += r.sent;
      } catch (e) { /* best effort, never throw */ }
    }
  }
  const n = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(Array.from({ length: n }, worker));
  return { recipients, sent, configured: true };
}

// Verify an inbound Twilio webhook. Twilio signs the full request URL plus
// the POST parameters sorted by key, HMAC-SHA1 with the auth token, base64.
// Without this check anyone who learns the URL can forge a STOP for someone
// else's number, or forge a START to re-subscribe a number that opted out.
export function verifyTwilioSignature(url, params, signature) {
  if (!AUTH_TOKEN || !signature) return false;
  const keys = Object.keys(params || {}).sort();
  let data = String(url || '');
  for (const k of keys) data += k + String(params[k]);
  const expected = createHmac('sha1', AUTH_TOKEN).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch (e) { return false; }
}

// Apply an inbound keyword. STOP and START are the two the carriers require
// to work; HELP is answered by Twilio's own advanced opt-out or by the
// caller. Matching is on the whole trimmed body, because "stop" inside a
// sentence is not an opt-out and treating it as one would silently mute
// someone who was just talking.
export function keywordFor(bodyText) {
  const s = String(bodyText || '').trim().toUpperCase();
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].indexOf(s) >= 0) return 'stop';
  if (['START', 'YES', 'UNSTOP'].indexOf(s) >= 0) return 'start';
  if (s === 'HELP' || s === 'INFO') return 'help';
  return '';
}

// Find the record for a number. Inbound webhooks know the phone, not the
// uid, so STOP has to resolve the other way.
export async function findByPhone(e164) {
  if (!e164) return null;
  try {
    const snap = await phonesCol().where('e164', '==', e164).limit(1).get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ref: d.ref, ...d.data() };
  } catch (e) {
    return null;
  }
}
