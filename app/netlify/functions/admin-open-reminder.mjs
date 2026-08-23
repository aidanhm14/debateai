/* admin-open-reminder.mjs  ·  POST /api/admin/open-reminder
 *
 * The SECOND touch on The Debatable Open: a short email sent in the
 * final days before the event (Saturday, August 29), to the same list
 * the announcement reached plus everyone who joined since.
 *
 * 2026-08-22, Aidan: send a reminder "saying reward has gone down bc
 * lack of participants, unless it goes above 50. help spread the word,
 * any ideas, feedback for product etc". So this is no longer only a
 * reminder. It carries a prize change, an ask to bring one person, and
 * an open question about the product, in that order.
 *
 * Three things that follow from carrying a prize change, and each is
 * the reason for a line of code below:
 *   - ENTRANTS ARE MAILED. This function used to skip them, on the
 *     sound reasoning that "come and enter" is noise to someone who
 *     entered. A pot that moved is not noise to them, it is the news
 *     they have the most standing to hear, so they get their own
 *     opening and their own ask instead of being dropped.
 *   - THE NUMBERS ARE READ, NOT TYPED. The field size and the pot come
 *     off the live tournament doc at send time, which is the same doc
 *     /tournaments renders. An email is the one surface that cannot be
 *     corrected after the fact, so it must not be able to quote a
 *     figure the page disagrees with.
 *   - ITS OWN STAMP (`openStatusSentAt`). The August 19 reminder run
 *     already stamped most of the list, and reusing that key would have
 *     silently skipped nearly everyone this one is for.
 *
 * It stopped being a DEADLINE email on 2026-08-19 and it stays that way.
 * The clock it carries is the EVENT (Aug 29), never the founding-comp
 * cutoff: a comped recipient is comped for good and has no deadline to
 * beat.
 *
 * There is no fee line to resolve any more. Entry went free for everyone
 * on 2026-08-22, so the per-recipient comped/paid fork this email used to
 * carry is gone and `comped` survives only as a record on the row. The
 * failure it was written against still stands as the rule: never tell a
 * recipient their entry is free and then meet them with a price at the
 * door. Wiring the send guard or the copy back to FOUNDING_CUTOFF_MS is
 * what broke it on 2026-08-19, when the cutoff moved into the past and
 * silently dead-buttoned the send with an "entries closed" message that
 * was not true. Guard on ENTRIES_CLOSE_MS.
 * Same two-press button shape as admin-open-announce.mjs: POST {} is a
 * dry run, POST {confirm:'SEND'} sends one batch and reports remaining.
 * A third press exists for the author: POST {test:'SEND'} renders BOTH
 * variants (entrant and not) through this exact code path, with the
 * live entry count and pot, and mails them to REPLY_TO alone. No stamp
 * is written and no recipient list is read, so it can be pressed any
 * number of times while the copy is being edited. An email is the one
 * surface that cannot be corrected after it lands, so the preview has
 * to be the real render, not a screenshot of the source.
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
                 || 'Debatable <hello@debateai.com>';
const REPLY_TO    = process.env.OPEN_ANNOUNCE_REPLY_TO || 'aidandavidhollinger@gmail.com';
const BATCH_MAX   = Math.min(60, parseInt(process.env.OPEN_ANNOUNCE_BATCH || '20', 10) || 20);
const STREAM      = 'open';
// 2026-08-22: the subject states the ask rather than teasing it. The
// number in it is read live from the tournament doc at send time, so
// this email can never quote a field size the page contradicts.
const SUBJECT_FN  = (n) => `${n} people have entered the Open. It needs 50.`;
// Own stamp, separate from openReminderSentAt. The August 19 run reached
// most of the list, so reusing that key would skip nearly everyone, and
// this is not the same email: it carries a prize change, which is news
// the people it affects are entitled to hear once.
const STAMP       = 'openStatusSentAt';
// The threshold that restores the pot, and what it restores it to. Both
// are published on /tournaments, /tournament-rules and the live
// tournament doc. If one moves they all move, together, or the email
// becomes the odd one out that someone screenshots.
const RALLY_TARGET = 50;
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
/* Two audiences, one send, because the news is the same and only the
 * ask changes. Someone already entered needs to hear that the pot
 * moved and that bringing people moves it back; someone who has not
 * needs that plus the door. Skipping entrants, which this function did
 * until today, would have meant the ten people with the most reason to
 * care about the prize being the ten who never heard it changed.
 *
 * Voice rules bind: no em-dashes, no preface, one ask per paragraph.
 * Every number here is read from the live tournament doc or from the
 * published rules, never typed in twice. */
