/* admin-open-timeslot.mjs  ·  POST /api/admin/open-timeslot
 *
 * The THIRD touch on The Debatable Open, and the only one that asks for
 * something back rather than asking someone to enter.
 *
 * Why it exists. A round needs two people online at the same moment,
 * and at this field size that is the only thing that can kill the day.
 * The event used to answer this with three published sessions, which
 * split a field of eighteen across twelve hours and made the problem
 * worse while looking generous. As of 2026-08-25 there is ONE session,
 * 10:00 AM Eastern, and this email is the commitment ask that goes with
 * it: not "which hour suits you" but "confirm you will be there".
 *
 * The replies are the product: they tell the organiser how many of the
 * field are actually turning up at 10, while there is still time to
 * chase the ones who are not.
 *
 * THE COHORT IS INVERTED relative to admin-open-reminder.mjs, and that
 * is the whole difference between the two. The reminder skips anyone
 * holding an entry, because "come and enter" is noise to someone who
 * already did. This one mails ONLY entrants: "you're in for Saturday"
 * is a false statement to anyone else, and asking a non-entrant to pick
 * an hour asks them to plan a day they have not signed up for.
 *
 * Entry docs are auto-id'd and carry uids in a `members` ARRAY (a 1v1
 * entry is a one-member team). Doc id and `uid` are read as fallbacks
 * for older shapes. That array read is not cosmetic: reading `uid`
 * alone counted zero entrants against six real entries on 2026-08-19.
 *
 * Same two-press shape as the other two: POST {} is a dry run,
 * POST {confirm:'SEND'} sends one batch and reports what is left.
 *
 * Deliberately NOT here:
 *  - No prize money in the copy, so no age disclosure is required. The
 *    rule is that the 18+ line travels with any money claim; the way to
 *    satisfy it in a short logistics email is to make no money claim.
 *  - No unsubscribe stream of its own. It rides `open`, so someone who
 *    opted out of Open mail is already covered and does not have to opt
 *    out twice.
 *  - No cron. Replies come back to a human who has to read them, so it
 *    sends when he is around to answer, not at 4 AM.
 *
 * Env: same as the other two (RESEND_API_KEY, OPEN_ANNOUNCE_FROM,
 * OPEN_ANNOUNCE_REPLY_TO, OPEN_ANNOUNCE_BATCH, SITE_URL).
 */

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL,
         verifiedSenderDomains, senderDomain } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';

const FALLBACK_VERIFIED = ['debateai.com'];
const FROM_EMAIL  = process.env.OPEN_ANNOUNCE_FROM || process.env.EMAIL_FROM
                 || 'Debatable <hello@debateai.com>';
// The ask IS the reply, so this has to reach a person who reads it.
const REPLY_TO    = process.env.OPEN_ANNOUNCE_REPLY_TO || 'hello@itsdebatable.com';
const BATCH_MAX   = Math.min(60, parseInt(process.env.OPEN_ANNOUNCE_BATCH || '20', 10) || 20);
const STREAM      = 'open';
const SUBJECT     = 'Saturday is one session: 10 AM Eastern';
const EVENT_LABEL = 'Saturday, August 29';
// Doors. Past this the question is moot: they are either there or they
// are not, and an email asking them to plan is late rather than useful.
const DOORS_OPEN_MS = Date.parse('2026-08-29T10:00:00-04:00');

