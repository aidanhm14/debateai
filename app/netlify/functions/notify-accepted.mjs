// Email notifications when a live challenge is accepted. Sends two
// emails: one to the poster ("your challenge was taken") and one to
// the accepter ("you accepted, here's your room link"). Both contain
// the meeting room URL, kickoff time, and the opponent's contact
// info so they can coordinate out-of-band if needed.
//
// Auth: Firebase ID token in Authorization header. Caller's UID must
// match either the poster or the accepter on the challenge doc, so a
// random signed-in user can't blast notifications for someone else.
//
// Env vars (set in Netlify):
//   RESEND_API_KEY  — from resend.com (free tier: 100/day, 3k/mo)
//   RESEND_FROM     — verified sender, e.g. "Debatable <aidandavidhollinger@gmail.com>"
//                     (when unset: EMAIL_FROM env, then the always-deliverable
//                      dev sender 'Debatable <onboarding@resend.dev>', which
//                      Resend accepts on any account with no domain setup)
//
// Sends ride through lib/email.mjs on the 'transactional' stream: shared
// esc, automatic text/plain part, no List-Unsubscribe headers (these are
// event receipts, not a mailing list). The footer stays this file's own
// lighter explanation sentence by design.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { esc, sendEmail } from './lib/email.mjs';
import { checkLayers } from './lib/rate-limit.mjs';
import { getDb } from './lib/firestore.mjs';

// The room link goes into a branded "Open the round room" button in an email
// sent from our domain. It MUST point at a room we host, or this endpoint is a
// phishing relay: any signed-in user could email an attacker-chosen link to
// arbitrary recipients under our brand. Allowlist the hosts a real round link
// uses (Daily rooms + our own origins) and reject everything else.
function hostAllowed(url, allowSuffixes) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return allowSuffixes.some((s) => h === s || h.endsWith('.' + s));
  } catch { return false; }
}
const ROOM_HOSTS = ['daily.co', 'itsdebatable.com', 'debateai.com', 'debateos1.netlify.app'];
const CAL_HOSTS = ['google.com', 'calendar.google.com', 'outlook.live.com', 'outlook.office.com'];

