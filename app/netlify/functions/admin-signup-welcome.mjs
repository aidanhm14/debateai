/* admin-signup-welcome.mjs  ·  POST /api/admin/signup-welcome
 *
 * The catch-up welcome for everyone who signed up and has never been
 * mailed: no openAnnounceSentAt (2026-08-11 campaign) and no
 * openRallySentAt (2026-08-22 campaign). Mostly the post-Aug-22 cohort
 * that the sign-in wall brought in. One short activation email: what
 * the product is, one Start-a-round ask, reply-for-feedback into the
 * founder's inbox, the early-member note.
 *
 * Third campaign, so it carries its OWN stamp (signupWelcomeSentAt),
 * per the standing rule in soul.md. The two Open stamps are read as
 * "already emailed" and left untouched.
 *
 * Same posture as admin-open-rally.mjs:
 *   1. POST {}                -> DRY RUN. Counts, samples, stamps nobody.
 *   2. POST {testTo:'a@b.c'}  -> one real copy to that address, no stamps.
 *   3. POST {confirm:'SEND'}  -> sends one batch, stamps each send,
 *                                reports `remaining`. Re-POST to zero.
 * Refuses a From on a domain Resend has not verified.
 *
 * EXCLUDED BY NAME (2026-09-01 signup sweep): the founder's own and
 * family accounts, disposable inboxes, and the people reserved for
 * PERSONAL outreach (the five notable signups plus six educators on
 * school-district domains). A blast must never be the first thing a
 * personal-outreach target hears from us.
 *
 * Env:
 *   RESEND_API_KEY        required to send; absent forces dry run
 *   SIGNUP_WELCOME_FROM / SIGNUP_WELCOME_REPLY_TO   sender overrides
 *   SIGNUP_WELCOME_BATCH  per-call send cap (default 20, max 60)
 *   SITE_URL              default https://itsdebatable.com
 */

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL,
         verifiedSenderDomains, senderDomain } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';

const FALLBACK_VERIFIED = ['debateai.com', 'itsdebatable.com'];
// hello@debateai.com is the proven inbox-placement sender for this exact
// cohort (259/259 on the 2026-08-22 rally run).
const FROM_EMAIL = process.env.SIGNUP_WELCOME_FROM || process.env.OPEN_RALLY_FROM
                || 'Debatable <hello@debateai.com>';
// Reply-To goes to the founder's real inbox. NOT hello@itsdebatable.com:
// inbound on that domain is Google Workspace where only support@ is a
// confirmed alias, and "every reply gets read" is a promise this email
// makes out loud.
const REPLY_TO  = process.env.SIGNUP_WELCOME_REPLY_TO || 'aidandavidhollinger@gmail.com';
const BATCH_MAX = Math.min(60, parseInt(process.env.SIGNUP_WELCOME_BATCH || '20', 10) || 20);
const STREAM    = 'onboarding';
const SUBJECT   = 'Come argue one round. The judge writes out who won.';

// Reserved for personal outreach or otherwise off-limits. Domains cover
// the founder's own itsdebatable.com test accounts and burner services.
const EXCLUDE_EMAILS = new Set([
  // own + brand accounts
  'aidandavidhollinger@gmail.com', 'ahollinger@uchicago.edu',
  'trydebatable@gmail.com', 'contact@devilsadvocateteam.com',
  // family
  'davidhollinger13@gmail.com', 'juliaannehollinger@gmail.com',
  'jhollinger@bishopodowd.org', 'jhollinger-miles27@bishopodowd.org',
  'jonahhm09@gmail.com', 'mhollinger-miles27@bishopodowd.org',
  'jenerfour@gmail.com',
  // Tier 1 notable signups: personal email from the founder instead
  'futarchy@gmail.com', 'john@superdebate.org', 'hines.debate@gmail.com',
  'adamboazbecker@gmail.com', 'antonia@theresanaiforthat.com',
  // educators on school domains: Program-tier leads, personal notes instead
  'lorenzo.balderas@jonesboroschools.net', 'ardanche@usd356.org',
  'pclements@usd261.com', 'beau.hulgan@pfisd.net',
  'vnguyen@headroyce.org', 'edward@5ft.org',
]);
const EXCLUDE_DOMAINS = new Set([
  'itsdebatable.com',            // dryrun.* test accounts + aidan@
  'sharklasers.com', 'ebflyai.com', 'kolsea.com', 'koboywin.com',
  'jbsze.com', 'nanana.uk', 'edumail.edu.pl',
  'privaterelay.appleid.com',    // relay mail bounces; sender not registered with Apple
]);

function excluded(email) {
  const e = String(email || '').toLowerCase();
  if (EXCLUDE_EMAILS.has(e)) return true;
  return EXCLUDE_DOMAINS.has(e.split('@')[1] || '');
}

