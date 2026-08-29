/* scheduled-spar-night.mjs
 *
 * Open Spar Night day-of reminder (2026-07-15). The /spar liquidity fix
 * is a set of fixed weekly hours (Wednesdays, 90 min each) when everyone
 * queues at once; this cron tells every reachable signed-in user about
 * today's sessions so the queue actually fills.
 *
 * THREE sessions since 2026-08-24: 7:00 AM ET Asia-Pacific night, 3:00
 * PM ET Europe night, 8:00 PM ET US night. The send moved from 13:00 to
 * 09:00 UTC with them, because 13:00 UTC is two hours AFTER the first
 * session ends and an email announcing an event that has already
 * happened is worse than no email. Companion surfaces: the
 * countdown cards on /landing + /spar (app/js/spar-night.js), which
 * compute the same schedule client-side.
 *
 * Cohort: every user_profiles doc with an email that isn't opted out
 * (isOptedOut(prof, 'sparnight'): global emailOptOut, the shared
 * wauDigestOptOut, or sparNightOptOut). Deliberately NOT activity-
 * gated — the whole point is pulling the long tail into one hour.
 * The base is small (double-digit profiles); MAX caps a runaway.
 *
 * SAFE BY DEFAULT (same posture as scheduled-winback): does NOT send
 * unless SPAR_NIGHT_ENABLED === '1'. Otherwise dry-run: computes the
 * cohort, writes the would-send count to config/spar_night_state,
 * sends nothing, stamps no one.
 *
 * Guards:
 *   - Only sends when the next event starts within 24h (so the cron
 *     can deploy before the first event on 2026-07-22 and stay quiet).
 *   - Run dedup via config/spar_night_state (5-day min gap).
 *   - Stamps user_profiles.sparNightSentAt; scheduled-winback (Wed
 *     16:00 UTC) skips anyone stamped in the last 24h, preserving the
 *     "never two of our emails in one day" rule.
 *
 * Env:
 *   SPAR_NIGHT_ENABLED  '1' to actually send; anything else => dry-run
 *   RESEND_API_KEY      required to send (absent => forced dry-run)
 *   SPAR_NIGHT_FROM / SPAR_NIGHT_REPLY_TO  sender overrides
 *   SPAR_NIGHT_MAX      per-run cap (default 500)
 *   SITE_URL            default https://itsdebatable.com
 *
 * Schedule: Wednesday 13:00 UTC (9:00 AM ET) — morning of the event,
 * 3h ahead of the winback cron it dedupes against.
 */

import { getDb, FieldValue } from './lib/firestore.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SEND_ENABLED   = process.env.SPAR_NIGHT_ENABLED === '1';
const FROM_EMAIL     = process.env.SPAR_NIGHT_FROM || undefined;
const REPLY_TO       = process.env.SPAR_NIGHT_REPLY_TO || undefined;
const MAX_EMAILS     = parseInt(process.env.SPAR_NIGHT_MAX || '500', 10);

