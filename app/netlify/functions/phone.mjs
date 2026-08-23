// /api/phone — put a phone number on an account, prove it, and control
// what it is allowed to be texted about.
//
// GET  ?              → status for the caller (never the number itself)
// POST { action:'start',   phone, consent, utcOffsetMinutes }
// POST { action:'confirm', code }
// POST { action:'update',  kinds:{live,challenge,dm} }
// POST { action:'remove' }
//
// WHY NAMED ACCOUNTS ONLY. Anonymous Firebase uids are free and unlimited to
// mint, so an anonymous lane here is an unbounded way to make us send texts
// to arbitrary numbers, which is both a bill and a way to harass someone.
// It is also pointless for the user: nobody can sign back into an anonymous
// account, so the number would be attached to something they lose on the
// next cache clear.
//
// WHY A CODE ROUND TRIP. Typing a number proves nothing about owning it.
// Without the round trip, anyone could put a stranger's number on their own
// account and have us text that stranger every time somebody goes live. The
// code is the only thing standing between this feature and being a free
// anonymous texting service pointed at whoever you like.
import { verifyIdToken, extractBearerToken, isNamedAccount } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { checkLayers, callerIp } from './lib/rate-limit.mjs';
import {
  smsConfigured, normalizePhone, sendVerificationSms, getPhoneRecord,
  publicPhoneStatus, findByPhone, SMS_KINDS, SMS_CONSENT_TEXT,
} from './lib/sms.mjs';
import { createHash, randomInt, timingSafeEqual } from 'crypto';

const CODE_TTL_MS = 10 * 60 * 1000;   // a code is good for ten minutes
const MAX_ATTEMPTS = 5;               // then the code is burned, not the account

// Sending a verification text costs money and reaches a real handset, so it
// is metered harder than a normal write. Per-uid AND per-IP, because one
// account rotating numbers and one attacker rotating accounts are different
// abuse shapes and each needs its own ceiling.
const UID_LAYERS = [
  { windowMs: 60 * 60 * 1000, max: 3, label: 'hour' },
  { windowMs: 24 * 60 * 60 * 1000, max: 6, label: 'day' },
];
const IP_LAYERS = [
  { windowMs: 60 * 60 * 1000, max: 8, label: 'hour' },
  { windowMs: 24 * 60 * 60 * 1000, max: 20, label: 'day' },
];

function hashCode(code, salt) {
  return createHash('sha256').update(String(salt) + ':' + String(code)).digest('hex');
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf-8');
  const bb = Buffer.from(String(b || ''), 'utf-8');
  if (ba.length !== bb.length) return false;
  try { return timingSafeEqual(ba, bb); } catch (e) { return false; }
}

