/* lib/founding-comp.mjs
 *
 * The founding-cohort comp for The Debatable Open (2026-08-11).
 *
 * Everyone who held a Debatable account before the cutoff enters the
 * prize bracket without paying the $5 entry. This is not a new policy, it is
 * the fee waiver the rules already promise ("the fee is waived for
 * anyone who asks, on identical terms") granted automatically to a
 * bounded, verifiable cohort instead of over email one at a time.
 *
 * What it deliberately does NOT do:
 *   - It does not resurrect the self-serve waiver route retired in
 *     "keep free tournament entries out of cash prizes". A plain free
 *     entry is still cash-ineligible. Eligibility still comes from one
 *     place, `tournaments/{tid}/payments/{uid}`, written by the server.
 *   - It does not touch `prizePoolCents` or `paidEntries`. A comp
 *     contributes no money and must not read as if it did; comps are
 *     counted separately on `compedEntries` so the pot stays honest.
 *   - It does not skip the 18+ attestation. A comped entry is
 *     prize-eligible, cash is 18+, so the same box is ticked.
 *
 * Qualification is the Firebase Auth account creation time, not the
 * user_profiles doc: sign-in writes to Auth and nothing mirrors the
 * timestamp into profiles, so a profiles-based check would silently
 * disqualify almost everyone (the same trap scheduled-spar-night hit
 * with emails on 2026-07-22).
 */

import { FieldValue } from './firestore.mjs';
import { getAuthUserByUid } from './auth-admin.mjs';

// Accounts created at or before this instant qualify.
//
// Moved 2026-08-19 (fourth move, same day as the third) to 1:00 PM
// Eastern that day, on Aidan's call: "free entry to any currently
// existing accounts, anyone new is subject to pay". The Open had 7 real
// entrants ten days out, every one of them comped and none paid, so the
// binding constraint is field size, not fee revenue.
//
// The third move's reasoning still holds and this does not undo it. What
// it fixed was a cutoff sitting in the FUTURE: at "end of Aug 19" every
// stranger arriving from the push that day landed inside the window, so
// the "$5 to enter" headline was false for the audience it was written
// for and the campaign had an invisible knife-edge at midnight. This
// cutoff is in the PAST at the moment it ships. Everyone who already
// held an account is in, including the twelve who signed up earlier
// today, and every arrival from here meets the $5 door. There is no
// window left open for a new account to walk through.
//
// A same-day cutoff has to state its hour or the copy lies to anyone who
// signs up that evening, so the label carries the time and the rules
// pages say it in full.
//
// The ask-and-it-is-waived route in the rules is untouched. That is the
// no-purchase-necessary path and it must never depend on a date.
export const FOUNDING_CUTOFF_MS = Date.parse('2026-08-19T13:00:00-04:00');
// Human label for copy. One constant so the page, the email and the
// rules cannot drift apart from the code that enforces it. Carries the
// hour because the cutoff falls inside a day people are still signing
// up on.
export const FOUNDING_CUTOFF_LABEL = '1:00 PM Eastern on Wednesday, August 19';

export function qualifiesByCreation(createdMs) {
  return Number.isFinite(createdMs) && createdMs > 0 && createdMs <= FOUNDING_CUTOFF_MS;
}

/* Account creation time in ms, or null when Auth cannot answer.
 * Null is a REFUSAL, never a pass: an unverifiable account does not get
 * comped, it gets the ordinary two doors. */
export async function accountCreatedMs(uid) {
  try {
    const user = await getAuthUserByUid(uid);
    const iso = user?.metadata?.creationTime;
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
  } catch (err) {
    console.warn('founding-comp: auth lookup failed:', err.message);
    return null;
  }
}

/* Grant the comp. Writes the SAME eligibility record a Stripe payment
 * writes, so every prize-eligibility read keeps working and there is one
 * source of truth about who plays for the cash.
 *
 * Idempotent: a second call on an already-eligible entry is a no-op, and
 * a comp never overwrites a real payment (someone who paid before the
 * comp existed keeps their paid record, and the refund is a human call).
 *
 * Returns { ok, status, reason } — reason is for the caller's message,
 * not for the participant's eyes. */
export async function grantFoundingComp(db, tid, uid, { createdMs, ageAttested } = {}) {
  if (!tid || !uid) return { ok: false, reason: 'missing-ids' };
  if (ageAttested !== true) return { ok: false, reason: 'age-not-attested' };
  if (!qualifiesByCreation(createdMs)) return { ok: false, reason: 'not-founding' };

  const tRef = db.collection('tournaments').doc(tid);
  const payRef = tRef.collection('payments').doc(uid);
  const existing = await payRef.get();
  if (existing.exists) {
    const status = existing.data()?.status || '';
    if (status === 'paid') return { ok: true, status: 'paid', already: true };
    if (status === 'comp') return { ok: true, status: 'comp', already: true };
  }

  await payRef.set({
    uid,
    status: 'comp',
    compReason: 'founding_cohort',
    // Zero, explicitly. The field exists on every payment record and a
    // reader summing it must see this entry contribute nothing.
    amountCents: 0,
    currency: 'usd',
    ageAttested: true,
    accountCreatedAtMs: createdMs,
    foundingCutoffMs: FOUNDING_CUTOFF_MS,
    payout: { status: 'none' },
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // Counted apart from paidEntries. prizePoolCents is untouched.
  await tRef.set({ compedEntries: FieldValue.increment(1) }, { merge: true }).catch(() => {});

  // Stamp the engine entry so the tab can show eligibility without a
  // second lookup. `paidEntry` stays false because no money moved;
  // `prizeEligible` is the field that answers "can cash reach this
  // entry", and it is true for both doors that qualify.
  try {
    const entry = await tRef.collection('entries')
      .where('members', 'array-contains', uid).limit(1).get();
    if (!entry.empty) {
      await entry.docs[0].ref.update({ prizeEligible: true, entryKind: 'founding' });
    }
  } catch (err) {
    console.warn('founding-comp: entry stamp failed:', err.message);
  }

  return { ok: true, status: 'comp' };
}
