/* scheduled-tournament-day-reminder.mjs
 *
 * One-time operational reminder for The Debatable Open. Netlify invokes this
 * every five minutes during the 11:00 UTC hour on August 29. The first run
 * after this deploy sends the full day guide; later runs catch a fresh entrant
 * only if they do not have the per-event success stamp. The separate kickoff
 * reminder owns the five-minute-before-start message.
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

const SEND_AT_MS = Date.parse('2026-08-29T04:20:00-07:00');
const DETAILS_CUTOFF_MS = Date.parse('2026-08-29T05:00:00-07:00');
const EVENT_NAME = 'The Debatable Open';
const SUBJECT = 'The Debatable Open: schedule, check-in, and rules';
const STATE_DOC = 'config/tournament_day_reminder_20260829';
const ACTIVE_ENTRY_STATUSES = new Set(['registered', 'checked_in']);
// Resend's normal per-second ceiling is the limiting resource here. A slower
// pace gets the whole live roster through one invocation instead of making the
// five-minute retry job advance only a few recipients at a time.
const PACE_MS = 650;
const DISCORD_URL = 'https://discord.gg/WMHZW9BKvJ';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function firstName(user, profile) {
  const raw = String(profile?.displayName || user?.displayName || '').trim();
  return raw ? raw.split(/\s+/)[0] : 'there';
}

export function renderEmail({ name, uid }) {
  const eventPage = `${SITE_URL}/open?utm_source=email&utm_medium=email&utm_campaign=open_day`;
  const rules = `${SITE_URL}/tournament-rules`;
  const landing = `${SITE_URL}/`;
  return `
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.96rem;line-height:1.6;margin:0 0 14px">Hey ${esc(name)},</p>

  <p style="font-size:1.02rem;line-height:1.65;margin:0 0 16px">
    <strong>Schedule</strong><br>
    6:50 AM Pacific, 9:50 AM Eastern: The stream starts on the
    <a href="${landing}" style="color:#dc2626;text-decoration:underline">landing page</a>
    and in the <a href="${eventPage}" style="color:#dc2626;text-decoration:underline">tournament room</a>.<br>
    7:00 AM Pacific, 10:00 AM Eastern: The roster locks and the first pairings begin.<br>
    Through 9:30 AM Pacific, 12:30 PM Eastern: Preliminary rounds.<br>
    Around 10:15 AM Pacific, 1:15 PM Eastern: The final. Elimination timing may move as rounds finish.
  </p>

  <p style="margin:0 0 24px">
    <a href="${eventPage}" style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;font-size:1rem;padding:14px 24px;border-radius:12px;text-decoration:none">Check in now &rarr;</a>
  </p>

  <p style="font-size:.94rem;line-height:1.6;margin:0 0 12px">
    <strong>Check in:</strong> Open the tournament room, sign in with the account
    you registered with, press <strong>Check in now</strong>, and accept the
    recording notice. If you are under 18, a parent or guardian must have
    approved. Keep that page open. Your pairing and <strong>Join your room</strong>
    button appear there. Join the <a href="${DISCORD_URL}" style="color:#dc2626;text-decoration:underline">Discord</a>
    as a backup for room links, schedule changes, and help if video fails.
  </p>

  <p style="font-size:.94rem;line-height:1.6;margin:0 0 12px">
    <strong>How competing works:</strong> Every round is a casual one-on-one.
    Each room draws three resolutions from the published pool. Both sides
    secretly strike one, the strikes reveal together, and the room settles the
    surviving resolution and sides. Each person gets a 90-second opening and a
    60-second reply. Debate without outside help. Standings rank total wins
    first, then speaker points. Playing more rounds gives you more chances to
    add a win. The break size is posted in the tournament room.
  </p>

  <p style="font-size:.94rem;line-height:1.6;margin:0 0 12px">
    <strong>Questions, pace, and camera:</strong> Questions and interruptions are
    captured with the round and may generate private clips. A well-asked
    question can improve responsiveness and persuasion. Heckling or disruption
    can hurt. Pace is calculated by the AI, and speech above 250 words per
    minute is flagged as spreading. Camera presence adds 2 standings points,
    Avatar mode subtracts 1, and camera off or too dark subtracts 3. These
    adjustments affect only the speaker-point tiebreak, never the round winner.
  </p>

  <p style="font-size:.94rem;line-height:1.6;margin:0 0 12px">
    <strong>Judging and fair winners:</strong> The published AI panel decides
    preliminary and early elimination rounds and gives a written reason for
    every decision. Either side may appeal a panel ballot for human review. The
    audience decides the final when the published vote floor and close-vote
    rules are met. Otherwise, the panel ballot decides it.
  </p>

  <p style="font-size:.94rem;line-height:1.6;margin:0 0 18px">
    <strong>Recording and the goal:</strong> Every round is recorded, including
    voice, video or Avatar mode, questions, interruptions, the resolution, and
    the ballot reveal. One goal of the tournament is to capture strong footage
    and useful clips while awarding the winners fairly. Preliminary footage and
    generated clips stay private by default and are not put on the public stream
    without separate public-use permission. Elimination rounds may be streamed
    and replayed under the official rules.
  </p>

  <p style="font-size:.88rem;line-height:1.6;color:#6b6b76;margin:0">
    Use a laptop, plug it in, connect headphones, and allow camera and microphone
    access. If you disconnect during a round, you have five minutes to return.
    Missing a room by more than five minutes is a forfeit. Read the
    <a href="${rules}" style="color:#dc2626;text-decoration:underline">official rules</a>.
  </p>

  ${renderFooter({
    uid,
    stream: 'transactional',
    reason: `You're getting this because you entered The Debatable Open.`,
  })}
</div>`;
}

export function renderTextEmail({ name }) {
  const eventPage = `${SITE_URL}/open?utm_source=email&utm_medium=email&utm_campaign=open_day`;
  return `Hey ${name},

SCHEDULE
6:50 AM Pacific, 9:50 AM Eastern: The stream starts on ${SITE_URL}/ and in the tournament room.
7:00 AM Pacific, 10:00 AM Eastern: The roster locks and the first pairings begin.
Through 9:30 AM Pacific, 12:30 PM Eastern: Preliminary rounds.
Around 10:15 AM Pacific, 1:15 PM Eastern: The final. Elimination timing may move as rounds finish.

CHECK IN
Open ${eventPage}, sign in with the account you registered with, press Check in now, and accept the recording notice. If you are under 18, a parent or guardian must have approved. Keep the page open. Your pairing and Join your room button appear there. Join Discord as a backup: ${DISCORD_URL}

HOW COMPETING WORKS
Every round is a casual one-on-one. Each room draws three resolutions from the published pool. Both sides secretly strike one, the strikes reveal together, and the room settles the surviving resolution and sides. Each person gets a 90-second opening and a 60-second reply. Debate without outside help. Standings rank total wins first, then speaker points. Playing more rounds gives you more chances to add a win. The break size is posted in the tournament room.

QUESTIONS, PACE, AND CAMERA
Questions and interruptions are captured with the round and may generate private clips. A well-asked question can improve responsiveness and persuasion. Heckling or disruption can hurt. Pace is calculated by the AI, and speech above 250 words per minute is flagged as spreading. Camera presence adds 2 standings points, Avatar mode subtracts 1, and camera off or too dark subtracts 3. These adjustments affect only the speaker-point tiebreak, never the round winner.

JUDGING AND FAIR WINNERS
The published AI panel decides preliminary and early elimination rounds and gives a written reason for every decision. Either side may appeal a panel ballot for human review. The audience decides the final when the published vote floor and close-vote rules are met. Otherwise, the panel ballot decides it.

RECORDING AND THE GOAL
Every round is recorded, including voice, video or Avatar mode, questions, interruptions, the resolution, and the ballot reveal. One goal is to capture strong footage and useful clips while awarding the winners fairly. Preliminary footage and generated clips stay private by default and are not put on the public stream without separate public-use permission. Elimination rounds may be streamed and replayed under the official rules.

Use a laptop, plug it in, connect headphones, and allow camera and microphone access. If you disconnect during a round, you have five minutes to return. Missing a room by more than five minutes is a forfeit.

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
  // This is the detailed advance email. The repeated cron catches a deploy
  // that misses one slot and reaches new entries during this short window;
  // the per-user stamp makes every healthy recipient a one-time send.
  if (now < SEND_AT_MS || now >= DETAILS_CUTOFF_MS) {
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
      text: renderTextEmail({ name: firstName(user, profile) }),
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

// Runs at the next five-minute mark after deploy, then catches new entrants
// through 04:55 Pacific. The five-minute kickoff reminder is a separate job.
export const config = { schedule: '*/5 11 29 8 *' };
