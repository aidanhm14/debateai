/* scheduled-tournament-kickoff-reminder.mjs
 *
 * The short second email for The Debatable Open. It runs at 13:55 UTC on
 * August 29, five minutes before the published start. The detailed schedule,
 * rules, and recording guide is sent earlier by
 * scheduled-tournament-day-reminder.mjs.
 */

import { getDb, FieldValue } from './lib/firestore.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
import {
  SITE_URL, brandHeader, esc, isOptedOut, renderFooter, sendEmail,
} from './lib/email.mjs';

const SEND_AT_MS = Date.parse('2026-08-29T06:55:00-07:00');
const EVENT_START_MS = Date.parse('2026-08-29T07:00:00-07:00');
const EVENT_NAME = 'The Debatable Open';
const SUBJECT = 'Starts in 5 minutes: check in for The Debatable Open';
const STATE_DOC = 'config/tournament_kickoff_reminder_20260829';
const ACTIVE_ENTRY_STATUSES = new Set(['registered', 'checked_in']);
const DISCORD_URL = 'https://discord.gg/WMHZW9BKvJ';
const PACE_MS = 140;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function firstName(user, profile) {
  const raw = String(profile?.displayName || user?.displayName || '').trim();
  return raw ? raw.split(/\s+/)[0] : 'there';
}

export function renderKickoffEmail({ name, uid }) {
  const eventPage = `${SITE_URL}/open?utm_source=email&utm_medium=email&utm_campaign=open_kickoff`;
  const landing = `${SITE_URL}/`;
  const rules = `${SITE_URL}/tournament-rules`;
  return `
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.96rem;line-height:1.6;margin:0 0 14px">Hey ${esc(name)},</p>

  <p style="font-size:1.02rem;line-height:1.65;margin:0 0 16px">
    <strong>Schedule</strong><br>
    6:50 AM Pacific, 9:50 AM Eastern: The stream is live on the
    <a href="${landing}" style="color:#dc2626;text-decoration:underline">landing page</a>
    and in the <a href="${eventPage}" style="color:#dc2626;text-decoration:underline">tournament room</a>.<br>
    7:00 AM Pacific, 10:00 AM Eastern: The roster locks and the first pairings begin.
  </p>

  <p style="font-size:1.08rem;line-height:1.6;margin:0 0 16px">
    <strong>The Open starts in five minutes.</strong> Open the tournament room,
    sign in with the account you registered with, press <strong>Check in now</strong>,
    and accept the recording notice. Keep the page open. Your pairing and
    <strong>Join your room</strong> button appear there.
  </p>

  <p style="margin:0 0 22px">
    <a href="${eventPage}" style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;font-size:1rem;padding:14px 24px;border-radius:12px;text-decoration:none">Check in now &rarr;</a>
  </p>

  <p style="font-size:.94rem;line-height:1.6;margin:0 0 12px">
    Every round is recorded, including questions and interruptions. If you are
    under 18, a parent or guardian must have approved. Use a laptop, headphones,
    and a stable connection. Missing your room by more than five minutes is a
    forfeit.
  </p>

  <p style="font-size:.9rem;line-height:1.6;color:#6b6b76;margin:0">
    Join the <a href="${DISCORD_URL}" style="color:#dc2626;text-decoration:underline">Discord</a>
    now as a backup for room links, schedule changes, and help if video fails.
    The <a href="${rules}" style="color:#dc2626;text-decoration:underline">official rules</a>
    remain in force.
  </p>

  ${renderFooter({
    uid,
    stream: 'transactional',
    reason: `You're getting this because you entered The Debatable Open.`,
  })}
</div>`;
}

export function renderKickoffText({ name }) {
  const eventPage = `${SITE_URL}/open?utm_source=email&utm_medium=email&utm_campaign=open_kickoff`;
  return `Hey ${name},

SCHEDULE
6:50 AM Pacific, 9:50 AM Eastern: The stream is live on ${SITE_URL}/ and in the tournament room.
7:00 AM Pacific, 10:00 AM Eastern: The roster locks and the first pairings begin.

The Open starts in five minutes. Open ${eventPage}, sign in with the account you registered with, press Check in now, and accept the recording notice. Keep the page open. Your pairing and Join your room button appear there.

Every round is recorded, including questions and interruptions. If you are under 18, a parent or guardian must have approved. Use a laptop, headphones, and a stable connection. Missing your room by more than five minutes is a forfeit.

Join Discord now as a backup for room links, schedule changes, and help if video fails: ${DISCORD_URL}

Official rules: ${SITE_URL}/tournament-rules`;
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
  // Netlify can start a scheduled function a little late. One minute early is
  // harmless, but once pairings are due an inbox alert is a distraction.
  if (now < SEND_AT_MS - 60_000 || now >= EVENT_START_MS) {
    console.log('[tournament-kickoff-reminder] outside the 2026 event window, skipping');
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
    console.error('[tournament-kickoff-reminder] The Debatable Open is not open');
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
    if (profile && isOptedOut(profile, 'transactional')) { optedOut += 1; continue; }
    if (profile?.tournamentKickoffReminderEventId === tournament.id) {
      alreadySent += 1;
      continue;
    }

    const name = firstName(user, profile);
    const result = await retryableSend({
      to: user.email,
      subject: SUBJECT,
      html: renderKickoffEmail({ name, uid }),
      text: renderKickoffText({ name }),
      uid,
      stream: 'transactional',
      from: process.env.TOURNAMENT_DAY_FROM || undefined,
      replyTo: process.env.TOURNAMENT_DAY_REPLY_TO || undefined,
    });

    if (result.ok) {
      sent += 1;
      try {
        await db.doc(`user_profiles/${uid}`).set({
          tournamentKickoffReminderEventId: tournament.id,
          tournamentKickoffReminderSentAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (stampError) {
        errors += 1;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('[tournament-kickoff-reminder] stamp failed for', uid, stampError.message);
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
  console.log('[tournament-kickoff-reminder]', {
    status, entrants: entrantUids.size, sent, alreadySent, optedOut, noEmail, errors, errorReasons,
  });
};

export const config = { schedule: '55 13 29 8 *' };
