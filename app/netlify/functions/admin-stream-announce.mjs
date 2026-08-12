/* admin-stream-announce.mjs  ·  POST /api/admin/stream-announce
 *
 * "A round is on air right now." Mails the list while a stream is
 * actually live, so the link in the email goes to something happening
 * rather than to a promise.
 *
 * Same posture as admin-open-announce, and for the same reason: mailing
 * the whole list is the most irreversible thing this codebase does, so
 * it is a button a human presses, twice.
 *   1. POST {}               -> DRY RUN. Counts, sends nothing, stamps
 *                               nobody, names ten sample addresses.
 *   2. POST {confirm:'SEND'} -> sends one BATCH, reports what is left.
 *
 * WHAT MAKES THIS DIFFERENT FROM open-announce, and it is the one thing
 * to get right: that send was ONE TIME, so a permanent
 * `openAnnounceSentAt` stamp was the correct dedupe. This send RECURS
 * every time a stream goes up. A permanent stamp would mail everyone
 * about the first stream and nobody about any stream after it, which
 * fails silently and looks exactly like a working feature.
 *
 * So the stamp is compared against the CURRENT stream's startedAt:
 * someone stamped before this stream began has not been told about THIS
 * one and is mailed again. Per-stream dedupe, one permanent field.
 *
 * Guard: refuses unless a stream is live right now. An email announcing
 * a live round that ended an hour ago is worse than no email.
 *
 * Env:
 *   RESEND_API_KEY          required to send; absent forces dry run
 *   STREAM_ANNOUNCE_FROM / STREAM_ANNOUNCE_REPLY_TO   sender overrides
 *   STREAM_ANNOUNCE_BATCH   per-call send cap (default 20, max 60)
 *   SITE_URL                default https://itsdebatable.com
 */

import { requireAdmin } from './lib/admin-auth.mjs';
import { FieldValue } from './lib/firestore.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';
import { esc, sendEmail, renderFooter, brandHeader, isOptedOut, SITE_URL,
         verifiedSenderDomains, senderDomain } from './lib/email.mjs';
import { listAllAuthUsers } from './lib/auth-admin.mjs';

// A From on an unverified domain does not bounce, it 403s at the Resend
// API and the run reports errors nobody reads. That is exactly how Spar
// Night sent zero emails from 2026-07-22 to 08-05, so this resolves its
// own From and REFUSES rather than discovering it in an error tally.
const FALLBACK_VERIFIED = ['debateai.com'];
const FROM_EMAIL = process.env.STREAM_ANNOUNCE_FROM || process.env.EMAIL_FROM
                || 'Aidan at Debatable <aidan@debateai.com>';
const REPLY_TO   = process.env.STREAM_ANNOUNCE_REPLY_TO || undefined;
const BATCH_MAX  = Math.min(60, parseInt(process.env.STREAM_ANNOUNCE_BATCH || '20', 10) || 20);
const STREAM     = 'stream';

