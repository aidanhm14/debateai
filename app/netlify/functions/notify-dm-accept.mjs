// Email the recipient when someone sends them the FIRST DM in a /spar
// waitlist thread. "Someone accepted your debate challenge."
//
// Existing /api/notify-accepted handles SCHEDULED rounds with both
// sides confirmed (motion + format + room URL + kickoff). This one is
// thinner: a single email to the post author when a stranger reaches
// out via DM. No motion or room URL — the user opens the thread to
// see what was said.
//
// Flow:
//   1. Caller (the SENDER) POSTs { threadId } with their Firebase ID token.
//   2. Function reads dm_threads/{threadId}, confirms caller is a participant.
//   3. Recipient = the other participant.
//   4. Idempotency: if threadDoc.acceptEmailSentAt is set, no-op.
//   5. Look up recipient's email via Identity Toolkit (client can't see it).
//   6. Send via Resend.
//   7. Write acceptEmailSentAt = serverTimestamp on the thread doc.
//
// Env vars (same as notify-accepted):
//   RESEND_API_KEY  — from resend.com (free tier: 100/day, 3k/mo)
//   RESEND_FROM     — verified sender; when unset: EMAIL_FROM env, then the
//                     always-deliverable dev sender 'Debatable <onboarding@resend.dev>'
//
// Sends ride through lib/email.mjs on the 'transactional' stream: shared
// esc, automatic text/plain part, no List-Unsubscribe headers. The footer
// stays this file's own lighter explanation sentence by design.

import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { getAuthUserByUid } from './lib/auth-admin.mjs';
import { getDb, FieldValue } from './lib/firestore.mjs';
import { esc, sendEmail, isOptedOut } from './lib/email.mjs';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Plain HTML email. Inline styles only (most clients strip <style>).
// Same chrome family as notify-accepted so the two emails read as one
// product.
function template({ senderName, preview, threadUrl }) {
  const safe = (s) => esc(s);
  const previewBlock = preview
    ? `<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:14px 16px;margin-top:14px">
         <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280">First message</p>
         <p style="margin:0;font-size:14px;color:#f3f4f6;line-height:1.55">"${safe(preview)}"</p>
       </div>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e7eb">
  <table role="presentation" style="max-width:560px;margin:0 auto;background:#15151a;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden">
    <tr><td style="padding:24px 28px 12px">
      <div style="font-size:13px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#ef4444">Debatable &middot; Spar</div>
      <h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;color:#fff;letter-spacing:-.01em">Someone wants to spar with you</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#9ca3af"><strong style="color:#e5e7eb">${safe(senderName)}</strong> reached out about a round. Reply to coordinate, or jump straight into a live voice debate when you're both ready.</p>
      ${previewBlock}
    </td></tr>
    <tr><td style="padding:18px 28px 26px">
      <a href="${safe(threadUrl)}" style="display:inline-block;padding:12px 22px;background:#ef4444;color:#fff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;letter-spacing:.02em">Open the conversation</a>
      <p style="margin:18px 0 0;font-size:12px;line-height:1.55;color:#6b7280">You'll only get this email the first time someone DMs you on a waitlist post. Future messages on the same thread are silent.</p>
    </td></tr>
    <tr><td style="padding:14px 28px 22px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:#52525b">
      You're receiving this because you posted to the /spar waitlist on debateai.com. Bail from the live board if something came up.
    </td></tr>
  </table>
</body></html>`;
}