// ── Template ─────────────────────────────────────────────────────────────────
// Voice rules that bind here: no em-dashes, no preface, no banned
// phrases, no traction numbers, no beta-free claims (billing is live).
function renderEmail({ firstName, uid }) {
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    You made a Debatable account. Here is the whole product in one line:
    <strong>you argue with a real person, live, and an AI judge reads the
    round and writes out who won and why.</strong> A round takes about ten
    minutes.
  </p>

  <p style="margin:0 0 22px">
    <a href="${SITE_URL}/" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Start a round &rarr;</a>
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    If nobody is waiting in the queue when you open it, take an AI opponent
    instead. Same clock, same written verdict, and the judge does not go
    easy on either of you.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>Then reply to this email and tell us what to fix.</strong>
    Replies land in the founder's inbox, not a support queue, and every one
    gets read. What you send decides what gets built next.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    One more thing: you are early, and it is on the record. We keep a note
    of who was here first, so when Debatable grows into a company, your
    part in that history comes with it.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">See you in a round.<br>Debatable</p>

  ${renderFooter({
    uid,
    stream: STREAM,
    reason: "You're getting this because you made a Debatable account.",
  })}
</div>`;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { db } = gate;

  let body = {};
  try { body = await request.json(); } catch { /* empty body = dry run */ }

  // Test mode: one real copy to a named address, stamps nobody.
  if (body?.testTo) {
    const to = String(body.testTo);
    const from = body.from ? String(body.from) : FROM_EMAIL;
    const res = await sendEmail({
      to,
      subject: SUBJECT,
      html: renderEmail({ firstName: 'debater', uid: 'test' }),
      uid: 'test', stream: STREAM, from, replyTo: REPLY_TO,
    });
    return jsonResponse({ test: true, to, from, replyTo: REPLY_TO, result: res }, 200, request);
  }

  const wantsSend = body?.confirm === 'SEND';
  const fromDomain = senderDomain(FROM_EMAIL);
  const live = await verifiedSenderDomains();
  const allowed = live.ok ? live.domains : FALLBACK_VERIFIED;
  const verifiedSource = live.ok ? 'resend' : `fallback (${live.reason})`;
  const senderOk = allowed.includes(fromDomain);
  if (wantsSend && !senderOk) {
    return jsonResponse({
      error: 'UNVERIFIED_SENDER',
      message: `From is ${FROM_EMAIL}, and ${fromDomain || 'that domain'} is not a verified Resend sender. `
             + `Resend would reject every send. Verified right now: ${allowed.join(', ') || 'nothing'}.`,
      verifiedDomains: allowed,
      verifiedSource,
    }, 409, request);
  }
  const dryRun = !wantsSend || !process.env.RESEND_API_KEY;
  const batch = Math.min(BATCH_MAX, Math.max(1, parseInt(body?.batch, 10) || BATCH_MAX));

  const authUsers = await listAllAuthUsers().catch((err) => {
    console.error('[signup-welcome] listAllAuthUsers failed:', err.message);
    return null;
  });
  if (!authUsers) return errorResponse('Could not read the account list. Nothing was sent.', 502, request);

  const profilesSnap = await db.collection('user_profiles').limit(3000).get();
  const profByUid = new Map();
  profilesSnap.docs.forEach(d => profByUid.set(d.id, d.data() || {}));

  let eligible = 0, sent = 0, errors = 0;
  let noEmail = 0, noProfile = 0, optedOut = 0, alreadyEmailed = 0, excludedCount = 0;
  const errorReasons = {};
  const sample = [];

  for (const user of authUsers) {
    if (!user.email) { noEmail++; continue; }
    if (excluded(user.email)) { excludedCount++; continue; }
    const prof = profByUid.get(user.uid) || null;
    // A missing profile doc is not an opt-out (same measured reasoning as
    // the announce and rally senders).
    if (!prof) noProfile++;
    if (prof && isOptedOut(prof, STREAM)) { optedOut++; continue; }
    // "Haven't emailed yet" = never stamped by ANY campaign, this one included.
    if (prof && (prof.openAnnounceSentAt || prof.openRallySentAt || prof.signupWelcomeSentAt)) {
      alreadyEmailed++; continue;
    }

    eligible++;
    if (dryRun) {
      if (sample.length < 12) sample.push(user.email);
      continue;
    }
    if (sent >= batch) continue;  // keep counting so `remaining` is honest

    const firstName = String((prof && prof.displayName) || user.displayName || '').trim().split(/\s+/)[0] || 'debater';
    const res = await sendEmail({
      to: user.email,
      subject: SUBJECT,
      html: renderEmail({ firstName, uid: user.uid }),
      uid: user.uid,
      stream: STREAM,
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
    });
    if (res.ok) {
      sent++;
      // set+merge, not update: many recipients hold no profile doc, and a
      // stamp that fails is a person who gets mailed twice, so it counts
      // as an error rather than disappearing.
      try {
        await db.doc(`user_profiles/${user.uid}`)
          .set({ signupWelcomeSentAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (stampErr) {
        errors++;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('signup-welcome: stamp failed for', user.uid, stampErr.message);
      }
    } else {
      errors++;
      const why = res.reason || `status-${res.status || 'unknown'}`;
      errorReasons[why] = (errorReasons[why] || 0) + 1;
      // Resend's daily quota kills every remaining send today: stop burning
      // the loop on doomed requests (the 2026-08-12 spar-night lesson).
      if (res.quotaExhausted) break;
    }
  }

  const remaining = dryRun ? eligible : Math.max(0, eligible - sent);
  const result = {
    dryRun,
    from: FROM_EMAIL,
    replyTo: REPLY_TO,
    senderVerified: senderOk,
    verifiedDomains: allowed,
    verifiedSource,
    subject: SUBJECT,
    accounts: authUsers.length,
    eligible, sent, remaining, errors,
    skipped: { noEmail, optedOut, alreadyEmailed, excluded: excludedCount },
    mailedWithoutProfile: noProfile,
    errorReasons,
    sample: dryRun ? sample : [],
  };

  await db.doc('config/signup_welcome_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: result,
  }, { merge: true }).catch(() => {});

  return jsonResponse(result, 200, request);
};

export const config = { path: '/api/admin/signup-welcome' };
