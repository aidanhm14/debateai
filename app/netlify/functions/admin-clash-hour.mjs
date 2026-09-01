/* admin-clash-hour.mjs  ·  POST /api/admin/clash-hour
 *
 * The 2026-09-01 "come back and get rounds in" campaign, per the founder:
 * email every account except the big names about Clash Hour running
 * three times a day now, and about the UI being in a state he is
 * confident in. Fourth campaign, so it carries its OWN stamp
 * (clashHourSentAt), per the standing rule in soul.md. Unlike the
 * welcome sender it does NOT skip people the earlier campaigns reached:
 * this is news to everyone.
 *
 * Same posture as admin-signup-welcome.mjs:
 *   1. POST {}                -> DRY RUN. Counts, samples, stamps nobody.
 *   2. POST {testTo:'a@b.c'}  -> one real copy to that address, no stamps.
 *   3. POST {confirm:'SEND'}  -> sends one batch, stamps each send,
 *                                reports `remaining`. Re-POST to zero.
 * Refuses a From on a domain Resend has not verified.
 *
 * Stream is 'sparnight': the Clash Hour reminders opt-out (and the digest
 * opt-out it inherits) is exactly the switch someone would have flipped
 * to say "do not tell me about the live hours".
 *
 * EXCLUDED BY NAME: copied from admin-signup-welcome.mjs (the founder's
 * own accounts, disposable inboxes, and the people reserved for PERSONAL
 * outreach), MINUS family, who the founder asked to keep in.
 *
 * Env:
 *   RESEND_API_KEY        required to send; absent forces dry run
 *   CLASH_HOUR_FROM / CLASH_HOUR_REPLY_TO   sender overrides
 *   CLASH_HOUR_BATCH      per-call send cap (default 20, max 60)
 *   SITE_URL              default https://itsdebatable.com
 */

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL,
         verifiedSenderDomains, senderDomain } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';

const FALLBACK_VERIFIED = ['debateai.com', 'itsdebatable.com'];
// hello@debateai.com is the proven inbox-placement sender (259/259 on the
// 2026-08-22 rally run, and the welcome run after it).
const FROM_EMAIL = process.env.CLASH_HOUR_FROM || process.env.OPEN_RALLY_FROM
                || 'Debatable <hello@debateai.com>';
const REPLY_TO  = process.env.CLASH_HOUR_REPLY_TO || 'aidandavidhollinger@gmail.com';
const BATCH_MAX = Math.min(60, parseInt(process.env.CLASH_HOUR_BATCH || '20', 10) || 20);
const STREAM    = 'sparnight';
const STAMP     = 'clashHourSentAt';
const SUBJECT   = 'Three times a day now: 7 AM, 3 PM and 8 PM ET';
const TZ        = 'America/New_York';