function jsonResponse(status, body){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fmtSchedule(scheduledAt){
  if (!scheduledAt) return 'as soon as both sides are online';
  const d = new Date(scheduledAt);
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

function template({ subject, headline, sub, motion, format, kickoff, roomUrl, opponent, opponentContact, calendarUrl }){
  // Plain HTML email. Inline styles only (most clients strip <style>).
  // Dark cards on dark background reads cleanly in Gmail dark mode + light.
  const safe = (s) => esc(s);
  const calBlock = calendarUrl
    ? `<a href="${safe(calendarUrl)}" style="display:inline-block;margin-top:14px;padding:8px 18px;background:#27272a;color:#fff;text-decoration:none;border-radius:999px;font-size:13px;font-weight:600">Add to Google Calendar</a>`
    : '';
  const contactLine = opponentContact
    ? `<p style="margin:6px 0 0;font-size:13px;color:#9ca3af">Opponent contact: <strong style="color:#e5e7eb">${safe(opponentContact)}</strong></p>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e7eb">
  <table role="presentation" style="max-width:560px;margin:0 auto;background:#15151a;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden">
    <tr><td style="padding:24px 28px 16px">
      <div style="font-size:13px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#ef4444">Debatable · Live</div>
      <h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;color:#fff;letter-spacing:-.01em">${safe(headline)}</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#9ca3af">${safe(sub)}</p>
    </td></tr>
    <tr><td style="padding:8px 28px 4px">
      <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:14px 16px">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280">Motion</p>
        <p style="margin:0 0 14px;font-size:15px;color:#f3f4f6;line-height:1.5">${safe(motion)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#9ca3af"><strong style="color:#e5e7eb">Format:</strong> ${safe(format)}</p>
        <p style="margin:0;font-size:13px;color:#9ca3af"><strong style="color:#e5e7eb">Kickoff:</strong> ${safe(kickoff)}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#9ca3af"><strong style="color:#e5e7eb">Opponent:</strong> ${safe(opponent)}</p>
        ${contactLine}
      </div>
    </td></tr>
    <tr><td style="padding:18px 28px 26px">
      <a href="${safe(roomUrl)}" style="display:inline-block;padding:12px 22px;background:#ef4444;color:#fff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;letter-spacing:.02em">Open the round room</a>
      ${calBlock}
      <p style="margin:18px 0 0;font-size:12px;line-height:1.55;color:#6b7280">Embedded video, format-aware speech timer, AI ballot at the end. No install on either side.</p>
    </td></tr>
    <tr><td style="padding:14px 28px 22px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:#52525b">
      You're receiving this because you posted or accepted a live debate on itsdebatable.com. Reply to coordinate, or bail from the live board if something came up.
    </td></tr>
  </table>
</body></html>`;
}

export default async (req) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'POST only' });

  const apiKey = process.env.RESEND_API_KEY;
  // RESEND_FROM > EMAIL_FROM > the resend.dev dev sender. The last hop is
  // this file's historical zero-env fallback and works on any Resend
  // account without domain verification; don't let it fall through to the
  // lib's gmail default, which needs a verified sender identity.
  const from = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'Debatable <onboarding@resend.dev>';
  if (!apiKey) {
    return jsonResponse(503, {
      error: 'Email not configured',
      hint: 'Set RESEND_API_KEY env var in Netlify (Site config → Environment variables). Free tier at resend.com.',
    });
  }

  // Auth check — caller must be signed in. The "caller is a party" check and
  // the recipient addresses are enforced/derived server-side below from the
  // challenge doc, so the body cannot pick who gets emailed.
  const token = extractBearerToken(req);
  if (!token) return jsonResponse(401, { error: 'Auth required (Bearer token)' });
  let uid = null;
  let callerEmail = '';
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded && decoded.sub;
    callerEmail = (decoded && decoded.email) || '';
  } catch (e) {
    return jsonResponse(401, { error: 'Invalid token: ' + (e.message || 'unknown') });
  }
  if (!uid) return jsonResponse(401, { error: 'No UID on token' });

  // Per-caller rate limit. A signed-in user still shouldn't be able to drain
  // the shared Resend allowance (100/day) blasting notifications.
  const rl = await checkLayers('notify-accepted', uid, [
    { label: 'min', window: 60_000, max: 4 },
    { label: 'day', window: 86_400_000, max: 30 },
  ]);
  if (!rl.ok) return jsonResponse(429, { error: 'Too many notifications — try again later.' });

  let body;
  try { body = await req.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const motion = String(body.motion || '').slice(0, 500);
  const format = String(body.format || '').slice(0, 80);
  const kickoff = fmtSchedule(body.scheduledAt);
  const roomUrl = String(body.roomUrl || '').slice(0, 800);
  const calendarUrl = body.calendarUrl ? String(body.calendarUrl).slice(0, 1500) : null;
  const poster = body.poster || {};
  const accepter = body.accepter || {};
  const challengeId = String(body.challengeId || '').slice(0, 200);

  if (!motion || !roomUrl || !challengeId) {
    return jsonResponse(400, { error: 'Missing required fields (motion, roomUrl, challengeId)' });
  }

  // Reject an off-allowlist room link so this can't be used as a branded
  // phishing relay.
  if (!hostAllowed(roomUrl, ROOM_HOSTS)) {
    return jsonResponse(400, { error: 'roomUrl host not allowed' });
  }
  const safeCalendarUrl = (calendarUrl && hostAllowed(calendarUrl, CAL_HOSTS)) ? calendarUrl : null;

  // Recipient emails are DERIVED SERVER-SIDE from the challenge, never trusted
  // from the request body. Otherwise any signed-in user could email arbitrary
  // addresses under our brand. The caller must also be a party to the round.
  // Poster email lives on the private companion live_challenge_contacts/{id}
  // (with a legacy fallback to the challenge doc); accepter email is the
  // caller's own verified-token email.
  let posterEmail = '';
  let accepterEmail = '';
  try {
    const db = getDb();
    const challSnap = await db.collection('live_challenges').doc(challengeId).get();
    if (!challSnap.exists) return jsonResponse(404, { error: 'Challenge not found' });
    const chall = challSnap.data() || {};

    // Party check: caller must be the poster or the recorded accepter. If no
    // accepter is stamped yet, the caller IS the one accepting right now, so a
    // non-poster is allowed through as the accepter.
    const isPoster = chall.posterUid && chall.posterUid === uid;
    const isAccepter = chall.accepterUid && chall.accepterUid === uid;
    const acceptingNow = !chall.accepterUid && chall.posterUid !== uid;
    if (!isPoster && !isAccepter && !acceptingNow) {
      return jsonResponse(403, { error: 'Not a party to this challenge' });
    }

    const contactSnap = await db.collection('live_challenge_contacts').doc(challengeId).get();
    const contact = (contactSnap.exists && contactSnap.data()) || {};
    posterEmail = contact.posterEmail || chall.posterEmail || '';
    // Accepter is normally the caller (their own verified-token email). Fall
    // back to the companion doc for the defensive poster-initiated path.
    accepterEmail = isPoster ? (contact.accepterEmail || '') : (callerEmail || contact.accepterEmail || '');
  } catch (e) {
    return jsonResponse(500, { error: 'Could not verify challenge' });
  }

  if (!posterEmail || !accepterEmail) {
    return jsonResponse(400, { error: 'No deliverable address on file for one side' });
  }
  // Force the server-derived addresses; ignore any body-supplied emails.
  poster.email = posterEmail;
  accepter.email = accepterEmail;

  // Build both emails. Each side sees the OTHER side's contact.
  const posterHtml = template({
    headline: 'Your challenge was accepted',
    sub: `${accepter.name || 'Someone'} took the other side. Round room is ready when you are.`,
    motion, format, kickoff, roomUrl, calendarUrl: safeCalendarUrl,
    opponent: accepter.name || 'Anonymous',
    opponentContact: accepter.contact || accepter.email || '',
  });
  const accepterHtml = template({
    headline: "You're in. Round confirmed",
    sub: `You accepted ${poster.name || 'the poster'}'s challenge. Save the kickoff time and you're set.`,
    motion, format, kickoff, roomUrl, calendarUrl: safeCalendarUrl,
    opponent: poster.name || 'Anonymous',
    opponentContact: poster.contact || poster.email || '',
  });

  // Fire both in parallel; report partial success cleanly. The lib's
  // sendEmail never throws: failures come back as { ok:false, ... }.
  const results = await Promise.all([
    sendEmail({ to: poster.email, subject: 'Your debate was accepted: ' + motion.slice(0, 60), html: posterHtml, stream: 'transactional', from }),
    sendEmail({ to: accepter.email, subject: 'You accepted: ' + motion.slice(0, 60), html: accepterHtml, stream: 'transactional', from }),
  ]);
  const errors = results.filter(r => !r.ok).map(r => 'Resend ' + (r.status || 'send') + ' failed: ' + String(r.reason || 'unknown').slice(0, 300));
  if (errors.length === 2) {
    return jsonResponse(502, { error: 'Both sends failed', detail: errors });
  }
  return jsonResponse(200, {
    sent: results.filter(r => r.ok).length,
    errors,
  });
};

export const config = {
  path: '/api/notify-accepted',
};
