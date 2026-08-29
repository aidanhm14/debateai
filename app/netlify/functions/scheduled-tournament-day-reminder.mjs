/* scheduled-tournament-day-reminder.mjs
 *
 * One-time operational reminder for The Debatable Open. Netlify invokes this
 * at 13:00 UTC on August 29, which is 06:00 Pacific and one hour before the
 * published 07:00 Pacific start. The year guard makes the annual cron inert
 * after the 2026 event.
 *
 * This is transactional tournament mail, not a general account blast. The
 * cohort comes from active entry documents, then Firebase Auth supplies each
 * entrant's address. A per-user event stamp makes a duplicate invocation or a
 * manual retry safe. Explicit global email opt-outs are still honored.
 */

import { getDb, FieldValue } from './lib/firestore.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
import {
  SITE_URL, brandHeader, esc, isOptedOut, renderFooter, sendEmail,
} from './lib/email.mjs';

const SEND_AT_MS = Date.parse('2026-08-29T06:00:00-07:00');
const EVENT_START_MS = Date.parse('2026-08-29T07:00:00-07:00');
const EVENT_NAME = 'The Debatable Open';
const SUBJECT = 'The Debatable Open starts in one hour';
const STATE_DOC = 'config/tournament_day_reminder_20260829';
const ACTIVE_ENTRY_STATUSES = new Set(['registered', 'checked_in']);
const PACE_MS = 140;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function firstName(user, profile) {
  const raw = String(profile?.displayName || user?.displayName || '').trim();
  return raw ? raw.split(/\s+/)[0] : 'there';
}

function renderEmail({ name, uid }) {
  const eventPage = `${SITE_URL}/open?utm_source=email&utm_medium=email&utm_campaign=open_day`;
  const rules = `${SITE_URL}/tournament-rules`;
  const watch = `${SITE_URL}/watch`;
  return `
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.96rem;line-height:1.6;margin:0 0 14px">Hey ${esc(name)},</p>

  <p style="font-size:1.02rem;line-height:1.6;margin:0 0 16px">
    <strong>The Debatable Open starts in one hour.</strong> Open your event page
    now. Keep it open, check in when the button appears, and press
    <strong>Join your room</strong> as soon as your pairing lands.
  </p>

  <p style="margin:0 0 24px">
    <a href="${eventPage}" style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;font-size:1rem;padding:14px 24px;border-radius:12px;text-decoration:none">Open your event page &rarr;</a>
  </p>

  <p style="font-size:.94rem;line-height:1.6;margin:0 0 12px">
    <strong>Start:</strong> 7:00 AM Pacific, 10:00 AM Eastern.<br>
    <strong>Before then:</strong> Use a laptop, plug it in, connect headphones,
    and allow camera and microphone access. A stable connection matters. If you
    disconnect during a round, you have five minutes to return.
  </p>

  <p style="font-size:.94rem;line-height:1.6;margin:0 0 12px">
    <strong>Each round:</strong> Three motions come from the published pool.
    Each side secretly strikes one. The room then settles the motion and sides.
    Debate without outside help. Missing a room by more than five minutes is a
    forfeit. The AI panel decides prelims and non-final elimination rounds and
    gives you a written ballot.
  </p>

  <p style="font-size:.94rem;line-height:1.6;margin:0 0 18px">
    <strong>The stream:</strong> The final runs live on the
    <a href="${watch}" style="color:#dc2626;text-decoration:underline">watch page</a>
    and the audience decides it. The AI ballot is published beside the vote.
    Elimination rounds may be recorded or streamed under the official rules.
  </p>

  <p style="font-size:.88rem;line-height:1.6;color:#6b6b76;margin:0">
    Read the <a href="${rules}" style="color:#dc2626;text-decoration:underline">official rules</a>
    before the first pairing. Keep the event page open throughout the day. It
    carries your check-in, room link, ballot, standings, and bracket.
  </p>

  ${renderFooter({
    uid,
    stream: 'transactional',
    reason: `You're getting this because you entered The Debatable Open.`,
  })}