const EXCLUDE_EMAILS = new Set([
  // own + brand accounts
  'aidandavidhollinger@gmail.com', 'ahollinger@uchicago.edu',
  'trydebatable@gmail.com', 'contact@devilsadvocateteam.com',
  // family: NOT excluded on this campaign (founder: "keep family in there").
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

// ── Calendar links: one per session, recurring daily off today's date ────────
function nyDay(ms) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const o = {};
  for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o.year + o.month + o.day;
}
function gcalFor(label, hh, endHhmm) {
  const day = nyDay(Date.now());
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent('Clash Hour (' + label + ') · Debatable')
    + '&details=' + encodeURIComponent('Daily live hour on Debatable. Everyone queues at once: real opponents, timed rounds, an AI judge ballot at the end. Join at itsdebatable.com/spar')
    + '&location=' + encodeURIComponent('https://itsdebatable.com/spar')
    + '&dates=' + day + 'T' + hh + '0000/' + day + 'T' + endHhmm + '00'
    + '&ctz=' + encodeURIComponent(TZ)
    + '&recur=' + encodeURIComponent('RRULE:FREQ=DAILY');
}

// ── Template ─────────────────────────────────────────────────────────────────
// Voice rules that bind here: no em-dashes, no preface, no banned
// phrases, no traction numbers, no beta-free claims (billing is live),
// and the outreach register: early, honest, an ask rather than a flex.
function renderEmail({ firstName, uid }) {
  const cta = `${SITE_URL}/spar?utm_source=email&utm_medium=email&utm_campaign=clash_hour`;
  const gAsia = gcalFor('Asia-Pacific', '07', '0830');
  const gEuro = gcalFor('Europe', '15', '1630');
  const gUs   = gcalFor('US', '20', '2130');
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>Debatable now runs Clash Hour three times a day, every day:
    three hour-long slots when everyone shows up at once.</strong>
    A live round needs two people online at the same minute, and the queue
    has been quiet at random hours. About 450 people have signed up, so if
    even a few of us turn up in the same slot, you match in seconds. We
    encourage you to show up for the one that is evening where you are.
  </p>

  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-collapse:collapse">
    <tr><td style="padding:9px 12px;border:1px solid #e6e4de;border-radius:8px 8px 0 0;font-size:.9rem;line-height:1.5">
      <strong>7:00 AM ET</strong> &middot; Asia-Pacific<br>
      <span style="color:#6b6b76;font-size:.82rem">Sydney 9 PM, Tokyo 8 PM, Delhi 4:30 PM</span></td></tr>
    <tr><td style="padding:9px 12px;border:1px solid #e6e4de;border-top:0;font-size:.9rem;line-height:1.5">
      <strong>3:00 PM ET</strong> &middot; Europe<br>
      <span style="color:#6b6b76;font-size:.82rem">London 8 PM, Berlin 9 PM, Lagos 8 PM</span></td></tr>
    <tr><td style="padding:9px 12px;border:1px solid #e6e4de;border-top:0;border-radius:0 0 8px 8px;font-size:.9rem;line-height:1.5">
      <strong>8:00 PM ET</strong> &middot; US<br>
      <span style="color:#6b6b76;font-size:.82rem">Chicago 7 PM, Los Angeles 5 PM</span></td></tr>
  </table>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    If you tried a round a while ago and it felt rough, a lot has changed
    since. One judge instead of three options to agree on. One clear
    Start my speech button. A reminder if you are talking and the clock
    has not started. It is still early, and the best way to find what is
    left is to get rounds in.
  </p>

  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Show up at the next slot &rarr;</a>
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>If something breaks, reply to this email and say so.</strong>
    Replies land in the founder's inbox, not a support queue, and every one
    gets read.
  </p>

  <p style="font-size:.82rem;line-height:1.6;color:#6b6b76;margin:0 0 22px">
    Add your hour to your calendar once and you are set:
    <a href="${gAsia}" style="color:#dc2626;text-decoration:underline">Asia-Pacific</a> &middot;
    <a href="${gEuro}" style="color:#dc2626;text-decoration:underline">Europe</a> &middot;
    <a href="${gUs}" style="color:#dc2626;text-decoration:underline">US</a>.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">See you in a round.<br>Debatable</p>

  ${renderFooter({
    uid,
    stream: STREAM,
    reason: "You're getting this because you have a Debatable account.",
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
    console.error('[clash-hour] listAllAuthUsers failed:', err.message);
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
    // the three senders before this one).
    if (!prof) noProfile++;
    if (prof && isOptedOut(prof, STREAM)) { optedOut++; continue; }
    // Own stamp only: this campaign goes to everyone, once.
    if (prof && prof[STAMP]) { alreadySent++; continue; }

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
      try {
        await db.doc(`user_profiles/${user.uid}`)
          .set({ [STAMP]: FieldValue.serverTimestamp() }, { merge: true });
      } catch (stampErr) {
        errors++;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('clash-hour: stamp failed for', user.uid, stampErr.message);
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

  await db.doc('config/clash_hour_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: result,
  }, { merge: true }).catch(() => {});

  return jsonResponse(result, 200, request);
};

export const config = { path: '/api/admin/clash-hour' };
