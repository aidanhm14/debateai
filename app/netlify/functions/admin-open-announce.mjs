/* admin-open-announce.mjs  ·  POST /api/admin/open-announce
 *
 * The one-time announcement of The Debatable Open to everyone who
 * already holds an account, carrying the founding comp: sign up before
 * the cutoff and the $20 prize entry is waived (lib/founding-comp.mjs).
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
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
import { FOUNDING_CUTOFF_LABEL, FOUNDING_CUTOFF_MS } from './lib/founding-comp.mjs';

// Only debateai.com is a verified Resend sender. A From on any other
// domain does not bounce, it 403s at the API and the run reports errors
// nobody reads, which is how the Spar Night reminders sent zero emails
// from 2026-07-22 to 08-05. lib/email.mjs still defaults to a gmail
// address for the older senders, so this one resolves its own From and
// REFUSES to send from an unverified domain rather than discovering it
// afterwards in an error tally.
const VERIFIED_SENDER_DOMAINS = ['debateai.com'];
const FROM_EMAIL  = process.env.OPEN_ANNOUNCE_FROM || process.env.EMAIL_FROM
                 || 'Aidan at Debatable <aidan@debateai.com>';
const REPLY_TO    = process.env.OPEN_ANNOUNCE_REPLY_TO || undefined;

function senderDomain(from) {
  const m = String(from || '').match(/<([^>]+)>|([^\s<>]+@[^\s<>]+)/);
  const addr = (m && (m[1] || m[2])) || '';
  return addr.split('@')[1]?.toLowerCase() || '';
}
const BATCH_MAX   = Math.min(60, parseInt(process.env.OPEN_ANNOUNCE_BATCH || '20', 10) || 20);
const STREAM      = 'open';
const SUBJECT     = `The Debatable Open, August 29. Your entry is free.`;

// ── Template ─────────────────────────────────────────────────────────────────
// Voice rules that bind here: no em-dashes, no preface, one ask, no
// traction numbers. Prizes and dates are the ones published on
// /tournaments and /tournament-rules; if those change, change these.

function renderEmail({ firstName, uid, tournamentName, startsAt }) {
  const cta   = `${SITE_URL}/tournaments#enter`;
  const rules = `${SITE_URL}/tournament-rules`;
  const when  = startsAt ? esc(startsAt) : 'Saturday, August 29';
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>Win $500 for winning an argument.</strong> ${esc(tournamentName)} puts
    $850 on the line: $500 for first, $250 for second, $100 for third. It runs
    ${when}, online, from wherever you are.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    Competing for that money costs $20. <strong>It costs you nothing.</strong>
    You signed up before this was on the calendar, so the fee is waived and you
    play for the cash on identical terms. Nothing to pay and nothing to ask for.
    Claim it on the entry page and tick the 18 or older box the prizes require.
  </p>

  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Claim your free entry &rarr;</a>
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
    Anyone who signs up before <strong>${esc(FOUNDING_CUTOFF_LABEL)}</strong> gets the
    same free entry, so forward this to whoever you want in your bracket. After
    that date the fee is back, and the waiver goes back to being something you
    have to email me for.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">Aidan</p>

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
  const senderOk = VERIFIED_SENDER_DOMAINS.includes(fromDomain);
  if (wantsSend && !senderOk) {
    return jsonResponse({
      error: 'UNVERIFIED_SENDER',
      message: `From is ${FROM_EMAIL}, and ${fromDomain || 'that domain'} is not a verified Resend sender. `
             + `Resend would reject every send. Set OPEN_ANNOUNCE_FROM to an address at ${VERIFIED_SENDER_DOMAINS.join(' or ')}.`,
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
    const prof = profByUid.get(user.uid);
    // No profile doc means we hold no preferences for this account.
    // isOptedOut treats that as opted out and so do we: never mail an
    // address whose preferences cannot be read. Counted separately
    // because it is the single biggest thing holding the list back.
    if (!prof) { noProfile++; continue; }
    if (isOptedOut(prof, STREAM)) { optedOut++; continue; }
    if (prof.openAnnounceSentAt) { alreadySent++; continue; }

    eligible++;
    if (dryRun) {
      if (sample.length < 10) sample.push(user.email);
      continue;
    }
    if (sent >= batch) continue;  // keep counting so `remaining` is honest

    const firstName = String(prof.displayName || user.displayName || '').trim().split(/\s+/)[0] || 'debater';
    const res = await sendEmail({
      to: user.email,
      subject: SUBJECT,
      html: renderEmail({
        firstName,
        uid: user.uid,
        tournamentName: tourn.name || 'The Debatable Open',
        startsAt: tourn.startsAt || '',
      }),
      uid: user.uid,
      stream: STREAM,
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
    });
    if (res.ok) {
      sent++;
      await db.doc(`user_profiles/${user.uid}`)
        .update({ openAnnounceSentAt: FieldValue.serverTimestamp() }).catch(() => {});
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
    subject: SUBJECT,
    tournament: { id: tourn.id, name: tourn.name || '', startsAt: tourn.startsAt || '' },
    cutoff: new Date(FOUNDING_CUTOFF_MS).toISOString(),
    accounts: authUsers.length,
    eligible, sent, remaining, errors,
    skipped: { noEmail, noProfile, optedOut, alreadySent },
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
