/* admin-open-reminder.mjs  ·  POST /api/admin/open-reminder
 *
 * The SECOND touch on The Debatable Open: a short email sent in the
 * final days before the event (Saturday, August 29), to the same list
 * the announcement reached plus everyone who joined since.
 *
 * It stopped being a DEADLINE email on 2026-08-19 and it stays that way.
 * The clock it carries is the EVENT (Aug 29), never the founding-comp
 * cutoff: a comped recipient is comped for good and has no deadline to
 * beat.
 *
 * It is NO LONGER true that every recipient is comped. That held while
 * this list was frozen behind an Aug 18 cutoff; the cohort is "the
 * announcement list plus everyone who joined since", the cutoff moved to
 * 1 PM on Aug 19, and the coach wave puts new accounts on this list
 * daily. So the fee line is resolved PER RECIPIENT from their own Auth
 * creation time. Telling a coach their entry is free and then charging
 * them $5 at the door is the version of this email that costs more than
 * sending nothing. Wiring the send guard or the copy back to FOUNDING_CUTOFF_MS is
 * what broke it on 2026-08-19, when the cutoff moved into the past and
 * silently dead-buttoned the send with an "entries closed" message that
 * was not true. Guard on ENTRIES_CLOSE_MS.
 * Same two-press button shape as admin-open-announce.mjs: POST {} is a
 * dry run, POST {confirm:'SEND'} sends one batch and reports remaining.
 *
 * Differences from the announcement, each deliberate:
 *  - Own stamp (`openReminderSentAt`), and it does NOT skip people the
 *    announcement reached. A reminder to the same list is the point.
 *  - SKIPS anyone who already holds an entry in the open tournament.
 *    "Come and enter" mailed to someone who entered is noise that
 *    spends the one reminder this list will tolerate.
 *  - REFUSES to run once entries have closed. An email asking people to
 *    enter an event they can no longer enter is a false claim, not a
 *    late one.
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
import { FOUNDING_CUTOFF_MS } from './lib/founding-comp.mjs';

const FALLBACK_VERIFIED = ['debateai.com'];
const FROM_EMAIL  = process.env.OPEN_ANNOUNCE_FROM || process.env.EMAIL_FROM
                 || 'Aidan at Debatable <aidan@debateai.com>';
const REPLY_TO    = process.env.OPEN_ANNOUNCE_REPLY_TO || 'aidandavidhollinger@gmail.com';
const BATCH_MAX   = Math.min(60, parseInt(process.env.OPEN_ANNOUNCE_BATCH || '20', 10) || 20);
const STREAM      = 'open';
const SUBJECT     = 'Speak money into existence: The Debatable Open';
// Event day, for copy. Deliberately NOT FOUNDING_CUTOFF_LABEL: that
// constant tracks who gets comped, this one tracks when the thing
// happens, and collapsing them resurrects deadline framing every time
// the cutoff moves.
const EVENT_LABEL = 'Saturday, August 29';
// Entries close when the doors close. This, not the comp cutoff, is the
// only date that can make this email a false claim.
const ENTRIES_CLOSE_MS = Date.parse('2026-08-29T23:59:59-04:00');

// Short on purpose: the announcement made the case, this one carries the
// clock. Voice rules bind: no em-dashes, no preface, one ask. Prizes and
// dates are the ones published on /tournaments and /tournament-rules.
function renderEmail({ firstName, uid, tournamentName, comped }) {
  const cta   = `${SITE_URL}/tournaments#enter`;
  const rules = `${SITE_URL}/tournament-rules`;
  const feeLine = comped
    ? `<strong>${esc(EVENT_LABEL)}. Your entry to ${esc(tournamentName)} is
    free.</strong> You had an account before this went on sale, so the $5 prize
    entry is waived for you and stays waived. Everyone arriving now pays it.
    Entering takes about a minute:`
    : `<strong>${esc(EVENT_LABEL)}. ${esc(tournamentName)} is open to you.</strong>
    Prize entry is $5, and I waive it for anyone who asks me, no reason needed.
    Entering takes about a minute:`;
  const ctaLabel = comped ? 'Claim your free entry &rarr;' : 'Enter the Open &rarr;';
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    ${feeLine}
  </p>

  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">${ctaLabel}</a>
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    If you haven't been on in a while, the site matches you with a real person,
    you argue it out, and an AI judge writes up who won and why.
    ${esc(EVENT_LABEL)} is the first real tournament on it. All online, doors open 10 AM
    Eastern, come and go whenever. Rounds you play count on the standings, the
    top of the board goes into a streamed bracket that evening, and first place
    takes $500 ($250 and $100 behind it). You don't need debate experience,
    and the field is still small, so your odds are genuinely good.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    Being honest with you, the whole thing is early and I'm building it mostly
    on my own. So if something breaks, confuses you, or you think it should
    work differently, reply and tell me. I read every reply and I ship fixes
    fast. Same if you just have a question. And if you know someone who likes
    to argue, forward them this.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">Aidan</p>

  <p style="font-size:.88rem;line-height:1.6;margin:0 0 14px">
    P.S. If you competed and have a record on Tabroom, you can import it and
    start with a rating that matches, instead of starting from zero. Two
    minutes: <a href="${SITE_URL}/claim" style="color:#dc2626;text-decoration:underline">itsdebatable.com/claim</a>
  </p>

  <p style="font-size:.82rem;line-height:1.6;color:#6b6b76;margin:0">
    Cash prizes go to entrants aged 18 or over with a prize entry and are void where
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

  // "Come and enter" mailed after entries close is a false claim. Refuse,
  // including the dry run, so the button reads dead once the hook is.
  if (Date.now() >= ENTRIES_CLOSE_MS) {
    return jsonResponse({
      error: 'ENTRIES_CLOSED',
      message: `Entries closed (${EVENT_LABEL}). This reminder asks people to enter an event they can no longer enter; do not send it.`,
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

  // People who already entered do not need to be told to enter. Entry
  // docs are auto-id'd and carry their uids in a `members` ARRAY (a 1v1
  // entry is a one-member team; verified against the live docs
  // 2026-08-19, which is how the first cut's `uid` read counted zero
  // entrants against six real entries). Doc id and `uid` stay as
  // fallbacks for any older shape.
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
        // Their own account age decides which fee sentence they read.
        // Unparseable creation time falls to the PAID copy: quoting $5 to
        // someone who turns out to be comped is a pleasant surprise at the
        // door, the reverse is a broken promise.
        comped: Date.parse(user.metadata?.creationTime || '') <= FOUNDING_CUTOFF_MS,
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
    compCutoff: new Date(FOUNDING_CUTOFF_MS).toISOString(),
    entriesClose: new Date(ENTRIES_CLOSE_MS).toISOString(),
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
