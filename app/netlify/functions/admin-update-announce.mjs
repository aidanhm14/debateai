/* admin-update-announce.mjs  ·  POST /api/admin/update-announce
 *
 * The August 2026 community update: bring a friend before the founding
 * cutoff, reply with what to fix, and the judge rebuild. One-time send
 * to EVERY account (unlike open-announce it does not exclude anyone by
 * signup date; the friend-forward hook is the cutoff itself).
 *
 * Same posture as admin-open-announce.mjs, and deliberately the same
 * machinery: a button a human presses twice, never a cron.
 *   1. POST {}            -> DRY RUN. Counts the cohort, sends nothing,
 *                            stamps nobody, names ten sample addresses.
 *   2. POST {confirm:'SEND'} -> sends one BATCH and reports what is left.
 *
 * Batched because Netlify's sync timeout is ten seconds; each call mails
 * up to `batch` people, stamps `updateAug18SentAt` on their profile, and
 * returns `remaining`. Re-POST until remaining hits zero. The per-user
 * stamp makes the run resumable and a double-click a no-op.
 *
 * Guard: the email leads with the Open's free-entry cutoff, so it
 * refuses to send unless a public tournament is actually in
 * registration, same as the announcement it follows.
 *
 * Env:
 *   RESEND_API_KEY         required to send; absent forces dry run
 *   UPDATE_ANNOUNCE_FROM / UPDATE_ANNOUNCE_REPLY_TO   sender overrides
 *   UPDATE_ANNOUNCE_BATCH  per-call send cap (default 20, max 60)
 *   SITE_URL               default https://itsdebatable.com
 */

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL,
         verifiedSenderDomains, senderDomain } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';
// FOUNDING_CUTOFF_LABEL intentionally not imported: there is no comp and no
// cutoff to quote. Entry is free for everyone (2026-08-22).

// Sender resolution is copied verbatim from admin-open-announce.mjs, and
// the reasoning travels with it: a From on an unverified domain does not
// bounce, it 403s at the Resend API (the Spar Night zero-send, 2026-07-22
// to 08-05), so the run resolves its own From against what Resend has
// verified RIGHT NOW and refuses rather than discovering it in an error
// tally. The fallback only covers a failed lookup, never a failed match.
const FALLBACK_VERIFIED = ['debateai.com'];
const FROM_EMAIL  = process.env.UPDATE_ANNOUNCE_FROM || process.env.EMAIL_FROM
                 || 'Debatable <hello@debateai.com>';
// Replies ARE the point of beat two, so they should land in the inbox
// the founder actually reads (the 2026-07-04 contact-email decision).
const REPLY_TO    = process.env.UPDATE_ANNOUNCE_REPLY_TO || 'hello@itsdebatable.com';
const BATCH_MAX   = Math.min(60, parseInt(process.env.UPDATE_ANNOUNCE_BATCH || '20', 10) || 20);
// Rides the 'open' stream end to end: bulk product/tournament news,
// suppressed by the digest flag and by openOptOut, and 'open' is on
// sendEmail's bulk-header list so the RFC 8058 one-click unsubscribe
// headers actually attach (a novel stream name would silently skip
// them). What makes this send distinct is the STAMP field, not the
// stream.
const OPT_STREAM  = 'open';
const STAMP       = 'updateAug18SentAt';
const SUBJECT     = `Bring a friend. The Open is free to enter.`;

// ── Template ─────────────────────────────────────────────────────────────────
// Voice rules that bind here: no em-dashes, no preface, short paragraphs,
// no traction numbers, nothing the site does not already claim. The judge
// paragraph states only what shipped: full written ballots, published
// rules at /judge-integrity, human appeals.

