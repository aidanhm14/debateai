import { esc, brandHeader, renderFooter, SITE_URL } from './email.mjs';

export const DM_MESSAGE_MAX_AGE_MS = 10 * 60 * 1000;

// At most one DM nudge email per recipient per window, however many messages
// arrive. The email is generic ("open your inbox"), so one nudge covers a
// whole burst; per-message email was the founder complaint on 2026-09-01.
export const DM_EMAIL_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function dmEmailCooldownOk(lastSentAtMs, now = Date.now(), cooldownMs = DM_EMAIL_COOLDOWN_MS) {
  const last = Number(lastSentAtMs) || 0;
  if (!last) return true;
  // A stamp from the future (clock skew, corrupt write) must never mute a
  // recipient forever; treat it as absent rather than waiting for the clock.
  if (last > now + 60_000) return true;
  return now - last >= cooldownMs;
}

export function dmMessageTime(message) {
  const createdAt = message && message.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt.toMillis === 'function') {
    try { return createdAt.toMillis(); } catch { return 0; }
  }
  if (typeof createdAt.seconds === 'number') return createdAt.seconds * 1000;
  if (typeof createdAt === 'number') return createdAt;
  return 0;
}

export function isRecentDmMessage(message, now = Date.now()) {
  const at = dmMessageTime(message);
  return !!at && at <= now + 60_000 && now - at <= DM_MESSAGE_MAX_AGE_MS;
}

export function buildDmEmail({ uid }) {
  const subject = 'You have a new message on Debatable';
  const url = `${SITE_URL}/chat`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#fafaf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1a1a1f">
  <div style="max-width:560px;margin:0 auto;padding:42px 24px">
    ${brandHeader()}
    <h1 style="font-size:1.45rem;line-height:1.2;letter-spacing:-.02em;margin:0 0 10px;color:#1a1a1f">You have a new message</h1>
    <p style="font-size:.96rem;line-height:1.6;color:#4b4b55;margin:0 0 18px">Open your inbox to read it and reply.</p>
    <p style="font-size:.82rem;line-height:1.55;color:#8a8a93;margin:0 0 18px">We send at most one of these every few hours, however many messages arrive.</p>
    <a href="${esc(url)}" style="display:inline-block;margin-top:4px;padding:12px 21px;background:#dc2626;color:#fff;text-decoration:none;border-radius:999px;font-size:.92rem;font-weight:750">Read and reply</a>
    ${renderFooter({ uid, stream: 'dm', reason: 'You received this because someone sent a message to your Debatable account.' })}
  </div>
</body></html>`;

  return { subject, html, url };
}