function renderEmail({ firstName, uid, tournamentName, entered, entryCount, potNow }) {
  const cta   = `${SITE_URL}/tournaments#enter`;
  const rules = `${SITE_URL}/tournament-rules`;
  const short = 'itsdebatable.com/tournaments';

  const opening = entered
    ? `You are already entered in ${esc(tournamentName)} on ${esc(EVENT_LABEL)}, so
       this is not a nudge to sign up. It is where things actually stand, because
       one number changed and it is one you should hear from me rather than
       notice on the page.`
    : `${esc(tournamentName)} runs ${esc(EVENT_LABEL)}. It is free to enter, there is
       no card and nothing to ask me for, and entering takes about a minute.`;

  const ask = entered
    ? `So the useful thing you can do is not play more rounds, it is bring one
       person. Forward this, or send them ${esc(short)}. The field is the
       constraint, not the format.`
    : `And if you know one person who likes to argue, send them this. Forward it,
       or give them ${esc(short)}. Getting to fifty is a people problem and I do
       not have a marketing budget to throw at it.`;

  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">${opening}</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>The prize pot came down.</strong> It was $850. It is now ${esc(potNow)}:
    $100 for first, $50 for second, $25 for third. The reason is plain, and it is
    not a good one to dress up. ${esc(String(entryCount))} people have entered so far,
    and I am funding the prizes myself. An $850 pot across a field that size is not
    a tournament, it is me handing money to whoever turns up.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>It goes back to $850 if more than ${esc(String(RALLY_TARGET))} people
    enter.</strong> That is written into the official rules, not just this email:
    past ${esc(String(RALLY_TARGET))} entrants, first place is $500 again, second is
    $250, third is $100. Nothing else about the day changes, and no entry fee is
    involved at any point.
  </p>

  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">${entered ? 'See where it stands &rarr;' : 'Enter the Open &rarr;'}</a>
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">${ask}</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">${entered
    ? `How the day runs, in case it has been a while since you entered: all online,
       doors open 10 AM Eastern and stay open until the evening, and you turn up
       whenever suits you. The rush hours are 12, 3 and 6 PM Eastern; come at one
       of those and the queue is at its fullest. There is no round one to miss.
       Every round you play counts on the standings, and the top of the board goes
       into a streamed bracket that night.`
    : `If you have not been on in a while: the site matches you with a real person,
       you argue it out on a clock, and an AI judge writes up who won and why. The
       Open is all online, doors open 10 AM Eastern and stay open all day, and the
       rush hours are 12, 3 and 6 PM Eastern, when pairing is fastest. Rounds you
       play at any hour count on the standings, and the top of the board goes into
       a streamed bracket that evening. No debate experience needed.`}
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    One more ask, and it is the one I actually want most. Reply to this and tell me
    what would make you use this thing. What is broken, what is confusing, what you
    expected to be here and could not find, or why you signed up and then did not
    come back. That last one especially. I read every reply myself and I ship fixes
    the same day more often than not.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">Debatable</p>

  <p style="font-size:.88rem;line-height:1.6;margin:0 0 14px">
    P.S. If you competed and have a record on Tabroom, you can import it and start
    with a rating that matches instead of from zero. Two minutes:
    <a href="${SITE_URL}/claim" style="color:#dc2626;text-decoration:underline">itsdebatable.com/claim</a>
  </p>

  <p style="font-size:.82rem;line-height:1.6;color:#6b6b76;margin:0">
    Entry is free. Cash prizes go to entrants aged 18 or over who confirm their age
    when entering, and are void where prohibited. An entrant under 18 plays the same
    field for the placement and the ranking. Prize amounts are as published on the
    <a href="${rules}" style="color:#dc2626;text-decoration:underline">official rules</a>,
    which carry eligibility and the payout ladder.
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

  /* Both figures in the copy come from the doc the page renders, so the
     email cannot quote a field size or a pot the site contradicts. The
     pot formats from prizePoolCents rather than being typed, which is
     what stops this email repeating the old $850 after a repricing. */
  const entryCount = Math.max(0, Number(tourn.entryCount) || 0);
  const potNow = '$' + Math.round((Number(tourn.prizePoolCents) || 0) / 100).toLocaleString('en-US');

  // ── Test send: both variants, to the author only ──────────────────
  // Runs the REAL render with the REAL numbers so what lands in the
  // inbox is byte-what the list would get, but touches no stamp and
  // reads no recipient list. `test` and `confirm` are mutually
  // exclusive on purpose: a press cannot half-mean both.
  if (body?.test === 'SEND') {
    if (body?.confirm) return errorResponse('Pass test OR confirm, not both.', 400, request);
    if (!process.env.RESEND_API_KEY) return errorResponse('RESEND_API_KEY is not set here; test sends need production.', 409, request);
    if (!senderOk) {
      return jsonResponse({ error: 'UNVERIFIED_SENDER', verifiedDomains: allowed, verifiedSource }, 409, request);
    }
    const testTo = REPLY_TO;
    const variants = [
      { entered: false, tag: 'not entered' },
      { entered: true,  tag: 'already entered' },
    ];
    const results = [];
    for (const v of variants) {
      const res = await sendEmail({
        to: testTo,
        subject: `[TEST · ${v.tag}] ${SUBJECT_FN(entryCount)}`,
        html: renderEmail({
          firstName: 'Aidan',
          uid: 'test',
          tournamentName: tourn.name || 'The Debatable Open',
          entered: v.entered,
          entryCount,
          potNow,
        }),
        uid: 'test',
        stream: STREAM,
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
      });
      results.push({ variant: v.tag, ok: !!res.ok, reason: res.ok ? undefined : (res.reason || res.status) });
    }
    return jsonResponse({
      test: true, to: testTo,
      subject: SUBJECT_FN(entryCount),
      entryCount, potNow,
      results,
      note: 'Nothing was stamped. Edit the copy, redeploy, press test again; confirm:SEND is untouched.',
    }, 200, request);
  }

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

  // Entrants are NOT skipped any more (they were until 2026-08-22).
  // This send carries a prize change, and the ten people it affects most
  // directly are exactly the ten the old skip would have excluded. They
  // get a different opening and a different ask; see renderEmail.
  for (const user of authUsers) {
    if (!user.email) { noEmail++; continue; }
    const isEntrant = entered.has(user.uid);
    if (isEntrant) alreadyEntered++;
    const prof = profByUid.get(user.uid) || null;
    // Same posture as the announcement (measured 2026-08-12): a missing
    // profile doc is not an opt-out, because opting out CREATES the doc.
    if (prof && isOptedOut(prof, STREAM)) { optedOut++; continue; }
    if (prof && prof[STAMP]) { alreadySent++; continue; }

    eligible++;
    if (dryRun) {
      if (sample.length < 10) sample.push(user.email);
      continue;
    }
    if (sent >= batch) continue;

    const firstName = String((prof && prof.displayName) || user.displayName || '').trim().split(/\s+/)[0] || 'debater';
    const res = await sendEmail({
      to: user.email,
      subject: SUBJECT_FN(entryCount),
      html: renderEmail({
        firstName,
        uid: user.uid,
        tournamentName: tourn.name || 'The Debatable Open',
        entered: isEntrant,
        entryCount,
        potNow,
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
          .set({ [STAMP]: FieldValue.serverTimestamp() }, { merge: true });
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
    subject: SUBJECT_FN(entryCount),
    tournament: { id: tourn.id, name: tourn.name || '', startsAt: tourn.startsAt || '' },
    compCutoff: new Date(FOUNDING_CUTOFF_MS).toISOString(),
    entriesClose: new Date(ENTRIES_CLOSE_MS).toISOString(),
    accounts: authUsers.length,
    eligible, sent, remaining, errors,
    // alreadyEntered is now a COUNT, not a skip: those people are
    // mailed the entrant variant. Kept on the row because the split
    // between the two copies is the thing worth seeing in a dry run.
    entrantsMailed: alreadyEntered,
    skipped: { noEmail, optedOut, alreadySent },
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
