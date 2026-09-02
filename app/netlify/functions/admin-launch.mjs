/* admin-launch.mjs  ·  POST /api/admin/launch
 *
 * The 2026-09-02 launch announcement, per the founder: one short, human
 * email to every reachable account. Three asks, in order of how much they
 * move the number: forward it to one person, turn up at an hour, reply with
 * what is broken.
 *
 * THE 500 IS EXACT AND IT IS NAMED ACCOUNTS ONLY. Measured 2026-09-02
 * against Firebase Auth: 2,059 records, of which 1,559 are anonymous
 * guests and 500 are named (499 with an email, one phone-only). The copy
 * says "just hit 500", not "passed 500", because 500 is where it is. Do
 * not restate this as 2,000-odd users: soul.md 8 records that counting the
 * anonymous guests is the exact arithmetic that produced the bogus "500+
 * signups" figure in old drafts, and here the true named figure happens to
 * land on the same number by coincidence.
 *
 * It exists because two earlier sends did not reach the people they were
 * written for, and both failures are on the record:
 *   1. admin-update-announce ("Bring a friend") computed 166 eligible and
 *      sent ZERO. Its FALLBACK_VERIFIED list held only debateai.com while
 *      its From resolved to hello@itsdebatable.com, and the live Resend
 *      domain lookup 401s on a send-only key, so the guard refused every
 *      send. config/update_announce_state still reads sent:0 remaining:166,
 *      and updateAnnounceSentAt exists on zero profiles.
 *   2. The Clash Hour send on 2026-09-01 reached 433 people carrying the
 *      hours 7 AM / 3 PM / 8 PM ET. The next day those hours were retimed
 *      to 12 AM / 3 PM / 7 PM ET off fourteen days of measured paired
 *      rooms (commit 31cc6740). So 433 people are holding two wrong times.
 *      Correcting that is this email's first job, and the reason a second
 *      send two days later is a correction rather than a nag.
 *
 * Fifth campaign, so it carries its OWN stamp (launchSentAt), per the
 * standing rule in soul.md. Like the Clash Hour sender it does NOT skip
 * people the earlier campaigns reached: the correction is news to exactly
 * the people who already got the wrong version.
 *
 *   1. POST {}                -> DRY RUN. Counts, samples, stamps nobody.
 *   2. POST {testTo:'a@b.c'}  -> one real copy to that address, no stamps.
 *   3. POST {confirm:'SEND'}  -> sends one batch, stamps each send,
 *                                reports `remaining`. Re-POST to zero.
 * Refuses a From on a domain Resend has not verified.
 *
 * Stream is 'onboarding' (account-level product news, one-off, so only the
 * global switch suppresses it), but this sender ALSO refuses anyone
 * carrying ANY per-stream opt-out flag. Someone who muted the live-hour
 * reminders should not receive a blast whose headline is a live-hour
 * correction under a different stream label. That is stream-shopping, and
 * a launch is not worth a complaint. See optedOutOfAnything().
 *
 * EXCLUDED BY NAME: carried forward from admin-clash-hour.mjs verbatim
 * (own and brand accounts, disposable inboxes, the five notable signups
 * and six educators reserved for PERSONAL outreach). Family stays IN, per
 * the founder's call on the Clash Hour run.
 *
 * Env:
 *   RESEND_API_KEY     required to send; absent forces dry run
 *   LAUNCH_FROM / LAUNCH_REPLY_TO   sender overrides
 *   LAUNCH_BATCH       per-call send cap (default 60, max 60)
 *   SITE_URL           default https://itsdebatable.com
 */

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL,
         verifiedSenderDomains, senderDomain } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';

const FALLBACK_VERIFIED = ['debateai.com', 'itsdebatable.com'];
// hello@debateai.com is the proven inbox-placement sender for this exact
// cohort: 259/259 on the 2026-08-22 rally run, 433/0 errors on the
// 2026-09-01 Clash Hour run. A launch blast is the wrong moment to gamble
// on a colder domain, so the From stays here even though the site is
// itsdebatable.com. The display name and every link say Debatable.
const FROM_EMAIL = process.env.LAUNCH_FROM || 'Debatable <hello@debateai.com>';
// Reply-To is the founder's real inbox. NOT hello@itsdebatable.com, whose
// inbound is a Workspace where only support@ exists, and "every reply gets
// read" is a promise this email makes out loud.
const REPLY_TO  = process.env.LAUNCH_REPLY_TO || 'aidandavidhollinger@gmail.com';
const BATCH_MAX = Math.min(60, parseInt(process.env.LAUNCH_BATCH || '60', 10) || 60);
const STREAM    = 'onboarding';
const STAMP     = 'launchSentAt';
const SUBJECT   = 'we just hit 500. help me get to 1,000?';

