/* admin-open-announce.mjs  ·  POST /api/admin/open-announce
 *
 * The one-time announcement of The Debatable Open to everyone who
 * already holds an account, carrying the founding comp: sign up before
 * the cutoff. That comp is retired: entry is free for everyone.
 *
 * Not a cron. A cron that mails your whole list is a machine deciding
 * to do the single most irreversible thing this codebase can do, so
 * this is a button a human presses, twice:
 *   1. POST {}            -> DRY RUN. Counts the cohort, sends nothing,
 *                            stamps nobody, names ten sample addresses.
 *   2. POST {confirm:'SEND'} -> sends one BATCH and reports what is left.
 *
 * Batched deliberately. Netlify's sync timeout is ten seconds and a
 * list of a few hundred addresses does not fit; each call mails up to
 * `batch` people, stamps them, and returns `remaining`. Re-POST until
 * remaining hits zero. The per-user stamp makes that resumable and
 * makes a double-click a no-op rather than a second copy.
 *
 * Guard: refuses to send unless a public tournament is actually open
 * for registration. The email's whole promise is a live entry page;
 * mailing everyone a link to an empty bracket is worse than not
 * mailing at all.
 *
 * Cohort: Firebase Auth (the only place sign-in stores an email; a
 * profiles-only scan saw 6 addresses out of 128 on 2026-07-22), minus
 * anyone whose profile says they opted out of the 'open' stream, minus
 * anyone we cannot read preferences for at all.
 *
 * Env:
 *   RESEND_API_KEY       required to send; absent forces dry run
 *   OPEN_ANNOUNCE_FROM / OPEN_ANNOUNCE_REPLY_TO   sender overrides
 *   OPEN_ANNOUNCE_BATCH  per-call send cap (default 20, max 60)
 *   SITE_URL             default https://itsdebatable.com
 */

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL,
         verifiedSenderDomains, senderDomain } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
import { FOUNDING_CUTOFF_MS } from './lib/founding-comp.mjs';

// A From on an unverified domain does not bounce, it 403s at the Resend API
// and the run reports errors nobody reads, which is how the Spar Night
// reminders sent zero emails from 2026-07-22 to 08-05. lib/email.mjs still
// defaults to a gmail address for the older senders, so this one resolves its
// own From and REFUSES to send from an unverified domain rather than
// discovering it afterwards in an error tally.
//
// The allow-list is ASKED, not hardcoded: verifiedSenderDomains() reads what
// Resend actually has verified right now. A hardcoded list is a second,
// independent claim about the truth, and the moment a domain is added or a DNS
// record lapses it becomes a confident lie in whichever direction hurts more.
// Adding itsdebatable.com in the Resend dashboard is therefore the ONLY step
// needed to move the sender there; no deploy follows it.
//
// FALLBACK is deliberate and narrow. If the lookup itself fails (network, a
// Resend outage) the run falls back to the last domain known to work rather
// than refusing, because a lookup hiccup should not be a new way for the
// button to stop. The response says which source was used.
//
// 2026-08-27: this fired for real. EMAIL_FROM is
// `Debatable <hello@itsdebatable.com>` and itsdebatable.com is NOT in the list
// Resend reports verified, so the card refused rather than 403ing 340 times
// into an error tally nobody reads. The DNS is published (DKIM, SPF and the
// feedback MX all resolve on itsdebatable.com), so the domain is added to
// Resend and simply not verified yet; finishing that in the Resend dashboard
// is the real fix and needs no deploy. Until then OPEN_ANNOUNCE_FROM is set in
// the Netlify production context to aidan@debateai.com, the address the
// August 19 run sent 210 emails from with zero errors.
//
// NOTE for whoever hits this next: EMAIL_FROM is the default for every OTHER
// sender in lib/email.mjs, and none of them carry this guard. While it points
// at an unverified domain they are all silently 403ing, which is exactly how
// Spar Night sent zero emails from 2026-07-22 to 08-05.
const FALLBACK_VERIFIED = ['debateai.com'];
const FROM_EMAIL  = process.env.OPEN_ANNOUNCE_FROM || process.env.EMAIL_FROM
                 || 'Debatable <hello@debateai.com>';
const REPLY_TO    = process.env.OPEN_ANNOUNCE_REPLY_TO || undefined;
const BATCH_MAX   = Math.min(60, parseInt(process.env.OPEN_ANNOUNCE_BATCH || '20', 10) || 20);
const STREAM      = 'open';
// One subject now. The two-subject split existed while a founding comp made
// entry free for some accounts and not others; entry is free for everyone, so
// a second version is a way to get one of them wrong. Aidan's wording, 2026-08-27.
const SUBJECT = `The Debatable Open - Free Tournament on the 29th - $100 for first place`;
const SUBJECT_COMPED = SUBJECT;
const SUBJECT_PAID   = SUBJECT;

