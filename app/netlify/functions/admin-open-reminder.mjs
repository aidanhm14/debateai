/* admin-open-reminder.mjs  ·  POST /api/admin/open-reminder
 *
 * The SECOND touch on The Debatable Open: a short deadline email sent in
 * the final days before the founding cutoff (Friday, August 22), to the
 * same list the announcement reached plus everyone who joined since.
 * Same two-press button shape as admin-open-announce.mjs: POST {} is a
 * dry run, POST {confirm:'SEND'} sends one batch and reports remaining.
 *
 * Differences from the announcement, each deliberate:
 *  - Own stamp (`openReminderSentAt`), and it does NOT skip people the
 *    announcement reached. A reminder to the same list is the point.
 *  - SKIPS anyone who already holds an entry in the open tournament.
 *    "Enter before Friday" mailed to someone who entered is noise that
 *    spends the one reminder this list will tolerate.
 *  - REFUSES to run after the cutoff it advertises. A deadline email
 *    sent past its deadline is a false claim, not a late one.
 *  - Accepts a bracket in `registration` OR `running` (the 2026-08-18
 *    drop-in fix: the Open holds both states at once on the day).
 *
 * Env: same as admin-open-announce (RESEND_API_KEY, OPEN_ANNOUNCE_FROM,
 * OPEN_ANNOUNCE_REPLY_TO, OPEN_ANNOUNCE_BATCH, SITE_URL).
 */

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL,
         verifiedSenderDomains, senderDomain } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
import { FOUNDING_CUTOFF_LABEL, FOUNDING_CUTOFF_MS } from './lib/founding-comp.mjs';

const FALLBACK_VERIFIED = ['debateai.com'];
const FROM_EMAIL  = process.env.OPEN_ANNOUNCE_FROM || process.env.EMAIL_FROM
                 || 'Aidan at Debatable <aidan@debateai.com>';
const REPLY_TO    = process.env.OPEN_ANNOUNCE_REPLY_TO || undefined;
const BATCH_MAX   = Math.min(60, parseInt(process.env.OPEN_ANNOUNCE_BATCH || '20', 10) || 20);
const STREAM      = 'open';
const SUBJECT     = 'Free entry to The Debatable Open ends Friday night';

// Short on purpose: the announcement made the case, this one carries the
// clock. Voice rules bind: no em-dashes, no preface, one ask. Prizes and
// dates are the ones published on /tournaments and /tournament-rules.
function renderEmail({ firstName, uid, tournamentName }) {
  const cta   = `${SITE_URL}/tournaments#enter`;
  const rules = `${SITE_URL}/tournament-rules`;
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>Your free entry to ${esc(tournamentName)} expires at 11:59 PM Eastern
    on ${esc(FOUNDING_CUTOFF_LABEL)}.</strong> After that, playing for the cash
    costs $20. Claiming takes about a minute: open the entry page, claim the
    waived entry, tick the 18 or older box the prizes require.
  </p>

  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Claim your free entry &rarr;</a>
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    The tournament runs Saturday, August 29, online, all day: drop in when it
    suits you, debate a real opponent, and get a written verdict on every round.
    $500 for first, $250 for second, $100 for third.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">Aidan</p>

  <p style="font-size:.82rem;line-height:1.6;color:#6b6b76;margin:0">
    Cash prizes go to prize-eligible entrants aged 18 or over and are void where
    prohibited. The <a href="${rules}" style="color:#dc2626;text-decoration:underline">official rules</a>
    carry eligibility and the payout ladder.
  </p>

  ${renderFooter({
    uid,
    stream: STREAM,
    reason: "You're getting this because you have a Debatable account.",
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

  // A deadline email sent past its deadline is a false claim. Refuse,
  // including the dry run, so the button reads dead once the hook is.
  if (Date.now() >= FOUNDING_CUTOFF_MS) {
    return jsonResponse({
      error: 'CUTOFF_PASSED',
      message: `The free-entry cutoff (${FOUNDING_CUTOFF_LABEL}) has passed. This reminder promises a deadline that no longer exists; do not send it.`,
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
  // (2026-08-18 fix), so accept either; prefer one still in registration.
  const openSnap = await db.collection('tournaments')
    .where('isPublic', '==', true).where('status', 'in', ['registration', 'running']).limit(5).get();
  if (openSnap.empty) {
    return jsonResponse({
      error: 'NO_OPEN_TOURNAMENT',
      message: 'No public tournament is open. The reminder promises a live entry page.',
    }, 409, request);
  }
  const docs = openSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
  const tourn = docs.find(t => t.status === 'registration') || docs[0];

  // People who already entered do not need to be told to enter.
  const entered = new Set();
  try {
    const entriesSnap = await db.collection(`tournaments/${tourn.id}/entries`).get();
    entriesSnap.docs.forEach(d => {
      entered.add(d.id);
      const u = (d.data() || {}).uid;
      if (u) entered.add(u);
    });
  } catch (err) {
    console.error('[open-reminder] entries read failed:', err.message);
  }

  const authUsers = await listAllAuthUsers().catch((err) => {
    console.error('[open-reminder] listAllAuthUsers failed:', err.message);
    return null;
  });
  if (!authUsers) return errorResponse('Could not read the account list. Nothing was sent.', 502, request);

  const profilesSnap = await db.collection('user_profiles').limit(3000).get();
  const profByUid = new Map();
  profilesSnap.docs.forEach(d => profByUid.set(d.id, d.data() || {}));

  let eligible = 0, sent = 0, errors = 0;
  let noEmail = 0, optedOut = 0, alreadySent = 0, alreadyEntered = 0;
  const errorReasons = {};
  const sample = [];

  for (const user of authUsers) {
    if (!user.email) { noEmail++; continue; }
    if (entered.has(user.uid)) { alreadyEntered++; continue; }
    const prof = profByUid.get(user.uid) || null;
    // Same posture as the announcement (measured 2026-08-12): a missing
    // profile doc is not an opt-out, because opting out CREATES the doc.
    if (prof && isOptedOut(prof, STREAM)) { optedOut++; continue; }
    if (prof && prof.openReminderSentAt) { alreadySent++; continue; }

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
      // set+merge so the stamp can create a missing profile doc; a stamp
      // that fails is a person who gets mailed twice, so it is an error.
      try {
        await db.doc(`user_profiles/${user.uid}`)
          .set({ openReminderSentAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (stampErr) {
        errors++;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('open-reminder: stamp failed for', user.uid, stampErr.message);
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
    cutoff: new Date(FOUNDING_CUTOFF_MS).toISOString(),
    accounts: authUsers.length,
    eligible, sent, remaining, errors,
    skipped: { noEmail, optedOut, alreadySent, alreadyEntered },
    errorReasons,
    sample: dryRun ? sample : [],
  };

  await db.doc('config/open_reminder_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: result,
  }, { merge: true }).catch(() => {});

  return jsonResponse(result, 200, request);
};

export const config = { path: '/api/admin/open-reminder' };
