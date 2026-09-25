/* One welcome per signup. The client trigger and recovery sweep share the
 * profile stamp and a server-only delivery record. Gmail is enabled explicitly
 * after OAuth setup; an uncertain dispatch is held for review, never replayed.
 */

import { FieldValue } from './firestore.mjs';
import { esc, sendEmail, toText, unsubUrl, isOptedOut, SITE_URL } from './email.mjs';

import { gmailConfig, sendGmailWelcome, welcomeMessageId } from './gmail-welcome.mjs';

// Accounts created before this never get the automatic welcome. The
// catch-up campaign (admin-signup-welcome.mjs) owns the older cohort.
export const WELCOME_SINCE_MS = Date.parse('2026-09-03T00:00:00Z');
export const WELCOME_DELAY_MS = 5 * 60_000;

export const STREAM = 'onboarding';
export const SUBJECT = 'welcome to debatable';
export const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeIaqv8NvUsUdZI8VWFya05cQFS_Q_1hhe13L4cafRBShMkow/viewform';
export const usesGmail = () => process.env.WELCOME_TRANSPORT === 'gmail';
export function welcomeReady() {
  return usesGmail()
    ? !!(gmailConfig() && process.env.EMAIL_UNSUB_SECRET && Number.isFinite(Date.parse(process.env.WELCOME_GMAIL_SINCE || '')))
    : !!process.env.RESEND_API_KEY;
}

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
export function welcomeRecipientEligibility(user, profile) {
  if (!user) return { ok: false, reason: 'no_user' };
  if (user.disabled) return { ok: false, reason: 'disabled' };
  const providers = (user.providerData || []).map(p => p && p.providerId).filter(Boolean);
  if (!providers.length || providers.every(p => p === 'anonymous')) return { ok: false, reason: 'anonymous' };
  const email = String(user.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, reason: 'no_email' };
  if (EXCLUDE_DOMAINS.has(email.split('@')[1])) return { ok: false, reason: 'excluded_domain' };
  if (user.emailVerified !== true) return { ok: false, reason: 'email_unverified' };
  if (profile && isOptedOut(profile, STREAM)) return { ok: false, reason: 'opted_out' };
  return { ok: true };
}

