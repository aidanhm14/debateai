/* admin-open-week.mjs  ·  POST /api/admin/open-week
 *
 * The mid-week ladder email for The Debatable Open: the one-day event
 * became a week-long rating ladder (2026-08-29 decision), and almost
 * nobody who entered has been told. This says what changed, how to
 * play, who leads right now, and when the ladder freezes.
 *
 * Third whole-list campaign after admin-open-announce and
 * admin-open-rally, so it carries its OWN stamp (openWeekSentAt) and
 * touches neither of theirs: skipping on an earlier campaign's stamp
 * would exclude exactly the people this email is for, and writing to
 * one would make that campaign unresendable forever.
 *
 * Same posture as both, and for the same reasons:
 *   1. POST {}               -> DRY RUN. Counts, samples, stamps nobody.
 *   2. POST {confirm:'SEND'} -> sends one batch, stamps each send,
 *                               reports `remaining`. Re-POST to zero.
 *   3. POST {testTo:'a@b.c'} -> one real copy to one address, no stamps.
 * Refuses to send unless a public tournament is open (registration OR
 * running: the ladder's whole point is that it is live mid-week, which
 * is exactly when the rally sender's registration-only guard would have
 * refused), and refuses a From on a domain Resend has not verified.
 *
 * Env:
 *   RESEND_API_KEY      required to send; absent forces dry run
 *   OPEN_WEEK_FROM / OPEN_WEEK_REPLY_TO   sender overrides; falls back
 *     to the rally's OPEN_RALLY_FROM, which is the address measured
 *     landing in INBOX on 2026-08-22 (259/259, zero errors)
 *   OPEN_WEEK_BATCH     per-call send cap (default 20, max 60)
 *   SITE_URL            default https://itsdebatable.com
 */

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL,
         verifiedSenderDomains, senderDomain } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';

const FALLBACK_VERIFIED = ['debateai.com'];
const FROM_EMAIL = process.env.OPEN_WEEK_FROM || process.env.OPEN_RALLY_FROM
                || process.env.EMAIL_FROM || 'Debatable <hello@debateai.com>';
const REPLY_TO  = process.env.OPEN_WEEK_REPLY_TO || process.env.OPEN_RALLY_REPLY_TO
                || 'hello@itsdebatable.com';
const BATCH_MAX = Math.min(60, parseInt(process.env.OPEN_WEEK_BATCH || '20', 10) || 20);
const STREAM    = 'open';
const SUBJECT   = 'The Open is now a week-long ladder. Live through Saturday.';

// The current leader, read from the SAME public endpoint the event page
// renders, so the email can never disagree with the site. Best effort:
// a failed read drops the line rather than blocking the campaign, and a
// leader with zero games is not a leader worth naming.
async function readLeaderLine() {
  try {
    const r = await fetch(`${SITE_URL}/api/tournament?t=the-debatable-open`);
    if (!r.ok) return '';
    const d = await r.json();
    const top = (d.standings || []).find((s) => (s.ratingGames || 0) > 0);
    if (!top || !top.name) return '';
    const rec = `${top.wins || 0} and ${top.losses || 0}`;
    return `Right now <strong>${esc(top.name)}</strong> leads the ladder at `
         + `<strong>${esc(top.rating)}</strong> with a record of ${esc(rec)}. `
         + `One judged round puts you on the board next to them.`;
  } catch { return ''; }
}

// ── Template ─────────────────────────────────────────────────────────────────
// Voice rules that bind here: no em-dashes, no preface, no invented
// traction. The freeze time, the 1500 start, the Elo update, and the
// prize ladder are the ones published on /tournament-rules; if those
// change, change these.
function renderEmail({ firstName, uid, tournamentName, leaderLine }) {
  const cta   = `${SITE_URL}/tournaments`;
  const rules = `${SITE_URL}/tournament-rules`;
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>${esc(tournamentName)} changed shape: it is now a week-long
    rating ladder, live right now through 11:59 PM Eastern on Saturday,
    September 5.</strong> No fixed session and no bracket. Check in when
    you are free, press Ready, and you are paired with a real person.
    Everyone starts the event at 1500, and every judged round moves both
    ratings.
  </p>

  ${leaderLine ? `<p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">${leaderLine}</p>` : ''}

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>The money settles when the ladder freezes.</strong> The top
    three ratings on Saturday night take $100, $50 and $25. Rounds are
    short, a written verdict lands after every one, and playing more
    gives the ladder more chances to move you up.
  </p>

  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Get on the ladder &rarr;</a>
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    Not entered yet? Entry is free and stays open all week: sign in,
    click once, and you are in the same field as everyone else.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">
    Reply to this email with anything that felt broken or confusing.
    It lands in the founder's inbox and every reply gets read.<br>Debatable
  </p>

  <p style="font-size:.82rem;line-height:1.6;color:#6b6b76;margin:0">
    Entry is free, and we encourage entrants to be 18+. Everyone competes
    in one field. Cash prizes go only to eligible winners aged 18 or over,
    verified before payout, and are void where prohibited. The
    <a href="${rules}" style="color:#dc2626;text-decoration:underline">official rules</a>
    carry eligibility, the rating system, and the freeze time.
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

  const leaderLine = await readLeaderLine();

  if (body?.testTo) {
    const to = String(body.testTo);
    const from = body.from ? String(body.from) : FROM_EMAIL;
    const res = await sendEmail({
      to,
      subject: SUBJECT,
      html: renderEmail({ firstName: 'debater', uid: 'test', tournamentName: 'The Debatable Open', leaderLine }),
      uid: 'test', stream: STREAM, from, replyTo: REPLY_TO,
    });
    return jsonResponse({ test: true, to, from, leaderLine: !!leaderLine, result: res }, 200, request);
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
             + `Resend would reject every send. Verified right now: ${allowed.join(', ') || 'nothing'}.`,
      verifiedDomains: allowed,
      verifiedSource,
    }, 409, request);
  }
  const dryRun = !wantsSend || !process.env.RESEND_API_KEY;
  const batch = Math.min(BATCH_MAX, Math.max(1, parseInt(body?.batch, 10) || BATCH_MAX));

  // Guard: the email promises a live ladder. Registration OR running,
  // because mid-week the doc IS running and that is the normal case.
  const openSnap = await db.collection('tournaments')
    .where('isPublic', '==', true).where('status', 'in', ['registration', 'running']).limit(1).get();
  if (openSnap.empty) {
    return jsonResponse({
      error: 'NO_OPEN_TOURNAMENT',
      message: 'No public tournament is open or running. The email promises a live ladder.',
    }, 409, request);
  }
  const tourn = { id: openSnap.docs[0].id, ...(openSnap.docs[0].data() || {}) };

  const authUsers = await listAllAuthUsers().catch((err) => {
    console.error('[open-week] listAllAuthUsers failed:', err.message);
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
    if (prof && prof.openWeekSentAt) { alreadySent++; continue; }

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
        leaderLine,
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
          .set({ openWeekSentAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (stampErr) {
        errors++;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('open-week: stamp failed for', user.uid, stampErr.message);
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
    leaderLine: !!leaderLine,
    tournament: { id: tourn.id, name: tourn.name || '', startsAt: tourn.startsAt || '' },
    accounts: authUsers.length,
    eligible, sent, remaining, errors,
    skipped: { noEmail, optedOut, alreadySent },
    mailedWithoutProfile: noProfile,
    errorReasons,
    sample: dryRun ? sample : [],
  };

  await db.doc('config/open_week_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: result,
  }, { merge: true }).catch(() => {});

  return jsonResponse(result, 200, request);
};

export const config = {
  path: '/api/admin/open-week',
};
