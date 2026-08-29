/* admin-open-elo-update.mjs  ·  POST /api/admin/open-elo-update
 *
 * One event-day correction to active entrants in The Debatable Open. The
 * event is a continuous rating ladder now, not a fixed prelim-to-elims day.
 * This is tournament operations mail, never a whole-account marketing blast.
 *
 * POST {} previews the eligible cohort. POST {confirm:'SEND'} sends one
 * resumable batch. Each successful recipient gets a dedicated stamp so a
 * retry, browser refresh, or second operator cannot send the correction twice.
 */

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import {
  SITE_URL, brandHeader, esc, isOptedOut, renderFooter, sendEmail,
  verifiedSenderDomains, senderDomain,
} from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';

const EVENT_NAME = 'The Debatable Open';
const ACTIVE_ENTRY_STATUSES = new Set(['registered', 'checked_in']);
const SUBJECT = 'The Open is an Elo ladder all day';
const STREAM = 'transactional';
const STAMP = 'openEloDayUpdate20260829SentAt';
const FALLBACK_VERIFIED = ['debateai.com'];
const FROM_EMAIL = process.env.TOURNAMENT_DAY_FROM || process.env.OPEN_ANNOUNCE_FROM
  || process.env.EMAIL_FROM || 'Debatable <hello@debateai.com>';
const REPLY_TO = process.env.TOURNAMENT_DAY_REPLY_TO
  || process.env.OPEN_ANNOUNCE_REPLY_TO || 'hello@itsdebatable.com';
const BATCH_MAX = Math.min(60, parseInt(process.env.OPEN_ANNOUNCE_BATCH || '20', 10) || 20);

