/* lib/welcome-email.mjs
 *
 * The welcome email every new account gets, and the one rule for who gets
 * it. Two entry points share this file so they cannot drift:
 *
 *   welcome-email.mjs             POST /api/welcome-email. The client calls
 *                                 it the moment sign-up completes, so the
 *                                 email lands while the tab is still open.
 *   scheduled-welcome-sweep.mjs   every 30 minutes. Catches every account
 *                                 the client path missed (a native sign-in,
 *                                 a tournament page's own popup, a closed
 *                                 tab, a failed fetch).
 *
 * Built 2026-09-03 (Aidan: "send an email congratulating and introducing
 * debatable when people sign up so it lands in their main. explain the
 * story, the vision, need for contributions").
 *
 * LANDING IN PRIMARY is the design constraint, and every choice below
 * serves it: one recipient per send, a verified sender on the domain the
 * person just signed up on, a plain text/plain part, no images, no
 * buttons, no tracking pixel, few links, and a Reply-To that reaches a
 * human. Gmail sorts on shape and on behaviour, and a reply is the
 * strongest signal there is, which is why the email asks for one.
 *
 * ONE SEND PER ACCOUNT, EVER. The stamp is user_profiles.signupWelcomeSentAt,
 * the same field admin-signup-welcome.mjs (the catch-up campaign for the
 * pre-2026-09-03 cohort) reads as "already emailed", so the two can never
 * double-mail. A Firestore transaction claims the send before Resend is
 * called, which is what stops the client path and the sweep racing each
 * other onto one inbox.
 *
 * ELIGIBILITY is a pure function (welcomeEligibility) so the guard can
 * test it without Auth or Firestore: created on or after the launch date,
 * a real provider (never anonymous), an email on the account, and not a
 * relay or test address. Phone accounts have no email and are excluded
 * by that rule rather than by name.
 */

import { FieldValue } from './firestore.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL } from './email.mjs';

// Accounts created before this never get the automatic welcome. The
// catch-up campaign (admin-signup-welcome.mjs) owns the older cohort.
export const WELCOME_SINCE_MS = Date.parse('2026-09-03T00:00:00Z');

export const STREAM = 'onboarding';
export const SUBJECT = 'welcome to debatable, and why it exists';

// From: the domain the person just signed up on. itsdebatable.com has
// been a verified Resend sender since 2026-08-19 and the sign-in link
// ships from it and lands in INBOX (measured 2026-08-26). Never point
// this at a domain Resend has not verified: an unverified From 403s
// silently, which is how Spar Night mailed nobody for two weeks.
export const FROM = process.env.WELCOME_FROM || 'Debatable <hello@itsdebatable.com>';
// Reply-To is the founder's real inbox, the standing contact-email
// exception (2026-07-04). The email promises every reply gets read, and
// hello@itsdebatable.com is not a mailbox anyone reads.
export const REPLY_TO = process.env.WELCOME_REPLY_TO || 'aidandavidhollinger@gmail.com';

const EXCLUDE_DOMAINS = new Set([
  'privaterelay.appleid.com',   // Apple relay: bounces, sender not registered with Apple
  'itsdebatable.com',           // dryrun.* test accounts
  'sharklasers.com', 'ebflyai.com', 'kolsea.com', 'koboywin.com',
  'jbsze.com', 'nanana.uk', 'edumail.edu.pl',
]);

/**
 * Pure. user = { email, providerData:[{providerId}], metadata:{creationTime} }
 * (the shape lib/auth-admin.mjs returns). profile = user_profiles doc data
 * or null. Returns { ok:true } or { ok:false, reason }.
 */
export function welcomeEligibility(user, profile, nowMs = Date.now()) {
  if (!user) return { ok: false, reason: 'no_user' };
  const providers = (user.providerData || []).map(p => p && p.providerId).filter(Boolean);
  if (!providers.length || providers.every(p => p === 'anonymous')) return { ok: false, reason: 'anonymous' };
  const email = String(user.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, reason: 'no_email' };
  if (EXCLUDE_DOMAINS.has(email.split('@')[1])) return { ok: false, reason: 'excluded_domain' };
  const created = user.metadata && user.metadata.creationTime ? Date.parse(user.metadata.creationTime) : NaN;
  if (!Number.isFinite(created)) return { ok: false, reason: 'no_created_at' };
  if (created < WELCOME_SINCE_MS) return { ok: false, reason: 'before_launch' };
  if (created > nowMs + 5 * 60_000) return { ok: false, reason: 'created_in_future' };
  if (profile) {
    if (profile.signupWelcomeSentAt) return { ok: false, reason: 'already_sent' };
    if (profile.openAnnounceSentAt || profile.openRallySentAt) return { ok: false, reason: 'already_emailed' };
    if (isOptedOut(profile, STREAM)) return { ok: false, reason: 'opted_out' };
  }
  return { ok: true };
}

export function firstNameOf(user, profile) {
  const raw = String((profile && profile.displayName) || (user && user.displayName) || '').trim();
  const first = raw.split(/\s+/)[0] || '';
  // A generated alias or an email local part is not a name to greet with.
  if (!first || /[@\d_]/.test(first) || first.length > 24) return '';
  return first;
}