</div>`;
}

async function retryableSend(message) {
  let result = await sendEmail(message);
  if (result.rateLimited) {
    await sleep(Math.max(600, Math.min(result.retryAfterMs || 1200, 3000)));
    result = await sendEmail(message);
  }
  return result;
}

export default async () => {
  const now = Date.now();
  // Scheduled functions can start a little late. Sending any time from five
  // minutes before 06:00 until five minutes before the event is useful; after
  // that, a new inbox notification would distract people already in rooms.
  if (now < SEND_AT_MS - 5 * 60_000 || now > EVENT_START_MS - 5 * 60_000) {
    console.log('[tournament-day-reminder] outside the 2026 event window, skipping');
    return;
  }

  const db = getDb();
  const stateRef = db.doc(STATE_DOC);

  const tournamentSnap = await db.collection('tournaments')
    .where('isPublic', '==', true)
    .where('status', 'in', ['registration', 'running'])
    .limit(10)
    .get();
  const tournaments = tournamentSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const tournament = tournaments.find((item) => item.name === EVENT_NAME);
  if (!tournament) {
    await stateRef.set({
      lastRunAt: FieldValue.serverTimestamp(),
      status: 'no-open-tournament',
    }, { merge: true });
    console.error('[tournament-day-reminder] The Debatable Open is not open');
    return;
  }

  const entriesSnap = await db.collection('tournaments').doc(tournament.id)
    .collection('entries').get();
  const entrantUids = new Set();
  entriesSnap.docs.forEach((doc) => {
    const entry = doc.data() || {};
    if (!ACTIVE_ENTRY_STATUSES.has(String(entry.status || 'registered'))) return;
    if (entry.uid) entrantUids.add(entry.uid);
    (Array.isArray(entry.members) ? entry.members : []).forEach((uid) => {
      if (uid) entrantUids.add(uid);
    });
  });

  const [authUsers, profilesSnap] = await Promise.all([
    listAllAuthUsers(),
    db.collection('user_profiles').limit(3000).get(),
  ]);
  const authByUid = new Map(authUsers.map((user) => [user.uid, user]));
  const profilesByUid = new Map();
  profilesSnap.docs.forEach((doc) => profilesByUid.set(doc.id, doc.data() || {}));

  let sent = 0;
  let alreadySent = 0;
  let optedOut = 0;
  let noEmail = 0;
  let errors = 0;
  const errorReasons = {};

  for (const uid of entrantUids) {
    const user = authByUid.get(uid);
    const profile = profilesByUid.get(uid) || null;
    if (!user?.email) { noEmail += 1; continue; }
    // A missing profile is not an opt-out for a transactional reminder about
    // an event the person explicitly entered. An existing global opt-out is.
    if (profile && isOptedOut(profile, 'transactional')) { optedOut += 1; continue; }
    if (profile?.tournamentDayReminderEventId === tournament.id) {
      alreadySent += 1;
      continue;
    }

    const result = await retryableSend({
      to: user.email,
      subject: SUBJECT,
      html: renderEmail({ name: firstName(user, profile), uid }),
      uid,
      stream: 'transactional',
      from: process.env.TOURNAMENT_DAY_FROM || undefined,
      replyTo: process.env.TOURNAMENT_DAY_REPLY_TO || undefined,
    });

    if (result.ok) {
      sent += 1;
      try {
        await db.doc(`user_profiles/${uid}`).set({
          tournamentDayReminderEventId: tournament.id,
          tournamentDayReminderSentAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (stampError) {
        errors += 1;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('[tournament-day-reminder] stamp failed for', uid, stampError.message);
      }
    } else {
      errors += 1;
      const reason = result.reason || `status-${result.status || 'unknown'}`;
      errorReasons[reason] = (errorReasons[reason] || 0) + 1;
      if (result.quotaExhausted) break;
    }
    await sleep(PACE_MS);
  }

  const status = errors ? (sent ? 'partial' : 'failed') : 'sent';
  await stateRef.set({
    eventId: tournament.id,
    lastRunAt: FieldValue.serverTimestamp(),
    status,
    entrants: entrantUids.size,
    sent,
    alreadySent,
    optedOut,
    noEmail,
    errors,
    errorReasons,
  }, { merge: true });
  console.log('[tournament-day-reminder]', {
    status, entrants: entrantUids.size, sent, alreadySent, optedOut, noEmail, errors, errorReasons,
  });
};

// First run is exactly 06:00 Pacific. Later slots retry only entrants without
// a success stamp, so a transient Auth, Firestore, or Resend failure does not
// strand somebody while a healthy first run still delivers exactly once.
export const config = { schedule: '0,5,10,15,20,25,30,35,40,45,50 13 29 8 *' };
