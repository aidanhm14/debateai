/* scheduled-spar-night.mjs
 *
 * Open Spar Night day-of reminder (2026-07-15). The /spar liquidity fix
 * is a fixed weekly hour (Wednesdays 8:00 PM ET, 90 min) when everyone
 * queues at once; this cron tells every reachable signed-in user about
 * tonight's event so the queue actually fills. Companion surfaces: the
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
function nextEventStart(nowMs) {
  for (let i = 0; i < 10; i++) {
    const p = nyParts(nowMs + i * 86400000);
    if (p.weekday !== 'Wed') continue;
    const start = nyToUtc(+p.year, +p.month, +p.day, 20, 0);
    if (start + LIVE_MS <= nowMs) continue;
    return Math.max(start, FIRST_EVENT_UTC);
  }
  return FIRST_EVENT_UTC;
}

// ── Email template ───────────────────────────────────────────────────────────
function renderEmail({ firstName, uid }) {
  const cta = `${SITE_URL}/spar?utm_source=email&utm_medium=email&utm_campaign=spar_night`;
  const gcal = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent('Open Spar Night · Debatable')
    + '&details=' + encodeURIComponent('Weekly live hour on Debatable. Everyone queues at once: real opponents, timed rounds, an AI judge ballot at the end. Join at itsdebatable.com/spar')
    + '&location=' + encodeURIComponent('https://itsdebatable.com/spar')
    + '&dates=20260722T200000/20260722T213000'
    + '&ctz=' + encodeURIComponent(TZ)
    + '&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY;BYDAY=WE');

  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>Open Spar Night is tonight: Wednesday, 8:00 PM Eastern.</strong>
    For one hour, everyone queues at the same time, so you match with a real
    opponent in seconds instead of sitting in an empty queue.
  </p>
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">
    Pick your format, run a timed round, and the judge ballot lands when it
    ends. The founders are in the queue every week.
  </p>
  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Join the queue at 8 &rarr;</a>
  </p>
  <p style="font-size:.82rem;line-height:1.6;color:#6b6b76;margin:0">
    Can't make it tonight? It runs every Wednesday.
    <a href="${gcal}" style="color:#dc2626;text-decoration:underline">Add it to your calendar</a> once and you're set.
  </p>
  ${renderFooter({ uid, stream: 'sparnight', reason: 'You\'re getting this because you have a Debatable account.' })}
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
  const lastRunAt = stateSnap?.data?.()?.lastRunAt?.toMillis?.() || 0;
  if (!dryRun && now - lastRunAt < MIN_GAP_RUN_MS) {
    console.log('[spar-night] ran recently — skipping');
    return;
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
  const sampleWould = [];
  const errorReasons = {};   // reason -> count, so a failed run says WHY

  for (const user of authUsers) {
    if (sent >= MAX_EMAILS) break;
    if (!user.email) { skipped++; continue; }
    const prof = profByUid.get(user.uid);
    // No profile doc = we hold no preferences for this account. isOptedOut
    // treats that as opted out, and we keep that posture: never mail an
    // address whose preferences we cannot read. Counted separately so the
    // state doc shows how many addresses this rule is holding back.
    if (!prof) { noProfile++; skipped++; continue; }
    if (isOptedOut(prof, 'sparnight')) { skipped++; continue; }
    eligible++;

    const firstName = String(prof.displayName || user.displayName || '').trim().split(/\s+/)[0] || 'debater';
    if (dryRun) {
      if (sampleWould.length < 10) sampleWould.push(user.email);
      continue;
    }

    const res = await sendEmail({
      to: user.email,
      subject: 'Open Spar Night is tonight: 8pm ET',
      html: renderEmail({ firstName, uid: user.uid }),
      uid: user.uid,
      stream: 'sparnight',
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
    });
    if (res.ok) {
      sent++;
      await db.doc(`user_profiles/${user.uid}`).update({ sparNightSentAt: FieldValue.serverTimestamp() }).catch(() => {});
    } else {
      errors++;
      const why = res.reason || `status-${res.status || 'unknown'}`;
      errorReasons[why] = (errorReasons[why] || 0) + 1;
    }
  }

  await stateRef.set({
    lastRunAt: FieldValue.serverTimestamp(),
    status: 'done',
    dryRun,
    eventStart: new Date(start).toISOString(),
    eligible,
    sent,
    skipped,
    errors,
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

  console.log(`[spar-night] ${dryRun ? 'DRY-RUN' : 'LIVE'} — eligible:${eligible} sent:${sent} skipped:${skipped} (noProfile:${noProfile}) errors:${errors} ${JSON.stringify(errorReasons)}`);
};

export const config = {
  schedule: '0 13 * * 3', // Wednesday 13:00 UTC (9am ET), 3h before winback's 16:00
};
