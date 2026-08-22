/* admin-open-rally.mjs  ·  POST /api/admin/open-rally
 *
 * The week-of rally email for The Debatable Open (Saturday, August 29):
 * the date, the prize ladder, the rush hours, a direct feedback ask
 * with Reply-To pointed at the founder, and the early-member note.
 *
 * Second campaign to the same cohort as admin-open-announce.mjs, so it
 * carries its OWN stamp (openRallySentAt). The announce stamp is left
 * alone: skipping on it would exclude exactly the people this email is
 * for, and writing to it would make the announce unresendable forever.
 *
 * Same posture as the announce sender, and for the same reasons:
 *   1. POST {}               -> DRY RUN. Counts, samples, stamps nobody.
 *   2. POST {confirm:'SEND'} -> sends one batch, stamps each send,
 *                               reports `remaining`. Re-POST to zero.
 * Refuses to send unless a public tournament is open for registration,
 * and refuses a From on a domain Resend has not verified.
 *
 * Env:
 *   RESEND_API_KEY      required to send; absent forces dry run
 *   OPEN_RALLY_FROM / OPEN_RALLY_REPLY_TO   sender overrides
 *   OPEN_RALLY_BATCH    per-call send cap (default 20, max 60)
 *   SITE_URL            default https://itsdebatable.com
 */

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL,
         verifiedSenderDomains, senderDomain } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';

const FALLBACK_VERIFIED = ['debateai.com'];
const FROM_EMAIL = process.env.OPEN_RALLY_FROM || process.env.EMAIL_FROM
                || 'Aidan at Debatable <hello@debateai.com>';
// Reply-To is the point of this email: "reply and it reaches me" is only
// true if replies actually land in the founder's inbox rather than at a
// send-only address on the verified domain.
const REPLY_TO  = process.env.OPEN_RALLY_REPLY_TO || 'aidandavidhollinger@gmail.com';
const BATCH_MAX = Math.min(60, parseInt(process.env.OPEN_RALLY_BATCH || '20', 10) || 20);
const STREAM    = 'open';
const SUBJECT   = 'The Debatable Open is this Saturday. Free entry, cash prizes.';

// ── Template ─────────────────────────────────────────────────────────────────
// Voice rules that bind here: no em-dashes, no preface, no traction
// numbers. The prize ladder, the $850 scale-up at 50+ entrants, the
// 10 AM doors and the 12/3/6 rush hours are the ones published on
// /tournament-rules; if those change, change these.
function renderEmail({ firstName, uid, tournamentName }) {
  const cta   = `${SITE_URL}/tournaments#enter`;
  const rules = `${SITE_URL}/tournament-rules`;
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>${esc(tournamentName)} runs this Saturday, August 29.</strong>
    Doors open 10:00 AM Eastern and stay open all day. Drop in whenever,
    get paired with a real person, and argue it out. Every round ends with a
    written verdict that says what decided it, and the top of the standings
    goes to a streamed elimination final in the evening.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>Entry is free and the money is real.</strong> $100 for first,
    $50 for second, $25 for third. If more than 50 people enter, the pot
    climbs to $850, with $500 for first. A bigger field raises the prize,
    so forward this to someone you want to argue with.
  </p>

  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Enter the Open &rarr;</a>
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>Come at a rush hour.</strong> Pairing works when people are online
    at the same moment, so the day has three: 12:00 PM, 3:00 PM, and
    6:00 PM Eastern. Turn up at one of those and the queue is at its
    fullest. Rounds at any hour count the same.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>Then tell me what to fix.</strong> Reply to this email. It goes
    straight to me, not a support queue, and I read every reply. What you
    send decides what gets built next.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>One more thing: you are early, and it is on the record.</strong>
    You signed up before this was a company. I am keeping a note of who was
    here first and the part each of you played, so when Debatable grows into
    one, that history comes with it.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">See you Saturday,<br>Aidan</p>

  <p style="font-size:.82rem;line-height:1.6;color:#6b6b76;margin:0">
    Entry is free. Cash prizes go to entrants aged 18 or over who confirm their
    age when entering, and are void where prohibited. An entrant under 18 plays
    the same field for the placement and the ranking. The <a href="${rules}" style="color:#dc2626;text-decoration:underline">official rules</a>
    carry eligibility and the payout ladder, including how the pot scales with the field.
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
             + `Resend would reject every send. Verified right now: ${allowed.join(', ') || 'nothing'}.`,
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
    console.error('[open-rally] listAllAuthUsers failed:', err.message);
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
    // A missing profile doc is not an opt-out; see the measured reasoning
    // in admin-open-announce.mjs (2026-08-12). Scoped to this sender.
    if (!prof) noProfile++;
    if (prof && isOptedOut(prof, STREAM)) { optedOut++; continue; }
    if (prof && prof.openRallySentAt) { alreadySent++; continue; }

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
      // set+merge, not update: many recipients hold no profile doc, and a
      // stamp that fails is a person who gets mailed twice, so it counts
      // as an error rather than disappearing (same as the announce sender).
      try {
        await db.doc(`user_profiles/${user.uid}`)
          .set({ openRallySentAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (stampErr) {
        errors++;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('open-rally: stamp failed for', user.uid, stampErr.message);
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

  await db.doc('config/open_rally_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: result,
  }, { merge: true }).catch(() => {});

  return jsonResponse(result, 200, request);
};

export const config = { path: '/api/admin/open-rally' };
