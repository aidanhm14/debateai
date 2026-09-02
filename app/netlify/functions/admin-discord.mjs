/* admin-discord.mjs  ·  POST /api/admin/discord
 *
 * The 2026-09-04 Discord invite, per the founder, written on 09-02 and
 * held. It exists because the ask arrived while the launch blast was in
 * flight: batch 8 of 8 had already sent, so all 455 of those emails went
 * without a Discord link and nothing can be unsent. Rather than fire a
 * third email at the same people inside an hour, this one is built, dry
 * run, tested, and held for Friday, three days after the launch.
 *
 * Sixth campaign, so it carries its OWN stamp (discordSentAt), per the
 * standing rule in soul.md. Like the launch sender it does NOT skip
 * people earlier campaigns reached.
 *
 * The pitch is the honest one. The queue matches whoever is online right
 * now, which works at the three Clash Hours and thins out between them.
 * Discord is where someone can say when they are free and find a
 * counterpart, which is the actual fix for an empty queue, so that is
 * what the email says rather than "join our community".
 *
 *   1. POST {}                -> DRY RUN. Counts, samples, stamps nobody.
 *   2. POST {testTo:'a@b.c'}  -> one real copy to that address, no stamps.
 *   3. POST {confirm:'SEND'}  -> sends one batch, stamps each send,
 *                                reports `remaining`. Re-POST to zero.
 * Refuses a From on a domain Resend has not verified.
 *
 * Stream is 'onboarding', and as in admin-launch.mjs the sender is
 * deliberately stricter than isOptedOut(prof,'onboarding'): anyone
 * carrying ANY per-stream opt-out is skipped. See optedOutOfAnything().
 *
 * EXCLUDED BY NAME: carried forward from admin-launch.mjs verbatim.
 *
 * Env:
 *   RESEND_API_KEY     required to send; absent forces dry run
 *   DISCORD_FROM / DISCORD_REPLY_TO   sender overrides
 *   DISCORD_BATCH      per-call send cap (default 60, max 60)
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
const FROM_EMAIL = process.env.DISCORD_FROM || 'Debatable <hello@debateai.com>';
// Reply-To is the founder's real inbox. NOT hello@itsdebatable.com, whose
// inbound is a Workspace where only support@ exists, and "every reply gets
// read" is a promise this email makes out loud.
const REPLY_TO  = process.env.DISCORD_REPLY_TO || 'aidandavidhollinger@gmail.com';
const BATCH_MAX = Math.min(60, parseInt(process.env.DISCORD_BATCH || '60', 10) || 60);
const STREAM    = 'onboarding';
const STAMP     = 'discordSentAt';
const SUBJECT   = 'come argue in the discord';
const DISCORD   = 'https://discord.gg/WMHZW9BKvJ';

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
    Quick one. We have a Discord, and it is the easiest way to actually get
    a round.
  </p>

  <p style="${P}">
    The site matches you with whoever happens to be online at that moment,
    which works at the busy hours and thins out between them. Discord fixes
    the gap. Say when you are free, find someone who is around then, and go
    start a round together.
  </p>

  <p style="margin:0 0 22px">
    <a href="${DISCORD}" style="display:inline-block;background:#5865F2;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Join the Discord &rarr;</a>
  </p>

  <p style="${P}">
    If you would rather just turn up, Clash Hour is still
    <strong>12 AM, 3 PM and 7 PM ET, every day</strong>, and you can always
    take an AI opponent at <a href="${SITE_URL}/" style="color:#dc2626;text-decoration:none">itsdebatable.com</a>
    when the queue is quiet.
  </p>

  <p style="${P}">
    And the last ask stands. If something is broken or annoying, just reply
    to this. It lands in a real inbox.
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
    console.error('[discord] listAllAuthUsers failed:', err.message);
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
        console.error('discord: stamp failed for', user.uid, stampErr.message);
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

  await db.doc('config/discord_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: result,
  }, { merge: true }).catch(() => {});

  return jsonResponse(result, 200, request);
};

export const config = { path: '/api/admin/discord' };