export function welcomeEligibility(user, profile, nowMs = Date.now()) {
  const recipient = welcomeRecipientEligibility(user, profile);
  if (!recipient.ok) return recipient;
  const created = user.metadata && user.metadata.creationTime ? Date.parse(user.metadata.creationTime) : NaN;
  if (!Number.isFinite(created)) return { ok: false, reason: 'no_created_at' };
  const since = usesGmail() ? Date.parse(process.env.WELCOME_GMAIL_SINCE || '') : WELCOME_SINCE_MS;
  if (!Number.isFinite(since)) return { ok: false, reason: 'gmail_start_not_configured' };
  if (created < since) return { ok: false, reason: 'before_launch' };
  if (created > nowMs + 5 * 60_000) return { ok: false, reason: 'created_in_future' };
  if (profile) {
    if (profile.personalGmailWelcomeSentAt) return { ok: false, reason: 'already_sent' };
    if (profile.signupWelcomeSentAt) return { ok: false, reason: 'already_sent' };
    if (profile.openAnnounceSentAt || profile.openRallySentAt) return { ok: false, reason: 'already_emailed' };
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

// These are coordinated meeting times, not a claim measured traffic is high.
export function renderWelcome({ firstName, uid }) {
  const link = unsubUrl(uid, STREAM);
  const paragraphs = [
    `Hey${firstName ? ' ' + firstName : ''},`,
    "Thanks for joining Debatable. I'm Aidan, the person building it.",
    "The biggest thing we need right now is more people online at the same time. We're getting people together every day at:",
    '9 pm Eastern time (New York)\n9 pm London time\n9 pm India time (IST)',
    "These are three separate sessions, each at 9 pm local time. Pick whichever works for you and give people a few minutes to arrive.",
    `Add a session to Google Calendar or Apple Calendar: ${SITE_URL}/clash-hours`,
    `Come back for a round: ${SITE_URL}/spar`,
    "If you have a friend who'd enjoy arguing something out, bring them along. Even one extra person makes it easier for someone else to find a round.",
    `I'd really like to know what you think. What worked, what broke, and what would make you come back? Here's the feedback form: ${FEEDBACK_URL}`,
    'You can also reply to this email. It comes straight to me.',
    'Aidan',
    'You received this because you signed up for Debatable. ' + (link ? `Unsubscribe: ${link}` : 'Reply to opt out.'),
  ];
  return paragraphs.map(p => '<p>' + esc(p).replaceAll('\n', '<br>') + '</p>').join('\n');
}

export async function sendWelcomeTo(db, user, { source = 'unknown', sender, now = Date.now } = {}) {
  if (!welcomeReady() && !sender) return { sent: false, reason: 'welcome_not_configured' };
  const gmail = usesGmail();
  const ref = db.collection('user_profiles').doc(user.uid);
  const delivery = db.collection('welcome_deliveries').doc(user.uid);
  const budget = db.collection('config').doc('welcome_gmail_budget');
  const cap = Math.min(400, Math.max(1, Number.parseInt(process.env.WELCOME_GMAIL_DAILY_CAP || '100', 10) || 100));
  let claim;
  try {
    claim = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const profile = snap.exists ? (snap.data() || {}) : null;
      const elig = welcomeEligibility(user, profile, now());
      if (!elig.ok) return { reason: elig.reason };
      if (profile?.personalGmailWelcomeClaimedAt) return { reason: 'delivery_needs_review' };
      const record = await tx.get(delivery);
      const state = record.exists ? record.data() : {};
      if (['dispatching', 'uncertain', 'sent'].includes(state.status)) return { reason: state.status === 'sent' ? 'already_sent' : 'delivery_needs_review' };
      const sendAfter = Date.parse(user.metadata.creationTime) + WELCOME_DELAY_MS;
      if (sendAfter > now()) {
        // Auth owns the signup time. Reloads and repeated triggers never reset
        // this deadline, and waiting consumes no Gmail sending capacity.
        if (state.status !== 'pending' || state.nextAttemptAt !== sendAfter) {
          tx.set(delivery, { status: 'pending', nextAttemptAt: sendAfter, source });
        }
        return { reason: 'queued', sendAfter };
      }
      if (state.nextAttemptAt > now()) return { reason: 'retry_later' };
      // Respect an in-flight send from the previous deployed implementation.
      const legacyClaim = profile?.signupWelcomeClaimedAt?.toMillis?.() || 0;
      if (legacyClaim && now() - legacyClaim < 10 * 60_000) return { reason: 'claimed' };
      if (gmail) {
        const budgetSnap = await tx.get(budget);
        const reservations = (budgetSnap.data()?.reservations || []).filter(t => t > now() - 86400_000);
        if (reservations.length >= cap) {
          tx.set(delivery, { status: 'pending', source,
            nextAttemptAt: Math.max(now() + 60_000, Math.min(...reservations) + 86400_000) });
          return { reason: 'daily_cap' };
        }
        tx.set(budget, { reservations: [...reservations, now()] });
      }
      // Dispatching is durable BEFORE the external call. A crash after acceptance
      // must not let the sweep resend. This is the submitted Message-ID only;
      // Gmail may replace it, so review also requires recipient/subject/time.
      tx.set(delivery, {
        status: 'dispatching', startedAt: now(), source,
        provider: gmail ? 'gmail' : 'resend', messageId: welcomeMessageId(user.uid),
      });
      tx.set(ref, { signupWelcomeClaimedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { profile, claimed: true };
    });
  } catch {
    console.error('[welcome-email] claim failed');
    return { sent: false, reason: 'claim_failed' };
  }
  if (!claim.claimed) return { sent: false, reason: claim.reason,
    ...(claim.sendAfter ? { sendAfter: claim.sendAfter } : {}) };

  let result;
  try {
    // Recheck opt-out after claiming, before handing anything to the provider.
    const fresh = await ref.get();
    if (!welcomeEligibility(user, fresh.exists ? fresh.data() : null, now()).ok) {
      await delivery.set({ status: 'suppressed' }, { merge: true });
      await ref.set({ signupWelcomeClaimedAt: FieldValue.delete() }, { merge: true });
      return { sent: false, reason: 'suppressed' };
    }
    const html = renderWelcome({ firstName: firstNameOf(user, claim.profile), uid: user.uid });
    const message = { to: user.email, subject: SUBJECT, html, text: toText(html), uid: user.uid,
      unsubscribe: unsubUrl(user.uid, STREAM), stream: STREAM, from: FROM, replyTo: REPLY_TO };
    result = await (sender || (gmail ? sendGmailWelcome : sendEmail))(message);
  } catch {
    result = { ok: false, reason: 'delivery_exception', ambiguous: true };
  }
  if (!result.ok) {
    // Resend's historical network error does not distinguish acceptance either.
    const uncertain = result.ambiguous || (!gmail && (String(result.reason).startsWith('fetch-failed') || result.status >= 500));
    try {
      await delivery.set({ status: uncertain ? 'uncertain' : 'retry', reason: result.reason || 'send_failed',
        nextAttemptAt: uncertain ? FieldValue.delete() : now() + (result.quotaExhausted ? 86400_000 : 30 * 60_000) }, { merge: true });
      if (!uncertain) await ref.set({ signupWelcomeClaimedAt: FieldValue.delete() }, { merge: true });
    } catch { console.error('[welcome-email] failed to save delivery failure; dispatch stays held'); }
    return { sent: false, reason: result.reason || 'send_failed', quotaExhausted: !!result.quotaExhausted,
      needsReview: !!uncertain };
  }
  try {
    await db.runTransaction(async tx => {
      tx.set(delivery, { status: 'sent', sentAt: now(), providerId: result.id || null }, { merge: true });
      tx.set(ref, { signupWelcomeSentAt: FieldValue.serverTimestamp(), signupWelcomeSource: source,
        signupWelcomeProvider: gmail ? 'gmail' : 'resend', signupWelcomeClaimedAt: FieldValue.delete() }, { merge: true });
    });
  } catch {
    console.error('[welcome-email] receipt persistence failed; dispatch stays held for review');
    return { sent: true, reason: 'stamp_failed', needsReview: true };
  }
  return { sent: true, reason: 'sent' };
}