// Voice rules that bind here: no em-dashes, no preface, one ask, no
// traction numbers, no invented urgency beyond the plain fact that a
// live thing is live.
function renderEmail({ firstName, uid, title }){
  const cta = `${SITE_URL}/watch`;
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#26262b">
  ${brandHeader()}
  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">Hey ${esc(firstName)},</p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    <strong>A round is on air right now.</strong> ${esc(title)}. Two people
    arguing one motion on the clock, with the ballot at the end.
  </p>

  <p style="margin:0 0 22px">
    <a href="${cta}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;font-size:.92rem;padding:11px 22px;border-radius:999px;text-decoration:none">Watch it live &rarr;</a>
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 14px">
    Nothing to install and nothing to join. It plays in the page, and you
    can leave whenever you want.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">
    If you would rather argue than watch, <a href="${SITE_URL}/spar" style="color:#dc2626;text-decoration:underline">get matched with a stranger</a>
    and take a side yourself.
  </p>

  <p style="font-size:.95rem;line-height:1.6;margin:0 0 22px">Aidan</p>

  ${renderFooter({ uid, stream: STREAM, reason: 'You get these because you have a Debatable account.' })}
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
             + `Either add ${fromDomain || 'the domain'} in the Resend dashboard, or set STREAM_ANNOUNCE_FROM to an address at one of those.`,
      verifiedDomains: allowed,
      verifiedSource,
    }, 409, request);
  }
  const dryRun = !wantsSend || !process.env.RESEND_API_KEY;
  const batch = Math.min(BATCH_MAX, Math.max(1, parseInt(body?.batch, 10) || BATCH_MAX));

  // Guard: the email's whole promise is that something is on right now.
  const streamSnap = await db.collection('site_stream').doc('current').get();
  const stream = streamSnap.exists ? (streamSnap.data() || {}) : {};
  if (!stream.live) {
    return jsonResponse({
      error: 'NOT_LIVE',
      message: 'No stream is on air. Start one from the Broadcast card before announcing it.',
    }, 409, request);
  }
  const title = String(stream.title || 'Live from the arena').slice(0, 140);
  // The dedupe boundary. Anyone stamped before this moment has not been
  // told about THIS stream. Missing startedAt means we cannot prove a
  // boundary, so nobody is re-mailed rather than everybody: an extra
  // email to the whole list is the expensive direction to be wrong in.
  const startedAt = stream.startedAt && stream.startedAt.toMillis
    ? stream.startedAt.toMillis() : Date.now();

  const authUsers = await listAllAuthUsers().catch((err) => {
    console.error('[stream-announce] listAllAuthUsers failed:', err.message);
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
    // A missing profile doc is NOT an opt-out: email-unsub writes with
    // {merge:true}, so opting out of anything CREATES the doc. No doc
    // therefore means this account has never opted out of anything.
    // Same reasoning as open-announce, measured there on 2026-08-12.
    if (!prof) noProfile++;
    if (prof && isOptedOut(prof, STREAM)) { optedOut++; continue; }
    const stampedAt = prof && prof.streamAnnounceSentAt && prof.streamAnnounceSentAt.toMillis
      ? prof.streamAnnounceSentAt.toMillis() : 0;
    if (stampedAt >= startedAt) { alreadySent++; continue; }

    eligible++;
    if (dryRun) {
      if (sample.length < 10) sample.push(user.email);
      continue;
    }
    if (sent >= batch) continue;  // keep counting so `remaining` is honest

    const firstName = String((prof && prof.displayName) || user.displayName || '').trim().split(/\s+/)[0] || 'debater';
    const res = await sendEmail({
      to: user.email,
      subject: `Live now: ${title}`,
      html: renderEmail({ firstName, uid: user.uid, title }),
      uid: user.uid,
      stream: STREAM,
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
    });
    if (res.ok) {
      sent++;
      // set+merge, NOT update: update() rejects on a document that does
      // not exist, and a large share of these accounts have no profile
      // doc. An unstamped send is a person mailed twice, so a failed
      // stamp counts as an error rather than disappearing.
      try {
        await db.doc(`user_profiles/${user.uid}`)
          .set({ streamAnnounceSentAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (stampErr) {
        errors++;
        errorReasons['stamp-failed'] = (errorReasons['stamp-failed'] || 0) + 1;
        console.error('stream-announce: stamp failed for', user.uid, stampErr.message);
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
    subject: `Live now: ${title}`,
    stream: { title, startedAt: new Date(startedAt).toISOString(), restream: !!stream.restream },
    accounts: authUsers.length,
    eligible, sent, remaining, errors,
    skipped: { noEmail, optedOut, alreadySentThisStream: alreadySent },
    mailedWithoutProfile: noProfile,
    errorReasons,
    sample: dryRun ? sample : [],
  };

  await db.doc('config/stream_announce_state').set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastResult: result,
  }, { merge: true }).catch(() => {});

  return jsonResponse(result, 200, request);
};

export const config = {
  path: '/api/admin/stream-announce',
};