// Short by design. One ask, no pitch, no money, no preface. The hour is
// the one published in the run-of-day on /tournaments, on
// /tournament-rules and in the sitewide strip; if it moves, move it in
// all of them in the same commit.
function renderEmail({ firstName, uid, tournamentName }) {
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    You're in for ${esc(tournamentName)} on ${esc(EVENT_LABEL)}. One change
    since you entered, and it is the only thing you need to know.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    We were running three sessions across the day. We are running one:
  </p>

  <p style="font-size:1.15rem;line-height:1.6;margin:0 0 16px;font-weight:800">
    10:00 AM Eastern<br>
    <span style="font-size:.9rem;font-weight:600;color:#6b6b76">Delhi 7:30 PM &middot; Lagos 3 PM &middot; London 3 PM &middot; New York 10 AM</span>
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    A round needs two people online at the same moment, and a field spread
    across twelve hours never gets there. So everyone is on the same hour.
    There is no second session and no make-up round: if you are not in the
    room at 10:00, you do not play.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    Reply YES if you'll be there and I'll make sure you get paired quickly.
    Reply NO if you can't and I'll take you off the bracket, no hard feelings.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">Debatable</p>

  ${renderFooter({
    uid,
    stream: STREAM,
    reason: "You're getting this because you entered The Debatable Open.",
  })}
</div>`;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { db } = gate;

  let body = {};
  try { body = await request.json(); } catch { /* empty body = dry run */ }

  // Once the doors are open the question answers itself. Refuse on the
  // dry run too, so the button reads dead rather than inviting a send
  // that would land after it could be acted on.
  if (Date.now() >= DOORS_OPEN_MS) {
    return jsonResponse({
      error: 'DOORS_OPEN',
      message: `Doors opened (${EVENT_LABEL}, 10 AM ET). Asking people to plan a time is no longer useful; do not send it.`,
    }, 409, request);
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
             + `Verified right now: ${allowed.join(', ') || 'nothing'}.`,
      verifiedDomains: allowed,
      verifiedSource,
    }, 409, request);
  }
  const dryRun = !wantsSend || !process.env.RESEND_API_KEY;
  const batch = Math.min(BATCH_MAX, Math.max(1, parseInt(body?.batch, 10) || BATCH_MAX));

  // The Open holds `registration` and `running` at once on the day
  // (2026-08-18 drop-in fix), so accept either.
  const openSnap = await db.collection('tournaments')
    .where('isPublic', '==', true).where('status', 'in', ['registration', 'running']).limit(5).get();
  if (openSnap.empty) {
    return jsonResponse({
      error: 'NO_OPEN_TOURNAMENT',
      message: 'No public tournament is open, so there is no entrant list to mail.',
    }, 409, request);
  }
  const docs = openSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
  const tourn = docs.find(t => t.status === 'registration') || docs[0];

  // The entrant set IS the cohort here. Read the members array, not
  // just `uid`: a uid-only read reported zero against six live entries.
  const entered = new Set();
  try {
    const entriesSnap = await db.collection(`tournaments/${tourn.id}/entries`).get();
    entriesSnap.docs.forEach(d => {
      entered.add(d.id);
      const data = d.data() || {};
      if (data.uid) entered.add(data.uid);
      (Array.isArray(data.members) ? data.members : []).forEach(m => { if (m) entered.add(m); });
    });
  } catch (err) {
    console.error('[open-timeslot] entries read failed:', err.message);
    return errorResponse('Could not read the entry list. Nothing was sent.', 502, request);
  }
  if (!entered.size) {
    return jsonResponse({
      error: 'NO_ENTRANTS',
      message: 'Nobody has entered yet, so there is nobody to ask.',
      tournament: { id: tourn.id, name: tourn.name || '' },
    }, 409, request);
  }

  const authUsers = await listAllAuthUsers().catch((err) => {
    console.error('[open-timeslot] listAllAuthUsers failed:', err.message);
    return null;
  });
  if (!authUsers) return errorResponse('Could not read the account list. Nothing was sent.', 502, request);

  const profilesSnap = await db.collection('user_profiles').limit(3000).get();
  const profByUid = new Map();
  profilesSnap.docs.forEach(d => profByUid.set(d.id, d.data() || {}));

  let eligible = 0, sent = 0, errors = 0;
  let notEntered = 0, noEmail = 0, optedOut = 0, alreadySent = 0;
  const errorReasons = {};
  const sample = [];

  for (const user of authUsers) {
    // The inversion. Everything else in this loop matches the reminder.
    if (!entered.has(user.uid)) { notEntered++; continue; }
    if (!user.email) { noEmail++; continue; }
    const prof = profByUid.get(user.uid) || null;
    // A missing profile doc is not an opt-out: opting out CREATES the doc
    // (measured 2026-08-12, 97 of 169 accounts had no profile and none of
    // them had opted out).
    if (prof && isOptedOut(prof, STREAM)) { optedOut++; continue; }
    if (prof && prof.openTimeslotSentAt) { alreadySent++; continue; }

    eligible++;
    if (dryRun) {
      if (sample.length < 10) sample.push(user.email);
      continue;
    }
    if (sent >= batch) continue;

    const firstName = String((prof && prof.displayName) || user.displayName || '').trim().split(/\s+/)[0] || 'debater';
    const res = await sendEmail({
      to: user.email,
      subject: SUBJECT,
      html: renderEmail({
        firstName,
        uid: user.uid,
        tournamentName: tourn.name || 'The Debatable Open',
      }),
      uid: user.uid,
      stream: STREAM,
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
    });
    if (res.ok) {
      sent++;
      // set+merge so the stamp can create a missing profile doc. A stamp
      // that fails is a person who gets asked twice, so it counts as an
      // error rather than passing quietly.
      try {
        await db.doc(`user_profiles/${user.uid}`)
          .set({ openTimeslotSentAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (stampErr) {
        errors++;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('open-timeslot: stamp failed for', user.uid, stampErr.message);
      }
    } else {
      errors++;
      const why = res.reason || `status-${res.status || 'unknown'}`;
      errorReasons[why] = (errorReasons[why] || 0) + 1;
    }
  }

  const remaining = dryRun ? eligible : Math.max(0, eligible - sent);
  const result = {
    dryRun,
    from: FROM_EMAIL,
    senderVerified: senderOk,
    verifiedDomains: allowed,
    verifiedSource,
    subject: SUBJECT,
    tournament: { id: tourn.id, name: tourn.name || '', startsAt: tourn.startsAt || '' },
    doorsOpen: new Date(DOORS_OPEN_MS).toISOString(),
    entrantUids: entered.size,
    // The shared card renderer prints this as "N accounts". For the other
    // two campaigns the relevant pool IS every account; here it is the
    // entrant list, and reporting 1,515 next to a cohort of 8 would read
    // as a broken query rather than a deliberately narrow one. The raw
    // total stays available as authAccounts.
    accounts: entered.size,
    authAccounts: authUsers.length,
    eligible, sent, remaining, errors,
    skipped: { noEmail, optedOut, alreadySent, notEntered },
    errorReasons,
    sample: dryRun ? sample : [],
  };

  await db.doc('config/open_timeslot_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: result,
  }, { merge: true }).catch(() => {});

  return jsonResponse(result, 200, request);
};

export const config = { path: '/api/admin/open-timeslot' };