function renderEmail({ firstName, uid }) {
  const cta   = `${SITE_URL}/tournaments#enter`;
  const rules = `${SITE_URL}/tournament-rules`;
  const integ = `${SITE_URL}/judge-integrity`;
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    Three things, each short.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>1. Bring a friend.</strong> The Debatable Open runs Saturday,
    August 29: cash prizes, online, drop in whenever suits you. Entry is free
    for everyone, so forward this to whoever you want in your bracket and it
    costs them nothing either.
  </p>

  <p style="margin:0 0 18px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Enter the Open &rarr;</a>
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>2. Tell me what to fix.</strong> You are early, which means your
    complaints actually change the product. Reply to this email with the one
    thing that annoyed you most last time you were on the site. I read every
    reply, and naming it here is the fastest way to get it fixed.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">
    <strong>3. The judge got a rebuild.</strong> Every round now ends with a
    full written ballot that walks each argument and names the clash that
    decided it. The rules the judge follows are published at
    <a href="${integ}" style="color:#dc2626;text-decoration:underline">itsdebatable.com/judge-integrity</a>,
    and you can appeal a call to a human. If a verdict ever felt arbitrary,
    run a round and read the new ballot.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">Debatable</p>

  <p style="font-size:.82rem;line-height:1.6;color:#6b6b76;margin:0">
    Entry is free, and we encourage entrants to be 18+. Everyone competes in one
    field. Cash prizes go only to eligible winners aged 18 or over, verified before
    payout, and are void where prohibited. The <a href="${rules}" style="color:#dc2626;text-decoration:underline">official rules</a>
    carry eligibility and the payout ladder.
  </p>

  ${renderFooter({
    uid,
    stream: OPT_STREAM,
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
             + `Either add ${fromDomain || 'the domain'} in the Resend dashboard, or set UPDATE_ANNOUNCE_FROM to an address at one of those.`,
      verifiedDomains: allowed,
      verifiedSource,
    }, 409, request);
  }
  const dryRun = !wantsSend || !process.env.RESEND_API_KEY;
  const batch = Math.min(BATCH_MAX, Math.max(1, parseInt(body?.batch, 10) || BATCH_MAX));

  // Guard: beat one promises a live entry page with the founding comp on it.
  const openSnap = await db.collection('tournaments')
    .where('isPublic', '==', true).where('status', '==', 'registration').limit(1).get();
  if (openSnap.empty) {
    return jsonResponse({
      error: 'NO_OPEN_TOURNAMENT',
      message: 'No public tournament is in registration. The email leads with free entry to one.',
    }, 409, request);
  }
  const tourn = { id: openSnap.docs[0].id, ...(openSnap.docs[0].data() || {}) };

  const authUsers = await listAllAuthUsers().catch((err) => {
    console.error('[update-announce] listAllAuthUsers failed:', err.message);
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
    // A missing profile doc is not an opt-out: opting out is what CREATES
    // the doc (email-unsub writes with merge). Same reasoning, and the
    // same measured cohort, as admin-open-announce.mjs.
    if (!prof) noProfile++;
    if (prof && isOptedOut(prof, OPT_STREAM)) { optedOut++; continue; }
    if (prof && prof[STAMP]) { alreadySent++; continue; }

    eligible++;
    if (dryRun) {
      if (sample.length < 10) sample.push(user.email);
      continue;
    }
    if (sent >= batch) continue;  // keep counting so `remaining` is honest

    const firstName = String((prof && prof.displayName) || user.displayName || '').trim().split(/\s+/)[0] || 'debater';
    const res = await sendEmail({
      to: user.email,
      subject: SUBJECT,
      html: renderEmail({ firstName, uid: user.uid }),
      uid: user.uid,
      stream: OPT_STREAM,
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
    });
    if (res.ok) {
      sent++;
      // set+merge, NOT update: many mailed accounts hold no profile doc,
      // and the stamp is what makes the run resumable, so it must be able
      // to create the doc it writes to. A failed stamp is a person who
      // will be mailed twice, so it counts as an error rather than
      // disappearing into a catch.
      try {
        await db.doc(`user_profiles/${user.uid}`)
          .set({ [STAMP]: FieldValue.serverTimestamp() }, { merge: true });
      } catch (stampErr) {
        errors++;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('update-announce: stamp failed for', user.uid, stampErr.message);
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
    replyTo: REPLY_TO,
    senderVerified: senderOk,
    verifiedDomains: allowed,
    verifiedSource,
    subject: SUBJECT,
    tournament: { id: tourn.id, name: tourn.name || '', startsAt: tourn.startsAt || '' },
    accounts: authUsers.length,
    eligible, sent, remaining, errors,
    skipped: { noEmail, optedOut, alreadySent },
    mailedWithoutProfile: noProfile,
    errorReasons,
    sample: dryRun ? sample : [],
  };

  await db.doc('config/update_announce_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: result,
  }, { merge: true }).catch(() => {});

  return jsonResponse(result, 200, request);
};

export const config = { path: '/api/admin/update-announce' };