function renderEmail({ firstName, uid, tournamentName }) {
  const open = `${SITE_URL}/open?utm_source=email&utm_medium=email&utm_campaign=open_elo_day`;
  return `
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.96rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:1.02rem;line-height:1.6;margin:0 0 16px">
    <strong>${esc(tournamentName)} is gathering Elo across the day.</strong>
    There is no elimination break today. The ladder stays open so people can
    keep getting different opponents and building a rating.
  </p>

  <p style="font-size:.96rem;line-height:1.6;margin:0 0 16px">
    Check in on the Open page and press <strong>Ready for a rated round</strong>.
    Every completed ballot updates today's Elo standings. When your round ends,
    go back and press Ready again for another opponent.
  </p>

  <p style="font-size:.96rem;line-height:1.6;margin:0 0 20px">
    You do not need to wait for a bracket or a scheduled round. New people can
    still enter and check in during the day.
  </p>

  <p style="margin:0 0 24px">
    <a href="${open}" style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;font-size:1rem;padding:14px 24px;border-radius:12px;text-decoration:none">Check in and get a round &rarr;</a>
  </p>

  <p style="font-size:.96rem;line-height:1.6;margin:0 0 20px">Debatable</p>

  ${renderFooter({
    uid,
    stream: STREAM,
    reason: `You're getting this because you entered The Debatable Open.`,
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
  try { body = await request.json(); } catch { /* empty body is a preview */ }

  const wantsSend = body?.confirm === 'SEND';
  const fromDomain = senderDomain(FROM_EMAIL);
  const live = await verifiedSenderDomains();
  const allowed = live.ok ? live.domains : FALLBACK_VERIFIED;
  const verifiedSource = live.ok ? 'resend' : `fallback (${live.reason})`;
  const senderOk = allowed.includes(fromDomain);
  if (wantsSend && !senderOk) {
    return jsonResponse({
      error: 'UNVERIFIED_SENDER',
      message: `From is ${FROM_EMAIL}, and ${fromDomain || 'that domain'} is not a verified Resend sender. Verified right now: ${allowed.join(', ') || 'nothing'}.`,
      verifiedDomains: allowed,
      verifiedSource,
    }, 409, request);
  }

  const dryRun = !wantsSend || !process.env.RESEND_API_KEY;
  const batch = Math.min(BATCH_MAX, Math.max(1, parseInt(body?.batch, 10) || BATCH_MAX));

  const openSnap = await db.collection('tournaments')
    .where('isPublic', '==', true)
    .where('status', '==', 'running')
    .limit(10)
    .get();
  const tournament = openSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .find((item) => item.name === EVENT_NAME && item.ratingCompetition === true);
  if (!tournament) {
    return jsonResponse({
      error: 'NO_RATING_EVENT',
      message: 'The live Open rating ladder was not found. Nothing was sent.',
    }, 409, request);
  }

  const entrants = new Set();
  try {
    const entriesSnap = await db.collection(`tournaments/${tournament.id}/entries`).get();
    entriesSnap.docs.forEach((doc) => {
      const entry = doc.data() || {};
      const status = String(entry.status || 'registered');
      if (!ACTIVE_ENTRY_STATUSES.has(status)) return;
      if (entry.uid) entrants.add(entry.uid);
      (Array.isArray(entry.members) ? entry.members : []).forEach((uid) => {
        if (uid) entrants.add(uid);
      });
    });
  } catch (error) {
    console.error('[open-elo-update] entries read failed:', error.message);
    return errorResponse('Could not read the active entrant list. Nothing was sent.', 502, request);
  }
  if (!entrants.size) {
    return jsonResponse({
      error: 'NO_ACTIVE_ENTRANTS',
      message: 'There are no active entrants to email. Nothing was sent.',
    }, 409, request);
  }

  const authUsers = await listAllAuthUsers().catch((error) => {
    console.error('[open-elo-update] listAllAuthUsers failed:', error.message);
    return null;
  });
  if (!authUsers) return errorResponse('Could not read the account list. Nothing was sent.', 502, request);

  const profilesSnap = await db.collection('user_profiles').limit(3000).get();
  const profiles = new Map();
  profilesSnap.docs.forEach((doc) => profiles.set(doc.id, doc.data() || {}));

  let eligible = 0;
  let sent = 0;
  let errors = 0;
  let notEntered = 0;
  let noEmail = 0;
  let optedOut = 0;
  let alreadySent = 0;
  let mailedWithoutProfile = 0;
  const errorReasons = {};
  const sample = [];

  for (const user of authUsers) {
    if (!entrants.has(user.uid)) { notEntered += 1; continue; }
    if (!user.email) { noEmail += 1; continue; }
    const profile = profiles.get(user.uid) || null;
    if (profile && isOptedOut(profile, STREAM)) { optedOut += 1; continue; }
    if (profile && profile[STAMP]) { alreadySent += 1; continue; }

    eligible += 1;
    if (!profile) mailedWithoutProfile += 1;
    if (dryRun) {
      if (sample.length < 10) sample.push(user.email);
      continue;
    }
    if (sent >= batch) continue;

    const firstName = String(profile?.displayName || user.displayName || '')
      .trim().split(/\s+/)[0] || 'there';
    const result = await sendEmail({
      to: user.email,
      subject: SUBJECT,
      html: renderEmail({
        firstName,
        uid: user.uid,
        tournamentName: tournament.name || EVENT_NAME,
      }),
      uid: user.uid,
      stream: STREAM,
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
    });
    if (result.ok) {
      sent += 1;
      try {
        await db.doc(`user_profiles/${user.uid}`).set({
          [STAMP]: FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (stampError) {
        errors += 1;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('[open-elo-update] stamp failed for', user.uid, stampError.message);
      }
    } else {
      errors += 1;
      const reason = result.reason || `status-${result.status || 'unknown'}`;
      errorReasons[reason] = (errorReasons[reason] || 0) + 1;
    }
  }

  const remaining = dryRun ? eligible : Math.max(0, eligible - sent);
  const response = {
    dryRun,
    from: FROM_EMAIL,
    senderVerified: senderOk,
    verifiedDomains: allowed,
    verifiedSource,
    subject: SUBJECT,
    tournament: { id: tournament.id, name: tournament.name || EVENT_NAME },
    accounts: entrants.size,
    authAccounts: authUsers.length,
    eligible,
    sent,
    remaining,
    errors,
    mailedWithoutProfile,
    skipped: { noEmail, optedOut, alreadySent, notEntered },
    errorReasons,
    sample: dryRun ? sample : [],
  };

  await db.doc('config/open_elo_day_update_20260829').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: response,
  }, { merge: true }).catch(() => {});

  return jsonResponse(response, 200, request);
};

export const config = { path: '/api/admin/open-elo-update' };
