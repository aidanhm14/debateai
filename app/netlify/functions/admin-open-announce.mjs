/* admin-open-announce.mjs  ·  POST /api/admin/open-announce
 *
 * The one-time announcement of The Debatable Open to everyone who
 * already holds an account, carrying the founding comp: sign up before
 * the cutoff and the $5 prize entry is waived (lib/founding-comp.mjs).
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
const FALLBACK_VERIFIED = ['debateai.com'];
const FROM_EMAIL  = process.env.OPEN_ANNOUNCE_FROM || process.env.EMAIL_FROM
                 || 'Debatable <hello@debateai.com>';
const REPLY_TO    = process.env.OPEN_ANNOUNCE_REPLY_TO || undefined;
const BATCH_MAX   = Math.min(60, parseInt(process.env.OPEN_ANNOUNCE_BATCH || '20', 10) || 20);
const STREAM      = 'open';
// Two subjects, because the old one asserted "your entry is free" to every
// inbox it reached, including the accounts arriving now that have to pay.
const SUBJECT_COMPED = `The Debatable Open, August 29. Your entry is free.`;
const SUBJECT_PAID   = `The Debatable Open, August 29. $100 for winning an argument.`;

// ── Template ─────────────────────────────────────────────────────────────────
// Voice rules that bind here: no em-dashes, no preface, one ask, no
// traction numbers. Prizes and dates are the ones published on
// /tournaments and /tournament-rules; if those change, change these.

// `comped` is resolved per recipient from their Auth creation time. The
// list is no longer frozen behind a past cutoff: new accounts arrive every
// day from the coach wave, and each one that lands here would otherwise be
// told the $5 fee is waived when it is not.
function renderEmail({ firstName, uid, tournamentName, startsAt, comped }) {
  const cta   = `${SITE_URL}/tournaments#enter`;
  const rules = `${SITE_URL}/tournament-rules`;
  const when  = startsAt ? esc(startsAt) : 'Saturday, August 29';
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>Win $100 for winning an argument.</strong> ${esc(tournamentName)} puts
    $175 on the line: $100 for first, $50 for second, $25 for third. It runs
    ${when}, online, from wherever you are.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    ${comped
      ? `Competing for that money costs $5. <strong>It costs you nothing.</strong>
         You signed up before this was on the calendar, so the fee is waived and you
         play for the cash on identical terms. Nothing to pay and nothing to ask for.
         Claim it on the entry page and tick the 18 or older box the prizes require.`
      : `Competing for that money costs $5, and I waive it for anyone who asks me,
         no reason needed. Enter on the tournaments page and tick the 18 or older
         box the prizes require.`}
  </p>

  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">${comped ? 'Claim your free entry &rarr;' : 'Enter the Open &rarr;'}</a>
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    You get paired with a real opponent and debate. Rounds are short, and every one
    ends with a written verdict that says what actually decided it, so a round you
    lose still tells you something. The final is streamed. There is no fixed start
    time, so turning up late does not shut you out.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    You do not need to have competed before. The default format is written for
    people who never have.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">
    ${comped
      ? `Forward this to whoever you want in your bracket. Your own entry is free
         because you were here first; theirs is $5, and I will waive it for anyone
         who asks me, no reason needed.`
      : `Forward this to whoever you want in your bracket. Entry is $5 and I will
         waive it for anyone who asks me, no reason needed.`}
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">Debatable</p>

  <p style="font-size:.82rem;line-height:1.6;color:#6b6b76;margin:0">
    Cash prizes go to prize-eligible entrants aged 18 or over and are void where
    prohibited. Free entry without the waiver plays the same field but cannot
    receive cash. The <a href="${rules}" style="color:#dc2626;text-decoration:underline">official rules</a>
    carry eligibility and the payout ladder.
  </p>

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
    if (prof && prof.openAnnounceSentAt) { alreadySent++; continue; }

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
    const comped = Date.parse(user.metadata?.creationTime || '') <= FOUNDING_CUTOFF_MS;
    const res = await sendEmail({
      to: user.email,
      subject: comped ? SUBJECT_COMPED : SUBJECT_PAID,
      html: renderEmail({
        firstName,
        uid: user.uid,
        tournamentName: tourn.name || 'The Debatable Open',
        startsAt: tourn.startsAt || '',
        comped,
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
          .set({ openAnnounceSentAt: FieldValue.serverTimestamp() }, { merge: true });
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
    subject: { comped: SUBJECT_COMPED, paid: SUBJECT_PAID },
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