const DAY_MS         = 24 * 60 * 60 * 1000;
const MIN_GAP_RUN_MS = 5 * DAY_MS;   // cron double-fire guard
// Gap between sends. Resend's window is 10/s; this sits an order of
// magnitude under it so a burst can never be the thing that fails.
const PACE_MS        = parseInt(process.env.SPAR_NIGHT_PACE_MS || '250', 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pace  = () => (PACE_MS > 0 ? sleep(PACE_MS) : Promise.resolve());

// Has this profile already been mailed for THIS event? The stamp is written
// on success only, so a missing or older stamp means the person never got
// this week's email and a retry should reach them.
function alreadySentFor(prof, eventStartMs) {
  const raw = prof?.sparNightSentAt;
  const ms = raw?.toMillis ? raw.toMillis()
           : (raw?._seconds ? raw._seconds * 1000
           : (raw instanceof Date ? raw.getTime() : 0));
  if (!ms) return false;
  // 24h, not "since the last event". This function only runs when the event
  // is already inside 24h (the guard above returns otherwise), so every
  // stamp belonging to THIS event is necessarily inside this window and
  // every stamp from a previous week is necessarily outside it. A 7-day
  // window also happens to work today, but only by an 11-hour margin
  // (the send fires ~11h before the event it announces), which a shifted
  // cron or a moved event time would quietly eat.
  return ms > (eventStartMs - DAY_MS);
}
const LIVE_MS        = 90 * 60 * 1000;
// First event: Wed 2026-07-22 20:00 EDT = 2026-07-23 00:00 UTC. Must
// match FIRST_EVENT_UTC in app/js/spar-night.js.
const FIRST_EVENT_UTC = Date.UTC(2026, 6, 23, 0, 0, 0);
const TZ = 'America/New_York';

// ── Next event start (same math as app/js/spar-night.js) ────────────────────
function nyParts(utcMs) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const out = {};
  for (const p of fmt.formatToParts(new Date(utcMs))) out[p.type] = p.value;
  return out;
}
function nyToUtc(y, mo, d, hh, mm) {
  const want = Date.UTC(y, mo - 1, d, hh, mm);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const p = nyParts(guess);
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute);
    guess += want - asUtc;
  }
  return guess;
}
// Eastern hours of the three sessions. Must match SESSIONS in
// app/js/spar-night.js.
const SESSION_HOURS = [7, 15, 20];
function nextEventStart(nowMs) {
  for (let i = 0; i < 10; i++) {
    const p = nyParts(nowMs + i * 86400000);
    if (p.weekday !== 'Wed') continue;
    for (const hour of SESSION_HOURS) {
      const start = nyToUtc(+p.year, +p.month, +p.day, hour, 0);
      if (start + LIVE_MS <= nowMs) continue;
      return Math.max(start, FIRST_EVENT_UTC);
    }
  }
  return FIRST_EVENT_UTC;
}

// ── Email template ───────────────────────────────────────────────────────────
function renderEmail({ firstName, uid, stream = 'sparnight' }) {
  const cta = `${SITE_URL}/spar?utm_source=email&utm_medium=email&utm_campaign=spar_night`;
  // One recurring calendar link per session, because the reader is being
  // asked to pick the one that is evening where they live, and a single
  // link can only carry one hour.
  const gcalFor = (label, hh, mm) => 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent('Open Spar Night (' + label + ') · Debatable')
    + '&details=' + encodeURIComponent('Weekly live hour on Debatable. Everyone queues at once: real opponents, timed rounds, an AI judge ballot at the end. Join at itsdebatable.com/spar')
    + '&location=' + encodeURIComponent('https://itsdebatable.com/spar')
    + '&dates=20260722T' + hh + '0000/20260722T' + mm + '00'
    + '&ctz=' + encodeURIComponent(TZ)
    + '&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY;BYDAY=WE');
  const gcalAsia = gcalFor('Asia-Pacific night', '07', '0830');
  const gcalEuro = gcalFor('Europe night', '15', '1630');
  const gcalUs   = gcalFor('US night', '20', '2130');

  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>Open Spar Night is today, and it runs three times.</strong>
    More people queue at the same time, so the live pool has a better chance
    of finding an opponent. Take the session that is evening where you are.
  </p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-collapse:collapse">
    <tr><td style="padding:9px 12px;border:1px solid #e6e4de;border-radius:8px 8px 0 0;font-size:.9rem;line-height:1.5">
      <strong>7:00 AM ET</strong> &middot; Asia-Pacific night<br>
      <span style="color:#6b6b76;font-size:.82rem">Sydney 9 PM, Tokyo 8 PM, Delhi 4:30 PM</span></td></tr>
    <tr><td style="padding:9px 12px;border:1px solid #e6e4de;border-top:0;font-size:.9rem;line-height:1.5">
      <strong>3:00 PM ET</strong> &middot; Europe night<br>
      <span style="color:#6b6b76;font-size:.82rem">London 8 PM, Berlin 9 PM, Lagos 8 PM</span></td></tr>
    <tr><td style="padding:9px 12px;border:1px solid #e6e4de;border-top:0;border-radius:0 0 8px 8px;font-size:.9rem;line-height:1.5">
      <strong>8:00 PM ET</strong> &middot; US night<br>
      <span style="color:#6b6b76;font-size:.82rem">Chicago 7 PM, Los Angeles 5 PM</span></td></tr>
  </table>
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">
    Ninety minutes each. Pick a side, run a timed round, and the judge
    ballot lands when it ends.
  </p>
  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Join the queue &rarr;</a>
  </p>
  <p style="font-size:.82rem;line-height:1.6;color:#6b6b76;margin:0">
    Can't make it today? It runs every Wednesday. Add your session once and
    you're set:
    <a href="${gcalAsia}" style="color:#dc2626;text-decoration:underline">Asia-Pacific</a> &middot;
    <a href="${gcalEuro}" style="color:#dc2626;text-decoration:underline">Europe</a> &middot;
    <a href="${gcalUs}" style="color:#dc2626;text-decoration:underline">US</a>.
  </p>
  ${renderFooter({
    uid,
    stream,
    reason: stream === 'sparrsvp'
      ? 'You\'re getting this because you asked to be reminded about Open Spar Night.'
      : 'You\'re getting this because you have a Debatable account.',
  })}
