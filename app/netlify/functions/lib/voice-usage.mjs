// ─────────────────────────────────────────────────────────────
// lib/voice-usage.mjs — how many voice rounds a caller has spent,
// recorded where the caller cannot reach it.
//
// WHY THIS FILE EXISTS. The voice cap has been described in
// realtime-session.mjs as "the real enforcement; the client gate is
// UX-only" since 2026-06-27. It was not enforcement. The counter lived
// at user_profiles/{uid}.voiceSessionsUsed, and firestore.rules says:
//
//     match /user_profiles/{uid} { allow read, write: if isOwner(uid); }
//
// so the person being metered owned the meter. One set() with
// { voiceSessionsUsed: 0 } from the browser console refilled the free
// tier, forever, on the single most expensive thing we run (the
// 2026-06-27 unit-economics audit put voice at ~80% of per-user
// variable cost). Minting a fresh anonymous uid did the same thing
// without even needing the console.
//
// This is the exact failure guest_rounds/ was created for on
// 2026-08-19, and its comment already stated the rule: "A client that
// could increment its own counter could also reset it." Voice simply
// never got the same treatment. voice_usage/{uid} is admin-SDK-write
// only; the client may read its own row so the page can say how many
// rounds are left honestly, which is nothing it could not already
// count for itself.
//
// MIGRATION. Existing users carry history in the legacy profile field,
// so a read takes the MAX of the two. Anyone who had already zeroed
// their profile field stays zeroed (there is no record left to
// recover), but from the first charge onward the number lives somewhere
// they cannot write. New charges go only to voice_usage; the legacy
// field is read, never written, and can be dropped once no row depends
// on it.
//
// SHARED BY three minters that all spend OpenAI Realtime money against
// one allowance: realtime-session.mjs, coach-session.mjs, and
// room-judge-session.mjs. They used to each hand-roll the same read and
// the same increment against the same forgeable field.
// ─────────────────────────────────────────────────────────────

import { FieldValue } from './firestore.mjs';
import {
  budgetFor, evaluate, applyMint, applyEnd, minutesUsed, settleOpen,
  ANON_VOICE_MINUTES, FREE_VOICE_MINUTES, PLAN_VOICE_MINUTES_MONTH, SESSION_RESERVE_MIN,
} from './voice-minutes.mjs';

// ─────────────────────────────────────────────────────────────
// 2026-09-03: the unit is MINUTES, not rounds, and a paid plan gets a
// monthly budget rather than a bypass. The model is pure in
// lib/voice-minutes.mjs (read its header); this file is the I/O around it.
// Every write is a transaction over voice_usage/{uid}, admin-SDK only,
// so the open-session record and the settlement it implies are as
// unforgeable as the counter was.
// ─────────────────────────────────────────────────────────────

export const VOICE_USAGE_COLLECTION = 'voice_usage';
export { ANON_VOICE_MINUTES, FREE_VOICE_MINUTES, PLAN_VOICE_MINUTES_MONTH, SESSION_RESERVE_MIN };
// Kept under the old names so the three minters' copy keeps reading:
// these are MINUTES now.
export const FREE_VOICE_NAMED = FREE_VOICE_MINUTES;
export const FREE_VOICE_ANON = ANON_VOICE_MINUTES;
export function freeVoiceLimit(isNamed) { return isNamed ? FREE_VOICE_NAMED : FREE_VOICE_ANON; }

function usageRef(db, uid) { return db.collection(VOICE_USAGE_COLLECTION).doc(uid); }

function withLegacy(doc, legacyProfileData) {
  const d = { ...(doc || {}) };
  const legacy = Math.max(0, parseInt(legacyProfileData?.voiceSessionsUsed, 10) || 0);
  if (legacy > (Number(d.rounds) || 0)) d.legacyRounds = legacy;
  return d;
}

/**
 * The gate, read-only. Settles an orphan in memory to decide, and the
 * next write (mint or end) settles it for real.
 * @returns {Promise<{allowed:boolean, used:number, remaining:number, reserve:number, budget:{kind,minutes}}|null>} null if unreadable
 */
export async function voiceGate(db, uid, { named = false, hasPlan = false, legacyProfileData = null, nowMs = Date.now() } = {}) {
  if (!uid) return null;
  const budget = budgetFor({ named, hasPlan });
  try {
    const snap = await usageRef(db, uid).get();
    const doc = withLegacy(snap.exists ? snap.data() : {}, legacyProfileData);
    const ev = evaluate(doc, budget, nowMs);
    return { allowed: ev.allowed, used: ev.used, remaining: ev.remaining, reserve: ev.reserve, budget };
  } catch (err) {
    console.warn('[voice-usage] gate read failed:', err?.message || err);
    return null;
  }
}

/** Legacy reader: minutes used against the FREE lifetime budget. Prefer voiceGate(). */
export async function readVoiceUsage(db, uid, legacyProfileData) {
  const g = await voiceGate(db, uid, { named: true, legacyProfileData });
  return g ? g.used : null;
}

/**
 * Open a session: settle any orphan, charge one minute, record the
 * reserve and the server-stamped start. AWAITED by callers (Lambda
 * freezes the context on return; an unawaited write is abandoned).
 * Called only AFTER a successful mint, so a failed mint costs nothing.
 */
export async function openVoiceSession(db, uid, { named = false, hasPlan = false, sessionId = '', surface = '', anonymous = false, reserve, legacyProfileData = null, nowMs = Date.now() } = {}) {
  const ref = usageRef(db, uid);
  const budget = budgetFor({ named, hasPlan });
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const doc = withLegacy(snap.exists ? snap.data() : {}, legacyProfileData);
    const out = applyMint(doc, budget, nowMs, sessionId, { surface, anonymous, reserve });
    const write = { ...out.doc, updatedAt: FieldValue.serverTimestamp() };
    delete write.legacyRounds;
    tx.set(ref, write, { merge: false });
    return { reserve: out.reserve, used: out.used, remaining: out.remaining, budget };
  });
}

/** The end call. Settles by server time; a stale id is a no-op. */
export async function endVoiceSession(db, uid, sessionId, nowMs = Date.now()) {
  const ref = usageRef(db, uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { matched: false, charged: 0 };
    const out = applyEnd(snap.data(), sessionId, nowMs);
    if (!out.matched) return { matched: false, charged: 0 };
    tx.set(ref, { ...out.doc, updatedAt: FieldValue.serverTimestamp() }, { merge: false });
    return { matched: true, charged: out.charged };
  });
}

/** Legacy name: opens a session at the default reserve. Prefer openVoiceSession(). */
export function chargeVoiceRound(db, uid, { anonymous = false, surface = '', named = !anonymous, hasPlan = false, sessionId = '' } = {}) {
  return openVoiceSession(db, uid, { named, hasPlan, sessionId: sessionId || (surface + '_' + Date.now()), surface, anonymous });
}

// Who gets the monthly budget lives in lib/plans.mjs (planBypassesVoiceCap),
// which is PURE so the pre-commit plan guard can import it.
