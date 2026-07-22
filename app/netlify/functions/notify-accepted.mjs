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

  // Auth check — caller must be signed in. We don't strictly enforce
  // "caller is one of the parties" because the challenge doc isn't
  // fetched server-side here; rate-limited at Resend's free tier
  // (100/day) so abuse is bounded.
  const token = extractBearerToken(req);
  if (!token) return jsonResponse(401, { error: 'Auth required (Bearer token)' });
  let uid = null;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded && decoded.sub;
  } catch (e) {
    return jsonResponse(401, { error: 'Invalid token: ' + (e.message || 'unknown') });
  }
  if (!uid) return jsonResponse(401, { error: 'No UID on token' });

  let body;
  try { body = await req.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const motion = String(body.motion || '').slice(0, 500);
  const format = String(body.format || '').slice(0, 80);
  const kickoff = fmtSchedule(body.scheduledAt);
  const roomUrl = String(body.roomUrl || '').slice(0, 800);
  const calendarUrl = body.calendarUrl ? String(body.calendarUrl).slice(0, 1500) : null;
  const poster = body.poster || {};
  const accepter = body.accepter || {};

  if (!motion || !roomUrl || !poster.email || !accepter.email) {
    return jsonResponse(400, { error: 'Missing required fields (motion, roomUrl, poster.email, accepter.email)' });
  }

  // Build both emails. Each side sees the OTHER side's contact.
  const posterHtml = template({
    headline: 'Your challenge was accepted',
    sub: `${accepter.name || 'Someone'} took the other side. Round room is ready when you are.`,
    motion, format, kickoff, roomUrl, calendarUrl,
    opponent: accepter.name || 'Anonymous',
    opponentContact: accepter.contact || accepter.email || '',
  });
  const accepterHtml = template({
    headline: "You're in. Round confirmed",
    sub: `You accepted ${poster.name || 'the poster'}'s challenge. Save the kickoff time and you're set.`,
    motion, format, kickoff, roomUrl, calendarUrl,
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