function cleanKinds(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of SMS_KINDS) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  return out;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse('Method not allowed', 405, request);
  }

  const token = extractBearerToken(request);
  if (!token) return errorResponse('Sign in to manage text alerts.', 401, request);
  let decoded;
  try { decoded = await verifyIdToken(token); } catch (e) {
    return errorResponse('Invalid token', 401, request);
  }
  if (!isNamedAccount(decoded)) {
    return jsonResponse({
      error: 'Text alerts need a Google or email account.',
      code: 'NAMED_ACCOUNT_REQUIRED',
    }, 403, request);
  }
  const uid = decoded.sub;
  const db = getDb();
  const ref = db.collection('phone_numbers').doc(uid);

  if (request.method === 'GET') {
    const rec = await getPhoneRecord(uid);
    return jsonResponse({
      ...publicPhoneStatus(rec),
      pending: !!(rec && rec.pendingAt && !rec.verified),
      consentText: SMS_CONSENT_TEXT,
    }, 200, request);
  }

  let body;
  try { body = await request.json(); } catch (e) { return errorResponse('Bad JSON', 400, request); }
  const action = String((body && body.action) || '');

  // ── start: take a number, send it a code ──────────────────────────
  if (action === 'start') {
    // Refuse before spending anything if the account cannot send at all.
    // Better an honest "not available yet" than a code that never arrives.
    if (!smsConfigured()) {
      return jsonResponse({ error: 'Text alerts are not switched on yet.', code: 'SMS_UNCONFIGURED' }, 503, request);
    }
    // Consent is a hard precondition, not a checkbox we record for show:
    // without it we have no basis to text this number at all.
    if (body.consent !== true) {
      return jsonResponse({ error: 'Consent is required.', code: 'CONSENT_REQUIRED' }, 400, request);
    }
    const e164 = normalizePhone(body.phone);
    if (!e164) {
      return jsonResponse({
        error: 'That does not look like a phone number we can text. Include the country code, like +1 555 123 4567.',
        code: 'BAD_PHONE',
      }, 400, request);
    }

    const uidGate = await checkLayers('phone', 'u:' + uid, UID_LAYERS);
    if (uidGate.limited) {
      return jsonResponse({ error: 'Too many codes requested. Try again later.', code: 'RATE_LIMITED' }, 429, request);
    }
    const ipGate = await checkLayers('phone', 'i:' + callerIp(request), IP_LAYERS);
    if (ipGate.limited) {
      return jsonResponse({ error: 'Too many codes requested. Try again later.', code: 'RATE_LIMITED' }, 429, request);
    }

    // One number, one account. Without this the same handset could be
    // attached to several accounts, which turns the daily cap into a
    // suggestion and makes a STOP ambiguous about who it silenced.
    const existing = await findByPhone(e164);
    if (existing && existing.id !== uid && existing.verified) {
      return jsonResponse({
        error: 'That number is already on another account.',
        code: 'PHONE_TAKEN',
      }, 409, request);
    }

    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const salt = String(randomInt(0, 1e9)) + ':' + uid;

    // Written BEFORE the send. If the send fails the user simply asks for
    // another code; if the write failed after a successful send, they would
    // hold a code that can never be redeemed.
    await ref.set({
      uid,
      e164,
      verified: false,
      optedOut: false,
      // A re-start on a number that already opted out clears the flag,
      // because asking for a code IS a fresh opt-in by the number's owner.
      optedOutAt: FieldValue.delete(),
      codeHash: hashCode(code, salt),
      codeSalt: salt,
      codeExpiresAt: Date.now() + CODE_TTL_MS,
      codeAttempts: 0,
      pendingAt: FieldValue.serverTimestamp(),
      utcOffsetMinutes: Number.isFinite(body.utcOffsetMinutes)
        ? Math.max(-840, Math.min(840, Math.round(body.utcOffsetMinutes))) : null,
      // The consent record. Stored with the exact wording shown, because
      // "they consented" is not worth anything without "to these words".
      consentAt: FieldValue.serverTimestamp(),
      consentText: SMS_CONSENT_TEXT,
      consentIp: callerIp(request),
      kinds: (() => {
        const k = cleanKinds(body.kinds);
        return { live: k.live !== false, challenge: k.challenge !== false, dm: k.dm !== false };
      })(),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const r = await sendVerificationSms(e164, code);
    if (!r.sent) {
      return jsonResponse({ error: 'Could not send the code to that number.', code: 'SEND_FAILED' }, 502, request);
    }
    return jsonResponse({ ok: true, pending: true, last4: e164.slice(-4) }, 200, request);
  }

  // ── confirm: redeem the code ──────────────────────────────────────
  if (action === 'confirm') {
    const rec = await getPhoneRecord(uid);
    if (!rec || !rec.codeHash) {
      return jsonResponse({ error: 'Ask for a code first.', code: 'NO_PENDING' }, 400, request);
    }
    if (rec.verified) return jsonResponse({ ok: true, verified: true }, 200, request);
    if ((rec.codeExpiresAt || 0) < Date.now()) {
      return jsonResponse({ error: 'That code expired. Ask for a new one.', code: 'CODE_EXPIRED' }, 400, request);
    }
    if ((rec.codeAttempts || 0) >= MAX_ATTEMPTS) {
      return jsonResponse({ error: 'Too many wrong codes. Ask for a new one.', code: 'CODE_BURNED' }, 429, request);
    }

    const given = String((body && body.code) || '').replace(/\D/g, '');
    const ok = given.length === 6 && safeEqualHex(hashCode(given, rec.codeSalt), rec.codeHash);
    if (!ok) {
      await ref.set({ codeAttempts: (rec.codeAttempts || 0) + 1 }, { merge: true });
      return jsonResponse({ error: 'That code is not right.', code: 'BAD_CODE' }, 400, request);
    }

    // Verified. The code material is deleted rather than kept: it has done
    // its job and a stored secret with no remaining purpose is only a risk.
    await ref.set({
      verified: true,
      verifiedAt: FieldValue.serverTimestamp(),
      codeHash: FieldValue.delete(),
      codeSalt: FieldValue.delete(),
      codeExpiresAt: FieldValue.delete(),
      codeAttempts: FieldValue.delete(),
      pendingAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const fresh = await getPhoneRecord(uid);
    return jsonResponse({ ok: true, verified: true, ...publicPhoneStatus(fresh) }, 200, request);
  }

  // ── update: per-kind switches ─────────────────────────────────────
  if (action === 'update') {
    const rec = await getPhoneRecord(uid);
    if (!rec) return jsonResponse({ error: 'No number on file.', code: 'NO_NUMBER' }, 400, request);
    const kinds = cleanKinds(body.kinds);
    if (!Object.keys(kinds).length) {
      return jsonResponse({ error: 'Nothing to update.', code: 'NOOP' }, 400, request);
    }
    await ref.set({
      kinds: { ...(rec.kinds || {}), ...kinds },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    const fresh = await getPhoneRecord(uid);
    return jsonResponse({ ok: true, ...publicPhoneStatus(fresh) }, 200, request);
  }

  // ── remove: take the number off entirely ──────────────────────────
  // A real delete, not an opt-out flag. Someone asking us to forget their
  // phone number should have it forgotten; the STOP path keeps a tombstone
  // because a carrier opt-out has to survive, but a deliberate removal from
  // the account holder is a different act.
  if (action === 'remove') {
    await ref.delete().catch(() => {});
    return jsonResponse({ ok: true, hasPhone: false, verified: false }, 200, request);
  }

  return errorResponse('Unknown action', 400, request);
};

export const config = { path: '/api/phone' };