const EXCLUDE_EMAILS = new Set([
  // own + brand accounts
  'aidandavidhollinger@gmail.com', 'ahollinger@uchicago.edu',
  'trydebatable@gmail.com', 'contact@devilsadvocateteam.com',
  // family: NOT excluded, per the founder's call on the Clash Hour run.
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

// Stricter than isOptedOut(profile,'onboarding'), deliberately. That call
// only reads the global switch, which would let this land on someone who
// had specifically muted the live hours. Anyone who has ever asked for
// less email gets none of this one.
const OPT_OUT_FLAGS = ['emailOptOut', 'wauDigestOptOut', 'winbackOptOut',
                       'sparNightOptOut', 'openOptOut', 'streamOptOut'];
function optedOutOfAnything(prof) {
  if (!prof) return false;             // missing doc is not an opt-out
  if (isOptedOut(prof, STREAM)) return true;
  return OPT_OUT_FLAGS.some(f => !!prof[f]);
}

// ── Template ─────────────────────────────────────────────────────────────────
// Voice rules that bind here: no em-dashes, no preface, no banned phrases,
// no beta-free claims (billing is live), no invented traction numbers, and
// no founder name (anonymous on every public surface since 2026-08-22).
function renderEmail({ firstName, uid }) {
  const P = 'font-size:.95rem;line-height:1.65;margin:0 0 15px';
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="${P}">Hi ${esc(firstName)},</p>

  <p style="${P}">
    We just hit 500 signups. I would love to get that to 1,000 quickly, and
    the honest truth is that the thing which moves it is you sending this to
    one person who likes arguing with you. A round needs two people, so one
    forward is worth more here than anything we could buy.
  </p>

  <p style="${P}">
    The other thing that helps is turning up at one of the hours. Clash Hour
    runs at <strong>12 AM, 3 PM and 7 PM ET, every day</strong>. Those changed
    this week, so ignore the times in Tuesday's email. Outside them the queue
    is often empty, and you can take an AI opponent instead.
  </p>

  <p style="${P}">
    And if something is broken or annoying, just reply to this. It lands in a
    real inbox, and every one gets read.
  </p>

  <p style="margin:0 0 22px">
    <a href="${SITE_URL}/" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Start a round &rarr;</a>
  </p>

  <p style="${P}">Thanks for being here early.</p>

  ${renderFooter({ uid, stream: STREAM,
    reason: 'You are getting this because you made a Debatable account.' })}
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

  if (body?.testTo) {
    const to = String(body.testTo);
    const from = body.from ? String(body.from) : FROM_EMAIL;
    const res = await sendEmail({
      to,
      subject: SUBJECT,
      html: renderEmail({ firstName: 'there', uid: 'test' }),
      uid: 'test', stream: STREAM, from, replyTo: REPLY_TO,
    });
    return jsonResponse({ test: true, to, from, replyTo: REPLY_TO, subject: SUBJECT, result: res }, 200, request);
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
    console.error('[launch] listAllAuthUsers failed:', err.message);
    return null;
  });
  if (!authUsers) return errorResponse('Could not read the account list. Nothing was sent.', 502, request);

  const profilesSnap = await db.collection('user_profiles').limit(3000).get();
  const profByUid = new Map();
  profilesSnap.docs.forEach(d => profByUid.set(d.id, d.data() || {}));

  let eligible = 0, sent = 0, errors = 0;
  let noEmail = 0, noProfile = 0, optedOut = 0, alreadySent = 0, excludedCount = 0;
  const errorReasons = {};
  const sample = [];

  for (const user of authUsers) {
    if (!user.email) { noEmail++; continue; }
    if (excluded(user.email)) { excludedCount++; continue; }
    const prof = profByUid.get(user.uid) || null;
    // A missing profile doc is not an opt-out (same measured reasoning as
    // the four senders before this one).
    if (!prof) noProfile++;
    if (optedOutOfAnything(prof)) { optedOut++; continue; }
    // Own stamp only: this campaign goes to everyone, once.
    if (prof && prof[STAMP]) { alreadySent++; continue; }

    eligible++;
    if (dryRun) {
      if (sample.length < 12) sample.push(user.email);
      continue;
    }
    if (sent >= batch) continue;  // keep counting so `remaining` is honest

    const firstName = String((prof && prof.displayName) || user.displayName || '').trim().split(/\s+/)[0] || 'there';
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
      try {
        await db.doc(`user_profiles/${user.uid}`)
          .set({ [STAMP]: FieldValue.serverTimestamp() }, { merge: true });
      } catch (stampErr) {
        errors++;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('launch: stamp failed for', user.uid, stampErr.message);
      }
    } else {
      errors++;
      const why = res.reason || `status-${res.status || 'unknown'}`;
      errorReasons[why] = (errorReasons[why] || 0) + 1;
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
    skipped: { noEmail, optedOut, alreadySent, excluded: excludedCount },
    mailedWithoutProfile: noProfile,
    errorReasons,
    sample: dryRun ? sample : [],
  };

  await db.doc('config/launch_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: result,
  }, { merge: true }).catch(() => {});

  return jsonResponse(result, 200, request);
};

export const config = { path: '/api/admin/launch' };