// The stamp for THIS send, and the name is date-scoped on purpose. The skip
// that makes a run resumable cannot tell one announcement from another, so a
// reused field does not error, it silently drops whoever the earlier send
// reached and reports success. Measured across the 343 accounts before
// picking: openAnnounceSentAt 210, openReminderSentAt 208, openRallySentAt
// 259, updateAug18SentAt 210, sparNightSentAt 280. The obvious name
// (openReminderSentAt) was already taken by admin-open-reminder.mjs and would
// have cut this list from 329 to 121 without saying so. Check the live field
// counts before naming the next one; do not reason from the file you are in.
const STAMP = 'openAug27SentAt';

// ── Template ─────────────────────────────────────────────────────────────────
// Voice rules that bind here: no em-dashes, no preface, one ask, no
// traction numbers. Prizes and dates are the ones published on
// /tournaments and /tournament-rules; if those change, change these.

// Body copy is Aidan's, verbatim, 2026-08-27. Everything factual in it was
// checked against the live tournament doc and the published page before it
// shipped: entryFeeCents 0, prizeSplit [10000, 5000, 2500], startsAtISO
// 2026-08-29T14:00:00Z, and /tournaments states the 12:30 prelim end, the
// 1:15 final, and the separate under-18 and 18-and-over brackets in its own
// words. If any of those move, this copy is wrong and has to move with them.
function renderEmail({ firstName, uid, registered }) {
  const cta = 'https://itsdebatable.com/tournaments';
  const P = 'font-size:.95rem;line-height:1.6;margin:0 0 14px';
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="${P}">Hey ${esc(firstName)},</p>

  <p style="${P}">
    The Debatable Open runs this Saturday, August 29. Doors open at
    <strong>10:00 AM EASTERN</strong>, prelims run until 12:30, and the final is
    streamed at 1:15. It is <strong>FREE TO ENTER</strong>. $100 for first, $50
    for second, $25 for third.
  </p>

  <p style="${P}">${esc(String(registered))} people are registered so far.</p>

  <p style="${P}">
    We'll provide a rundown of the tournament structure tomorrow. Under-18 and
    18+ brackets are separate for safety.
  </p>

  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Enter here &rarr;</a>
  </p>

  <p style="${P}">
    Or paste this in: <a href="${cta}" style="color:#dc2626">${cta}</a>
  </p>

  <p style="${P}">
    The site is vibe coded and the UI needs work. We are making it better
    before tournament day. It is still early, and we are open to your help with
    where this product goes, both its growth and its long term vision.
  </p>

  <!-- The number is drawn, not screenshotted. Gmail and Outlook hide images
       from a sender the reader has not engaged with, and an image-only stat
       leaves the paragraph under it pointing at a grey box. This renders
       everywhere, stays sharp on any screen, and needs nothing hosted. -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 18px">
    <tr><td style="border:1px solid #e4e4e0;border-radius:14px;padding:18px 20px;background:#fbfbf9">
      <div style="font-size:.7rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6b6b76;margin-bottom:6px">Spar match rate</div>
      <div style="font-size:2.1rem;font-weight:900;letter-spacing:-.02em;color:#1a1a1f;line-height:1.1">17.4%</div>
      <div style="font-size:.82rem;color:#b45309;margin-top:4px">411 of 2,368 joins matched, last 30 days</div>
    </td></tr>
  </table>

  <p style="${P}">
    Most people who go looking for a live opponent never find one. The matching
    is not broken. There is simply nobody else in the queue at that moment. We
    need more people live at once, so share this with your friends. Keep watch
    of our growth, and take an active part in it.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">Feel free to write us feedback too!</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">Debatable</p>

  ${renderFooter({
    uid,
    stream: STREAM,
    reason: "You're getting this because you have a Debatable account.",
  })}
</div>`;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { db } = gate;

  let body = {};
  try { body = await request.json(); } catch { /* empty body = dry run */ }

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
             + `Resend would reject every send. Verified right now: ${allowed.join(', ') || 'nothing'}. `
             + `Either add ${fromDomain || 'the domain'} in the Resend dashboard, or set OPEN_ANNOUNCE_FROM to an address at one of those.`,
      verifiedDomains: allowed,
      verifiedSource,
    }, 409, request);
  }
  const dryRun = !wantsSend || !process.env.RESEND_API_KEY;
  const batch = Math.min(BATCH_MAX, Math.max(1, parseInt(body?.batch, 10) || BATCH_MAX));

  // Guard: the email promises a live entry page. No open bracket, no send.
  const openSnap = await db.collection('tournaments')
    .where('isPublic', '==', true).where('status', '==', 'registration').limit(1).get();
  if (openSnap.empty) {
    return jsonResponse({
      error: 'NO_OPEN_TOURNAMENT',
      message: 'No public tournament is in registration. Open one before announcing it.',
    }, 409, request);
  }
  const tourn = { id: openSnap.docs[0].id, ...(openSnap.docs[0].data() || {}) };
  // "N people are registered so far" is read from the doc at send time, not
  // frozen into the copy. The sentence was written on a day the field held 25
  // and the send runs in batches over the days before the event, so a literal
  // would be quietly wrong by Friday and understate the thing it is there to
  // sell. Falls back to the number as written if the field is ever missing.
  const registeredCount = Number.isFinite(Number(tourn.entryCount)) ? Number(tourn.entryCount) : 25;

  const authUsers = await listAllAuthUsers().catch((err) => {
    console.error('[open-announce] listAllAuthUsers failed:', err.message);
    return null;
  });
  if (!authUsers) return errorResponse('Could not read the account list. Nothing was sent.', 502, request);

  const profilesSnap = await db.collection('user_profiles').limit(3000).get();
  const profByUid = new Map();
  profilesSnap.docs.forEach(d => profByUid.set(d.id, d.data() || {}));

  let eligible = 0, sent = 0, errors = 0;
  let noEmail = 0, noProfile = 0, optedOut = 0, alreadySent = 0;
  const errorReasons = {};
  const sample = [];

  for (const user of authUsers) {
    if (!user.email) { noEmail++; continue; }
    const prof = profByUid.get(user.uid) || null;
    // A missing profile doc is NOT an opt-out, and that is provable rather
    // than assumed: email-unsub.mjs writes with {merge:true}, so opting out
    // of anything CREATES this doc. No doc therefore means the account has
    // never opted out of anything, and "we cannot read their preferences"
    // is answered by the absence of the record itself.
    //
    // Measured 2026-08-12: 169 accounts carry an email, 97 of them had no
    // profile doc, and ZERO of those 97 had opted out. The conservative read
    // was holding back 57% of the list for a preference that cannot exist.
    // They are real: 96 of 97 email-verified, 96 Google sign-ins, 50 with
    // more than one login, spread evenly across April to August.
    //
    // Scoped to THIS sender on purpose. isOptedOut(null) still returns true
    // for digest, winback, sparnight and partner, which is right for a
    // recurring mailing list; this is a one-time announcement with a live
    // one-click unsubscribe in the footer.
    if (!prof) noProfile++;
    if (prof && isOptedOut(prof, STREAM)) { optedOut++; continue; }
    if (prof && prof[STAMP]) { alreadySent++; continue; }

    eligible++;
    if (dryRun) {
      if (sample.length < 10) sample.push(user.email);
      continue;
    }
    if (sent >= batch) continue;  // keep counting so `remaining` is honest

    // prof is null for the no-profile cohort above, so it cannot be read
    // directly here. Auth still carries a display name for a Google sign-in,
    // and 'debater' is the floor.
    const firstName = String((prof && prof.displayName) || user.displayName || '').trim().split(/\s+/)[0] || 'debater';
    const res = await sendEmail({
      to: user.email,
      subject: SUBJECT,
      html: renderEmail({
        firstName,
        uid: user.uid,
        registered: registeredCount,
      }),
      uid: user.uid,
      stream: STREAM,
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
    });
    if (res.ok) {
      sent++;
      // set+merge, NOT update. update() REJECTS on a document that does not
      // exist, and 97 of the accounts mailed here have no profile doc yet.
      // With update() inside a swallowed catch, every one of those sends
      // would have failed to stamp SILENTLY, and the next batch would have
      // found them unstamped and mailed them again, and again. The stamp is
      // the only thing making this run resumable and a double-click a no-op,
      // so it has to be able to create the doc it writes to.
      // Awaited, and NOT swallowed into a no-op: a stamp that fails is a
      // person who will be emailed twice, so it counts as an error on the
      // run rather than disappearing.
      try {
        await db.doc(`user_profiles/${user.uid}`)
          .set({ [STAMP]: FieldValue.serverTimestamp() }, { merge: true });
      } catch (stampErr) {
        errors++;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('open-announce: stamp failed for', user.uid, stampErr.message);
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
    registered: registeredCount,
    tournament: { id: tourn.id, name: tourn.name || '', startsAt: tourn.startsAt || '' },
    cutoff: new Date(FOUNDING_CUTOFF_MS).toISOString(),
    accounts: authUsers.length,
    eligible, sent, remaining, errors,
    // noProfile is NOT a skip any more, so it does not live under `skipped`.
    // It counts accounts that were mailed despite holding no profile doc,
    // which is worth reporting because it is the cohort this sender was
    // silently dropping until 2026-08-12.
    skipped: { noEmail, optedOut, alreadySent },
    mailedWithoutProfile: noProfile,
    errorReasons,
    sample: dryRun ? sample : [],
  };

  await db.doc('config/open_announce_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: result,
  }, { merge: true }).catch(() => {});

  return jsonResponse(result, 200, request);
};

export const config = { path: '/api/admin/open-announce' };