</div>`;
  return html;
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async () => {
  const db = getDb();
  const now = Date.now();
  const dryRun = !SEND_ENABLED || !RESEND_API_KEY;

  // Only act on event day: next event must start within the next 24h.
  const start = nextEventStart(now);
  if (start - now > DAY_MS) {
    console.log(`[spar-night] next event ${new Date(start).toISOString()} is >24h out — skipping`);
    return;
  }

  // Run dedup (cron double-fire / redeploy guard).
  const stateRef = db.doc('config/spar_night_state');
  const stateSnap = await stateRef.get().catch(() => null);
  const lastState = stateSnap?.data?.() || {};
  const lastRunAt = lastState?.lastRunAt?.toMillis?.() || 0;
  // A run that stopped short of the cohort is allowed back in before the
  // 5-day gap, because the gap exists to stop a double-fire mailing people
  // twice, not to strand the people who were never mailed once. The
  // already-sent stamp below is what makes that safe. Without this, the
  // 2026-08-12 run's 139 unreached accounts would have waited a full week
  // for an email about an event that had already happened.
  const lastWasPartial = lastState?.status === 'partial-quota';
  const retryingPartial = lastWasPartial && (lastState?.eventStart === new Date(start).toISOString());
  if (!dryRun && !retryingPartial && now - lastRunAt < MIN_GAP_RUN_MS) {
    console.log('[spar-night] ran recently — skipping');
    return;
  }
  if (retryingPartial) {
    console.log('[spar-night] last run stopped on quota for this same event — retrying the unsent');
  }

  // 2026-07-22: cohort now comes from Firebase Auth, not user_profiles.
  // Sign-in writes the email to Auth and nothing ever mirrors it into the
  // profile doc, so the old profiles-only scan saw 6 addresses out of 128
  // real ones and this cron mailed ~5% of the people it could.
  // Profiles are still loaded, purely to honor opt-outs and dedup stamps.
  const profilesSnap = await db.collection('user_profiles').limit(1000).get();
  const profByUid = new Map();
  profilesSnap.docs.forEach(d => profByUid.set(d.id, d.data() || {}));

  const authUsers = await listAllAuthUsers().catch(err => {
    console.error('[spar-night] listAllAuthUsers failed:', err.message);
    return null;
  });
  if (!authUsers) {
    await stateRef.set({
      lastRunAt: FieldValue.serverTimestamp(), status: 'auth-list-failed',
    }, { merge: true }).catch(() => {});
    return;
  }

  let eligible = 0, sent = 0, skipped = 0, errors = 0, noProfile = 0;
  // Set when the provider says the day's allowance is gone. Every further
  // send today is guaranteed to fail, so the loops below stop rather than
  // grinding through the rest of the cohort recording identical errors.
  // Measured 2026-08-12: without this the run burned 139 doomed requests
  // after the 31st send and still wrote status:'done'.
  let quotaExhausted = false;
  let alreadySent = 0;   // held back because they already have THIS event's email
  const sampleWould = [];
  const errorReasons = {};   // reason -> count, so a failed run says WHY
  // Every address this run has already taken, so the RSVP pass below
  // cannot send a second copy to someone who also holds an account.
  const mailedAddrs = new Set();

  for (const user of authUsers) {
    if (sent >= MAX_EMAILS || quotaExhausted) break;
    if (!user.email) { skipped++; continue; }
    const prof = profByUid.get(user.uid);
    // No profile doc = we hold no preferences for this account. isOptedOut
    // treats that as opted out, and we keep that posture: never mail an
    // address whose preferences we cannot read. Counted separately so the
    // state doc shows how many addresses this rule is holding back.
    if (!prof) { noProfile++; skipped++; continue; }
    if (isOptedOut(prof, 'sparnight')) { skipped++; continue; }
    // Already holds THIS event's email. Only reachable on a retry run (see
    // the partial-run rule above), and it is what makes a retry safe: the
    // stamp is written on success only, so the people it holds back are
    // exactly the ones who genuinely received it.
    if (alreadySentFor(prof, start)) { alreadySent++; skipped++; continue; }
    eligible++;
    mailedAddrs.add(String(user.email).trim().toLowerCase());

    const firstName = String(prof.displayName || user.displayName || '').trim().split(/\s+/)[0] || 'debater';
    if (dryRun) {
      if (sampleWould.length < 10) sampleWould.push(user.email);
      continue;
    }

    const res = await sendEmail({
      to: user.email,
      subject: 'Open Spar Night is today: 7am, 3pm and 8pm ET',
      html: renderEmail({ firstName, uid: user.uid }),
      uid: user.uid,
      stream: 'sparnight',
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
    });
    if (res.ok) {
      sent++;
      await db.doc(`user_profiles/${user.uid}`).update({ sparNightSentAt: FieldValue.serverTimestamp() }).catch(() => {});
      await pace();
    } else {
      errors++;
      const why = res.reason || `status-${res.status || 'unknown'}`;
      errorReasons[why] = (errorReasons[why] || 0) + 1;
      if (res.quotaExhausted) { quotaExhausted = true; break; }
      // A plain rate limit is the one failure worth waiting out, since the
      // next attempt genuinely can succeed. One retry, then move on.
      if (res.rateLimited) {
        await sleep(res.retryAfterMs || 1200);
        const retry = await sendEmail({
          to: user.email,
          subject: 'Open Spar Night is today: 7am, 3pm and 8pm ET',
          html: renderEmail({ firstName, uid: user.uid }),
          uid: user.uid,
          stream: 'sparnight',
          from: FROM_EMAIL,
          replyTo: REPLY_TO,
        });
        if (retry.ok) {
          errors--; sent++;
          await db.doc(`user_profiles/${user.uid}`).update({ sparNightSentAt: FieldValue.serverTimestamp() }).catch(() => {});
        } else if (retry.quotaExhausted) {
          quotaExhausted = true; break;
        }
        await pace();
      }
    }
  }

  // ── RSVP cohort (2026-07-28) ───────────────────────────────────────────────
  // The Auth loop above only reaches people who created an account, and
  // sign-ups run ~12 a fortnight against ~2,200 people who see the countdown
  // card. spar_night_rsvps holds addresses left by anonymous visitors via
  // /api/spar-rsvp, which is the cohort this event actually needs.
  //
  // Deduped against the addresses already mailed above so nobody who both
  // has an account and left an RSVP gets two copies.
  let rsvpSent = 0, rsvpSkipped = 0, rsvpErrors = 0;
  try {
    const rsvpSnap = await db.collection('spar_night_rsvps').limit(2000).get();
    for (const doc of rsvpSnap.docs) {
      if (sent + rsvpSent >= MAX_EMAILS || quotaExhausted) break;
      const r = doc.data() || {};
      const addr = String(r.email || '').trim().toLowerCase();
      if (!addr || r.unsubscribed) { rsvpSkipped++; continue; }
      if (mailedAddrs.has(addr)) { rsvpSkipped++; continue; }
      mailedAddrs.add(addr);

      if (dryRun) {
        if (sampleWould.length < 10) sampleWould.push(addr);
        continue;
      }

      const res = await sendEmail({
        to: addr,
        subject: 'Open Spar Night is today: 7am, 3pm and 8pm ET',
        // No uid for an anonymous RSVP, so the shared footer cannot build
        // an unsubscribe link from user_profiles. Pass the doc id as the
        // token subject instead; email-unsub handles the 'sparrsvp' stream
        // by writing to this collection.
        html: renderEmail({ firstName: 'debater', uid: doc.id, stream: 'sparrsvp' }),
        uid: doc.id,
        stream: 'sparrsvp',
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
      });
      if (res.ok) {
        rsvpSent++;
        await doc.ref.update({ lastSentAt: FieldValue.serverTimestamp() }).catch(() => {});
        await pace();
      } else {
        rsvpErrors++;
        const why = res.reason || `status-${res.status || 'unknown'}`;
        errorReasons[why] = (errorReasons[why] || 0) + 1;
        if (res.quotaExhausted) { quotaExhausted = true; break; }
      }
    }
  } catch (e) {
    console.error('[spar-night] rsvp cohort failed:', e.message);
  }

  // Status has to be able to say "this did not work". It read 'done' on a
  // run that reached 31 of 170, which is how the failure stayed invisible
  // until someone opened the doc by hand. 'partial-quota' is also the flag
  // the retry rule above keys on, so an honest status is load-bearing now
  // rather than decorative.
  const status = quotaExhausted ? 'partial-quota'
               : (errors > sent && errors > 0) ? 'mostly-failed'
               : errors > 0 ? 'done-with-errors'
               : 'done';

  await stateRef.set({
    lastRunAt: FieldValue.serverTimestamp(),
    status,
    quotaExhausted,
    alreadySent,
    dryRun,
    eventStart: new Date(start).toISOString(),
    eligible,
    sent,
    skipped,
    errors,
    rsvpSent,
    rsvpSkipped,
    rsvpErrors,
    // 2026-07-22: the 6/6 failure on the first live run recorded only a
    // count, so there was no way to tell a bad API key from a rejected
    // sender domain without tailing logs after the fact. Persist the
    // reasons; empty object on a clean run.
    errorReasons,
    // Addresses held back purely for having no profile doc (no stored
    // preferences). If this is large, the profile-creation path is the
    // real bug, not this cron.
    noProfile,
    sampleWould: dryRun ? sampleWould : FieldValue.delete(),
  }, { merge: true }).catch(() => {});

  console.log(`[spar-night] ${dryRun ? 'DRY-RUN' : 'LIVE'} — accounts eligible:${eligible} sent:${sent} skipped:${skipped} (noProfile:${noProfile}) errors:${errors} | rsvps sent:${rsvpSent} skipped:${rsvpSkipped} errors:${rsvpErrors} ${JSON.stringify(errorReasons)}`);
};

export const config = {
  // Wednesday 09:00 UTC (5am ET). Ahead of the FIRST session at 11:00
  // UTC rather than after it, which is where 13:00 UTC left it once the
  // day grew a 7am ET session, and still clear of winback's 16:00.
  schedule: '0 9 * * 3',
};