export default async (req) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'POST only' });

  const apiKey = process.env.RESEND_API_KEY;
  // RESEND_FROM > EMAIL_FROM > the resend.dev dev sender (this file's
  // historical zero-env fallback; works on any Resend account with no
  // domain verification, unlike the lib's gmail default).
  const from = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'Debatable <onboarding@resend.dev>';
  if (!apiKey) {
    return jsonResponse(503, {
      error: 'Email not configured',
      hint: 'Set RESEND_API_KEY env var in Netlify (Site config → Environment variables).',
    });
  }

  // Auth — caller must be signed in.
  const token = extractBearerToken(req);
  if (!token) return jsonResponse(401, { error: 'Auth required (Bearer token)' });
  let callerUid = null;
  let callerName = null;
  try {
    const decoded = await verifyIdToken(token);
    callerUid = decoded && decoded.sub;
    callerName = (decoded && (decoded.name || decoded.email)) || null;
  } catch (e) {
    return jsonResponse(401, { error: 'Invalid token: ' + (e.message || 'unknown') });
  }
  if (!callerUid) return jsonResponse(401, { error: 'No UID on token' });

  let body;
  try { body = await req.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const threadId = String(body.threadId || '').trim();
  if (!threadId) return jsonResponse(400, { error: 'threadId required' });

  const db = getDb();
  const threadRef = db.collection('dm_threads').doc(threadId);

  let threadSnap;
  try { threadSnap = await threadRef.get(); }
  catch (e) { return jsonResponse(500, { error: 'Firestore read failed: ' + (e.message || 'unknown') }); }
  if (!threadSnap.exists) return jsonResponse(404, { error: 'Thread not found' });

  const thread = threadSnap.data() || {};
  const participants = Array.isArray(thread.participants) ? thread.participants : [];
  if (!participants.includes(callerUid)) {
    return jsonResponse(403, { error: 'Caller not in thread participants' });
  }

  // Group threads — skip. Emailing every member from a single DM
  // would be a notification storm; not the "accepted your challenge"
  // semantic anyway. /spar 1:1 DMs only.
  if (thread.isGroup) {
    return jsonResponse(200, { sent: 0, reason: 'group thread, skipped' });
  }

  // Idempotency: this email fires ONCE per thread. After it sends we
  // stamp acceptEmailSentAt. Future calls return a clean no-op so the
  // client can fire-and-forget on every send without flooding.
  if (thread.acceptEmailSentAt) {
    return jsonResponse(200, { sent: 0, reason: 'already sent' });
  }

  // Recipient = the OTHER participant. 1:1 DMs always have 2.
  const recipientUid = participants.find((p) => p !== callerUid);
  if (!recipientUid) {
    return jsonResponse(400, { error: 'No recipient (thread missing second participant)' });
  }

  // Honor the recipient's global "unsubscribe from all Debatable email"
  // switch (emailOptOut, the promise the email-unsub page makes). A
  // missing profile doc doesn't block (plenty of users have none), and a
  // flaky read fails open: this is a one-time transactional notice.
  try {
    const profSnap = await db.doc(`user_profiles/${recipientUid}`).get();
    if (profSnap.exists && isOptedOut(profSnap.data() || {}, 'transactional')) {
      return jsonResponse(200, { sent: 0, reason: 'recipient opted out of all email' });
    }
  } catch (e) {
    console.warn('[notify-dm-accept] opt-out check failed:', e.message);
  }

  // Resolve recipient's email via Identity Toolkit. Not in Firestore;
  // Firebase Auth is the source of truth for email.
  let recipientAuth;
  try { recipientAuth = await getAuthUserByUid(recipientUid); }
  catch (e) { return jsonResponse(500, { error: 'Auth lookup failed: ' + (e.message || 'unknown') }); }
  if (!recipientAuth || !recipientAuth.email) {
    return jsonResponse(200, { sent: 0, reason: 'recipient has no email on record' });
  }

  // Sender name preference: thread.participantInfo[callerUid].name (current
  // display name), fall back to the name from the ID token.
  const partInfo = (thread.participantInfo || {})[callerUid] || {};
  const senderName = partInfo.name || callerName || 'Another debater';
  const preview = String(thread.lastMessage || '').slice(0, 200);

  // Direct link to the inbox so they land on the conversation. Spar's
  // inbox UI auto-opens the most recent thread.
  const origin = (req.headers && req.headers.get) ? (req.headers.get('origin') || '') : '';
  const host = origin || 'https://debateai.com';
  const threadUrl = host.replace(/\/$/, '') + '/spar#inbox';

  const html = template({ senderName, preview, threadUrl });
  const subject = senderName + ' wants to spar with you';

  // The lib's sendEmail never throws: failures come back as { ok:false, ... }.
  const result = await sendEmail({ to: recipientAuth.email, subject, html, uid: recipientUid, stream: 'transactional', from });
  if (!result.ok) {
    return jsonResponse(502, { error: 'Resend send failed: ' + (result.reason || (result.status ? 'status ' + result.status : 'unknown')) });
  }

  // Idempotency stamp. Best-effort — if this write fails the email
  // still went, and the next call will re-send (worst case: 2 emails
  // to the same recipient on a flaky write).
  try {
    await threadRef.set({
      acceptEmailSentAt: FieldValue.serverTimestamp(),
      acceptEmailSentTo: recipientUid,
    }, { merge: true });
  } catch (e) {
    console.warn('[notify-dm-accept] idempotency stamp failed:', e.message);
  }

  return jsonResponse(200, { sent: 1 });
};

export const config = {
  path: '/api/notify-dm-accept',
};