// ── Template ─────────────────────────────────────────────────────────────
// Voice rules that bind here: no em-dashes, no preface, no banned phrases,
// no traction numbers, no beta-free claims (billing is live), no founder
// name or credential (anonymous since 2026-08-22), "people" not "debaters"
// for the crowd. Plain paragraphs and text links only: a button, an image
// or a pixel is what tips Gmail toward Promotions.
export function renderWelcome({ firstName, uid }) {
  const p = (inner) => `<p style="font-size:15.5px;line-height:1.6;margin:0 0 16px">${inner}</p>`;
  const a = (href, text) => `<a href="${href}" style="color:#dc2626">${text}</a>`;
  return `
<div style="max-width:560px;margin:0 auto;padding:28px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#26262b">
  ${brandHeader()}
  ${p(`Hey${firstName ? ' ' + esc(firstName) : ''},`)}

  ${p(`You are in. Welcome to Debatable.`)}

  ${p(`Here is what you joined: a place to argue with a real person, live, on one question, and get a written decision on who won and why. A round takes about ten minutes.`)}

  ${p(`<strong>Why it exists.</strong> Debate has always been rationed by judges. A round only counts if someone sits through it and writes out a decision, and there have never been enough of those people, so most arguments never get judged at all. We built this from inside competitive debate, and the shortage we kept running into was not people who wanted to argue. It was verdicts. A judge that reads the whole round and shows its reasoning changes that math. Anyone can get a decision, on any question, any time.`)}

  ${p(`<strong>Where it is going.</strong> We want Debatable to be where people go to argue something out in public. A ladder you climb round by round. Replays and clips. An audience that watches and calls it. Eventually, rounds against the people you already watch. A reputation earned across many rounds, not one weekend's opinion.`)}

  ${p(`<strong>What we need from you.</strong> Three things, and they are all small.`)}

  ${p(`1. Argue a round. Even one. Everything on the site gets better when rounds happen.`)}
  ${p(`2. Reply to this email with what broke or what confused you. Replies go to a person, not a queue, and every one gets read. What you send decides what gets built next.`)}
  ${p(`3. Bring one person. A round needs two, and the queue is only as alive as the people in it.`)}

  ${p(`If you want to back the build directly, the Individual plan is $10 a year at ${a(`${SITE_URL}/pricing`, 'itsdebatable.com/pricing')}. No pressure. Rounds and replies help more.`)}

  ${p(`You are early, and it is on the record. We keep a note of who was here first, so when this grows into something bigger, your part in that history comes with it.`)}

  ${p(`Start here: ${a(`${SITE_URL}/spar`, 'a live round on video')}, or ${a(`${SITE_URL}/practice`, 'an AI opponent right now')} if nobody is waiting.`)}

  ${p(`See you in a round.<br>Debatable`)}

  ${renderFooter({
    uid,
    stream: STREAM,
    reason: 'You are getting this because you just made a Debatable account.',
  })}
</div>`;
}

/**
 * Claim, send, stamp. Returns { sent:boolean, reason }.
 *
 * The claim is a transaction on the profile doc: read, refuse if any stamp
 * is present, write signupWelcomeClaimedAt. Only the caller that wins the
 * claim calls Resend. A failed send releases the claim so the sweep can
 * retry; a successful one writes signupWelcomeSentAt, which is the stamp
 * every reader tests.
 */
export async function sendWelcomeTo(db, user, { source = 'unknown' } = {}) {
  const ref = db.collection('user_profiles').doc(user.uid);
  let profile = null;
  let claimed = false;
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      profile = snap.exists ? (snap.data() || {}) : null;
      const elig = welcomeEligibility(user, profile);
      if (!elig.ok) { claimed = elig.reason; return; }
      // A claim younger than 10 minutes belongs to a send in flight; older
      // than that it is a crashed lambda and the sweep may take it over.
      const c = profile && profile.signupWelcomeClaimedAt;
      const cMs = c && typeof c.toMillis === 'function' ? c.toMillis() : 0;
      if (cMs && Date.now() - cMs < 10 * 60_000) { claimed = 'claimed'; return; }
      tx.set(ref, { signupWelcomeClaimedAt: FieldValue.serverTimestamp() }, { merge: true });
      claimed = true;
    });
  } catch (err) {
    console.error('[welcome-email] claim failed for', user.uid, err.message);
    return { sent: false, reason: 'claim_failed' };
  }
  if (claimed !== true) return { sent: false, reason: claimed };

  const res = await sendEmail({
    to: user.email,
    subject: SUBJECT,
    html: renderWelcome({ firstName: firstNameOf(user, profile), uid: user.uid }),
    uid: user.uid,
    // 'welcome' is deliberately not one of the bulk streams in
    // lib/email.mjs, so no List-Unsubscribe headers ride along: this is a
    // one-to-one note, and the footer carries a working unsubscribe link
    // on the onboarding stream. Opt-out is still honoured above.
    stream: 'welcome',
    from: FROM,
    replyTo: REPLY_TO,
  });
  if (!res.ok) {
    console.error('[welcome-email] send failed for', user.uid, res.reason, res.message || '');
    try { await ref.set({ signupWelcomeClaimedAt: FieldValue.delete() }, { merge: true }); } catch {}
    return { sent: false, reason: res.reason || 'send_failed', quotaExhausted: !!res.quotaExhausted };
  }
  try {
    await ref.set({
      signupWelcomeSentAt: FieldValue.serverTimestamp(),
      signupWelcomeSource: source,
      signupWelcomeClaimedAt: FieldValue.delete(),
    }, { merge: true });
  } catch (err) {
    // The email went out. A missing stamp risks a second copy from the
    // sweep, so it is logged loudly rather than swallowed.
    console.error('[welcome-email] STAMP FAILED after send for', user.uid, err.message);
    return { sent: true, reason: 'stamp_failed' };
  }
  return { sent: true, reason: 'sent' };
}
