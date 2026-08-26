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

export const VOICE_USAGE_COLLECTION = 'voice_usage';

// Free voice rounds, by what kind of identity is asking. Both are env
// overridable so the allowance can be tuned without a deploy, which is
// the posture GUEST_FREE_ROUNDS already uses for the /spar trial.
//
// NAMED: 2 since 2026-06-27. Voice is the paid hook, so the free tier
// is a taste rather than a habit.
// ANON: 1. An anonymous uid is free and unlimited to mint, so this
// number is a courtesy to a real first-time visitor, not a security
// boundary. What bounds abuse is the per-IP layer in the caller.
export const FREE_VOICE_NAMED = Number(process.env.FREE_VOICE_ROUNDS ?? 2);
export const FREE_VOICE_ANON = Number(process.env.ANON_VOICE_ROUNDS ?? 1);

export function freeVoiceLimit(isNamed) {
  return isNamed ? FREE_VOICE_NAMED : FREE_VOICE_ANON;
}

function usageRef(db, uid) {
  return db.collection(VOICE_USAGE_COLLECTION).doc(uid);
}

/**
 * Voice rounds this uid has spent.
 *
 * Fails CLOSED at Infinity is wrong here and fails OPEN at 0 is wrong
 * too, so it does neither: an unreadable counter returns null and the
 * caller decides. realtime-session treats null as "let the round
 * happen" (a Firestore blip must not deny a paying-adjacent user) while
 * still logging it, which matches how the old inline read behaved.
 *
 * @returns {Promise<number|null>} rounds used, or null if unreadable
 */
export async function readVoiceUsage(db, uid, legacyProfileData) {
  if (!uid) return null;
  const legacy = Math.max(0, parseInt(legacyProfileData?.voiceSessionsUsed, 10) || 0);
  try {
    const snap = await usageRef(db, uid).get();
    const server = snap.exists ? Math.max(0, Number(snap.data()?.rounds || 0)) : 0;
    return Math.max(server, legacy);
  } catch (err) {
    console.warn('[voice-usage] read failed:', err?.message || err);
    return legacy || null;
  }
}

/**
 * Charge one voice round.
 *
 * AWAITED BY THE CALLER, deliberately. Lambda freezes the execution
 * context the moment the handler returns, so an unawaited write is not
 * deferred, it is abandoned — the lesson spar-pair.mjs learned in
 * production when markGuest silently never landed. A dropped charge
 * here is a free round on the most expensive surface we have.
 *
 * Called only AFTER a successful mint, so a failed mint never burns
 * someone's quota.
 */
export function chargeVoiceRound(db, uid, { anonymous = false, surface = '' } = {}) {
  return usageRef(db, uid).set({
    rounds: FieldValue.increment(1),
    anonymous: !!anonymous,
    lastRoundAt: FieldValue.serverTimestamp(),
    lastSurface: String(surface || '').slice(0, 40),
  }, { merge: true });
}

// Who bypasses the voice cap lives in lib/plans.mjs, not here: that
// file is PURE (no firebase-admin), which is what lets the pre-commit
// plan guard import it without credentials. This module does I/O, so
// anything the guard needs to assert has to live over there.
